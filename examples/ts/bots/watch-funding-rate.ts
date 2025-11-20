import ccxt from '../../../ts/ccxt';

const TOP_N = 10;
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

type FundingRow = {
    symbol: string;
    rate: number;
    normalizedRate?: number;
    nativeIntervalHours?: number;
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

    const shutdown = async () => {
        console.log ('\nGracefully closing WebSockets...');
        await Promise.all (EXCHANGES.map ((entry) => entry.instance.close ()));
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
                    const displaySymbol = (row.symbol?.split ('/')[0]) ?? row.symbol;
                    return Math.max (acc, displaySymbol.length);
                }, initialSymbolWidth);
                const rateWidth = rows.reduce ((acc, row) => {
                    const percent = (row.normalizedRate !== undefined) ? row.normalizedRate * 100 : (row.rate !== undefined ? row.rate * 100 : undefined);
                    const formatted = (percent !== undefined && Number.isFinite (percent)) ? ((percent >= 0 ? '+' : '') + percent.toFixed (4) + '%') : 'n/a';
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
                    const normalized = (row.normalizedRate !== undefined) ? row.normalizedRate : row.rate;
                    const percent = (normalized !== undefined) ? normalized * 100 : undefined;
                    const rateStr = (percent !== undefined && Number.isFinite (percent)) ? ((percent >= 0 ? '+' : '') + percent.toFixed (4) + '%') : 'n/a';
                    const displaySymbol = (row.symbol?.split ('/')[0]) ?? row.symbol;
                    return `${displaySymbol.padEnd (col.symbolWidth)} ${rateStr.padEnd (col.rateWidth)}`;
                });
                console.log (cells.join (' | '));
            }
            await delay (PRINT_INTERVAL_MS);
        }
    };

    const consumers = EXCHANGES.map ((entry) => consumeExchange (entry));
    await Promise.all ([ reporter (), ...consumers ]);
}

await main ();
