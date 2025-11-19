import ccxt from '../../../ts/ccxt';

const TOP_N = 10;
const PRINT_INTERVAL_MS = 1000;
const RETRY_DELAY_MS = 5000;
const EXCHANGES = [
    { id: 'paradex', instance: new ccxt.pro.paradex ({ enableRateLimit: true }), filter: (symbol: string) => symbol.indexOf ('-') === -1 },
    { id: 'asterdex', instance: new ccxt.pro.asterdex ({ enableRateLimit: true }), filter: (_symbol: string) => true },
    { id: 'hyperliquid', instance: new ccxt.pro.hyperliquid ({ enableRateLimit: true }), filter: (_symbol: string) => true },
];

type FundingRow = {
    symbol: string;
    rate: number;
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

    const shutdown = async () => {
        console.log ('\nGracefully closing WebSockets...');
        await Promise.all (EXCHANGES.map ((entry) => entry.instance.close ()));
        process.exit (0);
    };
    process.on ('SIGINT', shutdown);
    process.on ('SIGTERM', shutdown);

    const consumeExchange = async (exchangeEntry) => {
        const store = exchangeState.get (exchangeEntry.id);
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
                        store.set (symbol, { symbol, rate });
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
                    .sort ((a, b) => b.rate - a.rate)
                    .slice (0, TOP_N);
                const symbolWidth = rows.reduce ((acc, row) => Math.max (acc, row.symbol.length), entry.id.length);
                const rateWidth = rows.reduce ((acc, row) => Math.max (acc, ((row.rate >= 0 ? '+' : '') + row.rate.toString ()).length), 5);
                return { entry, rows, symbolWidth, rateWidth, columnWidth: symbolWidth + 1 + rateWidth };
            });
            const hasData = snapshot.some ((col) => col.rows.length > 0);
            if (!hasData) {
                console.log ('Waiting for funding data...');
                await delay (PRINT_INTERVAL_MS);
                continue;
            }
            const header = snapshot.map ((col) => col.entry.id.toUpperCase ().padEnd (col.columnWidth)).join (' | ');
            console.log ('\nTop funding rates @ ' + new Date ().toISOString ());
            console.log (header);
            for (let i = 0; i < TOP_N; i++) {
                const cells = snapshot.map ((col) => {
                    const row = col.rows[i];
                    if (row === undefined) {
                        return ''.padEnd (col.columnWidth);
                    }
                    const rateStr = (row.rate >= 0 ? '+' : '') + row.rate.toString ();
                    return `${row.symbol.padEnd (col.symbolWidth)} ${rateStr.padEnd (col.columnWidth - col.symbolWidth)}`;
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
