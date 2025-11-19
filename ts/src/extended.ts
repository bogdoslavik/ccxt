//  ---------------------------------------------------------------------------

import Exchange from './abstract/extended.js';
import { TICK_SIZE } from './base/functions/number.js';
import type { Market, Dict, FundingRate, FundingRates, Strings } from './base/types.js';

//  ---------------------------------------------------------------------------

export default class extended extends Exchange {

    describe (): any {
        return this.deepExtend (super.describe (), {
            'id': 'extended',
            'name': 'Extended',
            'countries': [],
            'version': 'v1',
            'rateLimit': 50,
            'certified': false,
            'dex': true,
            'pro': true,
            'precisionMode': TICK_SIZE,
            'has': {
                'CORS': undefined,
                'spot': false,
                'margin': false,
                'swap': true,
                'future': false,
                'option': false,
                'fetchMarkets': true,
                'fetchFundingRates': true,
            },
            'urls': {
                'logo': 'https://extended.exchange/assets/images/logo.svg',
                'api': {
                    'public': 'https://api.starknet.extended.exchange/api/v1',
                },
                'test': {
                    'public': 'https://api.starknet.sepolia.extended.exchange/api/v1',
                },
                'www': 'https://extended.exchange',
                'doc': 'https://api.docs.extended.exchange',
            },
            'api': {
                'public': {
                    'get': {
                        'info/markets': 1,
                    },
                },
            },
            'fees': {
                'trading': {
                    'tierBased': false,
                    'percentage': true,
                    'maker': this.parseNumber ('0'),
                    'taker': this.parseNumber ('0'),
                },
            },
            'userAgent': this.userAgents['chrome'],
            'options': {
                'defaultType': 'swap',
                'fundingRateIntervalHours': 1,
            },
        });
    }

    parseMarket (market: Dict): Market {
        const marketId = this.safeString (market, 'name');
        const parts = marketId.split ('-');
        const baseId = this.safeString (parts, 0);
        const quoteId = this.safeString (parts, 1);
        const base = this.safeCurrencyCode (baseId);
        const quote = this.safeCurrencyCode (quoteId);
        const settleId = this.safeString (market, 'collateralAssetName', quoteId);
        const settle = this.safeCurrencyCode (settleId);
        const status = this.safeStringLower (market, 'status');
        const active = (status === 'active');
        const tradingConfig = this.safeDict (market, 'tradingConfig', {});
        const minAmount = this.safeNumber (tradingConfig, 'minOrderSize');
        const minCost = this.safeNumber (tradingConfig, 'minOrderSizeChange');
        const minPriceChange = this.safeString (tradingConfig, 'minPriceChange');
        const precisionPrice = (minPriceChange !== undefined) ? this.parseNumber (minPriceChange) : undefined;
        const assetPrecision = this.safeInteger (market, 'assetPrecision');
        const amountPrecision = (assetPrecision !== undefined) ? this.parseNumber (this.parsePrecision (this.numberToString (assetPrecision))) : undefined;
        return {
            'id': marketId,
            'symbol': base + '/' + quote + ':' + settle,
            'base': base,
            'quote': quote,
            'baseId': baseId,
            'quoteId': quoteId,
            'type': 'swap',
            'spot': false,
            'margin': false,
            'swap': true,
            'future': false,
            'option': false,
            'contract': true,
            'linear': true,
            'inverse': false,
            'settle': settle,
            'settleId': settleId,
            'contractSize': undefined,
            'precision': {
                'amount': amountPrecision,
                'price': precisionPrice,
            },
            'limits': {
                'amount': {
                    'min': minAmount,
                    'max': undefined,
                },
                'price': {
                    'min': precisionPrice,
                    'max': undefined,
                },
                'cost': {
                    'min': minCost,
                    'max': undefined,
                },
            },
            'active': active,
            'info': market,
        } as Market;
    }

    async fetchMarkets (params = {}) {
        const response = await this.publicGetInfoMarkets (params);
        const data = this.safeValue (response, 'data', []);
        return this.parseMarkets (data, undefined);
    }

    parseFundingRate (info, market: Market = undefined): FundingRate {
        const marketId = this.safeString (info, 'name');
        market = this.safeMarket (marketId, market, undefined, 'swap');
        const symbol = market['symbol'];
        const stats = this.safeDict (info, 'marketStats', {});
        const timestamp = undefined;
        const nextTimestamp = this.safeInteger (stats, 'nextFundingRate');
        return {
            'info': info,
            'symbol': symbol,
            'markPrice': this.safeNumber (stats, 'markPrice'),
            'indexPrice': this.safeNumber (stats, 'indexPrice'),
            'interestRate': undefined,
            'estimatedSettlePrice': undefined,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'fundingRate': this.safeNumber (stats, 'fundingRate'),
            'fundingTimestamp': timestamp,
            'fundingDatetime': this.iso8601 (timestamp),
            'nextFundingRate': this.safeNumber (stats, 'nextFundingRate'),
            'nextFundingTimestamp': nextTimestamp,
            'nextFundingDatetime': this.iso8601 (nextTimestamp),
            'previousFundingRate': undefined,
            'previousFundingTimestamp': undefined,
            'previousFundingDatetime': undefined,
        };
    }

    parseFundingRates (rates, symbols: Strings = undefined): FundingRates {
        const result: FundingRates = {};
        for (let i = 0; i < rates.length; i++) {
            const entry = this.parseFundingRate (rates[i]);
            const symbol = entry['symbol'];
            if (symbol !== undefined) {
                result[symbol] = entry;
            }
        }
        if (symbols === undefined) {
            return result;
        }
        const filtered: FundingRates = {};
        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            if ((symbol in result)) {
                filtered[symbol] = result[symbol];
            }
        }
        return filtered;
    }

    async fetchFundingRates (symbols: Strings = undefined, params = {}): Promise<FundingRates> {
        await this.loadMarkets ();
        const response = await this.publicGetInfoMarkets (params);
        const data = this.safeValue (response, 'data', []);
        return this.parseFundingRates (data, symbols);
    }

    sign (path, api: any = 'public', method = 'GET', params = {}, headers: any = undefined, body: any = undefined) {
        let url = this.urls['api'][api];
        if (path[0] !== '/') {
            path = '/' + path;
        }
        url += path;
        const query = this.omit (params, []);
        if (method === 'GET' && Object.keys (query).length) {
            url += '?' + this.urlencode (query);
        }
        headers = this.extend ({
            'Content-Type': 'application/json',
        }, headers);
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }
}
