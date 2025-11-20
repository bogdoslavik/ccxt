import ccxt from '../../../ts/ccxt';
import { MongoClient } from 'mongodb';

const TOP_N = 20;
const PRINT_INTERVAL_MS = 1000;
const RETRY_DELAY_MS = 5000;
const TARGET_INTERVAL_HOURS = 8;
const DEFAULT_NATIVE_INTERVAL_HOURS = 8;
const MIN_SYMBOL_WIDTH = 10;
const MIN_RATE_WIDTH = 12;
const EXCHANGES = [
    { id: 'paradex', instance: new ccxt.pro.paradex ({ enableRateLimit: true }), filter: (symbol: string) => symbol.indexOf ('-') === -1 },
    { id: 'asterdex', instance: new ccxt.pro.asterdex ({ enableRateLimit: true }), filter: (_symbol: string) => true },
    { id: 'hyperliquid', instance: new ccxt.pro.hyperliquid ({ enableRateLimit: true }), filter: (_symbol: string) => true },
    { id: 'lighter', instance: new ccxt.pro.lighter ({ enableRateLimit: true }), filter: (_symbol: string) => true },
    { id: 'extended', instance: new ccxt.pro.extended ({ enableRateLimit: true }), filter: (_symbol: string) => true },
];

type ExchangeFeeInfo = {
    maker: number;
    taker: number;
};

const EXCHANGE_FEES: Record<string, ExchangeFeeInfo> = {
    paradex: { maker: 0, taker: 0 },
    asterdex: { maker: 0.0001, taker: 0.00035 },
    hyperliquid: { maker: 0.00015, taker: 0.00045 },
    lighter: { maker: 0, taker: 0 },
    extended: { maker: 0, taker: 0.00025 },
};

type FundingRow = {
    symbol: string;
    rate: number;
    normalizedRate?: number;
    nativeIntervalHours?: number;
};

type FundingBucketEntry = {
    exchangeId: string;
    symbol: string;
    normalizedRate: number;
};

type ArbitrageOpportunity = {
    baseSymbol: string;
    minEntry: FundingBucketEntry;
    maxEntry: FundingBucketEntry;
    delta: number;
    minFeeCost: number;
    maxFeeCost: number;
    deltaWithFees: number;
};

const extractBaseFromSymbol = (symbol?: string): string | undefined => {
    if (typeof symbol !== 'string' || symbol.length === 0) {
        return undefined;
    }
    const separators = [ '/', ':', '-' ];
    for (const separator of separators) {
        const idx = symbol.indexOf (separator);
        if (idx !== -1) {
            return symbol.slice (0, idx);
        }
    }
    return symbol;
};

const getDisplaySymbol = (symbol?: string): string => extractBaseFromSymbol (symbol) ?? '';

const getBaseSymbol = (symbol?: string): string | undefined => extractBaseFromSymbol (symbol);

const getNormalizedRateValue = (row: FundingRow): number | undefined => {
    const candidate = (row.normalizedRate !== undefined) ? row.normalizedRate : row.rate;
    return (candidate !== undefined && Number.isFinite (candidate)) ? candidate : undefined;
};

const formatPercent = (value?: number): string => {
    if (value === undefined || !Number.isFinite (value)) {
        return 'n/a';
    }
    const percent = value * 100;
    const prefix = (percent >= 0 ? '+' : '');
    return `${prefix}${percent.toFixed (4)}%`;
};

const formatUnsignedPercent = (value?: number): string => {
    if (value === undefined || !Number.isFinite (value)) {
        return 'n/a';
    }
    return `${Math.abs (value * 100).toFixed (4)}%`;
};

const getTakerFee = (exchangeId: string): number => EXCHANGE_FEES[exchangeId]?.taker ?? 0;

const getDoubleTakerFee = (exchangeId: string): number => getTakerFee (exchangeId) * 2;

const formatExchangeWithFees = (exchangeId: string, feeValue?: number): string => {
    const doubleFee = (feeValue !== undefined) ? feeValue : getDoubleTakerFee (exchangeId);
    return `${exchangeId} (${formatUnsignedPercent (doubleFee)})`;
};

const delay = (ms: number) => new Promise ((resolve) => setTimeout (resolve, ms));

const normalizeFundingPayload = (payload): any[] => {
    if (Array.isArray (payload)) {
        return payload;
    }
    if ((payload !== undefined) && (typeof payload === 'object')) {
        if ('symbol' in payload) {
            return [ payload ];
        }
        return Object.values (payload);
    }
    return [];
};

const logSample = (exchangeId: string, payload, entries: any[]) => {
    const ts = new Date ().toISOString ();
    if (entries.length === 0) {
        console.log (`[${ts}] ${exchangeId} empty funding payload`, payload);
    } else {
        const sample = entries.slice (0, Math.min (entries.length, 3));
        // console.log (`[${ts}] ${exchangeId} received ${entries.length} funding update(s)`, sample);
    }
};

async function main () {
    const exchangeState: Map<string, Map<string, FundingRow>> = new Map ();
    for (const entry of EXCHANGES) {
        exchangeState.set (entry.id, new Map ());
    }
    const columnSizing: Map<string, { symbolWidth: number; rateWidth: number }> = new Map ();
    const mongoUri = process.env.MONGO_URI ?? 'mongodb://localhost:27017';
    const mongoClient = new MongoClient (mongoUri);
    await mongoClient.connect ();
    console.log ('Connected to MongoDB @ ' + mongoUri);
    const spreadsCollection = mongoClient.db ('funding').collection ('spread');

    const shutdown = async () => {
        console.log ('\nGracefully closing WebSockets...');
        await Promise.all (EXCHANGES.map ((entry) => entry.instance.close ()));
        await mongoClient.close ();
        process.exit (0);
    };
    process.on ('SIGINT', shutdown);
    process.on ('SIGTERM', shutdown);

    const consumeExchange = async (exchangeEntry) => {
        const store = exchangeState.get (exchangeEntry.id);
        const nativeInterval = exchangeEntry.instance.options?.fundingRateIntervalHours ?? DEFAULT_NATIVE_INTERVAL_HOURS;
        while (true) {
            try {
                const payload = await exchangeEntry.instance.watchFundingRates ();
                const entries = normalizeFundingPayload (payload);
                logSample (exchangeEntry.id, payload, entries);
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const symbol = entry?.symbol;
                    const rate = Number (entry?.fundingRate);
                    if ((symbol !== undefined) && Number.isFinite (rate) && exchangeEntry.filter (symbol)) {
                        const normalized = (nativeInterval > 0) ? rate * (TARGET_INTERVAL_HOURS / nativeInterval) : undefined;
                        store.set (symbol, { symbol, rate, normalizedRate: normalized, nativeIntervalHours: nativeInterval });
                    }
                }
            } catch (err) {
                console.error (`${exchangeEntry.id} watchFundingRates error:`, err);
                await delay (RETRY_DELAY_MS);
            }
        }
    };

    const persistArbitrageRows = async (rows: ArbitrageOpportunity[]) => {
        if (rows.length === 0) {
            return;
        }
        const timestamp = new Date ();
        const documents = rows.map ((row) => ({
            timestamp,
            symbol: row.baseSymbol,
            minEx: row.minEntry.exchangeId,
            minExFees: row.minFeeCost,
            minFunding: row.minEntry.normalizedRate,
            maxEx: row.maxEntry.exchangeId,
            maxExFees: row.maxFeeCost,
            maxFunding: row.maxEntry.normalizedRate,
            delta: row.delta,
            deltaWFees: row.deltaWithFees,
        }));
        try {
            await spreadsCollection.insertMany (documents, { ordered: false });
        } catch (err) {
            console.error ('Mongo insert error', err);
        }
    };

    const reporter = async () => {
        while (true) {
            const snapshot = EXCHANGES.map ((entry) => {
                const store = exchangeState.get (entry.id);
                const rows = Array.from (store.values ())
                    .sort ((a, b) => {
                        const aValue = (a.normalizedRate !== undefined) ? a.normalizedRate : a.rate;
                        const bValue = (b.normalizedRate !== undefined) ? b.normalizedRate : b.rate;
                        const aAbs = (aValue !== undefined && Number.isFinite (aValue)) ? Math.abs (aValue) : -Infinity;
                        const bAbs = (bValue !== undefined && Number.isFinite (bValue)) ? Math.abs (bValue) : -Infinity;
                        return bAbs - aAbs;
                    })
                    .slice (0, TOP_N);
                const previousSizing = columnSizing.get (entry.id);
                const initialSymbolWidth = Math.max (
                    entry.id.length,
                    previousSizing?.symbolWidth ?? MIN_SYMBOL_WIDTH,
                    MIN_SYMBOL_WIDTH
                );
                const initialRateWidth = Math.max (
                    previousSizing?.rateWidth ?? MIN_RATE_WIDTH,
                    MIN_RATE_WIDTH
                );
                const symbolWidth = rows.reduce ((acc, row) => {
                    const displaySymbol = getDisplaySymbol (row.symbol);
                    return Math.max (acc, displaySymbol.length);
                }, initialSymbolWidth);
                const rateWidth = rows.reduce ((acc, row) => {
                    const formatted = formatPercent (getNormalizedRateValue (row));
                    return Math.max (acc, formatted.length);
                }, initialRateWidth);
                const columnWidth = symbolWidth + 1 + rateWidth;
                columnSizing.set (entry.id, { symbolWidth, rateWidth });
                return { entry, rows, symbolWidth, rateWidth, columnWidth };
            });
            const hasData = snapshot.some ((col) => col.rows.length > 0);
            if (!hasData) {
                console.log ('Waiting for funding data...');
                await delay (PRINT_INTERVAL_MS);
                continue;
            }
            const header = snapshot
                .map ((col) => {
                    const title = col.entry.id.toUpperCase ().padEnd (col.symbolWidth);
                    return `${title} ${''.padEnd (col.rateWidth)}`;
                })
                .join (' | ');
            console.log (`\nTop funding rates (${TARGET_INTERVAL_HOURS}h normalized) @ ` + new Date ().toISOString ());
            console.log (header);
            for (let i = 0; i < TOP_N; i++) {
                const cells = snapshot.map ((col) => {
                    const row = col.rows[i];
                    if (row === undefined) {
                        return ''.padEnd (col.columnWidth);
                    }
                    const normalized = getNormalizedRateValue (row);
                    const rateStr = formatPercent (normalized);
                    const displaySymbol = getDisplaySymbol (row.symbol);
                    return `${displaySymbol.padEnd (col.symbolWidth)} ${rateStr.padEnd (col.rateWidth)}`;
                });
                console.log (cells.join (' | '));
            }
            const arbitrageRows = (() => {
                const grouped: Map<string, FundingBucketEntry[]> = new Map ();
                for (const exchangeEntry of EXCHANGES) {
                    const store = exchangeState.get (exchangeEntry.id);
                    if (store === undefined) {
                        continue;
                    }
                    store.forEach ((row) => {
                        const normalized = getNormalizedRateValue (row);
                        const baseSymbol = getBaseSymbol (row.symbol);
                        if (normalized === undefined || baseSymbol === undefined) {
                            return;
                        }
                        if (!grouped.has (baseSymbol)) {
                            grouped.set (baseSymbol, []);
                        }
                        grouped.get (baseSymbol).push ({
                            exchangeId: exchangeEntry.id,
                            symbol: row.symbol,
                            normalizedRate: normalized,
                        });
                    });
                }
                const opportunities: ArbitrageOpportunity[] = [];
                grouped.forEach ((entries, baseSymbol) => {
                    if (entries.length < 2) {
                        return;
                    }
                    const sorted = entries.slice ().sort ((a, b) => a.normalizedRate - b.normalizedRate);
                    const minEntry = sorted[0];
                    const maxEntry = sorted[sorted.length - 1];
                    const delta = maxEntry.normalizedRate - minEntry.normalizedRate;
                    if (delta <= 0) {
                        return;
                    }
                    const minFeeCost = getDoubleTakerFee (minEntry.exchangeId);
                    const maxFeeCost = getDoubleTakerFee (maxEntry.exchangeId);
                    const deltaWithFees = delta - (minFeeCost + maxFeeCost);
                    opportunities.push ({ baseSymbol, minEntry, maxEntry, delta, minFeeCost, maxFeeCost, deltaWithFees });
                });
                return opportunities
                    .sort ((a, b) => {
                        const feesDiff = b.deltaWithFees - a.deltaWithFees;
                        if (feesDiff !== 0) {
                            return feesDiff;
                        }
                        return b.delta - a.delta;
                    })
                    .slice (0, TOP_N);
            }) ();
            console.log ('\nTop funding spreads by base symbol (normalized to ' + TARGET_INTERVAL_HOURS + 'h):');
            if (arbitrageRows.length === 0) {
                console.log ('No cross-exchange spreads detected yet.');
            } else {
                const headers = {
                    symbol: 'Symbol',
                    lowExchange: 'Min Exch (fee*2)',
                    lowRate: 'Min Funding',
                    highExchange: 'Max Exch (fee*2)',
                    highRate: 'Max Funding',
                    delta: 'Delta',
                    deltaWithFees: 'Delta w/ Fees',
                };
                const widths = {
                    symbol: headers.symbol.length,
                    lowExchange: headers.lowExchange.length,
                    lowRate: headers.lowRate.length,
                    highExchange: headers.highExchange.length,
                    highRate: headers.highRate.length,
                    delta: headers.delta.length,
                    deltaWithFees: headers.deltaWithFees.length,
                };
                arbitrageRows.forEach ((row) => {
                    widths.symbol = Math.max (widths.symbol, row.baseSymbol.length);
                    const minExchangeLabel = formatExchangeWithFees (row.minEntry.exchangeId, row.minFeeCost);
                    widths.lowExchange = Math.max (widths.lowExchange, minExchangeLabel.length);
                    widths.lowRate = Math.max (widths.lowRate, formatPercent (row.minEntry.normalizedRate).length);
                    const maxExchangeLabel = formatExchangeWithFees (row.maxEntry.exchangeId, row.maxFeeCost);
                    widths.highExchange = Math.max (widths.highExchange, maxExchangeLabel.length);
                    widths.highRate = Math.max (widths.highRate, formatPercent (row.maxEntry.normalizedRate).length);
                    widths.delta = Math.max (widths.delta, formatPercent (row.delta).length);
                    widths.deltaWithFees = Math.max (widths.deltaWithFees, formatPercent (row.deltaWithFees).length);
                });
                const headerRow = [
                    headers.symbol.padEnd (widths.symbol),
                    headers.lowExchange.padEnd (widths.lowExchange),
                    headers.lowRate.padEnd (widths.lowRate),
                    headers.highExchange.padEnd (widths.highExchange),
                    headers.highRate.padEnd (widths.highRate),
                    headers.delta.padEnd (widths.delta),
                    headers.deltaWithFees.padEnd (widths.deltaWithFees),
                ].join (' | ');
                console.log (headerRow);
                arbitrageRows.forEach ((row) => {
                    const minExchangeLabel = formatExchangeWithFees (row.minEntry.exchangeId, row.minFeeCost);
                    const maxExchangeLabel = formatExchangeWithFees (row.maxEntry.exchangeId, row.maxFeeCost);
                    const line = [
                        row.baseSymbol.padEnd (widths.symbol),
                        minExchangeLabel.padEnd (widths.lowExchange),
                        formatPercent (row.minEntry.normalizedRate).padEnd (widths.lowRate),
                        maxExchangeLabel.padEnd (widths.highExchange),
                        formatPercent (row.maxEntry.normalizedRate).padEnd (widths.highRate),
                        formatPercent (row.delta).padEnd (widths.delta),
                        formatPercent (row.deltaWithFees).padEnd (widths.deltaWithFees),
                    ].join (' | ');
                    console.log (line);
                });
            }
            await persistArbitrageRows (arbitrageRows);
            await delay (PRINT_INTERVAL_MS);
        }
    };

    const consumers = EXCHANGES.map ((entry) => consumeExchange (entry));
    await Promise.all ([ reporter (), ...consumers ]);
}

await main ();
