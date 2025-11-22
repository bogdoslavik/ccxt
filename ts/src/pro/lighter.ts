//  ---------------------------------------------------------------------------

import lighterRest from '../lighter.js';
import Client from '../base/ws/Client.js';
import Precise from '../base/Precise.js';
import type { Strings, FundingRate, FundingRates, Dict, Market } from '../base/types.js';

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
        const bidsasks = await this.watchBidsAsks ([ market['symbol'] ], params);
        return this.safeValue (bidsasks, market['symbol']);
    }

    async watchBidsAsks (symbols: Strings = undefined, params = {}) {
        await this.loadMarkets ();
        const url = this.urls['api']['ws']['public'];
        if (symbols === undefined || symbols.length === 0) {
            const messageHash = 'bidsasks';
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
            const messageHash = 'bidask:' + market['symbol'];
            const channel = 'market_stats/' + market['id'];
            const request: Dict = {
                'type': 'subscribe',
                'channel': channel,
            };
            promises.push (this.watch (url, messageHash, this.extend (request, params), messageHash));
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
        } else if (type === 'connected') {
            return;
        }
        client.resolve (message, type);
    }
}
