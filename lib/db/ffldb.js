/*!
 * ffldb.js - flat file database for bcoin
 * Copyright (c) 2016-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const DUMMY = Buffer.alloc(0);
const Treap = require('../utils/treap');
const LevelDOWN = require('leveldown');

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

  this.db = LevelDOWN.call(this, location);

  this.location = location;
  this.options = {};

  // pending inserts and deletes
  this.add = new Treap(cmp, true);
  this.del = new Treap(cmp, true);
}

Object.setPrototypeOf(FlatFileDB.prototype, LevelDOWN.prototype);

/**
 * Commit pending inserts and deletes
 * @private
 */

FlatFileDB.prototype.commit = function commit() {
  // pending deletes and inserts cancel out
  const iterDel = this.del.iterator();
  while (iterDel.next())
    this.add.remove(iterDel.key);

  // commit pending inserts
  const iterAdd = this.add.iterator();
  while (iterAdd.next())
    LevelDOWN.prototype.put.call(this, iterAdd.key, iterAdd.value, () => {});
  iterAdd.reset();
};

/**
 * Do a key lookup.
 * @private
 * @param {Buffer|String} key
 * @returns {Buffer?} value
 */

FlatFileDB.prototype.search = function search(key) {
  if (typeof key === 'string')
    key = Buffer.from(key, 'utf8');

  assert(Buffer.isBuffer(key), 'Key must be a Buffer.');

  const node = this.add.search(key);

  if (!node)
    return undefined;

  return node.value;
};

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

  return this.add.insert(key, value) != null;
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

  return this.del.insert(key, DUMMY) != null;
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

  return this.add.range(min, max);
};

/**
 * Open the database (leveldown method).
 * @param {Object?} options
 * @param {Function} callback
 */

FlatFileDB.prototype.open = function open(callback) {
  LevelDOWN.prototype.open.call(this, callback);
};

/**
 * Close the database (leveldown method).
 * @param {Function} callback
 */

FlatFileDB.prototype.close = function close(callback) {
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

  let value = this.search(key);

  if (!value) {
    LevelDOWN.prototype.get.call(this, key, options, callback);
  }

  if (options.asBuffer === false)
    value = value.toString('utf8');

  setImmediate(() => callback(null, value));
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
  this.add.insert(key, value);

  setImmediate(callback);
};

/**
 * Remove a record (leveldown method).
 * @param {Buffer|String} key
 * @param {Object?} options
 * @param {Function} callback
 */

FlatFileDB.prototype.del = function del(key, options, callback) {
  if (!callback) {
    callback = options;
    options = null;
  }

  this.remove(key);
  this.del.insert(key);

  setImmediate(callback);
};

/*
 * Helpers
 */

function cmp(a, b) {
  return a.compare(b);
}

/*
 * Expose
 */

module.exports = FlatFileDB;
