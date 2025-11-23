//  ---------------------------------------------------------------------------

import lighterRest from '../lighter.js';
import Client from '../base/ws/Client.js';
import Precise from '../base/Precise.js';
import { NotSupported } from '../base/errors.js';
import type { Strings, FundingRate, FundingRates, Dict, Market, Ticker, OrderBook } from '../base/types.js';
import { ExchangeError } from '../base/errors.js';

//  ---------------------------------------------------------------------------

export default class lighter extends lighterRest {
    describe (): any {
        const parent = super.describe ();
        return this.deepExtend (parent, {
            'has': this.deepExtend (parent['has'], {
                'ws': true,
                'watchFundingRate': true,
                'watchFundingRates': true,
                'watchBidAsk': true,
                'watchBidsAsks': true,
                'watchOrderBook': true,
            }),
            'urls': this.deepExtend (parent['urls'], {
                'api': this.deepExtend (parent['urls']['api'], {
                    'ws': {
                        'public': 'wss://mainnet.zklighter.elliot.ai/stream',
                        'test': 'wss://testnet.zklighter.elliot.ai/stream',
                    },
                }),
            }),
            'streaming': {
                'keepAlive': 20000,
            },
        });
    }

    async watchFundingRate (symbol: string, params = {}): Promise<FundingRate> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const fundingRates = await this.watchFundingRates ([ market['symbol'] ], params);
        return this.safeValue (fundingRates, market['symbol']);
    }

    async watchFundingRates (symbols: Strings = undefined, params = {}): Promise<FundingRates> {
        await this.loadMarkets ();
        const url = this.urls['api']['ws']['public'];
        if (symbols === undefined || symbols.length === 0) {
            const messageHash = 'fundingrates';
            const request: Dict = {
                'type': 'subscribe',
                'channel': 'market_stats/all',
            };
            return await this.watch (url, messageHash, this.extend (request, params), messageHash);
        }
        const markets = symbols.map ((symbol) => this.market (symbol));
        const promises = [];
        for (let i = 0; i < markets.length; i++) {
            const market = markets[i];
            const messageHash = 'fundingrate:' + market['symbol'];
            const channel = 'market_stats/' + market['id'];
            const request: Dict = {
                'type': 'subscribe',
                'channel': channel,
            };
            promises.push (this.watch (url, messageHash, this.extend (request, params), messageHash));
        }
        const responses = await Promise.all (promises);
        const result: FundingRates = {};
        for (let i = 0; i < responses.length; i++) {
            const fundingRate = responses[i];
            const symbol = this.safeString (fundingRate, 'symbol', symbols[i]);
            result[symbol] = fundingRate;
        }
        return result;
    }

    async watchBidAsk (symbol: string, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const orderbook = await this.watchOrderBook (market['symbol'], 20, params);
        return this.orderBookToBidAsk (orderbook);
    }

    async watchBidsAsks (symbols: Strings = undefined, params = {}) {
        await this.loadMarkets ();
        if (symbols === undefined || symbols.length === 0) {
            throw new NotSupported (this.id + ' watchBidsAsks requires a symbol argument');
        }
        const promises = [];
        for (let i = 0; i < symbols.length; i++) {
            promises.push (this.watchBidAsk (symbols[i], params));
        }
        const responses = await Promise.all (promises);
        const result = {};
        for (let i = 0; i < responses.length; i++) {
            const bidask = responses[i];
            const symbol = this.safeString (bidask, 'symbol', symbols[i]);
            result[symbol] = bidask;
        }
        return result;
    }

    handleMarketStats (client: Client, message) {
        const rawStats = this.safeValue (message, 'market_stats');
        if (rawStats === undefined) {
            return;
        }
        const entries: Dict[] = [];
        if (Array.isArray (rawStats)) {
            for (let i = 0; i < rawStats.length; i++) {
                entries.push (rawStats[i]);
            }
        } else {
            const marketId = this.safeString (rawStats, 'market_id');
            if (marketId !== undefined) {
                entries.push (rawStats);
            } else {
                const keys = Object.keys (rawStats);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    entries.push (rawStats[key]);
                }
            }
        }
        const fundingResult: FundingRates = {};
        const bidsasks: Dict = {};
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const fundingRate = this.parseMarketStatsFunding (entry);
            if (fundingRate === undefined) {
                const bidask = this.parseMarketStatsBidAsk (entry);
                if (bidask !== undefined) {
                    const symbol = bidask['symbol'];
                    this.bidsasks = this.safeValue (this, 'bidsasks', {});
                    this.bidsasks[symbol] = bidask;
                    bidsasks[symbol] = bidask;
                }
                continue;
            }
            const symbol = fundingRate['symbol'];
            if (symbol === undefined) {
                continue;
            }
            this.fundingRates = this.safeValue (this, 'fundingRates', {});
            this.fundingRates[symbol] = fundingRate;
            fundingResult[symbol] = fundingRate;
            const messageHash = 'fundingrate:' + symbol;
            client.resolve (fundingRate, messageHash);
            const bidask = this.parseMarketStatsBidAsk (entry);
            if (bidask !== undefined) {
                this.bidsasks = this.safeValue (this, 'bidsasks', {});
                this.bidsasks[symbol] = bidask;
                bidsasks[symbol] = bidask;
                client.resolve (bidask, 'bidask:' + symbol);
            }
        }
        const resultKeys = Object.keys (fundingResult);
        if (resultKeys.length > 0) {
            client.resolve (fundingResult, 'fundingrates');
        }
        const bidaskKeys = Object.keys (bidsasks);
        if (bidaskKeys.length > 0) {
            client.resolve (bidsasks, 'bidsasks');
        }
    }

    handleOrderBook (client: Client, message) {
        const channel = this.safeString (message, 'channel');
        const orderbook = this.safeDict (message, 'order_book');
        if ((channel === undefined) || (orderbook === undefined)) {
            return;
        }
        if (this.verbose) {
            // raw log for debugging actual server payloads
            console.log (this.id + ' raw order_book message', message);
        }
        const parts = channel.split (/[:/]/); // server returns "order_book:ID"
        const marketId = this.safeString (parts, 1);
        const market: Market = this.safeMarket (marketId, undefined, undefined, 'swap');
        const symbol = market['symbol'];
        const messageTs = this.safeInteger (message, 'timestamp');
        const messageHash = 'orderbook:' + symbol;
        if (!(symbol in this.orderbooks)) {
            // wait for subscription handler to create book and fetch snapshot
            return;
        }
        const stored = this.orderbooks[symbol];
        const lastNonce = this.safeInteger (stored, 'nonce');
        const offset = this.safeInteger2 (message, 'offset', 'nonce');
        if (lastNonce !== undefined) {
            if ((offset !== undefined) && (offset !== lastNonce + 1)) {
                delete this.orderbooks[symbol];
                client.reject (new ExchangeError (this.id + ' orderbook desync, reloading snapshot'), messageHash);
                return;
            }
        }
        if (stored['nonce'] === undefined) {
            stored.cache.push (message);
            return;
        }
        this.handleOrderBookMessage (client, message, stored, market, messageTs);
        client.resolve (stored, messageHash);
        const bidask = this.orderBookToBidAsk (stored);
        if (bidask !== undefined) {
            this.bidsasks = this.safeValue (this, 'bidsasks', {});
            this.bidsasks[symbol] = bidask;
            client.resolve (bidask, 'bidask:' + symbol);
        }
    }

    handleOrderBookMessage (client: Client, message, orderbook, market: Market, messageTimestamp?: number) {
        const data = this.safeDict (message, 'order_book', {});
        const bids = this.safeList (data, 'bids', []);
        const asks = this.safeList (data, 'asks', []);
        this.handleDeltasWithKeys (orderbook['bids'], bids, 'price', 'size');
        this.handleDeltasWithKeys (orderbook['asks'], asks, 'price', 'size');
        const offset = this.safeInteger2 (message, 'offset', 'nonce');
        if (offset !== undefined) {
            orderbook['nonce'] = offset;
        }
        const timestamp = this.safeInteger2 (data, 'timestamp', 'ts', messageTimestamp);
        orderbook['timestamp'] = timestamp;
        orderbook['datetime'] = this.iso8601 (timestamp);
        return orderbook;
    }

    orderBookToBidAsk (orderbook: OrderBook): Ticker {
        const symbol = this.safeString (orderbook, 'symbol');
        const bids = this.safeValue (orderbook, 'bids', []);
        const asks = this.safeValue (orderbook, 'asks', []);
        const bestBid = this.safeValue (bids, 0);
        const bestAsk = this.safeValue (asks, 0);
        if ((bestBid === undefined) || (bestAsk === undefined)) {
            return undefined as any;
        }
        const bidPrice = this.safeString (bestBid, 0);
        const bidSize = this.safeString (bestBid, 1);
        const askPrice = this.safeString (bestAsk, 0);
        const askSize = this.safeString (bestAsk, 1);
        const timestamp = this.safeInteger (orderbook, 'timestamp');
        return this.safeTicker ({
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'bid': bidPrice,
            'bidVolume': bidSize,
            'ask': askPrice,
            'askVolume': askSize,
            'info': orderbook,
        });
    }

    parseMarketStatsFunding (stats: Dict): FundingRate {
        const marketId = this.safeString (stats, 'market_id');
        if (marketId === undefined) {
            return undefined;
        }
        const market: Market = this.safeMarket (marketId, undefined, undefined, 'swap');
        const symbol = market['symbol'];
        const rawFundingRate = this.safeNumber (stats, 'funding_rate');
        const fundingRate = (rawFundingRate !== undefined) ? rawFundingRate / 100 : undefined;
        const rawNextFundingRate = this.safeNumber (stats, 'current_funding_rate');
        const nextFundingRate = (rawNextFundingRate !== undefined) ? rawNextFundingRate / 100 : undefined;
        const timestamp = this.safeInteger (stats, 'funding_timestamp');
        return {
            'info': stats,
            'symbol': symbol,
            'markPrice': this.safeNumber (stats, 'mark_price'),
            'indexPrice': this.safeNumber (stats, 'index_price'),
            'interestRate': undefined,
            'estimatedSettlePrice': undefined,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'fundingRate': fundingRate,
            'fundingTimestamp': timestamp,
            'fundingDatetime': this.iso8601 (timestamp),
            'nextFundingRate': nextFundingRate,
            'nextFundingTimestamp': undefined,
            'nextFundingDatetime': undefined,
            'previousFundingRate': undefined,
            'previousFundingTimestamp': undefined,
            'previousFundingDatetime': undefined,
        };
    }

    parseMarketStatsBidAsk (stats: Dict) {
        const marketId = this.safeString (stats, 'market_id');
        if (marketId === undefined) {
            return undefined;
        }
        const market: Market = this.safeMarket (marketId, undefined, undefined, 'swap');
        const symbol = market['symbol'];
        const timestamp = this.safeInteger (stats, 'timestamp');
        let bid = this.safeString2 (stats, 'best_bid_price', 'best_bid');
        let ask = this.safeString2 (stats, 'best_ask_price', 'best_ask');
        if (bid === undefined && ask === undefined) {
            const mark = this.safeString (stats, 'mark_price');
            const last = this.safeString (stats, 'last_trade_price', mark);
            bid = last;
            // ensure ask > bid to satisfy ticker assertions
            if (bid !== undefined) {
                ask = Precise.stringAdd (bid, '0.00000001');
            }
        }
        return this.safeTicker ({
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'bid': bid,
            'bidVolume': this.safeString2 (stats, 'best_bid_size', 'best_bid_quantity'),
            'ask': ask,
            'askVolume': this.safeString2 (stats, 'best_ask_size', 'best_ask_quantity'),
            'info': stats,
        }, market);
    }

    /**
     * @method
     * @name lighter#watchOrderBook
     * @description watch order book for a symbol
     * @param {string} symbol unified symbol
     * @param {int} [limit] max depth
     * @param {object} [params] extra params specific to lighter
     */
    async watchOrderBook (symbol: string, limit: Int = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const url = this.urls['api']['ws']['public'];
        const channel = 'order_book/' + market['id'];
        const messageHash = 'orderbook:' + market['symbol'];
        const request: Dict = {
            'type': 'subscribe',
            'channel': channel,
        };
        const subscription: Dict = {
            'symbol': market['symbol'],
            'limit': limit,
            'params': params,
            'messageHash': messageHash,
        };
        const client = this.client (url);
        this.handleOrderBookSubscription (client, undefined, subscription);
        const orderbook = await this.watch (url, messageHash, this.extend (request, params), messageHash, subscription);
        return orderbook.limit ();
    }

    handleOrderBookSubscription (client: Client, message, subscription) {
        const defaultLimit = this.safeInteger (this.options, 'watchOrderBookLimit', 100);
        const symbol = this.safeString (subscription, 'symbol');
        const limit = this.safeInteger (subscription, 'limit', defaultLimit);
        if (symbol in this.orderbooks) {
            delete this.orderbooks[symbol];
        }
        this.orderbooks[symbol] = this.orderBook ({}, limit);
        this.spawn (this.fetchOrderBookSnapshot, client, subscription);
    }

    async fetchOrderBookSnapshot (client: Client, subscription) {
        try {
            const symbol = this.safeString (subscription, 'symbol');
            const market = this.market (symbol);
            const params = this.safeValue (subscription, 'params', {});
            const request: Dict = { 'market_ids': [ market['id'] ] };
            const response = await this.publicGetOrderBooks (this.extend (request, params));
            const data = this.safeValue (response, 'order_books', []);
            const first = this.safeDict (data, 0, {});
            const rawOrderBook = this.safeDict (first, 'order_book', first);
            const timestamp = this.safeInteger (rawOrderBook, 'timestamp');
            const snapshot = this.parseOrderBook (rawOrderBook, symbol, timestamp, 'bids', 'asks', 'price', 'size');
            snapshot['symbol'] = symbol;
            const offset = this.safeInteger2 (rawOrderBook, 'offset', 'nonce');
            if (offset !== undefined) {
                snapshot['nonce'] = offset;
            }
            const orderbook = this.orderbooks[symbol];
            if (orderbook === undefined) {
                return;
            }
            orderbook.reset (snapshot);
            const messageHash = this.safeString (subscription, 'messageHash');
            const cache = orderbook.cache;
            const cacheLength = cache.length;
            if (cacheLength) {
                for (let i = 0; i < cacheLength; i++) {
                    const message = cache[i];
                    this.handleOrderBookMessage (client, message, orderbook);
                }
            }
            client.resolve (orderbook, messageHash);
        } catch (e) {
            const messageHash = this.safeString (subscription, 'messageHash');
            client.reject (e, messageHash);
        }
    }

    async pong (client: Client, message) {
        await client.send ({ 'type': 'pong' });
    }

    handleMessage (client: Client, message) {
        const type = this.safeString (message, 'type');
        if (type === 'ping') {
            this.spawn (this.pong, client, message);
            return;
        } else if (type === 'update/market_stats') {
            this.handleMarketStats (client, message);
            return;
        } else if (type === 'update/order_book') {
            this.handleOrderBook (client, message);
            return;
        } else if (type === 'connected') {
            return;
        }
        if (this.verbose) {
            console.log (this.id + ' unhandled ws message', message);
        }
        client.resolve (message, type);
    }
}
