/*!
 * blockstore/records.js - blockstore records
 * Copyright (c) 2019, Braydon Fuller (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('bsert');
const bio = require('bufio');
const consensus = require('../protocol/consensus');

/**
 * @module blockstore/records
 */

/**
 * Block Record
 */

class BlockRecord {
  /**
   * Create a block record.
   * @constructor
   */

  constructor(options = {}) {
    this.file = options.file || 0;
    this.position = options.position || 0;
    this.length = options.length || 0;

    assert((this.file >>> 0) === this.file);
    assert((this.position >>> 0) === this.position);
    assert((this.length >>> 0) === this.length);
  }

  /**
   * Inject properties from serialized data.
   * @private
   * @param {Buffer} data
   */

  fromRaw(data) {
    const br = bio.read(data);

    this.file = br.readU32();
    this.position = br.readU32();
    this.length = br.readU32();

    return this;
  }

  /**
   * Instantiate block record from serialized data.
   * @param {Hash} hash
   * @param {Buffer} data
   * @returns {BlockRecord}
   */

  static fromRaw(data) {
    return new this().fromRaw(data);
  }

  /**
   * Serialize the block record.
   * @returns {Buffer}
   */

  toRaw() {
    const bw = bio.write(12);

    bw.writeU32(this.file);
    bw.writeU32(this.position);
    bw.writeU32(this.length);

    return bw.render();
  }
}

/**
 * Transaction Record
 */

class TxRecord {
  /**
   * Create a block record.
   * @constructor
   */

  constructor(options = {}) {
    this.block = options.block || consensus.ZERO_HASH;
    this.height = options.height || 0;
    this.time = options.time || 0;
    this.index = options.index || 0;
    this.offset = options.offset || 0;
    this.length = options.length || 0;

    assert((this.height >>> 0) === this.height);
    assert((this.time >>> 0) === this.time);
    assert((this.index >>> 0) === this.index);
    assert((this.offset >>> 0) === this.offset);
    assert((this.length >>> 0) === this.length);
  }

  /**
   * Inject properties from serialized data.
   * @private
   * @param {Buffer} data
   */

  fromRaw(data) {
    const br = bio.read(data);

    this.block = br.readHash();
    this.height = br.readU32();
    this.time = br.readU32();
    this.index = br.readU32();
    if (this.index === 0x7fffffff)
      this.index = -1;

    this.offset = br.readU32();
    this.length = br.readU32();

    return this;
  }

  /**
   * Instantiate block record from serialized data.
   * @param {Hash} hash
   * @param {Buffer} data
   * @returns {BlockRecord}
   */

  static fromRaw(data) {
    return new this().fromRaw(data);
  }

  /**
   * Serialize the block record.
   * @returns {Buffer}
   */

  toRaw() {
    const bw = bio.write(52);

    bw.writeHash(this.block);
    bw.writeU32(this.height);
    bw.writeU32(this.time);
    bw.writeU32(this.index);
    bw.writeU32(this.offset);
    bw.writeU32(this.length);

    return bw.render();
  }
}

/**
 * File Record
 */

class FileRecord {
  /**
   * Create a file record.
   * @constructor
   */

  constructor(options = {}) {
    this.blocks = options.blocks || 0;
    this.used = options.used || 0;
    this.length = options.length || 0;

    assert((this.blocks >>> 0) === this.blocks);
    assert((this.used >>> 0) === this.used);
    assert((this.length >>> 0) === this.length);
  }

  /**
   * Inject properties from serialized data.
   * @private
   * @param {Buffer} data
   */

  fromRaw(data) {
    const br = bio.read(data);

    this.blocks = br.readU32();
    this.used = br.readU32();
    this.length = br.readU32();

    return this;
  }

  /**
   * Instantiate file record from serialized data.
   * @param {Hash} hash
   * @param {Buffer} data
   * @returns {ChainState}
   */

  static fromRaw(data) {
    return new this().fromRaw(data);
  }

  /**
   * Serialize the file record.
   * @returns {Buffer}
   */

  toRaw() {
    const bw = bio.write(12);

    bw.writeU32(this.blocks);
    bw.writeU32(this.used);
    bw.writeU32(this.length);

    return bw.render();
  }
}

/*
 * Expose
 */

exports.BlockRecord = BlockRecord;
exports.TxRecord = TxRecord;
exports.FileRecord = FileRecord;

module.exports = exports;
