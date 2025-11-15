//  ---------------------------------------------------------------------------

import asterdexRest from '../asterdex.js';
import Client from '../base/ws/Client.js';
import { ArrayCache, ArrayCacheByTimestamp, ArrayCacheBySymbolById, ArrayCacheBySymbolBySide } from '../base/ws/Cache.js';
import { ArgumentsRequired } from '../base/errors.js';
import type { OrderBook, Trade, Ticker, Tickers, OHLCV, Int, Str, Strings, Dict, Balances, Order, Position, Market, Liquidation } from '../base/types.js';

//  ---------------------------------------------------------------------------

export default class asterdex extends asterdexRest {
    listenKeyRefreshTimer: any = undefined;
    orders: ArrayCacheBySymbolById | undefined;
    myTrades: ArrayCache | undefined;
    positions: ArrayCacheBySymbolBySide | undefined;
    compositeIndex: Tickers | undefined;
    describe (): any {
        const parent = super.describe ();
        return this.deepExtend (parent, {
            'has': this.deepExtend (parent['has'], {
                'ws': true,
                'watchTrades': true,
                'watchAggTrades': true,
                'watchTickers': true,
                'watchTicker': true,
                'watchOrderBook': true,
                'watchOrderBookForSymbols': true,
                'watchOHLCV': true,
                'watchMarkOHLCV': true,
                'watchIndexOHLCV': true,
                'watchContinuousOHLCV': true,
                'watchMarkPrice': true,
                'watchMarkPrices': true,
                'watchBidsAsks': true,
                'watchCompositeIndex': true,
                'watchGlobalLongShortAccountRatio': true,
                'watchTopLongShortAccountRatio': true,
                'watchTopLongShortPositionRatio': true,
                'watchLiquidations': true,
                'watchLiquidationsForSymbols': true,
                'watchOrders': true,
                'watchMyTrades': true,
                'watchPositions': true,
                'watchMarginCall': true,
                'watchAccountConfig': true,
            }),
            'urls': this.deepExtend (parent['urls'], {
                'api': this.deepExtend (parent['urls']['api'], {
                    'ws': this.deepExtend (parent['urls']['api']['ws'], {
                        // https://docs.asterdex.com/product/aster-perpetual-pro/api/api-documentation#mark-price-stream-for-all-markets
                        'future': 'wss://fstream.asterdex.com/ws',
                        'combined': 'wss://fstream.asterdex.com/stream?streams=',
                    }),
                }),
            }),
        });
    }

    formatPerpStream (marketId: Str, topic: Str) {
        return marketId.toLowerCase () + '@' + topic;
    }

    getStreamUrl (stream: Str) {
        return this.urls['api']['ws']['future'] + '/' + stream;
    }

    getKlineMessageHash (scope: Str, symbol: Str, timeframe: Str) {
        return 'ohlcv:' + scope + ':' + symbol + ':' + timeframe;
    }

    getKlineCache (symbol: Str, scope: Str, timeframe: Str) {
        this.ohlcvs = this.safeValue (this, 'ohlcvs', {});
        const timeframeKey = scope + ':' + timeframe;
        if (!(symbol in this.ohlcvs)) {
            this.ohlcvs[symbol] = {};
        }
        if (!(timeframeKey in this.ohlcvs[symbol])) {
            const limit = this.safeInteger (this.options, 'OHLCVLimit', 1000);
            this.ohlcvs[symbol][timeframeKey] = new ArrayCacheByTimestamp (limit);
        }
        return this.ohlcvs[symbol][timeframeKey];
    }

    getKlineStream (market, timeframe: Str, scope: Str, params = {}) {
        const interval = timeframe;
        if (scope === 'kline') {
            return this.formatPerpStream (market['id'], 'kline_' + interval);
        } else if (scope === 'mark') {
            return this.formatPerpStream (market['id'], 'markPriceKline_' + interval);
        } else if (scope === 'index') {
            return this.formatPerpStream (market['id'], 'indexPriceKline_' + interval);
        } else if (scope === 'continuous') {
            const contractType = this.safeStringLower (params, 'contractType', 'perpetual');
            const pairId = market['id'].replace (':', '').toLowerCase ();
            return pairId + '_' + contractType + '@continuousKline_' + interval;
        }
        return this.formatPerpStream (market['id'], 'kline_' + interval);
    }

    async watchKlineHelper (symbol: string, timeframe = '1m', since: Int = undefined, limit: Int = undefined, scope: Str = 'kline', params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.getKlineStream (market, timeframe, scope, params);
        const messageHash = this.getKlineMessageHash (scope, market['symbol'], timeframe);
        const url = this.getStreamUrl (stream);
        const cache = this.getKlineCache (market['symbol'], scope, timeframe);
        const requestParams = (scope === 'continuous') ? this.omit (params, 'contractType') : params;
        await this.watch (url, messageHash, undefined, requestParams);
        if (this.newUpdates) {
            limit = cache.getLimit (market['symbol'], limit);
        }
        return this.filterBySinceLimit (cache, since, limit, 0, true);
    }

    async watchSentimentHelper (scope: Str, symbol: string = undefined, params = {}) {
        await this.loadMarkets ();
        let messageHash = scope;
        let stream = '!' + scope + '@arr';
        if (symbol !== undefined) {
            const market = this.market (symbol);
            stream = this.formatPerpStream (market['id'], scope);
            messageHash = scope + ':' + market['symbol'];
        }
        return await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
    }

    async watchTrades (symbol: string, since: Int = undefined, limit: Int = undefined, params = {}): Promise<Trade[]> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'trade');
        const messageHash = 'trade:' + market['symbol'];
        const trades = await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
        if (this.newUpdates) {
            limit = trades.getLimit (market['symbol'], limit);
        }
        return this.filterBySinceLimit (trades, since, limit, 'timestamp', true);
    }

    async watchAggTrades (symbol: string, since: Int = undefined, limit: Int = undefined, params = {}): Promise<Trade[]> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'aggTrade');
        const messageHash = 'aggtrade:' + market['symbol'];
        const trades = await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
        if (this.newUpdates) {
            limit = trades.getLimit (market['symbol'], limit);
        }
        return this.filterBySinceLimit (trades, since, limit, 'timestamp', true);
    }

    async watchOrderBook (symbol: string, limit: Int = undefined, params = {}): Promise<OrderBook> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        limit = (limit === undefined) ? this.safeInteger (this.options, 'watchOrderBookLimit', 1000) : limit;
        let depth = 'depth20';
        if (limit <= 5) {
            depth = 'depth5';
        } else if (limit <= 10) {
            depth = 'depth10';
        }
        const stream = this.formatPerpStream (market['id'], depth + '@100ms');
        const url = this.getStreamUrl (stream);
        const messageHash = 'orderbook:' + market['symbol'];
        this.prepareOrderBook (market['symbol'], limit, params);
        const client = this.client (url);
        this.spawn (this.fetchOrderBookSnapshot, client, { 'symbol': market['symbol'], 'limit': limit, 'params': params });
        return await this.watch (url, messageHash, undefined, params);
    }

    async watchOrderBookForSymbols (symbols: string[], limit: Int = undefined, params = {}): Promise<OrderBook> {
        await this.loadMarkets ();
        symbols = this.marketSymbols (symbols);
        if ((symbols === undefined) || (symbols.length === 0)) {
            throw new ArgumentsRequired (this.id + ' watchOrderBookForSymbols() requires a non-empty array of symbols');
        }
        const markets = symbols.map ((symbol) => this.market (symbol));
        const streamHashes = [];
        const urls = [];
        for (let i = 0; i < markets.length; i++) {
            const market = markets[i];
            limit = (limit === undefined) ? this.safeInteger (this.options, 'watchOrderBookLimit', 1000) : limit;
            let depth = 'depth20';
            if (limit <= 5) {
                depth = 'depth5';
            } else if (limit <= 10) {
                depth = 'depth10';
            }
            const stream = this.formatPerpStream (market['id'], depth + '@100ms');
            streamHashes.push (stream);
            urls.push (this.getStreamUrl (stream));
            this.prepareOrderBook (market['symbol'], limit, params);
        }
        const promises = urls.map ((url, index) => {
            const market = markets[index];
            const messageHash = 'orderbook:' + market['symbol'];
            const client = this.client (url);
            this.spawn (this.fetchOrderBookSnapshot, client, { 'symbol': market['symbol'], 'limit': limit, 'params': params });
            return this.watch (url, messageHash, undefined, params);
        });
        const results = await Promise.all (promises);
        return results[results.length - 1];
    }

    prepareOrderBook (symbol: Str, limit: Int = undefined, params = {}) {
        if (this.orderbooks === undefined) {
            this.orderbooks = {};
        }
        let orderbook = this.safeValue (this.orderbooks, symbol);
        if (orderbook === undefined) {
            orderbook = this.orderBook ({}, limit);
            orderbook['symbol'] = symbol;
            orderbook['cache'] = [];
            this.orderbooks[symbol] = orderbook;
        }
        orderbook['limit'] = limit;
        orderbook['params'] = params;
        orderbook['cache'] = this.safeValue (orderbook, 'cache', []);
        return orderbook;
    }

    async fetchOrderBookSnapshot (client: Client, subscription) {
        const symbol = this.safeString (subscription, 'symbol');
        const limit = this.safeInteger (subscription, 'limit', this.safeInteger (this.options, 'watchOrderBookLimit', 1000));
        const params = this.safeValue (subscription, 'params');
        const messageHash = 'orderbook:' + symbol;
        try {
            const snapshot = await this.fetchOrderBook (symbol, limit, params);
            const orderbook = this.safeValue (this.orderbooks, symbol);
            if (orderbook === undefined) {
                return;
            }
            orderbook.reset (snapshot);
            orderbook['nonce'] = this.safeInteger (snapshot, 'nonce');
            const cache = this.safeValue (orderbook, 'cache', []);
            orderbook['cache'] = [];
            for (let i = 0; i < cache.length; i++) {
                const message = cache[i];
                this.handleDepth (client, message);
            }
            client.resolve (orderbook, messageHash);
        } catch (error) {
            client.reject (error, messageHash);
        }
    }

    reloadOrderBook (client: Client, messageHash: Str, symbol: Str) {
        const orderbook = this.safeValue (this.orderbooks, symbol);
        if (orderbook === undefined) {
            return;
        }
        orderbook['nonce'] = undefined;
        orderbook['cache'] = [];
        const limit = this.safeInteger (orderbook, 'limit');
        const params = this.safeValue (orderbook, 'params', {});
        this.spawn (this.fetchOrderBookSnapshot, client, { 'symbol': symbol, 'limit': limit, 'params': params });
    }

    async watchTicker (symbol: string, params = {}): Promise<Ticker> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'ticker');
        const messageHash = 'ticker:' + market['symbol'];
        return await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
    }

    async watchTickers (symbols: Strings = undefined, params = {}): Promise<Tickers> {
        await this.loadMarkets ();
        symbols = this.marketSymbols (symbols);
        if (symbols === undefined || symbols.length === 0) {
            throw new ArgumentsRequired (this.id + ' watchTickers() requires a symbols argument');
        }
        const tickers = await Promise.all (symbols.map ((symbol) => this.watchTicker (symbol, params)));
        const result: Tickers = {};
        for (let i = 0; i < tickers.length; i++) {
            const ticker = tickers[i];
            const tickerSymbol = ticker['symbol'];
            result[tickerSymbol] = ticker;
        }
        return result;
    }

    async watchOHLCV (symbol: string, timeframe = '1m', since: Int = undefined, limit: Int = undefined, params = {}): Promise<OHLCV[]> {
        return await this.watchKlineHelper (symbol, timeframe, since, limit, 'kline', params);
    }

    async watchMarkOHLCV (symbol: string, timeframe = '1m', since: Int = undefined, limit: Int = undefined, params = {}): Promise<OHLCV[]> {
        return await this.watchKlineHelper (symbol, timeframe, since, limit, 'mark', params);
    }

    async watchIndexOHLCV (symbol: string, timeframe = '1m', since: Int = undefined, limit: Int = undefined, params = {}): Promise<OHLCV[]> {
        return await this.watchKlineHelper (symbol, timeframe, since, limit, 'index', params);
    }

    async watchContinuousOHLCV (symbol: string, timeframe = '1m', contractType: Str = 'perpetual', since: Int = undefined, limit: Int = undefined, params = {}): Promise<OHLCV[]> {
        return await this.watchKlineHelper (symbol, timeframe, since, limit, 'continuous', this.extend (params, { 'contractType': contractType }));
    }

    async watchMarkPrice (symbol: string, params = {}): Promise<Ticker> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'markPrice@1s');
        const messageHash = 'markprice:' + market['symbol'];
        return await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
    }

    async watchMarkPrices (symbols: Strings = undefined, params = {}): Promise<Tickers> {
        await this.loadMarkets ();
        symbols = this.marketSymbols (symbols);
        if (symbols === undefined || symbols.length === 0) {
            const stream = '!markPrice@arr';
            const messageHash = 'markprices';
            return await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
        }
        const tickers = await Promise.all (symbols.map ((symbol) => this.watchMarkPrice (symbol, params)));
        const result: Tickers = {};
        for (let i = 0; i < tickers.length; i++) {
            const ticker = tickers[i];
            const tickerSymbol = ticker['symbol'];
            result[tickerSymbol] = ticker;
        }
        return result;
    }

    async watchBidsAsks (symbols: Strings = undefined, params = {}): Promise<Tickers> {
        await this.loadMarkets ();
        symbols = this.marketSymbols (symbols);
        if (symbols === undefined || symbols.length === 0) {
            throw new ArgumentsRequired (this.id + ' watchBidsAsks() requires a symbols argument');
        }
        const bidsasks = await Promise.all (symbols.map ((symbol) => this.watchBidAsk (symbol, params)));
        const result: Tickers = {};
        for (let i = 0; i < bidsasks.length; i++) {
            const ticker = bidsasks[i];
            const tickerSymbol = ticker['symbol'];
            result[tickerSymbol] = ticker;
        }
        return result;
    }

    async watchBidAsk (symbol: string, params = {}): Promise<Ticker> {
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'bookTicker');
        const messageHash = 'bidask:' + market['symbol'];
        return await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
    }

    async watchCompositeIndex (symbols: Strings = undefined, params = {}): Promise<Tickers> {
        await this.loadMarkets ();
        if (symbols === undefined || symbols.length === 0) {
            return await this.watch (this.getStreamUrl ('!compositeIndex@arr'), 'compositeIndex', undefined, params);
        }
        const tickers = await Promise.all (symbols.map ((symbol) => this.watchSingleCompositeIndex (symbol, params)));
        const result: Tickers = {};
        for (let i = 0; i < tickers.length; i++) {
            const ticker = tickers[i];
            const tickerSymbol = ticker['symbol'];
            result[tickerSymbol] = ticker;
        }
        return result;
    }

    async watchSingleCompositeIndex (symbol: string, params = {}) {
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'compositeIndex');
        const messageHash = 'compositeIndex:' + market['symbol'];
        return await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
    }

    async watchGlobalLongShortAccountRatio (symbol: string = undefined, params = {}) {
        return await this.watchSentimentHelper ('globalLongShortAccountRatio', symbol, params);
    }

    async watchTopLongShortAccountRatio (symbol: string = undefined, params = {}) {
        return await this.watchSentimentHelper ('topLongShortAccountRatio', symbol, params);
    }

    async watchTopLongShortPositionRatio (symbol: string = undefined, params = {}) {
        return await this.watchSentimentHelper ('topLongShortPositionRatio', symbol, params);
    }

    async watchLiquidations (symbol: string = undefined, since: Int = undefined, limit: Int = undefined, params = {}): Promise<Liquidation[]> {
        await this.loadMarkets ();
        let messageHash = 'liquidations';
        let stream = '!forceOrder@arr';
        if (symbol !== undefined) {
            const market = this.market (symbol);
            messageHash = 'liquidations:' + market['symbol'];
            stream = this.formatPerpStream (market['id'], 'forceOrder');
        }
        await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
        const cache = this.getLiquidationsCache (symbol);
        return this.filterBySinceLimit (cache, since, limit, 'timestamp', true);
    }

    async watchLiquidationsForSymbols (symbols: Strings = undefined, since: Int = undefined, limit: Int = undefined, params = {}): Promise<Liquidation[]> {
        await this.loadMarkets ();
        if (symbols === undefined) {
            return await this.watchLiquidations (undefined, since, limit, params);
        }
        symbols = this.marketSymbols (symbols);
        await Promise.all (symbols.map ((symbol) => this.watchLiquidations (symbol, since, limit, params)));
        let result: Liquidation[] = [];
        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            const cache = this.getLiquidationsCache (symbol);
            const filtered = this.filterBySinceLimit (cache, since, limit, 'timestamp', true);
            result = this.arrayConcat (result, filtered);
        }
        return result;
    }

    async watchOrders (symbol: string = undefined, since: Int = undefined, limit: Int = undefined, params = {}): Promise<Order[]> {
        await this.loadMarkets ();
        if (symbol !== undefined) {
            this.market (symbol);
        }
        const messageHash = (symbol === undefined) ? 'orders' : ('orders:' + symbol);
        await this.watchPrivateStream (messageHash, params);
        if (this.orders === undefined) {
            return [];
        }
        return this.filterBySymbolSinceLimit (this.orders, symbol, since, limit, true);
    }

    async watchMyTrades (symbol: string = undefined, since: Int = undefined, limit: Int = undefined, params = {}): Promise<Trade[]> {
        await this.loadMarkets ();
        if (symbol !== undefined) {
            this.market (symbol);
        }
        const messageHash = (symbol === undefined) ? 'myTrades' : ('myTrades:' + symbol);
        await this.watchPrivateStream (messageHash, params);
        if (this.myTrades === undefined) {
            return [];
        }
        return this.filterBySymbolSinceLimit (this.myTrades, symbol, since, limit, true);
    }

    async watchPositions (symbols: Strings = undefined, params = {}): Promise<Position[]> {
        await this.loadMarkets ();
        symbols = this.marketSymbols (symbols);
        const messageHash = (symbols === undefined) ? 'positions' : ('positions:' + symbols.join (','));
        await this.watchPrivateStream (messageHash, params);
        if (this.positions === undefined) {
            return [];
        }
        return this.filterBySymbolsSinceLimit (this.positions, symbols, undefined, undefined, true);
    }

    async watchBalance (params = {}): Promise<Balances> {
        await this.loadMarkets ();
        return await this.watchPrivateStream ('balance', params);
    }

    async watchMarginCall (params = {}) {
        await this.loadMarkets ();
        return await this.watchPrivateStream ('marginCall', params);
    }

    async watchAccountConfig (params = {}) {
        await this.loadMarkets ();
        return await this.watchPrivateStream ('accountConfig', params);
    }

    async watchPrivateStream (messageHash: Str, params = {}) {
        this.checkRequiredCredentials (true);
        const listenKey = await this.getPrivateListenKey ();
        const url = this.urls['api']['ws']['future'] + '/' + listenKey;
        return await this.watch (url, messageHash, undefined, params);
    }

    async getPrivateListenKey () {
        let listenKey = this.safeString (this.options, 'listenKey');
        if (listenKey === undefined) {
            listenKey = await this.fetchListenKey ();
            this.options['listenKey'] = listenKey;
            this.schedulePrivateListenKeyKeepAlive ();
        }
        return listenKey;
    }

    schedulePrivateListenKeyKeepAlive () {
        const delay = this.safeInteger (this.options, 'listenKeyRefreshRate', 1200000);
        if (this.listenKeyRefreshTimer !== undefined) {
            clearTimeout (this.listenKeyRefreshTimer);
        }
        this.listenKeyRefreshTimer = setTimeout (() => {
            this.keepAliveListenKey ().then (() => {
                this.schedulePrivateListenKeyKeepAlive ();
            }).catch (() => {
                this.listenKeyRefreshTimer = undefined;
                this.options['listenKey'] = undefined;
            });
        }, delay);
    }

    handleMessage (client: Client, message: any) {
        const stream = this.safeString (message, 'stream');
        if (stream !== undefined) {
            const data = this.safeValue (message, 'data', message);
            this.handlePublicStream (client, stream, data);
            return;
        }
        const event = this.safeString (message, 'e');
        if (event !== undefined) {
            const url = client.url;
            if (this.isUserDataStreamUrl (url)) {
                if (event === 'ACCOUNT_UPDATE') {
                    this.handleAccountUpdate (client, message);
                    return;
                } else if (event === 'ORDER_TRADE_UPDATE') {
                    this.handleOrderTradeUpdate (client, message);
                    return;
                } else if (event === 'listenKeyExpired') {
                    this.handleListenKeyExpired (client, message);
                    return;
                } else if (event === 'MARGIN_CALL') {
                    this.handleMarginCall (client, message);
                    return;
                } else if (event === 'ACCOUNT_CONFIG_UPDATE') {
                    this.handleAccountConfigUpdate (client, message);
                    return;
                }
            } else {
                const streamId = this.getStreamNameFromUrl (url);
                if (streamId !== undefined) {
                    this.handlePublicStream (client, streamId, message);
                    return;
                }
            }
        }
        client.resolve (message, event);
    }

    handleAccountUpdate (client: Client, message: Dict) {
        const data = this.safeDict (message, 'a', {});
        const balances = this.safeList (data, 'B', []);
        this.balance = this.safeValue (this.balance, 'info', this.balance);
        for (let i = 0; i < balances.length; i++) {
            const entry = balances[i];
            const asset = this.safeString (entry, 'a');
            const code = this.safeCurrencyCode (asset);
            const account = this.account ();
            account['total'] = this.safeString (entry, 'wb');
            account['free'] = this.safeString (entry, 'cw');
            this.balance[code] = account;
        }
        this.balance['info'] = message;
        client.resolve (this.balance, 'balance');
        const positions = this.safeList (data, 'P', []);
        if (positions.length > 0) {
            if (this.positions === undefined) {
                this.positions = new ArrayCacheBySymbolBySide ();
            }
            const cache = this.positions;
            const parsedPositions = this.parseWsPositions (positions);
            for (let i = 0; i < parsedPositions.length; i++) {
                cache.append (parsedPositions[i]);
                const symbol = parsedPositions[i]['symbol'];
                client.resolve (cache, 'positions:' + symbol);
            }
            client.resolve (cache, 'positions');
        }
    }

    handlePublicTrade (client: Client, message, market) {
        const symbol = market['symbol'];
        this.trades = this.safeValue (this, 'trades', {});
        let trades = this.safeValue (this.trades, symbol);
        if (trades === undefined) {
            const limit = this.safeInteger (this.options, 'tradesLimit', 1000);
            trades = new ArrayCache (limit);
            this.trades[symbol] = trades;
        }
        const parsed = this.parseWsPublicTrade (message, market);
        trades.append (parsed);
        const messageHash = 'trade:' + symbol;
        client.resolve (trades, messageHash);
    }

    handlePublicAggTrade (client: Client, message, market) {
        const symbol = market['symbol'];
        this.trades = this.safeValue (this, 'trades', {});
        let trades = this.safeValue (this.trades, symbol);
        if (trades === undefined) {
            const limit = this.safeInteger (this.options, 'tradesLimit', 1000);
            trades = new ArrayCache (limit);
            this.trades[symbol] = trades;
        }
        const parsed = this.parseWsPublicAggTrade (message, market);
        trades.append (parsed);
        const messageHash = 'aggtrade:' + symbol;
        client.resolve (trades, messageHash);
    }

    handlePublicTicker (client: Client, message, market) {
        const symbol = market['symbol'];
        const parsed = this.parseWsPublicTicker (message, market);
        this.tickers = this.safeValue (this, 'tickers', {});
        this.tickers[symbol] = parsed;
        const messageHash = 'ticker:' + symbol;
        client.resolve (parsed, messageHash);
    }

    handleBookTickerMessage (client: Client, message, market) {
        const symbol = market['symbol'];
        const parsed = this.parseWsBidAsk (message, market);
        this.bidsasks = this.safeValue (this, 'bidsasks', {});
        this.bidsasks[symbol] = parsed;
        const messageHash = 'bidask:' + symbol;
        client.resolve (parsed, messageHash);
    }

    handleMarkPriceMessage (client: Client, message, market) {
        const symbol = market['symbol'];
        const parsed = this.parseWsMarkPrice (message, market);
        const messageHash = 'markprice:' + symbol;
        client.resolve (parsed, messageHash);
    }

    handleMarkPriceArray (client: Client, message) {
        if (!Array.isArray (message)) {
            return;
        }
        const result: Tickers = {};
        for (let i = 0; i < message.length; i++) {
            const entry = message[i];
            const marketId = this.safeString (entry, 's');
            const market = this.safeMarket (marketId);
            const parsed = this.parseWsMarkPrice (entry, market);
            const symbol = parsed['symbol'];
            result[symbol] = parsed;
            const symbolHash = 'markprice:' + symbol;
            client.resolve (parsed, symbolHash);
        }
        client.resolve (result, 'markprices');
    }

    getLiquidationsCache (symbol: Str = undefined) {
        const key = (symbol === undefined) ? 'all' : symbol;
        if (this.liquidations === undefined) {
            this.liquidations = {};
        }
        const cache = this.safeValue (this.liquidations, key);
        if (cache === undefined) {
            return [];
        }
        return cache;
    }

    handleCompositeIndex (client: Client, message, market = undefined) {
        const entries = Array.isArray (message) ? message : [ message ];
        this.compositeIndex = this.safeValue (this, 'compositeIndex', {});
        const result: Tickers = {};
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const parsed = this.parseCompositeIndex (entry, market);
            const symbol = parsed['symbol'];
            if (symbol === undefined) {
                continue;
            }
            this.compositeIndex[symbol] = parsed;
            result[symbol] = parsed;
            const symbolHash = 'compositeIndex:' + symbol;
            client.resolve (parsed, symbolHash);
        }
        if (Object.keys (result).length) {
            client.resolve (result, 'compositeIndex');
        }
    }

    parseCompositeIndex (entry, market = undefined): Ticker {
        const marketId = this.safeString (entry, 's');
        const parsedMarket = this.safeMarket (marketId, market);
        const symbol = parsedMarket['symbol'];
        const timestamp = this.safeInteger2 (entry, 'E', 'time');
        const price = this.safeString (entry, 'p');
        return this.safeTicker ({
            'info': entry,
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'last': price,
            'close': price,
        }, parsedMarket);
    }

    handleSentiment (client: Client, message, scope: Str) {
        const entries = Array.isArray (message) ? message : [ message ];
        const result: Dict = {};
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const parsed = this.parseSentiment (entry);
            const symbol = parsed['symbol'];
            if (symbol === undefined) {
                continue;
            }
            result[symbol] = parsed;
            const symbolHash = scope + ':' + symbol;
            client.resolve (parsed, symbolHash);
        }
        if (Object.keys (result).length) {
            client.resolve (result, scope);
        }
    }

    parseSentiment (entry) {
        const marketId = this.safeString (entry, 's');
        const symbol = this.safeSymbol (marketId, undefined, undefined, 'contract');
        const timestamp = this.safeInteger (entry, 'timestamp');
        return {
            'info': entry,
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'longAccount': this.safeNumber (entry, 'longAccount'),
            'shortAccount': this.safeNumber (entry, 'shortAccount'),
            'longShortRatio': this.safeNumber2 (entry, 'longShortRatio', 'ratio'),
        };
    }

    handleMarginCall (client: Client, message: Dict) {
        const positions = this.safeList (message, 'p', []);
        const parsed = [];
        for (let i = 0; i < positions.length; i++) {
            parsed.push (this.parseMarginCall (positions[i]));
        }
        client.resolve (parsed, 'marginCall');
        for (let i = 0; i < parsed.length; i++) {
            const entry = parsed[i];
            const symbol = this.safeString (entry, 'symbol');
            if (symbol !== undefined) {
                client.resolve (entry, 'marginCall:' + symbol);
            }
        }
    }

    parseMarginCall (position: Dict) {
        const marketId = this.safeString (position, 's');
        const market = this.safeMarket (marketId, undefined);
        const symbol = market['symbol'];
        const amount = this.safeNumber (position, 'pa');
        let side = undefined;
        if (amount !== undefined) {
            if (amount > 0) {
                side = 'long';
            } else if (amount < 0) {
                side = 'short';
            }
        }
        return {
            'info': position,
            'symbol': symbol,
            'positionSide': this.safeStringLower (position, 'ps'),
            'contracts': amount,
            'side': side,
            'marginType': this.safeStringLower (position, 'mt'),
            'isolatedWallet': this.safeNumber (position, 'iw'),
            'markPrice': this.safeNumber (position, 'mp'),
            'unrealizedPnl': this.safeNumber (position, 'up'),
            'maintenanceMargin': this.safeNumber (position, 'mm'),
        };
    }

    handleAccountConfigUpdate (client: Client, message: Dict) {
        const result = [];
        const ac = this.safeDict (message, 'ac');
        if (Object.keys (ac).length > 0) {
            result.push ({
                'info': ac,
                'type': 'leverage',
                'symbol': this.safeSymbol (this.safeString (ac, 's'), undefined),
                'leverage': this.safeInteger (ac, 'l'),
            });
        }
        const ai = this.safeDict (message, 'ai');
        if (Object.keys (ai).length > 0) {
            result.push ({
                'info': ai,
                'type': 'multiAssetsMargin',
                'key': this.safeString (ai, 'j'),
                'enabled': this.safeBool2 (ai, 'c', 'C'),
            });
        }
        if (result.length === 0) {
            result.push ({ 'info': message });
        }
        client.resolve (result, 'accountConfig');
    }

    handlePublicKline (client: Client, message, market = undefined, timeframe: Str = undefined) {
        const event = this.safeStringLower (message, 'e');
        const kline = this.safeDict (message, 'k', {});
        const interval = this.safeString (kline, 'i', timeframe);
        let scope = 'kline';
        if (event === 'markprice_kline') {
            scope = 'mark';
        } else if (event === 'indexprice_kline') {
            scope = 'index';
        } else if (event === 'continuous_kline') {
            scope = 'continuous';
        }
        let marketId = this.safeString2 (kline, 's', 'ps');
        if (scope === 'index') {
            marketId = this.safeString (message, 'ps', marketId);
        }
        const marketInner = this.safeMarket (marketId, market);
        const symbol = marketInner['symbol'];
        const cache = this.getKlineCache (symbol, scope, interval);
        const parsed = this.parseWsOHLCV (message, marketInner);
        cache.append (parsed);
        const messageHash = this.getKlineMessageHash (scope, symbol, interval);
        client.resolve (cache, messageHash);
    }

    handleDepth (client: Client, message, market = undefined) {
        const marketId = this.safeString (message, 's');
        const marketInner = this.safeMarket (marketId, market);
        const symbol = marketInner['symbol'];
        const messageHash = 'orderbook:' + symbol;
        const orderbook = this.safeValue (this.orderbooks, symbol);
        if (orderbook === undefined) {
            return;
        }
        const cache = this.safeValue (orderbook, 'cache', []);
        const timestamp = this.safeInteger (message, 'E');
        orderbook['timestamp'] = timestamp;
        orderbook['datetime'] = this.iso8601 (timestamp);
        const nonce = this.safeInteger (orderbook, 'nonce');
        if (nonce === undefined) {
            cache.push (message);
            orderbook['cache'] = cache;
            return;
        }
        try {
            const U = this.safeInteger (message, 'U');
            const u = this.safeInteger (message, 'u');
            const pu = this.safeInteger (message, 'pu');
            if (u >= orderbook['nonce']) {
                if ((U <= orderbook['nonce']) && (u >= orderbook['nonce']) || (pu === orderbook['nonce'])) {
                    this.handleOrderBookMessage (message, orderbook);
                    client.resolve (orderbook, messageHash);
                } else {
                    this.reloadOrderBook (client, messageHash, symbol);
                }
            }
        } catch (error) {
            this.reloadOrderBook (client, messageHash, symbol);
            client.reject (error, messageHash);
        }
    }

    handleForceOrder (client: Client, message, market = undefined) {
        const entries = Array.isArray (message) ? message : [ message ];
        if (this.liquidations === undefined) {
            this.liquidations = {};
        }
        const globalKey = 'all';
        let globalCache = this.safeValue (this.liquidations, globalKey);
        if (globalCache === undefined) {
            const limit = this.safeInteger (this.options, 'liquidationsLimit', 1000);
            globalCache = new ArrayCache (limit);
            this.liquidations[globalKey] = globalCache;
        }
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const rawLiquidation = this.safeDict (entry, 'o', entry);
            const marketId = this.safeString (rawLiquidation, 's');
            const marketInfo = this.safeMarket (marketId, market);
            const symbol = marketInfo['symbol'];
            const liquidation = this.parseWsLiquidation (rawLiquidation, marketInfo);
            if (symbol === undefined || liquidation === undefined) {
                continue;
            }
            let cache = this.safeValue (this.liquidations, symbol);
            if (cache === undefined) {
                const limit = this.safeInteger (this.options, 'liquidationsLimit', 1000);
                cache = new ArrayCache (limit);
                this.liquidations[symbol] = cache;
            }
            cache.append (liquidation);
            globalCache.append (liquidation);
            client.resolve (cache, 'liquidations:' + symbol);
        }
        client.resolve (globalCache, 'liquidations');
    }

    parseWsPublicTrade (trade, market = undefined): Trade {
        const marketId = this.safeString (trade, 's');
        const symbol = this.safeSymbol (marketId, market);
        const timestamp = this.safeInteger2 (trade, 'T', 'E');
        const isBuyerMaker = this.safeBool (trade, 'm');
        let side = undefined;
        let takerOrMaker = undefined;
        if (isBuyerMaker !== undefined) {
            side = isBuyerMaker ? 'sell' : 'buy';
            takerOrMaker = isBuyerMaker ? 'maker' : 'taker';
        }
        return this.safeTrade ({
            'info': trade,
            'id': this.safeString (trade, 't'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'order': undefined,
            'type': undefined,
            'side': side,
            'takerOrMaker': takerOrMaker,
            'price': this.safeString (trade, 'p'),
            'amount': this.safeString (trade, 'q'),
        }, market);
    }

    parseWsPublicTicker (ticker, market = undefined): Ticker {
        const symbol = this.safeSymbol (this.safeString (ticker, 's'), market);
        const timestamp = this.safeInteger2 (ticker, 'C', 'E');
        return this.safeTicker ({
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': this.safeString (ticker, 'h'),
            'low': this.safeString (ticker, 'l'),
            'bid': undefined,
            'bidVolume': undefined,
            'ask': undefined,
            'askVolume': undefined,
            'vwap': this.safeString (ticker, 'w'),
            'open': this.safeString (ticker, 'o'),
            'close': this.safeString (ticker, 'c'),
            'last': this.safeString (ticker, 'c'),
            'baseVolume': this.safeString (ticker, 'v'),
            'quoteVolume': this.safeString (ticker, 'q'),
            'info': ticker,
        }, market);
    }

    parseWsPublicAggTrade (trade, market = undefined): Trade {
        const marketId = this.safeString (trade, 's');
        const symbol = this.safeSymbol (marketId, market);
        const timestamp = this.safeInteger2 (trade, 'T', 'E');
        const isBuyerMaker = this.safeBool (trade, 'm');
        let side = undefined;
        let takerOrMaker = undefined;
        if (isBuyerMaker !== undefined) {
            side = isBuyerMaker ? 'sell' : 'buy';
            takerOrMaker = isBuyerMaker ? 'maker' : 'taker';
        }
        return this.safeTrade ({
            'info': trade,
            'id': this.safeString (trade, 'a'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'order': undefined,
            'type': undefined,
            'side': side,
            'takerOrMaker': takerOrMaker,
            'price': this.safeString (trade, 'p'),
            'amount': this.safeString (trade, 'q'),
        }, market);
    }

    parseWsBidAsk (ticker, market = undefined): Ticker {
        const symbol = this.safeSymbol (this.safeString (ticker, 's'), market);
        const timestamp = this.safeInteger2 (ticker, 'T', 'E');
        return this.safeTicker ({
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'bid': this.safeString (ticker, 'b'),
            'bidVolume': this.safeString (ticker, 'B'),
            'ask': this.safeString (ticker, 'a'),
            'askVolume': this.safeString (ticker, 'A'),
            'info': ticker,
        }, market);
    }

    parseWsMarkPrice (ticker, market = undefined): Ticker {
        const symbol = this.safeSymbol (this.safeString (ticker, 's'), market);
        const timestamp = this.safeInteger (ticker, 'E');
        const markPrice = this.safeString (ticker, 'p');
        return this.safeTicker ({
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'last': markPrice,
            'close': markPrice,
            'info': ticker,
        }, market);
    }

    parseWsOHLCV (message, market = undefined): OHLCV {
        const data = this.safeDict (message, 'k', message);
        return [
            this.safeInteger (data, 't'),
            this.safeNumber (data, 'o'),
            this.safeNumber (data, 'h'),
            this.safeNumber (data, 'l'),
            this.safeNumber (data, 'c'),
            this.safeNumber (data, 'v'),
        ];
    }

    parseWsLiquidation (liquidation, market: Market = undefined): Liquidation {
        const marketId = this.safeString (liquidation, 's');
        const parsedMarket = this.safeMarket (marketId, market);
        const symbol = parsedMarket['symbol'];
        const timestamp = this.safeInteger (liquidation, 'T');
        return {
            'info': liquidation,
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'price': this.safeNumber (liquidation, 'p'),
            'contracts': this.safeNumber (liquidation, 'q'),
            'side': this.safeStringLower (liquidation, 'S'),
        } as Liquidation;
    }

    handleOrderBookMessage (message, orderbook) {
        const bids = this.safeList (message, 'b', []);
        const asks = this.safeList (message, 'a', []);
        this.handleDeltas (orderbook['bids'], bids);
        this.handleDeltas (orderbook['asks'], asks);
        const u = this.safeInteger (message, 'u');
        orderbook['nonce'] = u;
    }

    handleDeltas (bookside, deltas) {
        for (let i = 0; i < deltas.length; i++) {
            this.handleDelta (bookside, deltas[i]);
        }
    }

    handleDelta (bookside, delta) {
        const price = this.safeNumber (delta, 0);
        const amount = this.safeNumber (delta, 1);
        bookside.store (price, amount);
    }

    getStreamNameFromUrl (url: Str) {
        if (url === undefined) {
            return undefined;
        }
        const path = url.split ('/');
        const lastPart = this.safeString (path, path.length - 1);
        if (lastPart === undefined) {
            return undefined;
        }
        if ((lastPart.indexOf ('@') > -1) || (lastPart[0] === '!')) {
            return lastPart;
        }
        return undefined;
    }

    isUserDataStreamUrl (url: Str) {
        if (url === undefined) {
            return false;
        }
        const lastPart = this.safeString (url.split ('/'), -1);
        if (lastPart === undefined) {
            return false;
        }
        if (lastPart.indexOf ('@') > -1 || lastPart.indexOf ('!') > -1 || lastPart.indexOf ('stream?') > -1) {
            return false;
        }
        return true;
    }

    handlePublicStream (client: Client, stream: Str, message: Dict) {
        const lowerStream = stream.toLowerCase ();
        if (lowerStream[0] === '!') {
            if (lowerStream === '!markprice@arr') {
                this.handleMarkPriceArray (client, message);
            } else if (lowerStream === '!forceorder@arr') {
                this.handleForceOrder (client, message);
            } else if (lowerStream === '!compositeindex@arr') {
                this.handleCompositeIndex (client, message);
            } else if (lowerStream === '!globallongshortaccountratio@arr') {
                this.handleSentiment (client, message, 'globalLongShortAccountRatio');
            } else if (lowerStream === '!toplongshortaccountratio@arr') {
                this.handleSentiment (client, message, 'topLongShortAccountRatio');
            } else if (lowerStream === '!toplongshortpositionratio@arr') {
                this.handleSentiment (client, message, 'topLongShortPositionRatio');
            } else {
                client.resolve (message, stream);
            }
            return;
        }
        const separatorIndex = lowerStream.indexOf ('@');
        if (separatorIndex < 0) {
            client.resolve (message, stream);
            return;
        }
        const marketIdLower = lowerStream.slice (0, separatorIndex);
        const topic = lowerStream.slice (separatorIndex + 1);
        const marketId = marketIdLower.toUpperCase ();
        const market = this.safeMarket (marketId);
        if (topic.startsWith ('aggtrade')) {
            this.handlePublicAggTrade (client, message, market);
        } else if (topic.startsWith ('trade')) {
            this.handlePublicTrade (client, message, market);
        } else if (topic.startsWith ('ticker')) {
            this.handlePublicTicker (client, message, market);
        } else if (topic.startsWith ('bookticker')) {
            this.handleBookTickerMessage (client, message, market);
        } else if (topic.startsWith ('kline_')) {
            const timeframe = topic.replace ('kline_', '');
            this.handlePublicKline (client, message, market, timeframe);
        } else if (topic.startsWith ('markpricekline_')) {
            const timeframe = topic.replace ('markpricekline_', '');
            this.handlePublicKline (client, message, market, timeframe);
        } else if (topic.startsWith ('indexpricekline_')) {
            const timeframe = topic.replace ('indexpricekline_', '');
            this.handlePublicKline (client, message, market, timeframe);
        } else if (topic.startsWith ('continuouskline_')) {
            const timeframe = topic.replace ('continuouskline_', '');
            this.handlePublicKline (client, message, market, timeframe);
        } else if (topic.startsWith ('markprice')) {
            this.handleMarkPriceMessage (client, message, market);
        } else if (topic.startsWith ('depth')) {
            this.handleDepth (client, message, market);
        } else if (topic.startsWith ('forceorder')) {
            this.handleForceOrder (client, message, market);
        } else if (topic.startsWith ('compositeindex')) {
            this.handleCompositeIndex (client, message, market);
        } else if (topic.startsWith ('globallongshortaccountratio')) {
            this.handleSentiment (client, message, 'globalLongShortAccountRatio');
        } else if (topic.startsWith ('toplongshortaccountratio')) {
            this.handleSentiment (client, message, 'topLongShortAccountRatio');
        } else if (topic.startsWith ('toplongshortpositionratio')) {
            this.handleSentiment (client, message, 'topLongShortPositionRatio');
        } else {
            client.resolve (message, stream);
        }
    }

    parseWsOrder (order: Dict, market = undefined): Order {
        const marketId = this.safeString (order, 's');
        const symbol = this.safeSymbol (marketId, market);
        const timestamp = this.safeInteger (order, 'T');
        const lastTradeTimestamp = this.safeInteger (order, 'T');
        const price = this.safeString (order, 'p');
        const average = this.safeString (order, 'ap');
        const amount = this.safeString (order, 'q');
        const filled = this.safeString (order, 'z');
        const remaining = this.safeString (order, 'Q');
        return this.safeOrder ({
            'info': order,
            'symbol': symbol,
            'id': this.safeString (order, 'i'),
            'clientOrderId': this.safeString (order, 'c'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': lastTradeTimestamp,
            'type': this.safeStringLower (order, 'o'),
            'timeInForce': this.safeString (order, 'f'),
            'postOnly': undefined,
            'side': this.safeStringLower (order, 'S'),
            'price': price,
            'stopPrice': this.safeString (order, 'sp'),
            'average': average,
            'amount': amount,
            'filled': filled,
            'remaining': remaining,
            'cost': this.safeString (order, 'Z'),
            'status': this.parseOrderStatus (this.safeString (order, 'X')),
            'fee': {
                'cost': this.safeNumber (order, 'n'),
                'currency': this.safeCurrencyCode (this.safeString (order, 'N')),
            },
            'reduceOnly': this.safeBool (order, 'R'),
        }, market);
    }

    parseWsMyTrade (trade, market = undefined): Trade {
        const marketId = this.safeString (trade, 's');
        const symbol = this.safeSymbol (marketId, market);
        const timestamp = this.safeInteger (trade, 'T');
        return this.safeTrade ({
            'info': trade,
            'id': this.safeString (trade, 't'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'order': this.safeString (trade, 'i'),
            'type': this.safeStringLower (trade, 'o'),
            'side': this.safeStringLower (trade, 'S'),
            'takerOrMaker': undefined,
            'price': this.safeString (trade, 'L'),
            'amount': this.safeString (trade, 'l'),
            'cost': this.safeString (trade, 'Y'),
            'fee': {
                'cost': this.safeNumber (trade, 'n'),
                'currency': this.safeCurrencyCode (this.safeString (trade, 'N')),
            },
        }, market);
    }

    parseWsPositions (positions: any[]): Position[] {
        const result: Position[] = [];
        for (let i = 0; i < positions.length; i++) {
            result.push (this.parseWsPosition (positions[i]));
        }
        return result;
    }

    parseWsPosition (position, market: Market = undefined): Position {
        const marketId = this.safeString (position, 's');
        const symbol = this.safeSymbol (marketId, market);
        const contracts = this.safeNumber (position, 'pa');
        let side = undefined;
        if (contracts !== undefined) {
            if (contracts > 0) {
                side = 'long';
            } else if (contracts < 0) {
                side = 'short';
            }
        }
        return this.safePosition ({
            'info': position,
            'symbol': symbol,
            'timestamp': undefined,
            'datetime': undefined,
            'isolated': (this.safeStringLower (position, 'mt') === 'isolated'),
            'marginMode': this.safeStringLower (position, 'mt'),
            'entryPrice': this.safeNumber (position, 'ep'),
            'notional': this.safeNumber (position, 'ma'),
            'leverage': this.safeNumber2 (position, 'leverage', 'le'),
            'unrealizedPnl': this.safeNumber (position, 'up'),
            'contracts': (contracts === undefined) ? undefined : Math.abs (contracts),
            'contractSize': undefined,
            'side': side,
            'collateral': this.safeNumber (position, 'iw'),
        });
    }

    handleOrderTradeUpdate (client: Client, message: Dict) {
        const orderData = this.safeDict (message, 'o', {});
        const marketId = this.safeString (orderData, 's');
        const market = this.safeMarket (marketId);
        const parsedOrder = this.parseWsOrder (orderData, market);
        if (parsedOrder !== undefined) {
            if (this.orders === undefined) {
                const limit = this.safeInteger (this.options, 'ordersLimit', 1000);
                this.orders = new ArrayCacheBySymbolById (limit);
            }
            const cache = this.orders;
            cache.append (parsedOrder);
            const symbol = parsedOrder['symbol'];
            client.resolve (cache, 'orders');
            if (symbol !== undefined) {
                client.resolve (cache, 'orders:' + symbol);
            }
        }
        const executionType = this.safeString (orderData, 'x');
        if (executionType === 'TRADE') {
            const trade = this.parseWsMyTrade (orderData, market);
            if (trade !== undefined) {
                if (this.myTrades === undefined) {
                    const tradesLimit = this.safeInteger (this.options, 'tradesLimit', 1000);
                    this.myTrades = new ArrayCache (tradesLimit);
                }
                const tradesCache = this.myTrades;
                tradesCache.append (trade);
                const symbol = trade['symbol'];
                client.resolve (tradesCache, 'myTrades');
                if (symbol !== undefined) {
                    client.resolve (tradesCache, 'myTrades:' + symbol);
                }
            }
        }
    }

    handleListenKeyExpired (client: Client, message: Dict) {
        this.options['listenKey'] = undefined;
        if (this.listenKeyRefreshTimer !== undefined) {
            clearTimeout (this.listenKeyRefreshTimer);
            this.listenKeyRefreshTimer = undefined;
        }
        client.reject (message, undefined);
    }
}
