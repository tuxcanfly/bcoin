/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const GCSFilter = require('golomb');
const bcoin = require('../../bcoin');

describe('Compact Filters', function() {
  it('should build regular filter', () => {
    const genesis = bcoin.Block.fromRaw(
      bcoin.networks.testnet.genesisBlock, 'hex');
    const basic = GCSFilter.fromBlock(genesis);
    const expected = Buffer.from('84134c0da400', 'hex');
    const hash = genesis.hash();
    const key = hash.slice(0, 16);
    basic.match(key, genesis.txs[0].hash());
    assert.bufferEqual(basic.data, expected);
  });

  it('should match tx against filter}', () => {
    const genesis = bcoin.Block.fromRaw(
      bcoin.networks.testnet.genesisBlock, 'hex');
    const basic = GCSFilter.fromBlock(genesis);
    const hash = genesis.hash();
    const key = hash.slice(0, 16);
    assert.ok(basic.match(key, genesis.txs[0].hash()));
  });
});
