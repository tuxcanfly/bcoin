/*!
 * ffldb.js - flat file database for bcoin
 * Copyright (c) 2016-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const path = require('path');
const LevelDOWN = require('leveldown');
const BlockIO = require('../utils/blockio');
const FileLocation = require('../utils/fileloc');
const co = require('../utils/co');

const DUMMY = Buffer.alloc(0);

/**
 * Flat file database for bcoin
 * using a treap backend.
 * @alias module:db.FlatFileDB
 * @constructor
 * @param {String?} location - database location.
 * @param {Object?} options
 * @param {Function} options.compare - Comparator.
 */

function FlatFileDB(location) {
  if (!(this instanceof FlatFileDB))
    return new FlatFileDB(location);

  LevelDOWN.call(this, location);

  this.location = location;

  this.blockio = new BlockIO({
    location: path.join(location, '..', 'blocks'),
    maxFileSize: 512 * 1024 * 1024, // 512 MiB
    network: 'simnet' // FIXME: use config
  });
}

Object.setPrototypeOf(FlatFileDB.prototype, LevelDOWN.prototype);

/**
 * Insert a record.
 * @private
 * @param {Buffer|String} key
 * @param {Buffer} value
 */

FlatFileDB.prototype.insert = function insert(key, value) {
  if (typeof key === 'string')
    key = Buffer.from(key, 'utf8');

  if (typeof value === 'string')
    value = Buffer.from(value, 'utf8');

  if (value == null)
    value = DUMMY;

  assert(Buffer.isBuffer(key), 'Key must be a Buffer.');
  assert(Buffer.isBuffer(value), 'Value must be a Buffer.');

  LevelDOWN.prototype.put.call(this, key, value, () => {});
};

/**
 * Remove a record.
 * @private
 * @param {Buffer|String} key
 * @returns {Boolean}
 */

FlatFileDB.prototype.remove = function remove(key) {
  if (typeof key === 'string')
    key = Buffer.from(key, 'utf8');

  assert(Buffer.isBuffer(key), 'Key must be a Buffer.');

  LevelDOWN.prototype.index.call(this, key, () => {});
};

/**
 * Traverse between a range of keys and collect records.
 * @private
 * @param {Buffer} min
 * @param {Buffer} max
 * @returns {TreapData[]} Records.
 */

FlatFileDB.prototype.range = function range(min, max) {
  if (typeof min === 'string')
    min = Buffer.from(min, 'utf8');

  if (typeof max === 'string')
    max = Buffer.from(max, 'utf8');

  assert(!min || Buffer.isBuffer(min), 'Key must be a Buffer.');
  assert(!max || Buffer.isBuffer(max), 'Key must be a Buffer.');

  return LevelDOWN.prototype.range.call(this, min, max);
};

/**
 * Open the database (leveldown method).
 * @param {Object?} options
 * @param {Function} callback
 */

FlatFileDB.prototype.open = function open(options, callback) {
  if (!callback) {
    callback = options;
    options = null;
  }

  if (!options)
    options = {};

  this.options = options;

  this.blockio.ensure();
  this.blockio.open();
  LevelDOWN.prototype.open.call(this, options, callback);
};

/**
 * Close the database (leveldown method).
 * @param {Function} callback
 */

FlatFileDB.prototype.close = function close(callback) {
  this.blockio.close();
  LevelDOWN.prototype.close.call(this, callback);
};

/**
 * Retrieve a record (leveldown method).
 * @param {Buffer|String} key
 * @param {Object?} options
 * @param {Function} callback - Returns Buffer.
 */

FlatFileDB.prototype.get = function get(key, options, callback) {
  if (!callback) {
    callback = options;
    options = null;
  }

  if (!options)
    options = {};

  LevelDOWN.prototype.get.call(this, key, options, (err, value) => {
    setImmediate(() => callback(err, value));
  });
};

/**
 * Insert a record (leveldown method).
 * @param {Buffer|String} key
 * @param {Buffer} value
 * @param {Object?} options
 * @param {Function} callback
 */

FlatFileDB.prototype.put = function put(key, value, options, callback) {
  if (!callback) {
    callback = options;
    options = null;
  }

  this.insert(key, value);
  this.cacheSize += key.length + value.length;

  setImmediate(callback);
};

FlatFileDB.prototype.getBlock = async function getBlock(key) {
  const entry = await co.promisify(this.get).call(this, key);
  const loc = FileLocation.fromRaw(entry);
  const block = await this.blockio.readBlock(loc);
  return block;
};

FlatFileDB.prototype.putBlock = function putBlock(key, value) {
  (async () => {
  try {
    const loc = await this.blockio.writeBlock(value);
    const entry = loc.toRaw();
    co.promisify(this.put).call(this, key.toString('hex'), entry);
    this.cacheSize += key.length + value.length;
  } catch (e) {
    throw e;
  }
  })();
};

FlatFileDB.prototype.removeBlock = function removeBlock(key) {
  // delete from file
};

/*
 * Expose
 */

module.exports = FlatFileDB;
