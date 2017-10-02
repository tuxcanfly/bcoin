/*!
 * blockio.js - blockio object for bcoin
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const path = require('path');
const util = require('../utils/util');
const fs = require('../utils/fs');
const Network = require('../protocol/network');
const FileBlock = require('./fileblock');

/**
 * BlockIO
 * @alias module:utils.BlockIO
 * @constructor
 * @param {Function?} options
 */

function BlockIO(options) {
  if (!(this instanceof BlockIO))
    return new BlockIO(options);

  this.files = {};
  this.cursor = null;
  if (options)
    this.fromOptions(options);
}

/**
 * Inject properties from object.
 * @private
 * @param {Object} options
 * @returns {BlockIOOptions}
 */

BlockIO.prototype.fromOptions = function fromOptions(options) {
  if (options.network != null)
    this.network = Network.get(options.network);

  if (options.logger != null) {
    assert(typeof options.logger === 'object');
    this.logger = options.logger;
  }

  if (options.prefix != null) {
    assert(typeof options.prefix === 'string');
    this.prefix = options.prefix;
    this.location = this.spv
      ? path.join(this.prefix, 'spvchain')
      : path.join(this.prefix, 'chain');
  }

  if (options.location != null) {
    assert(typeof options.location === 'string');
    this.location = options.location;
  }

  if (options.maxFiles != null) {
    assert(util.isU32(options.maxFiles));
    this.maxFiles = options.maxFiles;
  }

  if (options.maxFileSize != null) {
    assert(util.isU64(options.maxFileSize));
    this.cacheSize = options.maxFileSize;
  }

  return this;
};

BlockIO.prototype.openWriteFile = async function openWriteFile(file) {
  const filepath = path.join(this.location, file);
  const fd = await fs.open(filepath, 'w');
  return fd;
};

BlockIO.prototype.openReadFile = async function openReadFile(file) {
  const filepath = path.join(this.location, file);
  const fd = await fs.open(filepath, 'r');
  this.files[file] = fd;
  return fd;
};

BlockIO.prototype.deleteFile = async function deleteFile(file) {
  const filepath = path.join(this.location, file);
  await fs.unlink(filepath);
};

BlockIO.prototype.blockFile = function blockFile(file) {
  if (file in this.files[file]) {
    return this.files[file];
  }
  return this.openReadFile(file);
};

BlockIO.prototype.writeData = async function writeData(raw) {
  let len = 0;
  try {
    len = await
      fs.write(this.cursor.fd, raw, 0, raw.length, this.cursor.offset);
  } catch(e) {
    throw e;
  }
  this.cursor.offset += len;
};

BlockIO.prototype.writeBlock = async function writeBlock(block) {
  // 4 bytes for network, 4 bytes for block length, 4 bytes for checksum
  const size = block.length + 12;
  if (this.cursor.offset + size > this.maxFileSize) {
    await fs.close(this.cursor.fd);
    await this.cursor.rollover();
  }

  const fileBlock = new FileBlock(block, this.network);
  const raw = fileBlock.toRaw();
  this.writeData(raw);
};

BlockIO.prototype.readBlock = async function readBlock(loc) {
  const fd = this.blockFile(loc.file);
  const block = Buffer.alloc(loc.len);
  const len = await fs.read(fd, block, 0, loc.len, loc.offset);
  return block.slice(8, len-4);
};

BlockIO.prototype.sync = async function sync() {
  await fs.fsync(this.cursor.fd);
};

/*
 * Expose
 */

module.exports = BlockIO;
