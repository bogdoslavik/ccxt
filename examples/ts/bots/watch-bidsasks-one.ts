import ccxt from '../../../ts/ccxt';

// Usage: tsx examples/ts/bots/watch-bidsasks-one.ts <exchangeId> [symbol]
// Defaults: exchangeId=paradex, symbol=all (aggregate stream if supported)

const main = async () => {
    const exchangeId = process.argv[2] ?? 'hyperliquid'; // hyperliquid paradex asterdex lighter extended
    const symbol = process.argv[3] ?? 'ETH/USDC:USDC'; //hyperliquid paradex lighter
    // const symbol = process.argv[3] ?? 'ETH/USDT:USDT'; //asterdex
    if (!(exchangeId in ccxt.pro)) {
        console.error ('Unknown exchange id:', exchangeId);
        process.exit (1);
    }

    const exchange = new (ccxt.pro as any)[exchangeId] ({ enableRateLimit: true });
    // exchange.verbose = true;
    await exchange.loadMarkets ();
    const symbols = exchange.symbols ?? [];
    console.log (`Loaded ${symbols.length} symbols for ${exchangeId}:`);
    console.log (symbols.join (', '));

    const shutdown = async () => {
        console.log ('\nClosing WebSocket...');
        await exchange.close ();
        process.exit (0);
    };
    process.on ('SIGINT', shutdown);
    process.on ('SIGTERM', shutdown);

    console.log (`Subscribed to watchBidsAsks on ${exchangeId}${symbol ? ' ' + symbol : ''}`);
    while (true) {
        try {
            const result = symbol ? await exchange.watchBidAsk (symbol) : await exchange.watchBidsAsks ();
            console.log (new Date ().toISOString (), JSON.stringify (result, null, 2));
        } catch (e) {
            console.error ('watch error', e);
            await new Promise ((resolve) => setTimeout (resolve, 2000));
        }
    }
};

main ();
