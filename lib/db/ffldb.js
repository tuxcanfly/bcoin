/*!
 * ffldb.js - flat file database for bcoin
 * Copyright (c) 2016-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('../utils/fs');
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
  // TODO: make use of these options
  // sync memory data with leveldb index and files
  // if size exceeds 100mb or every 300s
  this.options = {
    'maxsize': 100 * 1024 * 1024,
    'flush': 300
  };
  this.lastFlush = Date.now();
  // TODO: add rolling files based on size
  this.file = path.join(location, 'blocks', '000000000.fdb');
  // TODO: get current cursor from leveldb
  this.pos = 0;

  // pending inserts and deletes
  this.add = new Treap(cmp, true);
  this.del = new Treap(cmp, true);
  this.blocks = [];
  this.hashes = {};
}

Object.setPrototypeOf(FlatFileDB.prototype, LevelDOWN.prototype);

FlatFileDB.prototype.sync = async function sync() {
  const fd = await fs.open(this.file, 'w');
  for (const block of this.blocks) {
    const len = fs.writeSync(fd, block, 0, block.length, this.pos);
    this.pos += len;
  }
  await fs.close(this.file);
};

FlatFileDB.prototype.commit = function commit() {
  const idel = this.del.iterator();
  while (idel.next())
    LevelDOWN.prototype.remove.call(this, idel.key, () => {
      // pending deletes and inserts cancel out
      this.add.remove(idel.key);
    });

  const iadd = this.add.iterator();
  while (iadd.next())
    LevelDOWN.prototype.put.call(this, iadd.key, iadd.value, () => {
    });

  iadd.reset();
  idel.reset();

  this.sync();
};

FlatFileDB.prototype.needsFlush = function needsFlush() {
  if (Math.round(Date.now() - this.lastFlush / 1000) > this.options.flush)
    return true;
  // TODO: check size
  return false;
};

FlatFileDB.prototype.flush = function flush() {
  this.lastFlush = Date.now();

  this.commit();
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
  if (!fs.existsSync(path.join(this.location, 'blocks')))
    fs.mkdirSync (path.join(this.location, 'blocks'));
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

FlatFileDB.prototype.getBlock = function getBlock(key, value) {
  if (key in this.hashes)
    return this.blocks[this.hashes[key]];

  // read from file
  return '';
};

FlatFileDB.prototype.putBlock = function putBlock(key, value) {
  this.hashes[key] = this.blocks.push(value);
};

FlatFileDB.prototype.removeBlock = function removeBlock(key) {
  delete this.blocks[this.hashes[key]];

  // delete from file
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

/**
 * Create an atomic batch (leveldown method).
 * @see Leveldown.Batch
 * @param {Object[]?} ops
 * @param {Object?} options
 * @param {Function} callback
 */

FlatFileDB.prototype.batch = function batch(ops, options, callback) {
  if (!callback) {
    callback = options;
    options = null;
  }

  const b = new Batch(this, options);

  if (ops) {
    b.ops = ops;
    b.write(callback);
    return undefined;
  }

  return b;
};

/**
 * Batch
 * @constructor
 * @ignore
 * @private
 * @param {FlatFileDB} db
 * @param {Object?} options
 */

function Batch(db, options) {
  this.options = options || {};
  this.ops = [];
  this.db = db;
  this.written = false;
}

/**
 * Insert a record.
 * @param {Buffer|String} key
 * @param {Buffer} value
 */

Batch.prototype.put = function put(key, value) {
  assert(!this.written, 'Already written.');
  this.ops.push(new BatchOp('put', key, value));
  return this;
};

/**
 * Remove a record.
 * @param {Buffer|String} key
 */

Batch.prototype.del = function del(key) {
  assert(!this.written, 'Already written.');
  this.ops.push(new BatchOp('del', key));
  return this;
};

/**
 * Commit the batch.
 * @param {Function} callback
 */

Batch.prototype.write = function write(callback) {
  if (this.written) {
    setImmediate(() => callback(new Error('Already written.')));
    return this;
  }

  for (const op of this.ops) {
    switch (op.type) {
      case 'put':
        this.db.insert(op.key, op.value);
        break;
      case 'del':
        this.db.remove(op.key);
        break;
      default:
        setImmediate(() => callback(new Error('Bad op.')));
        return this;
    }
  }

  this.ops = [];
  this.written = true;

  setImmediate(callback);

  return this;
};

/**
 * Clear batch of all ops.
 */

Batch.prototype.clear = function clear() {
  assert(!this.written, 'Already written.');
  this.ops = [];
  return this;
};

/**
 * Batch Operation
 * @constructor
 * @ignore
 * @private
 * @param {String} type
 * @param {Buffer} key
 * @param {Buffer|null} value
 */

function BatchOp(type, key, value) {
  this.type = type;
  this.key = key;
  this.value = value;
}

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
