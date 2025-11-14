//  ---------------------------------------------------------------------------

import binanceusdm from './binanceusdm.js';

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
            'urls': {
                'logo': 'https://www.asterdex.com/images/logo.svg',
                'www': 'https://www.asterdex.com',
                'doc': [
                    'https://docs.asterdex.com/product/asterex-pro/api/api-documentation',
                    'https://github.com/asterdex/api-docs',
                ],
                'api_management': 'https://www.asterdex.com/en/api-management',
                'api': {
                    'public': 'https://fapi.asterdex.com/fapi/v3',
                    'private': 'https://fapi.asterdex.com/fapi/v3',
                    'fapiPublic': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPublicV2': 'https://fapi.asterdex.com/fapi/v2',
                    'fapiPublicV3': 'https://fapi.asterdex.com/fapi/v3',
                    'fapiPrivate': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPrivateV2': 'https://fapi.asterdex.com/fapi/v2',
                    'fapiPrivateV3': 'https://fapi.asterdex.com/fapi/v3',
                    'fapiData': 'https://fapi.asterdex.com/futures/data',
                },
                'test': {
                    'fapiPublic': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPublicV2': 'https://fapi.asterdex.com/fapi/v2',
                    'fapiPublicV3': 'https://fapi.asterdex.com/fapi/v3',
                    'fapiPrivate': 'https://fapi.asterdex.com/fapi/v1',
                    'fapiPrivateV2': 'https://fapi.asterdex.com/fapi/v2',
                    'fapiPrivateV3': 'https://fapi.asterdex.com/fapi/v3',
                    'fapiData': 'https://fapi.asterdex.com/futures/data',
                },
            },
        });
    }
}
