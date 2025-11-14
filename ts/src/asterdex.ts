//  ---------------------------------------------------------------------------

import Exchange from './abstract/asterdex.js';
import { ExchangeError, AuthenticationError, BadSymbol, InvalidOrder, InsufficientFunds, OrderNotFound, RateLimitExceeded, DDoSProtection, BadRequest, ArgumentsRequired } from './base/errors.js';
import { sha256 } from './static_dependencies/noble-hashes/sha256.js';
import { Precise } from './base/Precise.js';
import { TICK_SIZE } from './base/functions/number.js';
import type { Market, Dict, Ticker, Tickers, OrderBook, Trade, OHLCV, FundingRate, FundingRates, FundingRateHistory, Str, Strings, OpenInterest, int, Balances, Position, Order } from './base/types.js';

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
        const linear = true;
        const inverse = false;
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

    async fetchTime (params = {}) {
        const response = await this.publicGetTime (params);
        this.logResponse ('fetchTime', response);
        return this.safeInteger (response, 'serverTime');
    }

    async fetchBalance (params = {}): Promise<Balances> {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        const response = await this.privateGetAccount (params);
        this.logResponse ('fetchBalance', response);
        return this.parseBalance (response);
    }

    parseBalance (response) {
        const timestamp = this.safeInteger (response, 'updateTime');
        const result = {
            'info': response,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
        };
        const assets = this.safeList (response, 'assets', []);
        for (let i = 0; i < assets.length; i++) {
            const entry = assets[i];
            const currencyId = this.safeString (entry, 'asset');
            const code = this.safeCurrencyCode (currencyId);
            const account = this.account ();
            account['total'] = this.safeString (entry, 'walletBalance');
            account['free'] = this.safeString (entry, 'availableBalance');
            account['used'] = this.safeString (entry, 'crossWalletBalance');
            result[code] = account;
        }
        return this.safeBalance (result);
    }

    parseTicker (ticker: Dict, market: Market = undefined): Ticker {
        const symbol = this.safeSymbol (this.safeString (ticker, 'symbol'), market);
        const timestamp = this.safeInteger2 (ticker, 'closeTime', 'time');
        const last = this.safeString2 (ticker, 'lastPrice', 'price');
        const open = this.safeString (ticker, 'openPrice');
        const high = this.safeString (ticker, 'highPrice');
        const low = this.safeString (ticker, 'lowPrice');
        const baseVolume = this.safeString2 (ticker, 'volume', 'baseVolume');
        const quoteVolume = this.safeString2 (ticker, 'quoteVolume', 'quoteVolume');
        const bid = this.safeString (ticker, 'bidPrice');
        const ask = this.safeString (ticker, 'askPrice');
        const change = this.safeString (ticker, 'priceChange');
        const percentage = this.safeString (ticker, 'priceChangePercent');
        return this.safeTicker ({
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': high,
            'low': low,
            'bid': bid,
            'bidVolume': this.safeString (ticker, 'bidQty'),
            'ask': ask,
            'askVolume': this.safeString (ticker, 'askQty'),
            'vwap': this.safeString (ticker, 'weightedAvgPrice'),
            'open': open,
            'close': last,
            'last': last,
            'previousClose': undefined,
            'change': change,
            'percentage': percentage,
            'average': undefined,
            'baseVolume': baseVolume,
            'quoteVolume': quoteVolume,
            'info': ticker,
        }, market);
    }

    async fetchTicker (symbol: Str, params = {}): Promise<Ticker> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        const response = await this.publicGetTicker24hr (this.extend (request, params));
        this.logResponse ('fetchTicker', response);
        return this.parseTicker (response, market);
    }

    async fetchTickers (symbols: Strings = undefined, params = {}): Promise<Tickers> {
        await this.loadMarkets ();
        const response = await this.publicGetTicker24hr (params);
        this.logResponse ('fetchTickers', response);
        return this.parseTickers (response, symbols);
    }

    async fetchBidsAsks (symbols: Strings = undefined, params = {}) {
        await this.loadMarkets ();
        const response = await this.publicGetTickerBookTicker (params);
        this.logResponse ('fetchBidsAsks', response);
        return this.parseTickers (response, symbols);
    }

    async fetchOrderBook (symbol: Str, limit: int = undefined, params = {}): Promise<OrderBook> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetDepth (this.extend (request, params));
        this.logResponse ('fetchOrderBook', response);
        return this.parseOrderBook (response, market['symbol'], this.safeInteger (response, 'T'));
    }

    parseTrade (trade: Dict, market: Market = undefined) {
        const id = this.safeString2 (trade, 'a', 'id');
        const orderId = this.safeString (trade, 'orderId');
        const timestamp = this.safeInteger2 (trade, 'T', 'time');
        const price = this.safeString2 (trade, 'p', 'price');
        const amount = this.safeString2 (trade, 'q', 'qty');
        const cost = this.safeString (trade, 'quoteQty');
        const marketId = this.safeString (trade, 'symbol');
        const symbol = this.safeSymbol (marketId, market);
        const buyerMaker = this.safeBool2 (trade, 'm', 'isBuyerMaker');
        const takerOrMaker = (buyerMaker === undefined) ? undefined : 'taker';
        let side = undefined;
        if (buyerMaker !== undefined) {
            side = buyerMaker ? 'sell' : 'buy';
        }
        return this.safeTrade ({
            'info': trade,
            'id': id,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'order': orderId,
            'type': undefined,
            'side': side,
            'takerOrMaker': takerOrMaker,
            'price': price,
            'amount': amount,
            'cost': cost,
            'fee': undefined,
        }, market);
    }

    async fetchTrades (symbol: Str, limit: int = 100, params = {}): Promise<Trade[]> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetTrades (this.extend (request, params));
        this.logResponse ('fetchTrades', response);
        return this.parseTrades (response, market, undefined, limit);
    }

    parseOHLCV (ohlcv): OHLCV {
        return [
            this.safeInteger (ohlcv, 0),
            this.safeNumber (ohlcv, 1),
            this.safeNumber (ohlcv, 2),
            this.safeNumber (ohlcv, 3),
            this.safeNumber (ohlcv, 4),
            this.safeNumber (ohlcv, 5),
        ];
    }

    async fetchOHLCV (symbol: Str, timeframe = '1m', since: int = undefined, limit: int = 500, params = {}): Promise<OHLCV[]> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
            'interval': timeframe,
        };
        if (since !== undefined) {
            request['startTime'] = since;
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetKlines (this.extend (request, params));
        this.logResponse ('fetchOHLCV', response);
        return this.parseOHLCVs (response, market, timeframe, since, limit);
    }

    async fetchMarkOHLCV (symbol: Str, timeframe = '1m', since: int = undefined, limit: int = 500, params = {}): Promise<OHLCV[]> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
            'interval': timeframe,
        };
        if (since !== undefined) {
            request['startTime'] = since;
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetMarkPriceKlines (this.extend (request, params));
        this.logResponse ('fetchMarkOHLCV', response);
        return this.parseOHLCVs (response, market, timeframe, since, limit);
    }

    async fetchIndexOHLCV (symbol: Str, timeframe = '1m', since: int = undefined, limit: int = 500, params = {}): Promise<OHLCV[]> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'pair': market['id'],
            'interval': timeframe,
        };
        if (since !== undefined) {
            request['startTime'] = since;
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetIndexPriceKlines (this.extend (request, params));
        this.logResponse ('fetchIndexOHLCV', response);
        return this.parseOHLCVs (response, market, timeframe, since, limit);
    }

    parseFundingRate (contract, market: Market = undefined): FundingRate {
        const marketId = this.safeString (contract, 'symbol');
        const symbol = this.safeSymbol (marketId, market);
        const timestamp = this.safeInteger (contract, 'time');
        return {
            'info': contract,
            'symbol': symbol,
            'markPrice': this.safeNumber (contract, 'markPrice'),
            'indexPrice': this.safeNumber (contract, 'indexPrice'),
            'interestRate': this.safeNumber (contract, 'interestRate'),
            'estimatedSettlePrice': this.safeNumber (contract, 'estimatedSettlePrice'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'fundingRate': this.safeNumber (contract, 'lastFundingRate'),
            'fundingTimestamp': this.safeInteger (contract, 'nextFundingTime'),
            'fundingDatetime': this.iso8601 (this.safeInteger (contract, 'nextFundingTime')),
            'nextFundingRate': undefined,
            'nextFundingTimestamp': this.safeInteger (contract, 'nextFundingTime'),
            'nextFundingDatetime': this.iso8601 (this.safeInteger (contract, 'nextFundingTime')),
            'previousFundingRate': undefined,
            'previousFundingTimestamp': undefined,
            'previousFundingDatetime': undefined,
        };
    }

    async fetchFundingRate (symbol: Str, params = {}): Promise<FundingRate> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        const response = await this.publicGetPremiumIndex (this.extend (request, params));
        this.logResponse ('fetchFundingRate', response);
        return this.parseFundingRate (response, market);
    }

    async fetchFundingRates (symbols: Strings = undefined, params = {}): Promise<FundingRates> {
        await this.loadMarkets ();
        const response = await this.publicGetPremiumIndex (params);
        this.logResponse ('fetchFundingRates', response);
        return this.parseFundingRates (response, symbols);
    }

    parseFundingRates (rates, symbols: Strings = undefined): FundingRates {
        const result: FundingRate[] = [];
        for (let i = 0; i < rates.length; i++) {
            const entry = this.parseFundingRate (rates[i]);
            result.push (entry);
        }
        const filtered = this.filterByArray (result, 'symbol', symbols);
        return this.indexBy (filtered, 'symbol');
    }

    async fetchFundingRateHistory (symbol: Str, since: int = undefined, limit: int = undefined, params = {}): Promise<FundingRateHistory[]> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        if (since !== undefined) {
            request['startTime'] = since;
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetFundingRate (this.extend (request, params));
        this.logResponse ('fetchFundingRateHistory', response);
        return this.parseFundingRateHistories (response, market, since, limit);
    }

    parseFundingRateHistories (rates, market: Market = undefined, since: int = undefined, limit: int = undefined): FundingRateHistory[] {
        const result: FundingRateHistory[] = [];
        for (let i = 0; i < rates.length; i++) {
            const entry = rates[i];
            const parsed = {
                'info': entry,
                'symbol': this.safeSymbol (this.safeString (entry, 'symbol'), market),
                'fundingRate': this.safeNumber (entry, 'fundingRate'),
                'timestamp': this.safeInteger (entry, 'fundingTime'),
                'datetime': this.iso8601 (this.safeInteger (entry, 'fundingTime')),
            };
            result.push (parsed);
        }
        return this.filterBySinceLimit (result, since, limit, 'timestamp');
    }

    parseOpenInterest (interest, market: Market = undefined): OpenInterest {
        const symbol = this.safeSymbol (this.safeString (interest, 'symbol'), market);
        const timestamp = this.safeInteger (interest, 'time');
        return {
            'symbol': symbol,
            'baseVolume': this.safeNumber (interest, 'openInterest'),
            'quoteVolume': undefined,
            'openInterestAmount': this.safeNumber (interest, 'openInterest'),
            'openInterestValue': undefined,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'info': interest,
        };
    }

    async fetchOpenInterest (symbol: Str, params = {}): Promise<OpenInterest> {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = { 'symbol': market['id'] };
        const response = await this.publicGetOpenInterest (this.extend (request, params));
        this.logResponse ('fetchOpenInterest', response);
        return this.parseOpenInterest (response, market);
    }

    parseOrderStatus (status: Str) {
        const statuses = {
            'NEW': 'open',
            'PARTIALLY_FILLED': 'open',
            'FILLED': 'closed',
            'CANCELED': 'canceled',
            'REJECTED': 'rejected',
            'EXPIRED': 'expired',
        };
        return this.safeString (statuses, status, status);
    }

    parseOrder (order, market: Market = undefined): Order {
        const marketId = this.safeString (order, 'symbol');
        const symbol = this.safeSymbol (marketId, market);
        const timestamp = this.safeInteger2 (order, 'time', 'updateTime');
        const lastTradeTimestamp = this.safeInteger (order, 'updateTime');
        const status = this.parseOrderStatus (this.safeString (order, 'status'));
        const type = this.safeStringLower (order, 'type');
        const side = this.safeStringLower (order, 'side');
        const fee = {
            'cost': this.safeNumber (order, 'commission'),
            'currency': this.safeCurrencyCode (this.safeString (order, 'commissionAsset')),
        };
        const timeInForce = this.safeString (order, 'timeInForce');
        const amount = this.safeString (order, 'origQty');
        const filled = this.safeString (order, 'executedQty');
        let remaining = undefined;
        if (amount !== undefined && filled !== undefined) {
            remaining = Precise.stringSub (amount, filled);
        }
        return this.safeOrder ({
            'info': order,
            'id': this.safeString (order, 'orderId'),
            'clientOrderId': this.safeString (order, 'clientOrderId'),
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': lastTradeTimestamp,
            'symbol': symbol,
            'type': type,
            'timeInForce': timeInForce,
            'postOnly': (timeInForce === 'GTX') ? true : undefined,
            'side': side,
            'price': this.safeString (order, 'price'),
            'amount': amount,
            'cost': this.safeString (order, 'cumQuote'),
            'average': this.safeString (order, 'avgPrice'),
            'filled': filled,
            'remaining': remaining,
            'status': status,
            'fee': fee,
            'stopPrice': this.safeString (order, 'stopPrice'),
            'reduceOnly': this.safeBool (order, 'reduceOnly'),
        });
    }

    normalizeClientId (params) {
        const clientOrderId = this.safeString2 (params, 'clientOrderId', 'newClientOrderId');
        if (clientOrderId !== undefined && clientOrderId !== '') {
            return clientOrderId;
        }
        return this.safeString (params, 'clientOrderId');
    }

    async createOrder (symbol: Str, type: Str, side: Str, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        const market = this.market (symbol);
        const upperType = type.toUpperCase ();
        const request = {
            'symbol': market['id'],
            'side': side.toUpperCase (),
            'type': upperType,
        };
        const clientOrderId = this.normalizeClientId (params);
        if (clientOrderId !== undefined) {
            request['newClientOrderId'] = clientOrderId;
        }
        const reduceOnly = this.safeBool (params, 'reduceOnly');
        if (reduceOnly !== undefined) {
            request['reduceOnly'] = reduceOnly;
            params = this.omit (params, 'reduceOnly');
        }
        if (upperType === 'MARKET') {
            const quoteOrderQty = this.safeNumber2 (params, 'quoteOrderQty', 'cost');
            if (quoteOrderQty !== undefined) {
                request['quoteOrderQty'] = this.costToPrecision (symbol, quoteOrderQty);
                params = this.omit (params, [ 'quoteOrderQty', 'cost' ]);
            } else {
                request['quantity'] = this.amountToPrecision (symbol, amount);
            }
        } else {
            request['quantity'] = this.amountToPrecision (symbol, amount);
            request['price'] = this.priceToPrecision (symbol, price);
            const timeInForce = this.safeStringUpper (params, 'timeInForce');
            if (timeInForce !== undefined) {
                request['timeInForce'] = timeInForce;
                params = this.omit (params, 'timeInForce');
            }
        }
        const response = await this.privatePostOrder (this.extend (request, params));
        this.logResponse ('createOrder', response);
        return this.parseOrder (response, market);
    }

    async cancelOrder (id: Str, symbol: Str = undefined, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' cancelOrder() requires a symbol argument');
        }
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
            'orderId': id,
        };
        const response = await this.privateDeleteOrder (this.extend (request, params));
        this.logResponse ('cancelOrder', response);
        return this.parseOrder (response, market);
    }

    async fetchOpenOrders (symbol: Str = undefined, since: int = undefined, limit: int = undefined, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        const request = {};
        let market = undefined;
        if (symbol !== undefined) {
            market = this.market (symbol);
            request['symbol'] = market['id'];
        }
        const response = await this.privateGetOpenOrders (this.extend (request, params));
        this.logResponse ('fetchOpenOrders', response);
        return this.parseOrders (response, market, since, limit);
    }

    async fetchOrders (symbol: Str = undefined, since: int = undefined, limit: int = undefined, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchOrders() requires a symbol argument');
        }
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        if (since !== undefined) {
            request['startTime'] = since;
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.privateGetAllOrders (this.extend (request, params));
        this.logResponse ('fetchOrders', response);
        return this.parseOrders (response, market, since, limit);
    }

    async fetchMyTrades (symbol: Str = undefined, since: int = undefined, limit: int = undefined, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchMyTrades() requires a symbol argument');
        }
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        if (since !== undefined) {
            request['startTime'] = since;
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.privateGetUserTrades (this.extend (request, params));
        this.logResponse ('fetchMyTrades', response);
        return this.parseTrades (response, market, since, limit);
    }

    async fetchListenKey (params = {}) {
        this.checkRequiredCredentials (true);
        const response = await this.privatePostListenKey (params);
        this.logResponse ('fetchListenKey', response);
        this.options['listenKey'] = this.safeString (response, 'listenKey');
        return this.options['listenKey'];
    }

    async keepAliveListenKey (params = {}) {
        this.checkRequiredCredentials (true);
        const listenKey = this.safeString (this.options, 'listenKey');
        if (listenKey === undefined) {
            throw new ArgumentsRequired (this.id + ' keepAliveListenKey() requires fetchListenKey() to be called first');
        }
        const response = await this.privatePutListenKey (this.extend ({ 'listenKey': listenKey }, params));
        this.logResponse ('keepAliveListenKey', response);
        return response;
    }

    async closeListenKey (params = {}) {
        this.checkRequiredCredentials (true);
        const listenKey = this.safeString (this.options, 'listenKey');
        if (listenKey === undefined) {
            throw new ArgumentsRequired (this.id + ' closeListenKey() requires fetchListenKey() to be called first');
        }
        const response = await this.privateDeleteListenKey (this.extend ({ 'listenKey': listenKey }, params));
        this.logResponse ('closeListenKey', response);
        this.options['listenKey'] = undefined;
        return response;
    }

    async fetchLeverage (symbol: Str = undefined, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        const request = {};
        const response = await this.privateGetLeverageBracket (this.extend (request, params));
        this.logResponse ('fetchLeverage', response);
        if (symbol === undefined) {
            return response;
        }
        const market = this.market (symbol);
        for (let i = 0; i < response.length; i++) {
            const entry = response[i];
            if (this.safeString (entry, 'symbol') === market['id']) {
                return entry;
            }
        }
        return undefined;
    }

    async setLeverage (leverage, symbol: Str = undefined, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' setLeverage() requires a symbol argument');
        }
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
            'leverage': leverage,
        };
        const response = await this.privatePostLeverage (this.extend (request, params));
        this.logResponse ('setLeverage', response);
        return response;
    }

    async setMarginMode (marginMode: Str, symbol: Str = undefined, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' setMarginMode() requires a symbol argument');
        }
        const market = this.market (symbol);
        const marginModeUpper = marginMode.toUpperCase ();
        const request = {
            'symbol': market['id'],
            'marginType': marginModeUpper,
        };
        const response = await this.privatePostMarginType (this.extend (request, params));
        this.logResponse ('setMarginMode', response);
        return response;
    }

    async setPositionMode (hedged: boolean, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        const request = {
            'dualSidePosition': hedged ? 'true' : 'false',
        };
        const response = await this.privatePostPositionSideDual (this.extend (request, params));
        this.logResponse ('setPositionMode', response);
        return response;
    }

    async fetchPositions (symbols: Strings = undefined, params = {}) {
        await this.loadMarkets ();
        this.checkRequiredCredentials (true);
        const response = await this.privateGetPositionRisk (params);
        this.logResponse ('fetchPositions', response);
        return this.parsePositions (response, symbols);
    }

    parsePosition (position, market: Market = undefined): Position {
        const marketId = this.safeString (position, 'symbol');
        const symbol = this.safeSymbol (marketId, market);
        const timestamp = this.safeInteger (position, 'updateTime');
        const isolated = this.safeString (position, 'marginType') === 'isolated';
        const entryPrice = this.safeNumber (position, 'entryPrice');
        const size = this.safeNumber (position, 'positionAmt');
        let side = undefined;
        if (size !== undefined) {
            if (size > 0) {
                side = 'long';
            } else if (size < 0) {
                side = 'short';
            }
        }
        const leverage = this.safeNumber (position, 'leverage');
        const notional = this.safeNumber (position, 'notional');
        const unrealizedPnl = this.safeNumber (position, 'unRealizedProfit');
        const contracts = (size !== undefined) ? Math.abs (size) : undefined;
        return this.safePosition ({
            'info': position,
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'isolated': isolated,
            'marginMode': isolated ? 'isolated' : 'cross',
            'entryPrice': entryPrice,
            'notional': notional,
            'leverage': leverage,
            'collateral': this.safeNumber (position, 'isolatedMargin'),
            'side': side,
            'contracts': contracts,
            'contractSize': this.safeNumber (position, 'contractSize'),
            'unrealizedPnl': unrealizedPnl,
            'liquidationPrice': this.safeNumber (position, 'liquidationPrice'),
        });
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
            this.log (this.id + ' ' + label + ': ' + this.json (payload));
        }
    }
}
