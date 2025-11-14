//  ---------------------------------------------------------------------------

import asterdexRest from '../asterdex.js';

//  ---------------------------------------------------------------------------

export default class asterdex extends asterdexRest {
    describe (): any {
        const parent = super.describe ();
        return this.deepExtend (parent, {
            'urls': this.deepExtend (parent['urls'], {
                'api': this.deepExtend (parent['urls']['api'], {
                    'ws': this.deepExtend (parent['urls']['api']['ws'], {
                        // https://docs.asterdex.com/product/aster-perpetual-pro/api/api-documentation#mark-price-stream-for-all-markets
                        'future': 'wss://fstream.asterdex.com/ws',
                        'combined': 'wss://fstream.asterdex.com/stream?streams=',
                    }),
                }),
            }),
        });
    }
}
