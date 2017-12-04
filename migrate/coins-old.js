/*!
 * coins.js - coins object for bcoin
 * Copyright (c) 2014-2016, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

/* eslint-disable */

'use strict';

const assert = require('assert');
const bio = require('bufio');
const util = require('../lib/utils/util');
const Coin = require('../lib/primitives/coin');
const Output = require('../lib/primitives/output');
const {compress, decompress} = require('./compress-old');
const {encoding} = bio;

/**
 * Represents the outputs for a single transaction.
 * @exports Coins
 * @constructor
 * @param {TX|Object} tx/options - TX or options object.
 * @property {Hash} hash - Transaction hash.
 * @property {Number} version - Transaction version.
 * @property {Number} height - Transaction height (-1 if unconfirmed).
 * @property {Boolean} coinbase - Whether the containing
 * transaction is a coinbase.
 * @property {Coin[]} outputs - Coins.
 */

function Coins(options) {
  if (!(this instanceof Coins))
    return new Coins(options);

  this.version = 1;
  this.hash = encoding.NULL_HASH;
  this.height = -1;
  this.coinbase = true;
  this.outputs = [];

  if (options)
    this.fromOptions(options);
}

/**
 * Inject properties from options object.
 * @private
 * @param {Object} options
 */

Coins.prototype.fromOptions = function fromOptions(options) {
  if (options.version != null) {
    assert((options.version >>> 0) === options.version);
    this.version = options.version;
  }

  if (options.hash) {
    assert(typeof options.hash === 'string');
    this.hash = options.hash;
  }

  if (options.height != null) {
    assert(Number.isSafeInteger(options.height));
    this.height = options.height;
  }

  if (options.coinbase != null) {
    assert(typeof options.coinbase === 'boolean');
    this.coinbase = options.coinbase;
  }

  if (options.outputs) {
    assert(Array.isArray(options.outputs));
    this.outputs = options.outputs;
  }

  return this;
};

/**
 * Instantiate coins from options object.
 * @param {Object} options
 * @returns {Coins}
 */

Coins.fromOptions = function fromOptions(options) {
  return new Coins().fromOptions(options);
};

/**
 * Add a single coin to the collection.
 * @param {Coin} coin
 */

Coins.prototype.add = function add(coin) {
  if (this.outputs.length === 0) {
    this.version = coin.version;
    this.hash = coin.hash;
    this.height = coin.height;
    this.coinbase = coin.coinbase;
  }

  while (this.outputs.length <= coin.index)
    this.outputs.push(null);

  if (coin.script.isUnspendable()) {
    this.outputs[coin.index] = null;
    return;
  }

  this.outputs[coin.index] = CoinEntry.fromCoin(coin);
};

/**
 * Test whether the collection has a coin.
 * @param {Number} index
 * @returns {Boolean}
 */

Coins.prototype.has = function has(index) {
  if (index >= this.outputs.length)
    return false;

  return this.outputs[index] != null;
};

/**
 * Get a coin.
 * @param {Number} index
 * @returns {Coin}
 */

Coins.prototype.get = function get(index) {
  if (index >= this.outputs.length)
    return;

  const coin = this.outputs[index];

  if (!coin)
    return;

  return coin.toCoin(this, index);
};

/**
 * Remove a coin and return it.
 * @param {Number} index
 * @returns {Coin}
 */

Coins.prototype.spend = function spend(index) {
  const coin = this.get(index);

  if (!coin)
    return;

  this.outputs[index] = null;

  return coin;
};

/**
 * Count up to the last available index.
 * @returns {Number}
 */

Coins.prototype.size = function size() {
  let index = -1;

  for (let i = this.outputs.length - 1; i >= 0; i--) {
    const output = this.outputs[i];
    if (output) {
      index = i;
      break;
    }
  }

  return index + 1;
};

/**
 * Test whether the coins are fully spent.
 * @returns {Boolean}
 */

Coins.prototype.isEmpty = function isEmpty() {
  return this.size() === 0;
};

/*
 * Coins serialization:
 * version: varint
 * bits: uint32 (31-bit height | 1-bit coinbase-flag)
 * spent-field: varint size | bitfield (0=unspent, 1=spent)
 * outputs (repeated):
 *   compressed-script:
 *     prefix: 0x00 = varint size | raw script
 *             0x01 = 20 byte pubkey hash
 *             0x02 = 20 byte script hash
 *             0x03 = 33 byte compressed key
 *     data: script data, dictated by the prefix
 *   value: varint
 *
 * The compression below sacrifices some cpu in exchange
 * for reduced size, but in some cases the use of varints
 * actually increases speed (varint versions and values
 * for example). We do as much compression as possible
 * without sacrificing too much cpu. Value compression
 * is intentionally excluded for now as it seems to be
 * too much of a perf hit. Maybe when v8 optimizes
 * non-smi arithmetic better we can enable it.
 */

/**
 * Serialize the coins object.
 * @param {TX|Coins} tx
 * @returns {Buffer}
 */

Coins.prototype.toRaw = function toRaw() {
  const bw = bio.static();
  const length = this.size();
  const len = Math.ceil(length / 8);

  // Return nothing if we're fully spent.
  if (length === 0)
    return;

  // Varint version: hopefully we
  // never run into `-1` versions.
  bw.writeVarint(this.version);

  // Create the `bits` value:
  // (height | coinbase-flag).
  let bits = this.height << 1;

  // Append the coinbase bit.
  if (this.coinbase)
    bits |= 1;

  if (bits < 0)
    bits += 0x100000000;

  // Making this a varint would actually
  // make 99% of coins bigger. Varints
  // are really only useful up until
  // 0x10000, but since we're also
  // storing the coinbase flag on the
  // lo bit, varints are useless (and
  // actually harmful) after height
  // 32767 (0x7fff).
  bw.writeU32(bits);

  // Fill the spent field with zeroes to avoid
  // allocating a buffer. We mark the spents
  // after rendering the final buffer.
  bw.writeVarint(len);
  const start = bw.offset;
  bw.fill(0, len);

  // Write the compressed outputs.
  for (let i = 0; i < length; i++) {
    const output = this.outputs[i];

    if (!output)
      continue;

    output.toWriter(bw);
  }

  // Render the buffer with all
  // zeroes in the spent field.
  const data = bw.render();

  // Mark the spents in the spent field.
  // This is essentially a NOP for new coins.
  for (let i = 0; i < length; i++) {
    const output = this.outputs[i];

    if (output)
      continue;

    const bit = i % 8;
    let oct = (i - bit) / 8;
    oct += start;

    data[oct] |= 1 << (7 - bit);
  }

  return data;
};

/**
 * Parse serialized coins.
 * @param {Buffer} data
 * @param {Hash} hash
 * @returns {Object} A "naked" coins object.
 */

Coins.prototype.fromRaw = function fromRaw(data, hash, index) {
  const br = bio.reader(data);
  let pos = 0;

  this.version = br.readVarint();

  const bits = br.readU32();

  this.height = bits >>> 1;
  this.hash = hash;
  this.coinbase = (bits & 1) !== 0;

  // Mark the start of the spent field and
  // seek past it to avoid reading a buffer.
  const len = br.readVarint();
  const start = br.offset;
  br.seek(len);

  while (br.left()) {
    const bit = pos % 8;
    let oct = (pos - bit) / 8;
    oct += start;

    // Read a single bit out of the spent field.
    let spent = data[oct] >>> (7 - bit);
    spent &= 1;

    // Already spent.
    if (spent) {
      this.outputs.push(null);
      pos++;
      continue;
    }

    // Store the offset and size
    // in the compressed coin object.
    const coin = CoinEntry.fromReader(br);

    this.outputs.push(coin);
    pos++;
  }

  return this;
};

/**
 * Parse a single serialized coin.
 * @param {Buffer} data
 * @param {Hash} hash
 * @param {Number} index
 * @returns {Coin}
 */

Coins.parseCoin = function parseCoin(data, hash, index) {
  const br = bio.reader(data);
  const coin = new Coin();
  let pos = 0;

  coin.version = br.readVarint();

  const bits = br.readU32();

  coin.hash = hash;
  coin.index = index;
  coin.height = bits >>> 1;
  coin.hash = hash;
  coin.coinbase = (bits & 1) !== 0;

  // Mark the start of the spent field and
  // seek past it to avoid reading a buffer.
  const len = br.readVarint();
  const start = br.offset;
  br.seek(len);

  while (br.left()) {
    const bit = pos % 8;
    let oct = (pos - bit) / 8;
    oct += start;

    // Read a single bit out of the spent field.
    let spent = data[oct] >>> (7 - bit);
    spent &= 1;

    // We found our coin.
    if (pos === index) {
      if (spent)
        return;
      decompress.script(coin.script, br);
      coin.value = br.readVarint();
      return coin;
    }

    // Already spent.
    if (spent) {
      pos++;
      continue;
    }

    // Skip past the compressed coin.
    skipCoin(br);
    pos++;
  }
};

/**
 * Instantiate coins from a serialized Buffer.
 * @param {Buffer} data
 * @param {Hash} hash - Transaction hash.
 * @returns {Coins}
 */

Coins.fromRaw = function fromRaw(data, hash) {
  return new Coins().fromRaw(data, hash);
};

/**
 * Inject properties from tx.
 * @private
 * @param {TX} tx
 */

Coins.prototype.fromTX = function fromTX(tx) {
  this.version = tx.version;
  this.hash = tx.hash('hex');
  this.height = tx.height;
  this.coinbase = tx.isCoinbase();

  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];

    if (output.script.isUnspendable()) {
      this.outputs.push(null);
      continue;
    }

    this.outputs.push(CoinEntry.fromTX(tx, i));
  }

  return this;
};

/**
 * Instantiate a coins object from a transaction.
 * @param {TX} tx
 * @returns {Coins}
 */

Coins.fromTX = function fromTX(tx) {
  return new Coins().fromTX(tx);
};

/**
 * A compressed coin is an object which defers
 * parsing of a coin. Say there is a transaction
 * with 100 outputs. When a block comes in,
 * there may only be _one_ input in that entire
 * block which redeems an output from that
 * transaction. When parsing the Coins, there
 * is no sense to get _all_ of them into their
 * abstract form. A compressed coin is just a
 * pointer to that coin in the Coins buffer, as
 * well as a size. Parsing is done only if that
 * coin is being redeemed.
 * @constructor
 * @private
 * @param {Number} offset
 * @param {Number} size
 * @param {Buffer} raw
 */

function CoinEntry() {
  this.offset = 0;
  this.size = 0;
  this.raw = null;
  this.output = null;
}

/**
 * Parse the deferred data and return a Coin.
 * @param {Coins} coins
 * @param {Number} index
 * @returns {Coin}
 */

CoinEntry.prototype.toCoin = function toCoin(coins, index) {
  const coin = new Coin();

  // Load in all necessary properties
  // from the parent Coins object.
  coin.version = coins.version;
  coin.coinbase = coins.coinbase;
  coin.height = coins.height;
  coin.hash = coins.hash;
  coin.index = index;

  if (this.output) {
    coin.script = this.output.script;
    coin.value = this.output.value;
    return coin;
  }

  const br = bio.reader(this.raw);

  // Seek to the coin's offset.
  br.seek(this.offset);

  decompress.script(coin.script, br);

  coin.value = br.readVarint();

  return coin;
};

/**
 * Slice off the part of the buffer
 * relevant to this particular coin.
 */

CoinEntry.prototype.toWriter = function toWriter(bw) {
  if (this.output) {
    compress.script(this.output.script, bw);
    bw.writeVarint(this.output.value);
    return;
  }

  assert(this.raw);

  // If we read this coin from the db and
  // didn't use it, it's still in its
  // compressed form. Just write it back
  // as a buffer for speed.
  const raw = this.raw.slice(this.offset, this.offset + this.size);

  bw.writeBytes(raw);
};

/**
 * Instantiate compressed coin from reader.
 * @param {BufferReader} br
 * @returns {CoinEntry}
 */

CoinEntry.fromReader = function fromReader(br) {
  const entry = new CoinEntry();
  entry.offset = br.offset;
  entry.size = skipCoin(br);
  entry.raw = br.data;
  return entry;
};

/**
 * Instantiate compressed coin from tx.
 * @param {TX} tx
 * @param {Number} index
 * @returns {CoinEntry}
 */

CoinEntry.fromTX = function fromTX(tx, index) {
  const entry = new CoinEntry();
  entry.output = tx.outputs[index];
  return entry;
};

/**
 * Instantiate compressed coin from coin.
 * @param {Coin} coin
 * @returns {CoinEntry}
 */

CoinEntry.fromCoin = function fromCoin(coin) {
  const entry = new CoinEntry();
  entry.output = new Output();
  entry.output.script = coin.script;
  entry.output.value = coin.value;
  return entry;
};

/*
 * Helpers
 */

function skipCoin(br) {
  const start = br.offset;

  // Skip past the compressed scripts.
  switch (br.readU8()) {
    case 0:
      br.seek(br.readVarint());
      break;
    case 1:
    case 2:
      br.seek(20);
      break;
    case 3:
      br.seek(33);
      break;
    default:
      throw new Error('Bad prefix.');
  }

  // Skip past the value.
  br.readVarint();

  return br.offset - start;
}

/*
 * Expose
 */

module.exports = Coins;
