import ccxt from '../../../ts/ccxt';
import { MongoClient } from 'mongodb';

const PRINT_INTERVAL_MS = 1000;
const RETRY_DELAY_MS = 3000;
const TOP_ROWS = 5;

type BidAskRow = {
    symbol: string;
    bid?: number;
    ask?: number;
    timestamp?: number;
};

type ExchangeEntry = {
    id: string;
    instance: any;
};

// asterdex temporarily excluded (requires symbols arg in watchBidsAsks)
const EXCHANGES: ExchangeEntry[] = [
    { id: 'paradex', instance: new ccxt.pro.paradex ({ enableRateLimit: true }) },
    // { id: 'asterdex', instance: new ccxt.pro.asterdex ({ enableRateLimit: true }) },
    { id: 'hyperliquid', instance: new ccxt.pro.hyperliquid ({ enableRateLimit: true }) },
    { id: 'lighter', instance: new ccxt.pro.lighter ({ enableRateLimit: true }) },
];

const TAKER_FEES: Record<string, number> = {
    paradex: 0,
    asterdex: 0.00035,
    hyperliquid: 0.00045,
    lighter: 0,
};

const delay = (ms: number) => new Promise ((resolve) => setTimeout (resolve, ms));

const normalizeBidAskPayload = (payload): BidAskRow[] => {
    if (Array.isArray (payload)) {
        return payload as BidAskRow[];
    }
    if ((payload !== undefined) && (typeof payload === 'object')) {
        if ('symbol' in payload) {
            return [ payload as BidAskRow ];
        }
        return Object.values (payload) as BidAskRow[];
    }
    return [];
};

const toNumber = (value): number | undefined => {
    const num = Number (value);
    return Number.isFinite (num) ? num : undefined;
};

const getDoubleFee = (exchangeId: string): number => (TAKER_FEES[exchangeId] ?? 0) * 2;

const pad = (value: string, size: number) => value.padEnd (size, ' ');
const padLeft = (value: string, size: number) => value.padStart (size, ' ');

const getBaseSymbol = (symbol?: string): string => {
    if (!symbol) {
        return '';
    }
    const seps = [ '/', ':', '-' ];
    for (const sep of seps) {
        const idx = symbol.indexOf (sep);
        if (idx !== -1) {
            return symbol.slice (0, idx);
        }
    }
    return symbol;
};

const formatPrice = (value?: number): string => {
    if (value === undefined || !Number.isFinite (value)) {
        return 'n/a';
    }
    // adaptive precision: 4 decimals for large, 8 for small
    return (value >= 1 ? value.toFixed (4) : value.toFixed (8));
};

const formatSide = (exId: string, price?: number): string => {
    // fees omitted in output as requested
    return `${exId} @ ${formatPrice (price)}`;
};

async function main () {
    const mongoUri = process.env.MONGO_URI ?? 'mongodb://localhost:27017';
    const mongoClient = new MongoClient (mongoUri);
    await mongoClient.connect ();
    const arbCollection = mongoClient.db ('arb').collection ('perps');

    const state: Map<string, { book: Map<string, BidAskRow>; updates: number; sample?: BidAskRow }> = new Map ();
    for (const entry of EXCHANGES) {
        await entry.instance.loadMarkets ();
        state.set (entry.id, { book: new Map (), updates: 0 });
    }

    const shutdown = async () => {
        console.log ('\nClosing sockets...');
        await Promise.allSettled (EXCHANGES.map ((e) => e.instance.close ()));
        await mongoClient.close ();
        process.exit (0);
    };
    process.on ('SIGINT', shutdown);
    process.on ('SIGTERM', shutdown);

    const consumeExchange = async (entry: ExchangeEntry) => {
        const store = state.get (entry.id);
        while (true) {
            try {
                const payload = await entry.instance.watchBidsAsks ();
                const rows = normalizeBidAskPayload (payload);
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
            const symbol = row?.symbol;
            const market = entry.instance.safeMarket (symbol, undefined);
                    // accept any derivative/spot instrument
                    const bid = toNumber (row.bid);
                    const ask = toNumber (row.ask);
                    if (!Number.isFinite (bid) && !Number.isFinite (ask)) {
                        continue;
                    }
                    const parsed: BidAskRow = { symbol: market.symbol, bid, ask, timestamp: entry.instance.safeInteger (row, 'timestamp') };
                    store?.book.set (market.symbol, parsed);
                    if (store !== undefined) {
                        store.updates += 1;
                        if (store.sample === undefined) {
                            store.sample = parsed;
                        }
                    }
                }
            } catch (err) {
                console.error (`${entry.id} watchBidsAsks error`, err);
                await delay (RETRY_DELAY_MS);
            }
        }
    };

    EXCHANGES.forEach ((entry) => consumeExchange (entry));

    const computeArb = () => {
        const symbols = new Set<string>();
        state.forEach ((value) => {
            value.book.forEach ((_, sym) => symbols.add (sym));
        });
        const rows = [];
        symbols.forEach ((symbol) => {
            let minAsk = Infinity;
            let minEx = '';
            let maxBid = -Infinity;
            let maxEx = '';
            state.forEach ((value, exId) => {
                const row = value.book.get (symbol);
                if (row === undefined) {
                    return;
                }
                if (row.ask !== undefined && row.ask < minAsk) {
                    minAsk = row.ask;
                    minEx = exId;
                }
                if (row.bid !== undefined && row.bid > maxBid) {
                    maxBid = row.bid;
                    maxEx = exId;
                }
            });
            if (!Number.isFinite (minAsk) || !Number.isFinite (maxBid) || minEx === '' || maxEx === '' || maxBid <= minAsk) {
                return;
            }
            const delta = (maxBid - minAsk) / minAsk;
            const totalFees = getDoubleFee (minEx) + getDoubleFee (maxEx);
            const deltaWFees = delta - totalFees;
            if (deltaWFees > 0) {
                rows.push ({ symbol, minEx, maxEx, minAsk, maxBid, delta, deltaWFees });
            }
        });
        return rows.sort ((a, b) => b.deltaWFees - a.deltaWFees).slice (0, TOP_ROWS);
    };

    const persistArb = async (rows) => {
        if (rows.length === 0) {
            return;
        }
        const timestamp = new Date ();
        const docs = rows.map ((row) => ({
            timestamp,
            symbol: row.symbol,
            longExchange: row.minEx,
            shortExchange: row.maxEx,
            longAsk: row.minAsk,
            shortBid: row.maxBid,
            longPrice: row.minAsk,
            shortPrice: row.maxBid,
            delta: row.delta,
            deltaWFees: row.deltaWFees,
            longFee: getDoubleFee (row.minEx),
            shortFee: getDoubleFee (row.maxEx),
            longSymbol: row.symbol,
            shortSymbol: row.symbol,
        }));
        try {
            await arbCollection.insertMany (docs, { ordered: false });
        } catch (err) {
            console.error ('Mongo insertMany error', err);
        }
    };

    setInterval (async () => {
        const ts = new Date ().toISOString ();
        console.log (`\n[${ts}] updates in last ${(PRINT_INTERVAL_MS / 1000).toFixed (1)}s`);
        EXCHANGES.forEach ((entry) => {
            const info = state.get (entry.id);
            const sample = info?.sample;
            const sampleBase = sample ? getBaseSymbol (sample.symbol) : undefined;
            const sampleStr = (sample !== undefined) ? `${sampleBase} b:${sample.bid} a:${sample.ask}` : 'n/a';
            const updates = info?.updates ?? 0;
            console.log (`${pad (entry.id, 12)} | updates: ${updates.toString ().padStart (5)} | sample: ${sampleStr}`);
            if (info !== undefined) {
                info.updates = 0;
                info.sample = undefined;
            }
        });

        const top = computeArb ();
        if (top.length > 0) {
            const symW = 8;
            const exchW = 32;
            const deltaW = 12;
            console.log (
                pad ('Symbol', symW) + ' | ' +
                pad ('Long Side', exchW) + ' | ' +
                pad ('Short Side', exchW) + ' | ' +
                pad ('Delta', deltaW) + ' | ' +
                pad ('Delta w/ Fees', deltaW)
            );
            for (let i = 0; i < top.length; i++) {
                const row = top[i];
                const longFee = getDoubleFee (row.minEx);
                const shortFee = getDoubleFee (row.maxEx);
                const deltaPct = (row.delta * 100).toFixed (4) + '%';
                const deltaFeePct = (row.deltaWFees * 100).toFixed (4) + '%';
                const base = getBaseSymbol (row.symbol);
                const longStr = formatSide (row.minEx, row.minAsk/*, longFee*/);
                const shortStr = formatSide (row.maxEx, row.maxBid/*, shortFee*/);
                console.log (
                    pad (base, symW) + ' | ' +
                    pad (longStr, exchW) + ' | ' +
                    pad (shortStr, exchW) + ' | ' +
                    padLeft (deltaPct, deltaW) + ' | ' +
                    padLeft (deltaFeePct, deltaW)
                );
            }
            await persistArb (top);
        } else {
            console.log ('No positive spread detected');
        }
    }, PRINT_INTERVAL_MS);
}

main ().catch ((err) => {
    console.error (err);
    process.exit (1);
});
