import ccxt from '../../../ts/ccxt.js';

const TOP_N = 30;
const PRINT_INTERVAL_MS = 1000;

async function main () {
    const exchange = new ccxt.pro.paradex ({
        enableRateLimit: true,
    });
    const fundingMap: Map<string, number> = new Map ();

    const shutdown = async () => {
        console.log ('\nGracefully closing WebSocket...');
        await exchange.close ();
        process.exit (0);
    };
    process.on ('SIGINT', shutdown);
    process.on ('SIGTERM', shutdown);

    const consume = async () => {
        while (true) {
            try {
                const fundingRates = await exchange.watchFundingRates ();
                const entries = Object.values (fundingRates);
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const symbol = entry?.symbol;
                    const rate = Number (entry?.fundingRate);
                    if ((symbol !== undefined) && Number.isFinite (rate) && (symbol.indexOf ('-') === -1)) {
                        fundingMap.set (symbol, rate);
                    }
                }
            } catch (err) {
                console.error ('watchFundingRates error:', err);
                await exchange.sleep (5000);
            }
        }
    };

    const reporter = async () => {
        while (true) {
            if (fundingMap.size > 0) {
                const rows = Array.from (fundingMap.entries ())
                    .sort ((a, b) => b[1] - a[1])
                    .slice (0, TOP_N);
                const maxSymbolLength = rows.reduce ((acc, [ symbol ]) => Math.max (acc, symbol.length), 0);
                console.log ('\nTop funding rates @ ' + new Date ().toISOString ());
                for (let i = 0; i < rows.length; i++) {
                    const [ symbol, rate ] = rows[i];
                    const rateStr = (rate >= 0 ? '+' : '') + rate.toString ();
                    console.log (`${symbol.padEnd (maxSymbolLength)} ${rateStr}`);
                }
            } else {
                console.log ('Waiting for funding data...');
            }
            await exchange.sleep (PRINT_INTERVAL_MS);
        }
    };

    await Promise.all ([ consume (), reporter () ]);
}

await main ();
