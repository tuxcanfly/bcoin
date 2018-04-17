/*!
 * addrindexer.js - addr indexer
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const path = require('path');
const bdb = require('bdb');
const Address = require('../../primitives/address');
const Indexer = require('../indexer');

class AddrIndexer extends Indexer {
  /**
   * Create a indexer
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    super(options);

    if (options.prefix != null) {
      assert(typeof options.prefix === 'string');
      options.location = path.join(options.prefix, 'addr');
    }

    this.db = bdb.create(options);
  }

  /**
   * Index transactions by address.
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
      for (const addr of tx.getHashes(view))
        b.put(this.layout.T.build(addr, hash), null);

      if (!tx.isCoinbase()) {
        for (const {prevout} of tx.inputs) {
          const {hash, index} = prevout;
          const coin = view.getOutput(prevout);
          assert(coin);

          const addr = coin.getHash();

          if (!addr)
            continue;

          b.del(this.layout.C.build(addr, hash, index));
        }
      }

      for (let i = 0; i < tx.outputs.length; i++) {
        const output = tx.outputs[i];
        const addr = output.getHash();

        if (!addr)
          continue;

        b.put(this.layout.C.build(addr, hash, i), null);
      }
    }

    return b.write();
  }

  /**
   * Remove addresses from index.
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
      for (const addr of tx.getHashes(view))
        b.del(this.layout.T.build(addr, hash));

      if (!tx.isCoinbase()) {
        for (const {prevout} of tx.inputs) {
          const {hash, index} = prevout;
          const coin = view.getOutput(prevout);
          assert(coin);

          const addr = coin.getHash();

          if (!addr)
            continue;

          b.put(this.layout.C.build(addr, hash, index), null);
        }
      }

      for (let i = 0; i < tx.outputs.length; i++) {
        const output = tx.outputs[i];
        const addr = output.getHash();

        if (!addr)
          continue;

        b.del(this.layout.C.build(addr, hash, i));
      }
    }

    return b.write();
  }

  /**
   * Get all coins pertinent to an address.
   * @param {Address[]} addrs
   * @returns {Promise} - Returns {@link Coin}[].
   */

  async getCoinsByAddress(addrs) {
    if (!Array.isArray(addrs))
      addrs = [addrs];

    const coins = [];

    for (const addr of addrs) {
      const hash = Address.getHash(addr);

      const keys = await this.db.keys({
        gte: this.layout.C.min(hash),
        lte: this.layout.C.max(hash),
        parse: (key) => {
          const [, txid, index] = this.layout.C.parse(key);
          return [txid, index];
        }
      });

      for (const [hash, index] of keys) {
        const coin = await this.client.getCoin(hash, index);
        assert(coin);
        coins.push(coin);
      }
    }

    return coins;
  }

  /**
   * Get all transaction hashes to an address.
   * @param {Address[]} addrs
   * @returns {Promise} - Returns {@link Hash}[].
   */

  async getHashesByAddress(addrs) {
    const hashes = Object.create(null);

    for (const addr of addrs) {
      const hash = Address.getHash(addr);

      await this.db.keys({
        gte: this.layout.T.min(hash),
        lte: this.layout.T.max(hash),
        parse: (key) => {
          const [, txid] = this.layout.T.parse(key);
          hashes[txid] = true;
        }
      });
    }

    return Object.keys(hashes);
  }
}

AddrIndexer.id = 'addr';

module.exports = AddrIndexer;
