//  ---------------------------------------------------------------------------

import binanceusdm from './binanceusdm.js';
import type { Market } from './base/types.js';

//  ---------------------------------------------------------------------------

export default class asterdex extends binanceusdm {
    describe (): any {
        const parent = super.describe ();
        return this.deepExtend (parent, {
            'id': 'asterdex',
            'name': 'AsterDEX',
            'countries': [],
            'certified': false,
            'pro': true,
            'dex': true,
            'has': this.deepExtend (parent['has'], {
                'spot': false,
                'margin': false,
                'swap': true,
                'future': true,
            }),
            'urls': this.deepExtend (parent['urls'], {
                'logo': 'https://www.asterdex.com/images/logo.svg',
                'www': 'https://www.asterdex.com',
                'doc': [
                    'https://docs.asterdex.com/product/asterex-pro/api/api-documentation',
                    'https://github.com/asterdex/api-docs',
                ],
                'api_management': 'https://www.asterdex.com/en/api-management',
                'api': this.deepExtend (parent['urls']['api'], {
                    'public': 'https://fapi.asterdex.com/fapi/v1',
                    'private': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPublic': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPublicV2': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPublicV3': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPrivate': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPrivateV2': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPrivateV3': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiData': 'https://fapi.asterdex.com/fapi/v1',
                }),
                'test': this.deepExtend (parent['urls']['test'], {
                    'fapiPublic': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPublicV2': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPublicV3': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPrivate': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPrivateV2': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPrivateV3': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiData': 'https://fapi.asterdex.com/fapi/v1',
                }),
            }),
        });
    }

    async fetchMarkets (params = {}) {
        const markets: Market[] = await super.fetchMarkets (params);
        for (let i = 0; i < markets.length; i++) {
            const market = markets[i];
            const precision = market['precision'];
            if (precision !== undefined) {
                const pricePrecision = this.safeString (market['info'], 'pricePrecision');
                if ((precision['price'] === undefined || precision['price'] === 0) && (pricePrecision !== undefined)) {
                    const precisionString = this.parsePrecision (pricePrecision);
                    precision['price'] = this.parseNumber (precisionString);
                }
            }
        }
        return markets;
    }
}
