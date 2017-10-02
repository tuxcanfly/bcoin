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
const FileCursor = require('./filecursor');
const FileLocation = require('../utils/fileloc');

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

  if (options)
    this.fromOptions(options);

  this.cursor = new FileCursor(this.location);
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

  if (options.location != null) {
    assert(typeof options.location === 'string');
    this.location = options.location;
  }

  if (options.maxFileSize != null) {
    assert(util.isU64(options.maxFileSize));
    this.maxFileSize = options.maxFileSize;
  }

  return this;
};

BlockIO.prototype.open = function open() {
  this.cursor.open();
};

BlockIO.prototype.ensure = function ensure() {
  if (!fs.existsSync(this.location)) {
    fs.mkdirSync(this.location);
  }
};

BlockIO.prototype.openWriteFile = async function openWriteFile(file) {
  const filepath = path.join(this.location, file);
  let fd = null;
  try {
    fd = await fs.open(filepath, 'w');
  } catch(e) {
    throw e;
  }
  return fd;
};

BlockIO.prototype.openReadFile = async function openReadFile(file) {
  const filepath = path.join(this.location, file);
  let  fd = null;
  try {
    fd = await fs.open(filepath, 'r');
  } catch(e) {
    throw e;
  }
  this.files[file] = fd;
  return fd;
};

BlockIO.prototype.deleteFile = async function deleteFile(file) {
  const filepath = path.join(this.location, file);
  try {
    await fs.unlink(filepath);
  } catch (e) {
    throw e;
  }
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
  return len;
};

BlockIO.prototype.writeBlock = async function writeBlock(block) {
  // 4 bytes for network, 4 bytes for block length, 4 bytes for checksum
  const size = block.length + 12;
  if (this.cursor.offset + size > this.maxFileSize) {
    await this.cursor.rollover();
  }

  const pos = this.cursor.offset;
  const fileBlock = new FileBlock(block, this.network);
  const raw = fileBlock.toRaw();
  const len = await this.writeData(raw);
  const loc = new FileLocation(this.cursor.file, pos, len);
  return loc;
};

BlockIO.prototype.readBlock = async function readBlock(loc) {
  const fd = this.blockFile(loc.file);
  const block = Buffer.alloc(loc.len);
  let len = 0;
  try {
    len = await fs.read(fd, block, 0, loc.len, loc.offset);
  } catch(e) {
    throw e;
  }
  return block.slice(8, len-4);
};

BlockIO.prototype.sync = async function sync() {
  try {
    await fs.fsync(this.cursor.fd);
  } catch (e) {
    throw e;
  }
};

/*
 * Expose
 */

module.exports = BlockIO;
