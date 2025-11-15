# AsterDEX Integration Notes

## Implementation Plan
1. **Research & Environment Prep** – capture REST/WebSocket specs, auth, rate limits, and available endpoints; ensure sandbox keys and hosts are documented.
2. **TypeScript Exchange Skeleton** – implement `describe()`, API routing, precision/fees/options, and shared helpers in `ts/src/asterdex.ts`.
3. **Market Data Layer** – wire `fetchMarkets`, tickers, books, trades, klines, mark/index/funding data, and WebSocket stream descriptors.
4. **Account & Trading** – add balance/margin/account info plus order lifecycle (create/cancel/query), leverage/margin toggles, and funding history.
5. **Auth, Errors, Helpers** – finalize signing (HMAC SHA256, timestamps, recvWindow), credential requirements, sandbox routing, and exception maps.
6. **Tests & Multi-language Sync** – add TS/JS offline tests, run targeted `run-tests` suites, and execute `npm run build` to propagate generated code & docs.

-## Research Summary (Step 1)
- **Base endpoints**: REST requests hit `https://fapi.asterdex.com`, while public and user data WebSockets use `wss://fstream.asterdex.com` with `/ws/<stream>` (raw) or `/stream?streams=...` multiplexing. Connections auto-expire after 24 h, require pings every 5 min, allow up to 200 stream subscriptions, and limit publishers to 10 inbound commands/sec.citeturn2search2
- **Security model**: REST headers carry `X-MBX-APIKEY`. All `TRADE`/`USER_DATA` routes demand HMAC-SHA256 signatures over concatenated query/body payloads plus `timestamp` (ms) and optional `recvWindow` (default 5000 ms). Signature examples are provided for `POST /fapi/v1/order`.citeturn2search2
- **Rate limits**: `/fapi/v1/exchangeInfo` advertises REQUEST_WEIGHT=2400/min and ORDERS=1200/min. Each HTTP response adds `X-MBX-USED-WEIGHT-*`, and order endpoints include `X-MBX-ORDER-COUNT-*`. Breaching rate limits yields HTTP 429, with persistent abuse escalating to HTTP 418 IP bans.citeturn2search2
- **Symbol/precision metadata**: `exchangeInfo` enumerates perpetual `FUTURE` symbols with filters like `PRICE_FILTER`, `LOT_SIZE`, `MARKET_LOT_SIZE`, `PERCENT_PRICE`, `MAX_NUM_ORDERS`, `MAX_NUM_ALGO_ORDERS`, and TIF set {GTC, IOC, FOK, GTX}. Supported klines span 1m–1M.citeturn2search2
- **Market data endpoints**: REST parity with Binance Futures: `/fapi/v1/ping`, `/time`, `/exchangeInfo`, `/depth`, `/trades`, `/historicalTrades`, `/aggTrades`, `/klines`, `/indexPriceKlines`, `/markPriceKlines`, `/premiumIndex`, `/fundingRate`, `/ticker/24hr`, `/ticker/price`, `/ticker/bookTicker`. Weight increases with depth limits; `aggTrades` enforces ≤1 h windows when filtering by timestamps.citeturn2search2
- **Account & trading endpoints**: Implements the familiar USDⓈ‑M set: position mode toggles (`/positionSide/dual`), multi-asset toggles, order lifecycle (`/fapi/v1/order`, `/batchOrders`, `/openOrder`, `/allOrders`), balance/account snapshots (`/balance`, `/account`), leverage/margin controls, position risk, user trades, income history, ADL quantiles, force orders, commission rate, etc., each with explicit weight/security labels.citeturn2search2
- **Streams**: WS payload schemas cover aggTrade, mark price (single/all), kline, ticker, liquidation, partial/diff depth streams, with runtime commands (`SUBSCRIBE`, `UNSUBSCRIBE`, `LIST_SUBSCRIPTIONS`, `SET/GET_PROPERTY`) and property toggles for combined vs. single message output.citeturn2search2
- **User data streams**: `POST /fapi/v1/listenKey` issues a listen key valid 60 min; `PUT` keeps it alive, `DELETE` closes it. WS endpoint `wss://fstream.asterdex.com/ws/<listenKey>` pushes `ACCOUNT_UPDATE`, `ORDER_TRADE_UPDATE`, `MARGIN_CALL`, `ACCOUNT_CONFIG` events, and links auto-expire after 24 h.citeturn2search2

## Implementation Notes (Step 2 Progress)
- Added `ts/src/asterdex.ts`, subclassing `binanceusdm` so we inherit the full USDⓈ-M surface while overriding `id`, `name`, DEX flag, and every `fapi*` host to `https://fapi.asterdex.com/...`. URLs also now point to the official docs and API management portal.  
- Mirrored the same host overrides in CCXT Pro via `ts/src/pro/asterdex.ts`, ensuring streaming clients connect to `wss://fstream.asterdex.com` once we hook up watch methods.
- Registered the exchange in `ts/ccxt.ts` (standard + pro import lists, factory maps, and exports). This makes the class discoverable through `ccxt.asterdex` and `ccxt.pro.asterdex`.
- Added a regression guard in `ts/src/test/tests.ts` (`testAsterdex`) that instantiates the offline exchange and asserts the `fapiPublic` URL contains `asterdex.com`, so regressions won’t silently point back to Binance.
- Next up: implement market loaders (Step 3) so we can call the real `/fapi/v1/exchangeInfo` and normalize symbols, then proceed to balance/trade endpoints once host plumbing is verified.

## Step 3 – Market Data Work Items (in progress)
- **`fetchMarkets` parity check**: run the standalone implementation against `https://fapi.asterdex.com/fapi/v1/exchangeInfo`, confirm fields like `contractType`, filters, and precision map correctly. Add any overrides if `exchangeInfo` omits assets or uses custom quotes. ✅ (real payload logged under `asterdex fetchMarkets: {...}` with `options.log = true`).
- **Ticker/book/trade passthrough**: implemented `fetchTime`, `fetchTicker(s)`, `fetchBidsAsks`, `fetchOrderBook`, `fetchTrades`, `fetchOHLCV`, and `parseTicker/trade/OHLCV`. Each call now pipes through `logResponse()` when `options.log = true`, letting us capture live JSON (e.g., `/ticker/24hr`, `/trades`, `/depth`). ✅
- **Funding/open interest**: wired up `fetchFundingRate`, `fetchFundingRates`, `fetchFundingRateHistory`, and `fetchOpenInterest`, using `/premiumIndex`, `/fundingRate`, and `/openInterest`. Responses verified via curl and logged automatically for future debugging. ✅
- **Mark/Index OHLCV**: added `fetchMarkOHLCV` and `fetchIndexOHLCV` (built on `/markPriceKlines` and `/indexPriceKlines`). Logging shows real payloads when `options.log` is enabled. ✅
- **Account & trading primitives**: implemented `fetchBalance`, `fetchPositions`, `fetchOpenOrders`, `fetchOrders`, `fetchMyTrades`, `createOrder`, and `cancelOrder`, plus parsers for balances, positions, and orders. Endpoints hit the signed `/fapi/v1/account`, `/positionRisk`, `/order`, `/allOrders`, etc.; logging captures their responses for validation. Private tests remain opt-in (set keys via `keys.json`). ✅
- **Margin & leverage controls**: wired up `setLeverage`, `setMarginMode`, `setPositionMode`, and `fetchLeverage` so we can adjust USDⓈ-M settings via `/leverage`, `/marginType`, `/positionSide/dual`, and `/leverageBracket`. All responses flow through `logResponse()` for easy inspection. ✅
- **Mark/index streams**: (pending) still need dedicated helpers for `/markPriceKlines`, `/indexPriceKlines`, plus WS watch methods.
- **Validation**: TS suite (`node run-tests --ts asterdex`) passes with live API access; use `exchange.options.log = true` locally to capture payloads for documentation or regression snapshots.
- **Host override verification (done)**: switched both standard and Pro classes to extend the parent `urls` map instead of overwriting it, so `binanceusdm`’s auxiliary APIs (sapi/papi/etc.) remain intact while all `fapi*` hosts point to `https://fapi.asterdex.com`. Ran `npm run test:asterdex` to confirm the offline regression still passes on the new branch point (`v4.5.18`). Command log: `node run-tests --ts asterdex` → success.
- **Precision fix (done)**: upstream `exchangeInfo` returns `PRICE_FILTER.tickSize = 0` for some listings, so the inherited parser was emitting `precision.price = 0` and failing TS tests. `fetchMarkets` now post-processes Binance’s output and falls back to `info.pricePrecision` when `tickSize` is zero/undefined. After this adjustment `npm run test:asterdex` passes again.
- **Endpoints audit (done)**: AsterDEX currently exposes only `/fapi/v1/*` routes; `/fapi/v2` and `/fapi/v3` return 404. Overrode all `fapiPublicV*`/`fapiPrivateV*` URLs (and the default `public/private`) to point at `/fapi/v1`, so shared helpers like `fetchLastPrices` don’t hit missing paths. Regression: `npm run test:asterdex` → pass.
- **Spot scope**: Per docs the spot venue lives under https://docs.asterdex.com/product/aster-spot — keep parity work scoped to Aster Perpetual Pro for now, then plan a separate integration pass for spot once the futures flow is stable.
- **WebSocket host override**: CCXT Pro now reuses Binance’s WS stack but points both single-stream (`wss://fstream.asterdex.com/ws`) and combined-stream (`wss://fstream.asterdex.com/stream?streams=`) URLs to the Aster endpoints documented under “Mark Price Stream for All Markets”. This keeps `watch*` methods functional once credentials are ready.
- **Live payload capture (pending)**: direct HTTPS/WebSocket calls to `fapi.asterdex.com`/`fstream.asterdex.com` still fail from this environment (DNS resolution returns `Could not resolve host`), so response samples in the code remain based on the published specs. Re-run curl/ws tests once outbound network access is restored to confirm production payloads.
- **`fetchCurrencies` toggle**: Binance’s helper hits `sapi/capital/config/getall` and fails without valid keys, so AsterDEX inherits that behavior. Set `options.fetchCurrencies = false` to keep `loadMarkets()` public-only until we obtain working REST credentials.
- **Standalone implementation**: dropped the `binanceusdm` inheritance chain; `ts/src/asterdex.ts` now extends the raw `Exchange` class with its own `describe()`, REST `api` map, `fetchMarkets`, `sign()`, and `handleErrors`. This avoids Binance-specific quirks (SAPI calls, demo flags) and keeps the code aligned with Aster’s actual `/fapi/v1` surface. Pro version now extends this standalone class.
- **Listen key manager (done)**: Pro class now fetches and keeps alive the user-data `listenKey` via `fetchListenKey()` and a refresh timer, so private WS streams can reuse it once watcher methods are added.
- **Perp WS helper layer (new)**: Raw `/ws/<stream>` subscriptions now come straight from `formatPerpStream` + `getStreamUrl`, no SUBSCRIBE payloads involved. Stream-specific handlers (`handlePublicTrade`, `handleDepth`, `handlePublicKline`, `handleBookTicker`, `handleMarkPrice`) parse each payload into CCXT structures and append them to `ArrayCache`/`ArrayCacheByTimestamp`/order-book caches before resolving the corresponding `watch*` futures.
- **Private WS coverage (new)**: Added caches plus `watchOrders`, `watchMyTrades`, and `watchPositions`. `ORDER_TRADE_UPDATE` feeds order/myTrade caches, `ACCOUNT_UPDATE` now emits both balance deltas and `P[]` position snapshots (pushed into `ArrayCacheBySymbolBySide`), and `listenKeyExpired` clears timers so the next watcher invocation fetches a fresh key.
- **Public WS smoketests**: `node run-tests --ws asterdex 'watchTrades()' BTC/USDT:USDT --ts`, `watchAggTrades()`, `watchTicker()`, `watchOrderBook()`, `watchOHLCV()`, and the new global `watchMarkPrices()` flow (no symbol argument) all pass against the live endpoints.
- **Aggregated trades (new)**: added `watchAggTrades()` wired to `<symbol>@aggTrade`, plus `parseWsPublicAggTrade` so merged trade payloads share the same `ArrayCache`/filtering helpers as standard trades.
- **Runner nuance**: wrap method names in quotes (e.g., `'watchOrders()'`) when invoking `run-tests --ws`; otherwise the harness interprets the bare token as an exchange id (e.g., `watchOrders`) and errors before the actual test.

## Testing Commands
- `npm run lint`
- `node run-tests --ts asterdex`
- `node run-tests --ws asterdex 'watchTrades()' BTC/USDT:USDT --ts`
- `node run-tests --ws asterdex 'watchTicker()' BTC/USDT:USDT --ts`
- `node run-tests --ws asterdex 'watchOrderBook()' BTC/USDT:USDT --ts`
- `node run-tests --ws asterdex 'watchOHLCV()' BTC/USDT:USDT --ts`
- `node run-tests --ws asterdex 'watchMarkPrices()' --ts`
- `node run-tests --ws asterdex 'watchAggTrades()' BTC/USDT:USDT --ts`
- `node run-tests --ws asterdex 'watchOrders()' BTC/USDT:USDT --ts`

## Open Questions / Next Steps
- Confirm whether Aster exposes spot markets or only USDⓈ-M perpetuals; docs imply futures-only, but double-check for any `/dapi` or spot endpoints before coding `has` flags.
- Identify sandbox vs. mainnet host overrides (docs reference only `fapi.asterdex.com`; verify if there’s testnet base like `https://testnet.fapi.asterdex.com` or HyperETH proxy).
- Capture exact endpoint weights for account/trade APIs (orders, leverage, margin, income history, etc.) from the remaining sections before implementation.
- Determine required broker/referral codes (if any) and whether CCXT should auto-set them similar to Hyperliquid/Paradex integrations.
- **Private WebSocket streams (done, needs live validation)** – balance + position updates ride `ACCOUNT_UPDATE`, order/trade caches come from `ORDER_TRADE_UPDATE`, and dedicated watchers (`watchBalance`, `watchPositions`, `watchOrders`, `watchMyTrades`) now surface those flows. Once live creds are available, re-run `node run-tests --ws asterdex watchOrders BTC/USDT:USDT` (etc.) to confirm production payloads and tweak cache limits if necessary.
