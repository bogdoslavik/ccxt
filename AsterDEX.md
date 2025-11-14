# AsterDEX Integration Notes

## Implementation Plan
1. **Research & Environment Prep** – capture REST/WebSocket specs, auth, rate limits, and available endpoints; ensure sandbox keys and hosts are documented.
2. **TypeScript Exchange Skeleton** – implement `describe()`, API routing, precision/fees/options, and shared helpers in `ts/src/asterdex.ts`.
3. **Market Data Layer** – wire `fetchMarkets`, tickers, books, trades, klines, mark/index/funding data, and WebSocket stream descriptors.
4. **Account & Trading** – add balance/margin/account info plus order lifecycle (create/cancel/query), leverage/margin toggles, and funding history.
5. **Auth, Errors, Helpers** – finalize signing (HMAC SHA256, timestamps, recvWindow), credential requirements, sandbox routing, and exception maps.
6. **Tests & Multi-language Sync** – add TS/JS offline tests, run targeted `run-tests` suites, and execute `npm run build` to propagate generated code & docs.

## Research Summary (Step 1)
- **Base endpoints**: REST requests hit `https://fapi.asterdex.com`, while public and user data WebSockets use `wss://fstream.asterdex.com` with `/ws/<stream>` (raw) or `/stream?streams=...` combined access. Connections auto-expire after 24h, ping every 5 min, and allow ≤200 subscribed streams/≤10 incoming msgs per second.citeturn1view0turn7view0turn8view0
- **Security model**: API key via `X-MBX-APIKEY` header; `TRADE` and `USER_DATA` endpoints are `SIGNED` using HMAC-SHA256 over query/body params plus mandatory `timestamp` (ms) and optional `recvWindow` (default 5000 ms). Signature must be appended last; docs include cURL examples for `/fapi/v1/order`.citeturn5view0
- **Rate limits**: `/fapi/v1/exchangeInfo` exposes REQUEST_WEIGHT (2400 weight/min) and ORDERS (1200/min). Responses include `X-MBX-USED-WEIGHT-*` headers, and repeated 429s escalate to auto IP bans (HTTP 418). Each order response also carries `X-MBX-ORDER-COUNT-*`.citeturn5view0turn6view0
- **Symbol/precision metadata**: Exchange info response lists assets, filters (`PRICE_FILTER`, `LOT_SIZE`, `MARKET_LOT_SIZE`, `MIN_NOTIONAL`, `MAX_NUM_ORDERS`, etc.), contract types (perpetual futures), order types (limit/market/stop variants), and time in force options (GTC/IOC/FOK/GTX). Tick intervals cover 1m–1M.citeturn5view0turn6view0
- **Market data endpoints**: Key REST routes mirror Binance Futures: `/fapi/v1/ping`, `/time`, `/exchangeInfo`, `/depth`, `/trades`, `/historicalTrades`, `/aggTrades`, `/klines`, `/indexPriceKlines`, `/markPriceKlines`, `/premiumIndex`, `/fundingRate`, `/ticker/24hr`, `/ticker/price`, `/ticker/bookTicker`. Weight rules depend on limit, and aggregated results enforce ≤1 h windows when filtering by time.citeturn6view0turn7view0
- **Streams**: Provided payload schemas for aggTrade, mark price, klines, plus subscription management commands (`SUBSCRIBE`, `UNSUBSCRIBE`, `LIST_SUBSCRIPTIONS`, `SET/GET_PROPERTY`) and related error codes, mirroring Binance’s futures WS API.citeturn8view0
- **User data streams**: Listen keys live at `/fapi/v1/listenKey` (POST/PUT/DELETE style) and map to WebSocket paths `/ws/<listenKey>`; validity is 60 min, extendable via keep-alive. (Need to extract endpoint specifics before implementation when we wire user stream helpers.)citeturn1view0

## Open Questions / Next Steps
- Confirm whether Aster exposes spot markets or only USDⓈ-M perpetuals; docs imply futures-only, but double-check for any `/dapi` or spot endpoints before coding `has` flags.
- Identify sandbox vs. mainnet host overrides (docs reference only `fapi.asterdex.com`; verify if there’s testnet base like `https://testnet.fapi.asterdex.com` or HyperETH proxy).
- Capture exact endpoint weights for account/trade APIs (orders, leverage, margin, income history, etc.) from the remaining sections before implementation.
- Determine required broker/referral codes (if any) and whether CCXT should auto-set them similar to Hyperliquid/Paradex integrations.
