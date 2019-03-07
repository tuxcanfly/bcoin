/*!
 * blockstore/level.js - leveldb block store for bcoin
 * Copyright (c) 2019, Braydon Fuller (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const bdb = require('bdb');
const AbstractBlockStore = require('./abstract');
const layout = require('./layout');

/**
 * LevelDB In Memory Block Store
 *
 * @alias module:blockstore:MemBlockStore
 * @abstract
 */

class MemBlockStore extends AbstractBlockStore {
  /**
   * Create a blockstore that stores blocks in MemDB.
   * @constructor
   */

  constructor(options) {
    super();

    this.db = bdb.create({
      memory: true
    });
  }

  /**
   * Ensure blocks directory.
   * @returns {Promise}
   */

  async ensure() {
      return undefined;
  }

  /**
   * Opens the block storage.
   * @returns {Promise}
   */

  async open() {
    this.logger.info('Opening MemBlockStore...');

    await this.db.open();
    await this.db.verify(layout.V.encode(), 'levelblockstore', 0);
  }

  /**
   * Closes the block storage.
   */

  async close() {
    this.logger.info('Closing MemBlockStore...');

    await this.db.close();
  }

  /**
   * This method stores block data in MemDB.
   * @param {Buffer} hash - The block hash
   * @param {Buffer} data - The block data
   * @returns {Promise}
   */

  async write(hash, data) {
    this.db.put(layout.b.encode(hash), data);
  }

  /**
   * This method will retrieve block data. Smaller portions of the
   * block (e.g. transactions) can be returned using the offset and
   * length arguments. However, the entire block will be read as the
   * data is stored in a key/value database.
   * @param {Buffer} hash - The block hash
   * @param {Number} offset - The offset within the block
   * @param {Number} length - The number of bytes of the data
   * @returns {Promise}
   */

  async read(hash, offset, length) {
    let raw = await this.db.get(layout.b.encode(hash));

    if (offset) {
      if (offset + length > raw.length)
        throw new Error('Out-of-bounds read.');

      raw = raw.slice(offset, offset + length);
    }

    return raw;
  }

  /**
   * This will free resources for storing the block data. The block
   * data may not be immediately removed from disk, and will be reclaimed
   * during MemDB compaction.
   * @param {Buffer} hash - The block hash
   * @returns {Promise}
   */

  async prune(hash) {
    if (!await this.has(hash))
      return false;

    await this.db.del(layout.b.encode(hash));

    return true;
  }

  /**
   * This will check if a block has been stored and is available.
   * @param {Buffer} hash - The block hash
   * @returns {Promise}
   */

  async has(hash) {
    return this.db.has(layout.b.encode(hash));
  }
}

/*
 * Expose
 */

module.exports = MemBlockStore;
