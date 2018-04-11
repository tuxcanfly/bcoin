/*!
 * txindexer.js - tx indexer
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const TXMeta = require('../primitives/txmeta');

class TXIndexer {
  /**
   * Create a indexer
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    this.db = options.db;
    this.layout = options.layout;
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

  async undoBlock(entry, block, view) {
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
}

TXIndexer.id = 'tx';

module.exports = TXIndexer;
