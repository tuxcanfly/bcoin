'use strict';

const utils = require('../utils/util');
const Lock = require('../utils/lock');
const path = require('path');
const fs = require('fs');
const Treap = require('../utils/treap');

const assert = utils.assert;
const murmur3 = require('../utils/murmur3');

const MAX_SIZE = 512 << 20;
const MAX_FILES = 64;
const MAX_ENTRY = 12 << 20;
const DUMMY = Buffer.alloc(0);

/**
 * Flat
 * @constructor
 */

function Flat(location) {
  if (!(this instanceof Flat))
    return new Flat(location);

  this.dir = path.resolve(location, '..');
  this.dir = path.resolve(this.dir, 'blocks');
  this.locker = new Lock(true);

  this.fileIndex = -1;
  this.current = null;
  this.files = {};
  this.openFiles = [];
  this.indexes = [];
  this.tree = new Treap(cmp, true);
}

/**
 * Do a key lookup.
 * @private
 * @param {Buffer|String} key
 * @returns {Buffer?} value
 */

Flat.prototype.search = function search(key) {
  if (typeof key === 'string')
    key = Buffer.from(key, 'utf8');

  assert(Buffer.isBuffer(key), 'Key must be a Buffer.');

  const node = this.tree.search(key);

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

Flat.prototype.insert = function insert(key, value) {
  if (typeof key === 'string')
    key = Buffer.from(key, 'utf8');

  if (typeof value === 'string')
    value = Buffer.from(value, 'utf8');

  if (value == null)
    value = DUMMY;

  assert(Buffer.isBuffer(key), 'Key must be a Buffer.');
  assert(Buffer.isBuffer(value), 'Value must be a Buffer.');

  return this.tree.insert(key, value) != null;
};

/**
 * Remove a record.
 * @private
 * @param {Buffer|String} key
 * @returns {Boolean}
 */

Flat.prototype.remove = function remove(key) {
  if (typeof key === 'string')
    key = Buffer.from(key, 'utf8');

  assert(Buffer.isBuffer(key), 'Key must be a Buffer.');

  return this.tree.remove(key) != null;
};

/**
 * Traverse between a range of keys and collect records.
 * @private
 * @param {Buffer} min
 * @param {Buffer} max
 * @returns {RBTData[]} Records.
 */

Flat.prototype.range = function range(min, max) {
  if (typeof min === 'string')
    min = Buffer.from(min, 'utf8');

  if (typeof max === 'string')
    max = Buffer.from(max, 'utf8');

  assert(!min || Buffer.isBuffer(min), 'Key must be a Buffer.');
  assert(!max || Buffer.isBuffer(max), 'Key must be a Buffer.');

  return this.tree.range(min, max);
};

/**
 * Retrieve a record (leveldown method).
 * @param {Buffer|String} key
 * @param {Object?} options
 * @param {Function} callback - Returns Buffer.
 */

Flat.prototype.get = function get(key, options, callback) {
  if (!callback) {
    callback = options;
    options = null;
  }

  if (!options)
    options = {};

  let value = this.search(key);

  if (!value) {
    const err = new Error('MEMDB_NOTFOUND: Key not found.');
    err.notFound = true;
    err.type = 'NotFoundError';
    setImmediate(() => callback(err));
    return;
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

Flat.prototype.put = function put(key, value, options, callback) {
  if (!callback) {
    callback = options;
    options = null;
  }

  this.insert(key, value);

  setImmediate(callback);
};

/**
 * Remove a record (leveldown method).
 * @param {Buffer|String} key
 * @param {Object?} options
 * @param {Function} callback
 */

Flat.prototype.del = function del(key, options, callback) {
  if (!callback) {
    callback = options;
    options = null;
  }

  this.remove(key);

  setImmediate(callback);
};

/**
 * Get a database property (leveldown method) (NOP).
 * @param {String} name - Property name.
 * @returns {String}
 */

Flat.prototype.getProperty = function getProperty(name) {
  return '';
};

/**
 * Calculate approximate database size (leveldown method).
 * @param {Buffer|String} start - Start key.
 * @param {Buffer|String} end - End key.
 * @param {Function} callback - Returns Number.
 */

Flat.prototype.approximateSize = function approximateSize(start, end, callback) {
  const items = this.range(start, end);
  let size = 0;

  for (const item of items) {
    size += item.key.length;
    size += item.value.length;
  }

  setImmediate(() => callback(null, size));
};

/**
 * Destroy the database (leveldown function) (NOP).
 * @param {String} location
 * @param {Function} callback
 */

Flat.destroy = function destroy(location, callback) {
  setImmediate(callback);
};

/**
 * Repair the database (leveldown function) (NOP).
 * @param {String} location
 * @param {Function} callback
 */

Flat.repair = function repair(location, callback) {
  setImmediate(callback);
};

Flat.prototype.hash = function hash(data) {
  return murmur3(data, 0xdeedbeef);
};

Flat.prototype.open = function open(options, callback) {
  let index = -1;
  let i, name;

  if (!(fs.exists(this.dir)))
    fs.mkdir(this.dir, 493, (err) => {
      fs.readdir(this.dir, (err, list) => {
        if (err)
          throw err;
        for (i = 0; i < list.length; i++) {
          name = list[i];

          if (!/^\d{10}$/.test(name))
            continue;

          name = parseInt(name, 10);

          utils.binaryInsert(this.indexes, name, cmp);

          if (name > index)
            index = name;
        }
      });
    });

  if (index === -1) {
    this.allocate();
    setImmediate(callback);
  }

  this.fileIndex = index;
  this.current = this.openFile(index);
  setImmediate(callback);
};

Flat.prototype.close = async function close() {
  const unlock = await this.locker.lock();
  try {
    return await this._close();
  } finally {
    unlock();
  }
};

Flat.prototype._close = function _close() {
  let i, index, file;

  for (i = this.openFiles.length - 1; i >= 0; i--) {
    index = this.openFiles[i];
    file = this.files[index];
    assert(file);
    this._closeFile(file.index);
  }

  assert(this.current === null);
  assert(this.openFiles.length === 0);

  this.fileIndex = -1;
  this.indexes.length = 0;
};

Flat.prototype.name = function name(index) {
  return path.resolve(this.dir, utils.pad32(index));
};

Flat.prototype.openFile = async function openFile(index) {
  const unlock = await this.locker.lock();
  try {
    return await this._openFile(index);
  } finally {
    unlock();
  }
};

Flat.prototype._openFile = function _openFile(index) {
  let file = this.files[index];

  if (file)
    return file;

  const name = this.name(index);

  fs.open(name, 'a+', (err, fd) => {
    if (err)
      throw err;
    fs.fstat(fd, (err, stat) => {
      if (err)
        throw err;
      file = new File(fd, index, stat.size);
    });
  });

  this.files[index] = file;
  utils.binaryInsert(this.openFiles, index, cmp);

  this.evict(index);

  return file;
};

Flat.prototype.closeFile = function closeFile(index) {
  const unlock = this.locker.lock();
  try {
    assert(index !== this.current.index);
    return this._closeFile(index);
  } finally {
    unlock();
  }
};

Flat.prototype._closeFile = function _closeFile(index) {
  const file = this.files[index];

  if (!file)
    return;

  fs.close(file.fd);

  const result = utils.binaryRemove(this.openFiles, index, cmp);
  assert(result);

  delete this.files[index];

  if (file === this.current)
    this.current = null;
};

Flat.prototype.remove = function remove(index) {
  const unlock = this.locker.lock();
  try {
    return this._remove(index);
  } finally {
    unlock();
  }
};

Flat.prototype._remove = function _remove(index) {
  assert(index != null);

  if (!this.files[index])
    return;

  this._closeFile(index);
  fs.unlink(this.name(index));

  const result = utils.binaryRemove(this.indexes, index, cmp);
  assert(result);

  if (!this.current) {
    index = this.indexes[this.indexes.length - 1];
    assert(index != null);
    this.current = this._openFile(index);
  }
};

Flat.prototype.allocate = function allocate() {
  const index = this.fileIndex + 1;
  let file;
  fs.open(this.name(index), 'a+', (err, fd) => {
    if (err)
      throw err;
    file = new File(fd, index, 0);
  });

  this.files[index] = file;
  this.current = file;
  this.fileIndex++;

  utils.binaryInsert(this.openFiles, index, cmp);
  this.evict(-1);
};

Flat.prototype.evict = function evict(not) {
  let i, index;

  if (this.openFiles.length <= MAX_FILES)
    return;

  for (;;) {
    assert(i < this.openFiles.length);

    index = this.openFiles[i];

    if (this.current) {
      if (index !== not && index !== this.current.index)
        break;
    }

    i++;
  }

  index = this.openFiles[i];
  const file = this.files[index];
  assert(file);

  fs.close(file.fd);

  this.openFiles.splice(i, 1);
  delete this.files[index];
};

Flat.prototype.write = function write(data) {
  const unlock = this.locker.lock();
  try {
    return this._write(data);
  } finally {
    unlock();
  }
};

Flat.prototype._write = function _write(data) {
  const buf = Buffer.alloc(4);
  const len = 4 + data.length + 4;

  if (data.length > MAX_ENTRY)
    throw new Error('Size too large.');

  if (this.current.pos + len > MAX_SIZE) {
    this.sync();
    this.allocate();
  }

  const pos = this.current.pos;
  const fd = this.current.fd;

  buf.writeUInt32LE(data.length, 0, true);
  fs.write(fd, buf, 0, 4, pos);

  fs.write(fd, data, 0, data.length, pos + 4);

  buf.writeUInt32LE(this.hash(data), 0, true);
  fs.write(fd, buf, 0, 4, pos + 4 + data.length);

  this.current.pos += len;

  return new FileEntry(this.current.index, pos, data.length);
};

Flat.prototype.read = function read(index, offset) {
  const file = this.openFile(index);
  const buf = Buffer.alloc(4);
  let err;

  if (offset + 8 > file.pos)
    throw new Error('Read is out of bounds.');

  fs.read(file.fd, buf, 0, 4, offset);
  const size = buf.readUInt32LE(0, true);

  if (size > MAX_ENTRY)
    throw new Error('Size too large.');

  if (offset + 4 + size + 4 > file.pos)
    throw new Error('Read is out of bounds.');

  const data = Buffer.alloc(size);
  fs.read(file.fd, data, 0, data.length, offset + 4);

  fs.read(file.fd, buf, 0, 4, offset + 4 + data.length);
  const chk = buf.readUInt32LE(0, true);

  if (this.hash(data) !== chk) {
    err = new Error('Checksum mismatch.');
    err.type = 'ChecksumMismatch';
    throw err;
  }

  return data;
};

Flat.prototype.sync = function sync() {
  fs.fsync(this.current.fd);
};

/*
 * File
 * @constructor
 */

function File(fd, index, pos) {
  this.fd = fd;
  this.index = index;
  this.pos = pos;
}

/*
 * FileEntry
 * @constructor
 */

function FileEntry(index, offset, size) {
  this.index = index;
  this.offset = offset;
  this.size = size;
}

FileEntry.prototype.toRaw = function toRaw() {
  const data = Buffer.alloc(12);
  data.writeUInt32LE(this.index, 0, true);
  data.writeUInt32LE(this.offset, 4, true);
  data.writeUInt32LE(this.size, 8, true);
  return data;
};

FileEntry.fromRaw = function fromRaw(data) {
  const entry = new FileEntry(0, 0, 0);
  entry.index = data.readUInt32LE(0, true);
  entry.offset = data.readUInt32LE(4, true);
  entry.size = data.readUInt32LE(8, true);
  return entry;
};

/*
 * Helpers
 */

function cmp(a, b) {
  return a - b;
}

/*
 * Expose
 */

exports = Flat;
exports.FileEntry = FileEntry;

module.exports = exports;
