import ccxt from '../../../ts/ccxt.js';

async function main () {
    const exchange = new ccxt.pro.paradex ({
        enableRateLimit: true,
    });
    process.on ('SIGINT', async () => {
        console.log ('\nGracefully closing WebSocket...');
        await exchange.close ();
        process.exit (0);
    });
    while (true) {
        try {
            const fundingRates = await exchange.watchFundingRates ();
            const entries = Object.values (fundingRates);
            entries.sort ((a, b) => {
                const aRateRaw = (typeof a?.fundingRate === 'number') ? a.fundingRate : parseFloat (a?.fundingRate ?? 'NaN');
                const bRateRaw = (typeof b?.fundingRate === 'number') ? b.fundingRate : parseFloat (b?.fundingRate ?? 'NaN');
                const aRate = Number.isFinite (aRateRaw) ? aRateRaw : Infinity;
                const bRate = Number.isFinite (bRateRaw) ? bRateRaw : Infinity;
                const aAbs = Math.abs (aRate);
                const bAbs = Math.abs (bRate);
                return aAbs - bAbs;
            });
            const maxSymbolLength = 30

            for (let i = 0; i < entries.length; i++) {
                const rate = entries[i];
                const symbol = rate['symbol'] ?? '';
                const fundingRate = rate['fundingRate'];
                console.log (`${symbol.padEnd (maxSymbolLength)} ${fundingRate<0 ? fundingRate : '+'+fundingRate}`);

            }
        } catch (err) {
            console.error ('watchFundingRate error:', err);
            await exchange.sleep (5000);
        }
    }
}

await main ();
