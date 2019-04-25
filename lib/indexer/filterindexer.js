/*!
 * filterindexer.js - filter indexer
 * Copyright (c) 2018, the bcoin developers (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const bdb = require('bdb');
const assert = require('bsert');
const Indexer = require('./indexer');
const common = require('../net/common');
const consensus = require('../protocol/consensus');
const GCSFilter = require('golomb');

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
   * Store genesis previous filter header.
   * @private
   * @returns {Promise}
   */

  async saveGenesis() {
    const prevHash = this.network.genesis.prevBlock;

    // Genesis prev filter headers are defined to be zero hashes
    await this.blocks.writeHeader(prevHash, consensus.ZERO_HASH);

    await super.saveGenesis();
  }

  /**
   * Index compact filters.
   * @private
   * @param {BlockMeta} meta
   * @param {Block} block
   * @param {CoinView} view
   */

  async indexBlock(meta, block, view) {
    const hash = block.hash();
    const prevHeader = await this.getCFHeader(block.prevBlock);
    const basic = GCSFilter.fromBlock(block, view);

    await this.blocks.writeFilter(hash, basic.toRaw());
    await this.blocks.writeHeader(hash, basic.header(prevHeader));
  }

  /**
   * Unindex compact filters.
   * @private
   * @param {BlockMeta} meta
   * @param {Block} block
   * @param {CoinView} view
   */

  async unindexBlock(meta, block, view) {
    const hash = block.hash();
    await this.blocks.pruneFilter(hash);
    await this.blocks.pruneHeader(hash);
  }

  /**
   * Retrieve compact filter by hash and type.
   * @param {Hash} hash
   * @param {Number} type
   * @returns {Promise} - Returns {@link Buffer}.
   */

  async getCFilter(hash, type) {
    type = type || common.FILTERS.REGULAR;

    assert(hash);
    assert(typeof type === 'number');
    assert(type === common.FILTERS.REGULAR, 'Bad filter type.');

    const cfilter = await this.blocks.readFilter(hash);
    assert(cfilter, `Missing cfilter ${hash.toString('hex')} ${type}.`);

    return cfilter;
  }

  /**
   * Retrieve compact filter header by hash and type.
   * @param {Hash} hash
   * @param {Number} type
   * @returns {Promise} - Returns {@link Hash}.
   */

  async getCFHeader(hash, type) {
    type = type || common.FILTERS.REGULAR;

    assert(hash);
    assert(typeof type === 'number');
    assert(type === common.FILTERS.REGULAR, 'Bad filter type.');

    const cfheader = await this.blocks.readHeader(hash);
    assert(cfheader, `Missing cfheader ${hash.toString('hex')} ${type}.`);

    return cfheader;
  }
}

module.exports = FilterIndexer;
