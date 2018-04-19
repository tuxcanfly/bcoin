/*!
 * txindexer.js - tx indexer
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const path = require('path');
const bdb = require('bdb');
const TXMeta = require('../../primitives/txmeta');
const Indexer = require('../indexer');

class TXIndexer extends Indexer {
  /**
   * Create a indexer
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    super(options);

    if (options.prefix != null) {
      assert(typeof options.prefix === 'string');
      options.location = path.join(options.prefix, 'tx');
    }

    this.logger = this.options.logger.context('txindexer');

    // t[hash] -> extended tx
    this.layout['t'] = bdb.key('t', ['hash256']);

    this.db = bdb.create(options);
  }

  /**
   * Index transactions by txid.
   * @private
   * @param (ChainEntry) entry
   * @param (Block) block
   * @param (CoinView) view
   */

  async indexBlock(entry, block, view) {
    const b = this.db.batch();

    for (let i = 0; i < block.txs.length; i++) {
      const tx = block.txs[i];
      const hash = tx.hash();
      const meta = TXMeta.fromTX(tx, entry, i);
      b.put(this.layout.t.build(hash), meta.toRaw());
    }

    return b.write();
  }

  /**
   * Remove transactions from index.
   * @private
   * @param (ChainEntry) entry
   * @param (Block) block
   * @param (CoinView) view
   */

  async unindexBlock(entry, block, view) {
    const b = this.db.batch();

    for (let i = 0; i < block.txs.length; i++) {
      const tx = block.txs[i];
      const hash = tx.hash();
      b.del(this.layout.t.build(hash));
    }

    return b.write();
  }

  /**
   * Get a transaction with metadata.
   * @param {Hash} hash
   * @returns {Promise} - Returns {@link TXMeta}.
   */

  async getMeta(hash) {
    const data = await this.db.get(this.layout.t.build(hash));

    if (!data)
      return null;

    return TXMeta.fromRaw(data);
  }

  /**
   * Retrieve a transaction.
   * @param {Hash} hash
   * @returns {Promise} - Returns {@link TX}.
   */

  async getTX(hash) {
    const meta = await this.getMeta(hash);

    if (!meta)
      return null;

    return meta.tx;
  }

  /**
   * @param {Hash} hash
   * @returns {Promise} - Returns Boolean.
   */

  async hasTX(hash) {
    return this.db.has(this.layout.t.build(hash));
  }
}

TXIndexer.id = 'tx';

module.exports = TXIndexer;
