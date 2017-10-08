/*!
 * ffldb.js - flat file database for bcoin
 * Copyright (c) 2016-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const path = require('path');
const LevelDOWN = require('leveldown');
const BlockIO = require('../utils/blockio');
const FileLocation = require('../utils/fileloc');
const co = require('../utils/co');

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

  LevelDOWN.call(this, path.join(location, 'metadata'));

  this.location = location;

  this.blockio = new BlockIO({
    location: path.join(location, 'blocks'),
    maxFileSize: 512 * 1024 * 1024, // 512 MiB
    network: 'simnet' // FIXME: use config
  });
}

Object.setPrototypeOf(FlatFileDB.prototype, LevelDOWN.prototype);

FlatFileDB.prototype.getBlock = async function getBlock(key) {
  const entry = await co.promisify(this.get).call(this, key);
  const loc = FileLocation.fromRaw(entry);
  const block = await this.blockio.readBlock(loc);
  return block;
};

FlatFileDB.prototype.putBlock = async function putBlock(key, value) {
  try {
    const loc = await this.blockio.writeBlock(value);
    const entry = loc.toRaw();
    co.promisify(this.put).call(this, key.toString('hex'), entry);
    this.cacheSize += key.length + value.length;
  } catch (e) {
    throw e;
  }
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

/*
 * Expose
 */

module.exports = FlatFileDB;
