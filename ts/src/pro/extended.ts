//  ---------------------------------------------------------------------------

import extendedRest from '../extended.js';
import Client from '../base/ws/Client.js';
import type { Strings, FundingRate, FundingRates, Dict } from '../base/types.js';

//  ---------------------------------------------------------------------------

export default class extended extends extendedRest {

    describe (): any {
        const parent = super.describe ();
        return this.deepExtend (parent, {
            'has': this.deepExtend (parent['has'], {
                'ws': true,
                'watchFundingRate': true,
                'watchFundingRates': true,
            }),
            'urls': this.deepExtend (parent['urls'], {
                'api': this.deepExtend (parent['urls']['api'], {
                    'ws': {
                        'public': 'wss://api.starknet.extended.exchange',
                        'test': 'wss://api.starknet.sepolia.extended.exchange',
                    },
                }),
            }),
            'options': this.deepExtend (parent['options'], {
                'ws': {
                    'options': {
                        'headers': {
                            'User-Agent': 'ccxt-pro',
                        },
                    },
                },
            }),
        });
    }

    getFundingUrl (marketId: string = undefined) {
        const base = this.urls['api']['ws']['public'];
        const path = (marketId === undefined) ? '/stream.extended.exchange/v1/funding' : '/stream.extended.exchange/v1/funding/' + marketId;
        return base + path;
    }

    async watchFundingRate (symbol: string, params = {}): Promise<FundingRate> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const rates = await this.watchFundingRates ([ market['symbol'] ], params);
        return this.safeValue (rates, market['symbol']);
    }

    async watchFundingRates (symbols: Strings = undefined, params = {}): Promise<FundingRates> {
        await this.loadMarkets ();
        if (symbols === undefined || symbols.length === 0) {
            const url = this.getFundingUrl ();
            const messageHash = 'fundingrates';
            return await this.watch (url, messageHash, undefined, messageHash);
        }
        const markets = this.marketSymbols (symbols);
        const promises = [];
        for (let i = 0; i < markets.length; i++) {
            const market = this.market (markets[i]);
            const url = this.getFundingUrl (market['id']);
            const messageHash = 'fundingrate:' + market['symbol'];
            promises.push (this.watch (url, messageHash, undefined, messageHash));
        }
        const responses = await Promise.all (promises);
        const result: FundingRates = {};
        for (let i = 0; i < responses.length; i++) {
            const fundingRate = responses[i];
            const symbol = fundingRate['symbol'];
            result[symbol] = fundingRate;
        }
        return result;
    }

    handleFundingMessage (client: Client, message, subscriptionHash: string) {
        const data = this.safeValue (message, 'data');
        if (data === undefined) {
            return;
        }
        const entries = Array.isArray (data) ? data : [ data ];
        const fundingResult: FundingRates = {};
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const fundingRate = this.parseWsFundingRate (entry);
            if (fundingRate === undefined) {
                continue;
            }
            const symbol = fundingRate['symbol'];
            this.fundingRates = this.safeValue (this, 'fundingRates', {});
            this.fundingRates[symbol] = fundingRate;
            fundingResult[symbol] = fundingRate;
            client.resolve (fundingRate, 'fundingrate:' + symbol);
        }
        if (Object.keys (fundingResult).length > 0) {
            client.resolve (fundingResult, subscriptionHash);
        }
    }

    parseWsFundingRate (data: Dict): FundingRate {
        const marketId = this.safeString (data, 'm');
        if (marketId === undefined) {
            return undefined;
        }
        const market = this.safeMarket (marketId, undefined, undefined, 'swap');
        const symbol = market['symbol'];
        const timestamp = this.safeInteger (data, 'T');
        const rate = this.safeNumber (data, 'f');
        return {
            'info': data,
            'symbol': symbol,
            'markPrice': undefined,
            'indexPrice': undefined,
            'interestRate': undefined,
            'estimatedSettlePrice': undefined,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'fundingRate': rate,
            'fundingTimestamp': timestamp,
            'fundingDatetime': this.iso8601 (timestamp),
            'nextFundingRate': undefined,
            'nextFundingTimestamp': undefined,
            'nextFundingDatetime': undefined,
            'previousFundingRate': undefined,
            'previousFundingTimestamp': undefined,
            'previousFundingDatetime': undefined,
        };
    }

    async pong (client: Client) {
        await client.send ({ 'type': 'pong' });
    }

    handleMessage (client: Client, message) {
        if (message === 'pong') {
            return;
        }
        const type = this.safeString (message, 'type');
        if (type === 'ping') {
            this.spawn (this.pong, client, message);
            return;
        }
        const data = this.safeValue (message, 'data');
        if (data !== undefined && (this.safeString (data, 'm') !== undefined || Array.isArray (data))) {
            const url = client.url;
            const streamHash = (url.indexOf ('/funding/') >= 0 && url.split ('/').pop () !== 'funding') ? 'fundingrate:' + this.safeString (data, 'm') : 'fundingrates';
            this.handleFundingMessage (client, message, streamHash);
            return;
        }
        client.resolve (message, undefined);
    }
}
