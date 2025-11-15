//  ---------------------------------------------------------------------------

import asterdexRest from '../asterdex.js';
import Client from '../base/ws/Client.js';
import { ArgumentsRequired } from '../base/errors.js';
import type { OrderBook, Trade, Ticker, Tickers, OHLCV, Int, Str, Strings, Dict, Balances } from '../base/types.js';

//  ---------------------------------------------------------------------------

export default class asterdex extends asterdexRest {
    listenKeyRefreshTimer: any = undefined;
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
        return marketId + '@' + topic;
    }

    buildPerpStreamsFromSymbols (symbols: Strings, streamBuilder: (marketId: Str) => Str) {
        if (streamBuilder === undefined) {
            throw new ArgumentsRequired (this.id + ' buildPerpStreamsFromSymbols() requires a streamBuilder callback');
        }
        const marketIds = this.marketIds (symbols);
        if ((marketIds === undefined) || (marketIds.length === 0)) {
            throw new ArgumentsRequired (this.id + ' buildPerpStreamsFromSymbols() requires a non-empty symbols array');
        }
        const result = [];
        for (let i = 0; i < marketIds.length; i++) {
            result.push (streamBuilder (marketIds[i]));
        }
        return result;
    }

    composePerpStreamRequest (streams: Strings): Dict {
        if ((streams === undefined) || (streams.length === 0)) {
            throw new ArgumentsRequired (this.id + ' composePerpStreamRequest() requires at least one stream name');
        }
        if (streams.length === 1) {
            const singleStream = streams[0];
            return {
                'url': this.urls['api']['ws']['future'] + '/' + singleStream,
                'messageHash': singleStream,
            };
        }
        const streamPath = streams.join ('/');
        return {
            'url': this.urls['api']['ws']['combined'] + streamPath,
            'messageHash': streamPath,
        };
    }

    watchPerpStreams (streams: Strings, subscription: Dict = undefined, params = {}) {
        const request = this.composePerpStreamRequest (streams);
        return this.watch (request['url'], request['messageHash'], subscription, params);
    }

    async watchTrades (symbol: string, since: Int = undefined, limit: Int = undefined, params = {}): Promise<Trade[]> {
        return await this.watchTradesForSymbols ([ symbol ], since, limit, params);
    }

    async watchTradesForSymbols (symbols: string[], since: Int = undefined, limit: Int = undefined, params = {}): Promise<Trade[]> {
        await this.loadMarkets ();
        const streams = this.buildPerpStreamsFromSymbols (symbols, (marketId: Str) => this.formatPerpStream (marketId, 'trade'));
        return await this.watchPerpStreams (streams, { 'type': 'trade', 'symbols': symbols, 'since': since, 'limit': limit }, params);
    }

    async watchOrderBook (symbol: string, limit: Int = undefined, params = {}): Promise<OrderBook> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'depth@100ms');
        return await this.watchPerpStreams ([ stream ], { symbol, limit }, params);
    }

    async watchTicker (symbol: string, params = {}): Promise<Ticker> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'ticker');
        return await this.watchPerpStreams ([ stream ], { symbol }, params);
    }

    async watchTickers (symbols: Strings = undefined, params = {}): Promise<Tickers> {
        await this.loadMarkets ();
        const streams = this.buildPerpStreamsFromSymbols (symbols, (marketId: Str) => this.formatPerpStream (marketId, 'ticker'));
        return await this.watchPerpStreams (streams, { symbols }, params);
    }

    async watchOHLCV (symbol: string, timeframe = '1m', since: Int = undefined, limit: Int = undefined, params = {}): Promise<OHLCV[]> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'kline_' + timeframe);
        return await this.watchPerpStreams ([ stream ], { symbol, timeframe }, params);
    }

    async watchMarkPrice (symbol: string, params = {}): Promise<Ticker> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = this.formatPerpStream (market['id'], 'markPrice@1s');
        const data = await this.watchPerpStreams ([ stream ], undefined, params);
        return this.parseTicker (data, market);
    }

    async watchBalance (params = {}): Promise<Balances> {
        await this.loadMarkets ();
        return await this.watchPrivateStream ('balance', params);
    }

    async watchPrivateStream (messageHash: Str, params = {}) {
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
        const event = this.safeString (message, 'e');
        if (event === 'ACCOUNT_UPDATE') {
            this.handleAccountUpdate (client, message);
            return;
        }
        client.resolve (message, undefined);
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
    }
}
