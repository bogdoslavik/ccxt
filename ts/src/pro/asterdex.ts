//  ---------------------------------------------------------------------------

import asterdexRest from '../asterdex.js';
import type { OrderBook, Trade, Ticker, Tickers, OHLCV, Int, Str, Strings } from '../base/types.js';

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

    getCombinedStream (type: string, subscriptionsHash: string, marketId: Str) {
        return marketId + '@' + type;
    }

    getStreamUrl (params = {}) {
        const url = this.urls['api']['ws']['future'];
        return url;
    }

    async watchTrades (symbol: string, since: Int = undefined, limit: Int = undefined, params = {}): Promise<Trade[]> {
        return await this.watchTradesForSymbols ([ symbol ], since, limit, params);
    }

    async watchTradesForSymbols (symbols: string[], since: Int = undefined, limit: Int = undefined, params = {}): Promise<Trade[]> {
        await this.loadMarkets ();
        const marketIds = this.marketIds (symbols);
        const streams = [];
        for (let i = 0; i < marketIds.length; i++) {
            streams.push (marketIds[i] + '@trade');
        }
        const url = this.urls['api']['ws']['combined'] + streams.join ('/');
        return await this.watch (url, streams.join ('/'), { 'type': 'trade', 'symbols': symbols, 'since': since, 'limit': limit }, params);
    }

    async watchOrderBook (symbol: string, limit: Int = undefined, params = {}): Promise<OrderBook> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = market['id'] + '@depth@100ms';
        const url = this.urls['api']['ws']['future'] + '/' + stream;
        return await this.watch (url, stream, { symbol, limit }, params);
    }

    async watchTicker (symbol: string, params = {}): Promise<Ticker> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = market['id'] + '@ticker';
        const url = this.urls['api']['ws']['future'] + '/' + stream;
        return await this.watch (url, stream, { symbol }, params);
    }

    async watchTickers (symbols: Strings = undefined, params = {}): Promise<Tickers> {
        await this.loadMarkets ();
        const marketIds = this.marketIds (symbols);
        const streams = marketIds.map ((id) => id + '@ticker');
        const url = this.urls['api']['ws']['combined'] + streams.join ('/');
        return await this.watch (url, streams.join ('/'), { symbols }, params);
    }

    async watchOHLCV (symbol: string, timeframe = '1m', since: Int = undefined, limit: Int = undefined, params = {}): Promise<OHLCV[]> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = market['id'] + '@kline_' + timeframe;
        const url = this.urls['api']['ws']['future'] + '/' + stream;
        return await this.watch (url, stream, { symbol, timeframe }, params);
    }

    async watchMarkPrice (symbol: string, params = {}): Promise<Ticker> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const stream = market['id'] + '@markPrice@1s';
        const url = this.urls['api']['ws']['future'] + '/' + stream;
        const data = await this.watch (url, stream, undefined, params);
        return this.parseTicker (data, market);
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
}
