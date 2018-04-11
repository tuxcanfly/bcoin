/*!
 * tx.js - tx indexer
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

class TXIndexer {
  /**
   * Create a indexer
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
  }

  /**
   * Index a transaction by txid.
   * @private
   * @param (ChainEntry) entry
   * @param (Block) block
   * @param (CoinView) view
   */

  async indexTX(entry, block, view) {
    if (!this.options.indexTX)
      return null;

    const b = this.db.batch();

    for (let i = 0; i < block.txs.length; i++) {
      const tx = block.txs[i];
      const hash = tx.hash();
      const meta = TXMeta.fromTX(tx, entry, i);
      b.put(layout.t.build(hash), meta.toRaw());
    }

    return b.write();
  }

  /**
   * Remove transaction from index.
   * @private
   * @param (ChainEntry) entry
   * @param (Block) block
   * @param (CoinView) view
   */

  async unindexTX(entry, block, view) {
    if (!this.options.indexTX)
      return null;

    const b = this.db.batch();

    for (let i = 0; i < block.txs.length; i++) {
      const tx = block.txs[i];
      const hash = tx.hash();
      b.del(layout.t.build(hash));
    }

    return b.write();
  }
}

module.exports = TXIndexer;
