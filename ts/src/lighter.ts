//  ---------------------------------------------------------------------------

import Exchange from './abstract/lighter.js';
import type { Market, Dict, Str, Strings, FundingRate, FundingRates } from './base/types.js';

//  ---------------------------------------------------------------------------

export default class lighter extends Exchange {

    describe (): any {
        return this.deepExtend (super.describe (), {
            'id': 'lighter',
            'name': 'Lighter',
            'countries': [],
            'version': 'v1',
            'certified': false,
            'pro': true,
            'dex': true,
            'rateLimit': 100,
            'has': {
                'CORS': undefined,
                'spot': false,
                'margin': false,
                'swap': true,
                'future': false,
                'option': false,
                'fetchFundingRates': true,
                'fetchMarkets': true,
            },
            'urls': {
                'logo': 'https://docs.lighter.xyz/~gitbook/image?url=https%3A%2F%2F3669194962-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Forganizations%252FUL2QKgoUbvRiSpqVpgNb%252Fsites%252Fsite_vJ2eU%252Ficon%252FK9qfLM7naMfzSsoGYajS%252FCrop%2520Circle%2520Tool%2520Image.png%3Falt%3Dmedia%26token%3D5281e6ca-9df2-43b9-b0c3-df734edc3487',
                'api': {
                    'public': 'https://mainnet.zklighter.elliot.ai/api/v1',
                },
                'www': 'https://www.lighter.xyz',
                'doc': 'https://apidocs.lighter.xyz',
            },
            'fees': {
                'trading': {
                    'tierBased': false,
                    'percentage': true,
                    'maker': this.parseNumber ('0'),
                    'taker': this.parseNumber ('0'),
                },
            },
            'api': {
                'public': {
                    'get': {
                        'orderBooks': 1,
                        'funding-rates': 1,
                    },
                },
            },
            'options': {
                'defaultType': 'swap',
                'fundingRateIntervalHours': 1,
            },
        });
    }

    parseMarket (market: Dict): Market {
        const marketId = this.safeString (market, 'market_id');
        const baseId = this.safeString (market, 'symbol');
        const base = baseId;
        const quote = 'USDC';
        const settle = 'USDC';
        const symbol = base + '/' + quote + ':' + settle;
        const status = this.safeStringLower (market, 'status');
        const active = (status === 'active');
        const amountDecimals = this.safeInteger (market, 'supported_size_decimals');
        const priceDecimals = this.safeInteger (market, 'supported_price_decimals');
        const amountPrecision = (amountDecimals !== undefined) ? this.parseNumber (this.parsePrecision (this.numberToString (amountDecimals))) : undefined;
        const pricePrecision = (priceDecimals !== undefined) ? this.parseNumber (this.parsePrecision (this.numberToString (priceDecimals))) : undefined;
        const limits = {
            'amount': {
                'min': this.safeNumber (market, 'min_base_amount'),
                'max': undefined,
            },
            'price': {
                'min': pricePrecision,
                'max': undefined,
            },
            'cost': {
                'min': this.safeNumber (market, 'min_quote_amount'),
                'max': undefined,
            },
        };
        return {
            'id': marketId,
            'symbol': symbol,
            'base': base,
            'quote': quote,
            'baseId': baseId,
            'quoteId': 'USDC',
            'type': 'swap',
            'spot': false,
            'swap': true,
            'option': false,
            'margin': false,
            'future': false,
            'contract': true,
            'linear': true,
            'inverse': false,
            'settle': settle,
            'settleId': 'USDC',
            'precision': {
                'amount': amountPrecision,
                'price': pricePrecision,
            },
            'limits': limits,
            'active': active,
            'contractSize': undefined,
            'expiry': undefined,
            'expiryDatetime': undefined,
            'strike': undefined,
            'optionType': undefined,
            'info': market,
        } as Market;
    }

    async fetchMarkets (params = {}) {
        const response = await this.publicGetOrderBooks (params);
        const data = this.safeValue (response, 'order_books', []);
        return this.parseMarkets (data, undefined);
    }

    parseFundingRate (info, market: Market = undefined): FundingRate {
        const marketId = this.safeString (info, 'market_id');
        market = this.safeMarket (marketId, market);
        const symbol = market['symbol'];
        const rate = this.safeNumber (info, 'rate');
        return {
            'info': info,
            'symbol': symbol,
            'markPrice': undefined,
            'indexPrice': undefined,
            'interestRate': undefined,
            'estimatedSettlePrice': undefined,
            'timestamp': undefined,
            'datetime': undefined,
            'fundingRate': rate,
            'fundingTimestamp': undefined,
            'fundingDatetime': undefined,
            'nextFundingRate': undefined,
            'nextFundingTimestamp': undefined,
            'nextFundingDatetime': undefined,
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
        const response = await this.publicGetFundingRates (params);
        const rates = this.safeValue (response, 'funding_rates', []);
        return this.parseFundingRates (rates, symbols);
    }

    sign (path, api: any = 'public', method = 'GET', params = {}, headers: any = undefined, body: any = undefined) {
        let url = this.urls['api'][api];
        let endpoint = path;
        if (endpoint[0] !== '/') {
            endpoint = '/' + endpoint;
        }
        url += endpoint;
        if (Object.keys (params).length) {
            url += '?' + this.urlencode (params);
        }
        headers = { 'Content-Type': 'application/json' };
        return { 'url': url, 'method': method, 'headers': headers, 'body': body };
    }
}
