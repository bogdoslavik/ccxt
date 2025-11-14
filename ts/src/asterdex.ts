//  ---------------------------------------------------------------------------

import Exchange from './abstract/asterdex.js';
import { ExchangeError, AuthenticationError, BadSymbol, InvalidOrder, InsufficientFunds, OrderNotFound, RateLimitExceeded, DDoSProtection, BadRequest } from './base/errors.js';
import { sha256 } from './static_dependencies/noble-hashes/sha256.js';
import { TICK_SIZE } from './base/functions/number.js';
import type { Market, Dict } from './base/types.js';

//  ---------------------------------------------------------------------------

/**
 * @class asterdex
 * @augments Exchange
 */
export default class asterdex extends Exchange {
    describe (): any {
        return this.deepExtend (super.describe (), {
            'id': 'asterdex',
            'name': 'AsterDEX',
            'countries': [],
            'rateLimit': 50,
            'version': 'v1',
            'certified': false,
            'pro': true,
            'dex': true,
            'has': {
                'CORS': undefined,
                'spot': false,
                'margin': false,
                'swap': true,
                'future': false,
                'option': false,
                'addMargin': true,
                'borrowCrossMargin': false,
                'borrowIsolatedMargin': false,
                'cancelAllOrders': true,
                'cancelOrder': true,
                'cancelOrders': true,
                'closeAllPositions': false,
                'closePosition': false,
                'createConvertTrade': false,
                'createDepositAddress': false,
                'createMarketBuyOrderWithCost': true,
                'createMarketOrder': true,
                'createMarketOrderWithCost': true,
                'createOrder': true,
                'createOrders': true,
                'createReduceOnlyOrder': true,
                'createStopOrder': true,
                'createTriggerOrder': true,
                'editOrder': true,
                'fetchBalance': true,
                'fetchBidsAsks': true,
                'fetchBorrowRateHistory': false,
                'fetchClosedOrders': true,
                'fetchFundingHistory': true,
                'fetchFundingRate': true,
                'fetchFundingRates': true,
                'fetchLeverage': true,
                'fetchLeverageTiers': false,
                'fetchMarketLeverageTiers': false,
                'fetchMarkets': true,
                'fetchMarkOHLCV': true,
                'fetchMyTrades': true,
                'fetchOHLCV': true,
                'fetchCurrencies': false,
                'fetchOpenInterest': true,
                'fetchOpenOrders': true,
                'fetchOrder': true,
                'fetchOrderBook': true,
                'fetchPositions': true,
                'fetchPremiumIndexOHLCV': true,
                'fetchTicker': true,
                'fetchTickers': true,
                'fetchTime': true,
                'fetchTrades': true,
                'reduceMargin': true,
                'setLeverage': true,
                'setMarginMode': true,
                'setPositionMode': true,
                'transfer': false,
                'withdraw': false,
            },
            'timeframes': {
                '1m': '1m',
                '3m': '3m',
                '5m': '5m',
                '15m': '15m',
                '30m': '30m',
                '1h': '1h',
                '2h': '2h',
                '4h': '4h',
                '6h': '6h',
                '8h': '8h',
                '12h': '12h',
                '1d': '1d',
                '3d': '3d',
                '1w': '1w',
                '1M': '1M',
            },
            'hostname': 'fapi.asterdex.com',
            'urls': {
                'logo': 'https://www.asterdex.com/images/logo.svg',
                'api': {
                    'public': 'https://fapi.asterdex.com/fapi/v1',
                    'private': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiData': 'https://fapi.asterdex.com/fapi',
                    'ws': {
                        'future': 'wss://fstream.asterdex.com/ws',
                        'combined': 'wss://fstream.asterdex.com/stream?streams=',
                    },
                },
                'www': 'https://www.asterdex.com',
                'doc': [
                    'https://docs.asterdex.com/product/aster-perpetual-pro/api/api-documentation',
                    'https://github.com/asterdex/api-docs',
                ],
                'fees': 'https://docs.asterdex.com/product/aster-perpetual-pro/api/trading/fees',
                'api_management': 'https://www.asterdex.com/en/api-management',
            },
            'api': {
                'public': {
                    'get': {
                        'ping': 1,
                        'time': 1,
                        'exchangeInfo': 1,
                        'depth': { 'cost': 1, 'byLimit': [ [ 50, 2 ], [ 100, 5 ], [ 500, 10 ], [ 1000, 20 ] ] },
                        'trades': 5,
                        'historicalTrades': 20,
                        'aggTrades': 20,
                        'klines': 1,
                        'continuousKlines': 1,
                        'indexPriceKlines': 1,
                        'markPriceKlines': 1,
                        'ticker/24hr': 2,
                        'ticker/price': 2,
                        'ticker/bookTicker': 2,
                        'premiumIndex': 1,
                        'fundingRate': 1,
                        'fundingInfo': 1,
                        'openInterest': 1,
                        'openInterestHist': 1,
                        'topLongShortAccountRatio': 1,
                        'topLongShortPositionRatio': 1,
                        'globalLongShortAccountRatio': 1,
                        'lvtKlines': 1,
                        'compositeIndex/resume': 1,
                    },
                },
                'private': {
                    'get': {
                        'account': 5,
                        'balance': 5,
                        'commissionRate': 20,
                        'income': 30,
                        'leverageBracket': 1,
                        'positionRisk': 5,
                        'positionSide/dual': 30,
                        'userTrades': 5,
                        'openOrder': 1,
                        'openOrders': 1,
                        'allOrders': 5,
                        'forceOrders': 20,
                        'adlQuantile': 5,
                    },
                    'post': {
                        'order': 1,
                        'batchOrders': 5,
                        'listenKey': 1,
                        'positionSide/dual': 1,
                        'marginType': 1,
                        'leverage': 1,
                        'income/asyn': 5,
                        'orderAmendment': 5,
                    },
                    'put': {
                        'listenKey': 1,
                        'positionSide/dual': 1,
                    },
                    'delete': {
                        'order': 1,
                        'allOpenOrders': 1,
                        'batchOrders': 5,
                        'listenKey': 1,
                    },
                },
            },
            'fees': {
                'trading': {
                    'tierBased': false,
                    'percentage': true,
                    'taker': this.parseNumber ('0.0004'),
                    'maker': this.parseNumber ('0.0002'),
                },
            },
            'precisionMode': TICK_SIZE,
            'features': {
                'spot': undefined,
                'swap': {
                    'linear': {
                        'sandbox': false,
                        'createOrder': {
                            'marginMode': true,
                            'triggerPrice': true,
                            'triggerPriceType': {
                                'mark': true,
                                'last': true,
                                'index': true,
                            },
                            'stopLossPrice': true,
                            'takeProfitPrice': true,
                            'attachedStopLossTakeProfit': {
                                'triggerPriceType': {
                                    'last': true,
                                    'mark': true,
                                    'index': true,
                                },
                                'triggerPrice': true,
                                'type': true,
                                'price': true,
                            },
                            'timeInForce': {
                                'GTC': true,
                                'IOC': true,
                                'FOK': true,
                                'PO': true,
                                'GTD': false,
                            },
                            'hedged': true,
                            'trailing': true,
                            'leverage': true,
                            'marketBuyByCost': true,
                            'marketBuyRequiresPrice': false,
                            'selfTradePrevention': false,
                            'iceberg': false,
                        },
                        'createOrders': {
                            'max': 10,
                        },
                        'fetchMyTrades': {
                            'marginMode': true,
                            'limit': 1000,
                            'daysBack': undefined,
                            'untilDays': undefined,
                            'symbolRequired': false,
                        },
                        'fetchOrder': {
                            'marginMode': true,
                            'trigger': true,
                            'trailing': true,
                            'symbolRequired': true,
                        },
                        'fetchOpenOrders': {
                            'marginMode': true,
                            'limit': 1000,
                            'trigger': true,
                            'trailing': true,
                            'symbolRequired': false,
                        },
                        'fetchOrders': {
                            'marginMode': true,
                            'limit': 1000,
                            'daysBack': undefined,
                            'untilDays': undefined,
                            'trigger': true,
                            'trailing': true,
                            'symbolRequired': true,
                        },
                        'fetchClosedOrders': {
                            'marginMode': true,
                            'limit': 1000,
                            'daysBack': undefined,
                            'daysBackCanceled': undefined,
                            'untilDays': undefined,
                            'trigger': true,
                            'trailing': true,
                            'symbolRequired': true,
                        },
                        'fetchOHLCV': {
                            'limit': 1500,
                        },
                    },
                },
            },
            'options': {
                'recvWindow': 5000,
                'timeDifference': 0,
                'defaultType': 'swap',
                'broker': 'CCXT',
                'fetchCurrencies': false,
                'warnOnFetchOpenOrdersWithoutSymbol': true,
                'warnOnFetchOrdersWithoutSymbol': true,
                'warnOnFetchFundingRateHistoryWithoutSymbol': true,
                'log': false,
            },
            'exceptions': {
                'exact': {
                    '-1000': ExchangeError,
                    '-1001': RateLimitExceeded,
                    '-1002': AuthenticationError,
                    '-1003': RateLimitExceeded,
                    '-1006': DDoSProtection,
                    '-1007': ExchangeError,
                    '-1013': InvalidOrder,
                    '-1021': InvalidOrder,
                    '-1022': AuthenticationError,
                    '-1100': BadRequest,
                    '-1101': BadRequest,
                    '-1102': BadRequest,
                    '-1103': BadRequest,
                    '-1104': BadRequest,
                    '-1105': BadRequest,
                    '-1108': BadRequest,
                    '-1110': BadRequest,
                    '-1111': BadRequest,
                    '-1112': InvalidOrder,
                    '-1114': InvalidOrder,
                    '-1115': InvalidOrder,
                    '-1116': InvalidOrder,
                    '-1117': InvalidOrder,
                    '-1121': BadSymbol,
                    '-1125': InvalidOrder,
                    '-1127': InvalidOrder,
                    '-1130': InvalidOrder,
                    '-1147': InsufficientFunds,
                    '-2010': InvalidOrder,
                    '-2011': OrderNotFound,
                    '-2013': OrderNotFound,
                    '-2014': AuthenticationError,
                    '-2015': AuthenticationError,
                    '-3005': InvalidOrder,
                    '-3010': InvalidOrder,
                    '-3011': BadRequest,
                    '-3012': ExchangeError,
                    '-3022': BadRequest,
                    '-3023': BadRequest,
                },
            },
        });
    }

    async fetchMarkets (params = {}): Promise<Market[]> {
        const response = await this.publicGetExchangeInfo (params);
        this.logResponse ('fetchMarkets', response);
        const markets = this.safeList (response, 'symbols', []);
        const result: Market[] = [];
        for (let i = 0; i < markets.length; i++) {
            const market = markets[i];
            const parsed = this.parseMarket (market);
            if (parsed !== undefined) {
                result.push (parsed);
            }
        }
        return result;
    }

    parseMarket (market: Dict): Market {
        const id = this.safeString (market, 'symbol');
        const baseId = this.safeString (market, 'baseAsset');
        const quoteId = this.safeString (market, 'quoteAsset');
        const settleId = this.safeString (market, 'marginAsset', quoteId);
        const base = this.safeCurrencyCode (baseId);
        const quote = this.safeCurrencyCode (quoteId);
        const settle = this.safeCurrencyCode (settleId);
        const contractType = this.safeStringLower (market, 'contractType');
        const status = this.safeString (market, 'status');
        const active = (status === 'TRADING');
        const contractSize = this.safeNumber (market, 'contractSize', 1);
        const deliveryDate = this.safeInteger (market, 'deliveryDate');
        const filters = this.safeList (market, 'filters', []);
        const filtersByType = this.indexBy (filters, 'filterType');
        const priceFilter = this.safeDict (filtersByType, 'PRICE_FILTER', {});
        const lotSizeFilter = this.safeDict (filtersByType, 'LOT_SIZE', {});
        const marketLotFilter = this.safeDict (filtersByType, 'MARKET_LOT_SIZE', {});
        const notionalFilter = this.safeDict (filtersByType, 'MIN_NOTIONAL', this.safeDict (filtersByType, 'NOTIONAL', {}));
        const minPrice = this.safeNumber (priceFilter, 'minPrice');
        const maxPrice = this.safeNumber (priceFilter, 'maxPrice');
        let tickSize = this.safeNumber (priceFilter, 'tickSize');
        const minQty = this.safeNumber (lotSizeFilter, 'minQty');
        const maxQty = this.safeNumber (lotSizeFilter, 'maxQty');
        let stepSize = this.safeNumber (lotSizeFilter, 'stepSize');
        const marketMinQty = this.safeNumber (marketLotFilter, 'minQty');
        const marketMaxQty = this.safeNumber (marketLotFilter, 'maxQty');
        const minNotional = this.safeNumber2 (notionalFilter, 'minNotional', 'notional');
        const maxNotional = this.safeNumber (notionalFilter, 'maxNotional');
        const pricePrecision = this.safeInteger (market, 'pricePrecision');
        if ((tickSize === undefined || tickSize === 0) && (pricePrecision !== undefined)) {
            const precisionString = this.parsePrecision (this.numberToString (pricePrecision));
            tickSize = this.parseNumber (precisionString);
        }
        const quantityPrecision = this.safeInteger (market, 'quantityPrecision');
        if ((stepSize === undefined || stepSize === 0) && (quantityPrecision !== undefined)) {
            const amountPrecisionString = this.parsePrecision (this.numberToString (quantityPrecision));
            stepSize = this.parseNumber (amountPrecisionString);
        }
        const precision = {
            'amount': stepSize,
            'price': tickSize,
        };
        const type = this.safeStringLower (market, 'contractType');
        const linear = true;
        const inverse = false;
        const settleType = this.safeStringLower (market, 'marginAsset', 'usdt');
        const symbol = base + '/' + quote + ':' + settle;
        return {
            'id': id,
            'symbol': symbol,
            'base': base,
            'quote': quote,
            'settle': settle,
            'baseId': baseId,
            'quoteId': quoteId,
            'settleId': settleId,
            'type': 'swap',
            'spot': false,
            'margin': false,
            'swap': true,
            'future': false,
            'option': false,
            'contract': true,
            'linear': linear,
            'inverse': inverse,
            'created': this.safeInteger (market, 'onboardDate'),
            'expiry': deliveryDate,
            'expiryDatetime': this.iso8601 (deliveryDate),
            'strike': undefined,
            'optionType': undefined,
            'contractSize': contractSize,
            'active': active,
            'launch': this.safeInteger (market, 'onboardDate'),
            'precision': precision,
            'limits': {
                'amount': {
                    'min': minQty,
                    'max': maxQty,
                },
                'price': {
                    'min': minPrice,
                    'max': maxPrice,
                },
                'cost': {
                    'min': minNotional,
                    'max': maxNotional,
                },
                'market': {
                    'min': marketMinQty,
                    'max': marketMaxQty,
                },
            },
            'info': market,
        } as Market;
    }

    sign (path: string, api: string = 'public', method: string = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = this.implodeHostname (this.urls['api'][api]) + '/' + path;
        const query = this.omit (params, this.extractParams (path));
        if (api === 'public') {
            if (Object.keys (query).length) {
                url += '?' + this.urlencode (query);
            }
        } else {
            this.checkRequiredCredentials ();
            const recvWindow = this.safeInteger (this.options, 'recvWindow', 5000);
            const timestamp = this.milliseconds () + this.safeInteger (this.options, 'timeDifference', 0);
            const request = this.extend ({ 'timestamp': timestamp, 'recvWindow': recvWindow }, query);
            const payload = this.rawencode (request);
            const signature = this.hmac (this.encode (payload), this.encode (this.secret), sha256);
            if (method === 'GET' || method === 'DELETE') {
                url += '?' + payload + '&signature=' + signature;
            } else {
                body = payload + '&signature=' + signature;
                headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
            }
            headers = this.extend ({ 'X-MBX-APIKEY': this.apiKey }, headers);
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    handleErrors (code, reason, url, method, headers, body, response, requestHeaders, requestBody) {
        if ((response === undefined) || (Object.keys (response).length === 0)) {
            return;
        }
        const error = this.safeString (response, 'msg');
        const errorCode = this.safeString (response, 'code');
        if (errorCode !== undefined && errorCode !== '0') {
            const feedback = this.id + ' ' + body;
            this.throwExactlyMatchedException (this.exceptions['exact'], errorCode, feedback);
            throw new ExchangeError (feedback);
        }
        if (error !== undefined && error !== '') {
            const feedback = this.id + ' ' + body;
            this.throwExactlyMatchedException (this.exceptions['exact'], error, feedback);
            throw new ExchangeError (feedback);
        }
    }

    logResponse (label: string, payload) {
        if (this.safeBool (this.options, 'log', false)) {
            console.log (this.id + ' ' + label + ': ' + this.json (payload));
        }
    }
}
