/*!
 * filterindexer.js - filter indexer
 * Copyright (c) 2018, the bcoin developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');
const bdb = require('bdb');
const layout = require('./layout');
const Indexer = require('./indexer');
const common = require('../net/common');
const consensus = require('../protocol/consensus');
const GCSFilter = require('golomb');

/*
 * FilterIndexer Database Layout:
 *  g[hash] -> basic filter
 *  G[hash] -> basic filter header
*/

Object.assign(layout, {
  g: bdb.key('g', ['hash256']),
  G: bdb.key('G', ['hash256'])
});

/**
 * FilterIndexer
 * @alias module:indexer.FilterIndexer
 * @extends Indexer
 */

class FilterIndexer extends Indexer {
  /**
   * Create a indexer
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    super('filter', options);

    this.db = bdb.create(this.options);
  }

  /**
   * Store genesis previous filter header
   * @private
   * @returns {Promise}
   */

  async saveGenesis() {
    this.start();

    const prevHash = this.network.genesis.prevBlock;

    // Genesis prev filter headers are defined to be zero hashes
    this.put(layout.G.encode(prevHash), consensus.ZERO_HASH);

    await this.commit();
    await super.saveGenesis();
  }

  /**
   * Index transactions by filterid.
   * @private
   * @param {ChainEntry} entry
   * @param {Block} block
   * @param {CoinView} view
   */

  async indexBlock(entry, block, view) {
    const hash = block.hash();
    const prevHeader = await this.getCFHeader(block.prevBlock);
    const basic = GCSFilter.fromBlock(block, view);

    this.put(layout.g.encode(hash), basic.toRaw());
    this.put(layout.G.encode(hash), basic.header(prevHeader));
  }

  /**
   * Remove transactions from index.
   * @private
   * @param {ChainEntry} entry
   * @param {Block} block
   * @param {CoinView} view
   */

  async unindexBlock(entry, block, view) {
    const hash = block.hash();
    this.del(layout.g(hash));
    this.del(layout.G(hash));
  }

  /**
   * Retrieve compact filter by hash and type..
   * @param {Hash} hash
   * @param {Number} type
   * @returns {Promise} - Returns {@link Buffer}.
   */

  async getCFilter(hash, type) {
    type = type || common.FILTERS.REGULAR;

    assert(hash);
    assert(typeof type === 'number');
    assert(type === common.FILTERS.REGULAR, 'Bad filter type.');

    const cfilter = await this.db.get(layout.g.encode(hash));
    assert(cfilter, `Missing cfilter ${hash.toString('hex')} ${type}.`);

    return cfilter;
  }

  /**
   * Retrieve compact filter header by hash and type..
   * @param {Hash} hash
   * @param {Number} type
   * @returns {Promise} - Returns {@link Hash}.
   */

  async getCFHeader(hash, type) {
    type = type || common.FILTERS.REGULAR;

    assert(hash);
    assert(typeof type === 'number');
    assert(type === common.FILTERS.REGULAR, 'Bad filter type.');

    const cfheader = await this.db.get(layout.G.encode(hash));
    assert(cfheader, `Missing cfheader ${hash.toString('hex')} ${type}.`);

    return cfheader;
  }
}

module.exports = FilterIndexer;
