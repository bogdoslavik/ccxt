//  ---------------------------------------------------------------------------

import asterdexRest from '../asterdex.js';
import Client from '../base/ws/Client.js';
import { ArrayCache, ArrayCacheByTimestamp, ArrayCacheBySymbolById, ArrayCacheBySymbolBySide } from '../base/ws/Cache.js';
import { ArgumentsRequired } from '../base/errors.js';
import type { OrderBook, Trade, Ticker, Tickers, OHLCV, Int, Str, Strings, Dict, Balances, Order, Position, Market } from '../base/types.js';

//  ---------------------------------------------------------------------------

export default class asterdex extends asterdexRest {
    listenKeyRefreshTimer: any = undefined;
    orders: ArrayCacheBySymbolById | undefined;
    myTrades: ArrayCache | undefined;
    positions: ArrayCacheBySymbolBySide | undefined;
    describe (): any {
        const parent = super.describe ();
        return this.deepExtend (parent, {
            'has': this.deepExtend (parent['has'], {
                'ws': true,
                'watchTrades': true,
                'watchTickers': true,
                'watchTicker': true,
                'watchOrderBook': true,
                'watchOHLCV': true,
                'watchMarkPrice': true,
                'watchMarkPrices': true,
                'watchBidsAsks': true,
                'watchLiquidations': false,
                'watchLiquidationsForSymbols': false,
                'watchOrders': true,
                'watchMyTrades': true,
                'watchPositions': true,
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

    async watchOrderBook (symbol: string, limit: Int = undefined, params = {}): Promise<OrderBook> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        let depth = 'depth5';
        if (limit !== undefined) {
            if (limit <= 5) {
                depth = 'depth5';
            } else if (limit <= 10) {
                depth = 'depth10';
            } else {
                depth = 'depth20';
            }
        }
        const stream = this.formatPerpStream (market['id'], depth + '@100ms');
        const messageHash = 'orderbook:' + market['symbol'];
        return await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
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
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'kline_' + timeframe);
        const baseSymbol = market['symbol'];
        const messageHash = 'ohlcv:' + baseSymbol + ':' + timeframe;
        const ohlcvs = await this.watch (this.getStreamUrl (stream), messageHash, undefined, params);
        if (this.newUpdates) {
            const cache = ohlcvs; // ArrayCacheByTimestamp
            limit = cache.getLimit (baseSymbol, limit);
        }
        return this.filterBySinceLimit (ohlcvs, since, limit, 0, true);
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

    handlePublicKline (client: Client, message, market, timeframe: Str) {
        const symbol = market['symbol'];
        this.ohlcvs = this.safeValue (this, 'ohlcvs', {});
        if (!(symbol in this.ohlcvs)) {
            this.ohlcvs[symbol] = {};
        }
        if (!(timeframe in this.ohlcvs[symbol])) {
            const limit = this.safeInteger (this.options, 'OHLCVLimit', 1000);
            this.ohlcvs[symbol][timeframe] = new ArrayCacheByTimestamp (limit);
        }
        const parsed = this.parseWsOHLCV (message, market);
        const cache = this.ohlcvs[symbol][timeframe];
        cache.append (parsed);
        const messageHash = 'ohlcv:' + symbol + ':' + timeframe;
        client.resolve (cache, messageHash);
    }

    handleDepth (client: Client, message, market) {
        const symbol = market['symbol'];
        this.orderbooks = this.safeValue (this, 'orderbooks', {});
        if (!(symbol in this.orderbooks)) {
            const newOrderBook = this.orderBook (); // empty
            newOrderBook['symbol'] = symbol;
            this.orderbooks[symbol] = newOrderBook;
        }
        const orderbook = this.orderbooks[symbol];
        const timestamp = this.safeInteger (message, 'E');
        const bids = this.safeList (message, 'b', []);
        const asks = this.safeList (message, 'a', []);
        const snapshot = this.parseOrderBook ({ 'bids': bids, 'asks': asks }, symbol, timestamp);
        orderbook.reset (snapshot);
        const messageHash = 'orderbook:' + symbol;
        client.resolve (orderbook, messageHash);
    }

    handleForceOrder (client: Client, message, market) {
        const symbol = market['symbol'];
        const messageHash = 'liquidations:' + symbol;
        client.resolve (message, messageHash);
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
        if (topic.startsWith ('trade')) {
            this.handlePublicTrade (client, message, market);
        } else if (topic.startsWith ('ticker')) {
            this.handlePublicTicker (client, message, market);
        } else if (topic.startsWith ('bookticker')) {
            this.handleBookTickerMessage (client, message, market);
        } else if (topic.startsWith ('kline_')) {
            const timeframe = topic.replace ('kline_', '');
            this.handlePublicKline (client, message, market, timeframe);
        } else if (topic.startsWith ('markprice')) {
            this.handleMarkPriceMessage (client, message, market);
        } else if (topic.startsWith ('depth')) {
            this.handleDepth (client, message, market);
        } else if (topic.startsWith ('forceorder')) {
            this.handleForceOrder (client, message, market);
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
