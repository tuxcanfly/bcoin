/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const GCSFilter = require('golomb');
const bcoin = require('../../bcoin');

describe('Compact Filters', function() {
  it('should build basic filter for testnet3 genesis block}', () => {
    const genesis = bcoin.block.fromRaw(
      bcoin.networks.testnet.genesisBlock, 'hex');
    const basic = GCSFilter.fromBlock(genesis);
    const expected = Buffer.from('84134c0da400', 'hex');
    assert.bufferEqual(basic.data, expected);
  });
});
