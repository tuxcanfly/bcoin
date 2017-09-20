/*!
 * blockdb.js - blockchain data management for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2016, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const co = require('../utils/co');
const Flat = require('../db/flat');
const LRU = require('../utils/lru');
const FileEntry = Flat.FileEntry;
const MemDB = require('./memdb');

/**
 * BlockDB
 * @constructor
 */

function BlockDB(location) {
  if (!(this instanceof BlockDB))
    return new BlockDB(location);

  MemDB.call(this);

  this.flat = new Flat(location);
  this.cache = new LRU(8192);
}

Object.setPrototypeOf(BlockDB.prototype, MemDB.prototype);

BlockDB.prototype.open = function open(options, callback) {
  return this.flat.open(options, callback);
};

BlockDB.prototype.close = function close() {
  return this.flat.close();
};

BlockDB.prototype.getEntry = async function getEntry(hash) {
  let key = hash;
  let entry;

  if (typeof key !== 'string')
    key = key.toString('hex');

  entry = this.cache.get(key);

  if (entry)
    return entry;

  const data = await this.db.get(hash);

  if (!data)
    return undefined;

  entry = FileEntry.fromRaw(data);

  this.cache.set(key, entry);

  return entry;
};

BlockDB.prototype.saveBlock = async function saveBlock(block) {
  const hex = block.hash('hex');
  const entry = await this.flat.write(block.toRaw());

  if (block.height === 0)
    await this.flat.sync();

  this.cache.set(hex, entry);
};

BlockDB.prototype.readBlock = async function readBlock(hash) {
  const entry = await this.getEntry(hash);

  if (!entry)
    return;

  await this.readBlockEntry(entry);
};

BlockDB.prototype.readBlockEntry = function readBlockEntry(entry) {
  return this.flat.read(entry.index, entry.pos);
};

BlockDB.prototype.removeBlock = async function removeBlock(hash) {
  const entry = await this.getEntry(hash);

  if (!entry)
    return;

  if (entry.pos === 0)
    await this.flat.remove(entry.index);
};

BlockDB.prototype.pruneBlock = async function pruneBlock(hash) {
  const entry = await this.getEntry(hash);
  if (!entry)
    return;
  await this.pruneBlockEntry(hash, entry);
};

BlockDB.prototype.pruneBlockEntry = function pruneBlockEntry(hash, entry) {
  let index = entry.index;
  if (index === this.current.index)
    index -= 1;
  return this.flat.remove(index);
};

/**
 * Batch
 * @constructor
 */

function Batch(ffdb) {
  this.ffdb = ffdb;
  this.ops = [];
}

Batch.prototype.put = function put(block) {
  this.ops.push(new BatchOp(0, block));
};

Batch.prototype.del = function del(hash) {
  this.ops.push(new BatchOp(1, hash));
};

Batch.prototype.write = co(function* write() {
  let i, op;

  for (i = 0; i < this.ops.length; i++) {
    op = this.ops[i];
    switch (op.type) {
      case 0:
        yield this.ffdb.saveBlock(op.data);
        break;
      case 1:
        yield this.ffdb.removeBlock(op.data);
        break;
      default:
        assert(false);
    }
  }
});

/**
 * BatchOp
 * @constructor
 */

function BatchOp(type, data) {
  this.type = type;
  this.data = data;
}

/*
 * Expose
 */

module.exports = BlockDB;
