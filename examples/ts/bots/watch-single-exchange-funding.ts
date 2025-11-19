import ccxt from '../../../ts/ccxt.ts';

const cliExchange = process.argv[2];
const EXCHANGE_ID = cliExchange ?? process.env.FUNDING_EXCHANGE ?? 'lighter';
const RETRY_DELAY_MS = 5000;
const MAX_LOG_ENTRIES = Number (process.env.FUNDING_LOG_SAMPLE ?? '5');
const SPEED = process.env.FUNDING_SPEED;
const INCLUDE_OPTIONS = process.env.FUNDING_INCLUDE_OPTIONS === '1';
const TARGET_INTERVAL_HOURS = 24;
const DEFAULT_NATIVE_INTERVAL_HOURS = 8;
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

async function main () {
    const ExchangeClass = ccxt.pro[EXCHANGE_ID];
    if (ExchangeClass === undefined) {
        throw new Error ('Exchange ' + EXCHANGE_ID + ' is not available in ccxt.pro');
    }
    const exchange = new ExchangeClass ({
        enableRateLimit: true,
        options: {
            watchFundingRatesDebug: true,
        },
    });

    const shutdown = async () => {
        console.log ('\nShutting down ' + EXCHANGE_ID + ' watcher...');
        await exchange.close ();
        process.exit (0);
    };
    process.on ('SIGINT', shutdown);
    process.on ('SIGTERM', shutdown);

    await exchange.loadMarkets ();
    console.log (`${EXCHANGE_ID} loaded ${exchange.symbols.length} symbols`);

    const params = (SPEED !== undefined) ? { speed: SPEED } : {};
    const nativeIntervalHours = exchange.options?.fundingRateIntervalHours ?? DEFAULT_NATIVE_INTERVAL_HOURS;

    while (true) {
        try {
            const payload = await exchange.watchFundingRates (undefined, params);
            const entries = normalizeFundingPayload (payload);
            const ts = new Date ().toISOString ();
            console.log (`[${ts}] RAW ${EXCHANGE_ID} payload sample:`, entries.slice (0, Math.min (entries.length, MAX_LOG_ENTRIES)));
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const symbol = entry?.symbol;
                const rate = Number (entry?.fundingRate);
                if ((symbol === undefined) || !Number.isFinite (rate)) {
                    continue;
                }
                if (!INCLUDE_OPTIONS && symbol.includes ('-')) {
                    continue;
                }
                const normalized = (nativeIntervalHours > 0) ? rate * (TARGET_INTERVAL_HOURS / nativeIntervalHours) : undefined;
                const percentStr = (normalized !== undefined && Number.isFinite (normalized)) ? ((normalized >= 0 ? '+' : '') + (normalized * 100).toFixed (4) + `% / ${TARGET_INTERVAL_HOURS}h`) : 'n/a';
                const rawStr = (rate >= 0 ? '+' : '') + rate.toString ();
                console.log (`${EXCHANGE_ID} ${symbol} fundingRate=${percentStr} raw=${rawStr} markPrice=${entry?.markPrice ?? entry?.mark_price} indexPrice=${entry?.indexPrice ?? entry?.index_price}`);
            }
        } catch (err) {
            console.error (EXCHANGE_ID + ' watchFundingRates error:', err);
            await delay (RETRY_DELAY_MS);
        }
    }
}

await main ();
