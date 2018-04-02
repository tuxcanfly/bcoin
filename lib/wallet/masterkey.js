/*!
 * masterkey.js - master bip32 key object for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const bio = require('bufio');
const {Lock} = require('bmutex');
const random = require('bcrypto/lib/random');
const cleanse = require('bcrypto/lib/cleanse');
const aes = require('bcrypto/lib/aes');
const sha256 = require('bcrypto/lib/sha256');
const pbkdf2 = require('bcrypto/lib/pbkdf2');
const scrypt = require('bcrypto/lib/scrypt');
const Network = require('../protocol/network');
const util = require('../utils/util');
const HD = require('../hd/hd');
const {encoding} = bio;
const {Mnemonic} = HD;

/**
 * Master Key
 * Master BIP32 key which can exist
 * in a timed out encrypted state.
 * @alias module:wallet.MasterKey
 */

class MasterKey {
  /**
   * Create a master key.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    this.encrypted = false;
    this.iv = null;
    this.ciphertext = null;
    this.key = null;
    this.mnemonic = null;

    this.alg = MasterKey.alg.PBKDF2;
    this.N = 50000;
    this.r = 0;
    this.p = 0;

    this.aesKey = null;
    this.timer = null;
    this.until = 0;
    this._onTimeout = this.lock.bind(this);
    this.locker = new Lock();

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options object.
   * @private
   * @param {Object} options
   */

  fromOptions(options) {
    assert(options);

    if (options.network != null)
      this.network = Network.get(options.network);

    if (options.encrypted != null) {
      assert(typeof options.encrypted === 'boolean');
      this.encrypted = options.encrypted;
    }

    if (options.iv) {
      assert(Buffer.isBuffer(options.iv));
      this.iv = options.iv;
    }

    if (options.ciphertext) {
      assert(Buffer.isBuffer(options.ciphertext));
      this.ciphertext = options.ciphertext;
    }

    if (options.key) {
      assert(HD.isPrivate(options.key));
      this.key = options.key;
    }

    if (options.mnemonic) {
      assert(options.mnemonic instanceof Mnemonic);
      this.mnemonic = options.mnemonic;
    }

    if (options.alg != null) {
      if (typeof options.alg === 'string') {
        this.alg = MasterKey.alg[options.alg.toUpperCase()];
        assert(this.alg != null, 'Unknown algorithm.');
      } else {
        assert(typeof options.alg === 'number');
        assert(MasterKey.algByVal[options.alg]);
        this.alg = options.alg;
      }
    }

    if (options.rounds != null) {
      assert((options.rounds >>> 0) === options.rounds);
      this.N = options.rounds;
    }

    if (options.N != null) {
      assert((options.N >>> 0) === options.N);
      this.N = options.N;
    }

    if (options.r != null) {
      assert((options.r >>> 0) === options.r);
      this.r = options.r;
    }

    if (options.p != null) {
      assert((options.p >>> 0) === options.p);
      this.p = options.p;
    }

    assert(this.encrypted ? !this.key : this.key);

    return this;
  }

  /**
   * Instantiate master key from options.
   * @returns {MasterKey}
   */

  static fromOptions(options) {
    return new this().fromOptions(options);
  }

  /**
   * Decrypt the key and set a timeout to destroy decrypted data.
   * @param {Buffer|String} passphrase - Zero this yourself.
   * @param {Number} [timeout=60000] timeout in ms.
   * @returns {Promise} - Returns {@link HDPrivateKey}.
   */

  async unlock(passphrase, timeout) {
    const _unlock = await this.locker.lock();
    try {
      return await this._unlock(passphrase, timeout);
    } finally {
      _unlock();
    }
  }

  /**
   * Decrypt the key without a lock.
   * @private
   * @param {Buffer|String} passphrase - Zero this yourself.
   * @param {Number} [timeout=60000] timeout in ms.
   * @returns {Promise} - Returns {@link HDPrivateKey}.
   */

  async _unlock(passphrase, timeout) {
    if (this.key) {
      if (this.encrypted) {
        assert(this.timer != null);
        this.start(timeout);
      }
      return this.key;
    }

    if (!passphrase)
      throw new Error('No passphrase.');

    assert(this.encrypted);

    const key = await this.derive(passphrase);
    const data = aes.decipher(this.ciphertext, key, this.iv);

    this.readKey(data);

    this.start(timeout);

    this.aesKey = key;

    return this.key;
  }

  /**
   * Start the destroy timer.
   * @private
   * @param {Number} [timeout=60000] timeout in ms.
   */

  start(timeout) {
    if (!timeout)
      timeout = 60;

    this.stop();

    if (timeout === -1)
      return;

    this.until = util.now() + timeout;
    this.timer = setTimeout(this._onTimeout, timeout * 1000);
  }

  /**
   * Stop the destroy timer.
   * @private
   */

  stop() {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.until = 0;
    }
  }

  /**
   * Derive an aes key based on params.
   * @param {String|Buffer} passphrase
   * @returns {Promise}
   */

  async derive(passwd) {
    const salt = MasterKey.SALT;
    const N = this.N;
    const r = this.r;
    const p = this.p;

    if (typeof passwd === 'string')
      passwd = Buffer.from(passwd, 'utf8');

    switch (this.alg) {
      case MasterKey.alg.PBKDF2:
        return await pbkdf2.deriveAsync(sha256, passwd, salt, N, 32);
      case MasterKey.alg.SCRYPT:
        return await scrypt.deriveAsync(passwd, salt, N, r, p, 32);
      default:
        throw new Error(`Unknown algorithm: ${this.alg}.`);
    }
  }

  /**
   * Encrypt data with in-memory aes key.
   * @param {Buffer} data
   * @param {Buffer} iv
   * @returns {Buffer}
   */

  encipher(data, iv) {
    if (!this.aesKey)
      return null;

    if (typeof iv === 'string')
      iv = Buffer.from(iv, 'hex');

    return aes.encipher(data, this.aesKey, iv.slice(0, 16));
  }

  /**
   * Decrypt data with in-memory aes key.
   * @param {Buffer} data
   * @param {Buffer} iv
   * @returns {Buffer}
   */

  decipher(data, iv) {
    if (!this.aesKey)
      return null;

    if (typeof iv === 'string')
      iv = Buffer.from(iv, 'hex');

    return aes.decipher(data, this.aesKey, iv.slice(0, 16));
  }

  /**
   * Destroy the key by zeroing the
   * privateKey and chainCode. Stop
   * the timer if there is one.
   * @returns {Promise}
   */

  async lock() {
    const unlock = await this.locker.lock();
    try {
      return await this._lock();
    } finally {
      unlock();
    }
  }

  /**
   * Destroy the key by zeroing the
   * privateKey and chainCode. Stop
   * the timer if there is one.
   */

  _lock() {
    if (!this.encrypted) {
      assert(this.timer == null);
      assert(this.key);
      return;
    }

    this.stop();

    if (this.key) {
      this.key.destroy(true);
      this.key = null;
    }

    if (this.aesKey) {
      cleanse(this.aesKey);
      this.aesKey = null;
    }
  }

  /**
   * Destroy the key permanently.
   */

  async destroy() {
    await this.lock();
    this.locker.destroy();
  }

  /**
   * Decrypt the key permanently.
   * @param {Buffer|String} passphrase - Zero this yourself.
   * @returns {Promise}
   */

  async decrypt(passphrase, clean) {
    const unlock = await this.locker.lock();
    try {
      return await this._decrypt(passphrase, clean);
    } finally {
      unlock();
    }
  }

  /**
   * Decrypt the key permanently without a lock.
   * @private
   * @param {Buffer|String} passphrase - Zero this yourself.
   * @returns {Promise}
   */

  async _decrypt(passphrase, clean) {
    if (!this.encrypted)
      throw new Error('Master key is not encrypted.');

    if (!passphrase)
      throw new Error('No passphrase provided.');

    this._lock();

    const key = await this.derive(passphrase);
    const data = aes.decipher(this.ciphertext, key, this.iv);

    this.readKey(data);
    this.encrypted = false;
    this.iv = null;
    this.ciphertext = null;

    if (!clean) {
      cleanse(key);
      return null;
    }

    return key;
  }

  /**
   * Encrypt the key permanently.
   * @param {Buffer|String} passphrase - Zero this yourself.
   * @returns {Promise}
   */

  async encrypt(passphrase, clean) {
    const unlock = await this.locker.lock();
    try {
      return await this._encrypt(passphrase, clean);
    } finally {
      unlock();
    }
  }

  /**
   * Encrypt the key permanently without a lock.
   * @private
   * @param {Buffer|String} passphrase - Zero this yourself.
   * @returns {Promise}
   */

  async _encrypt(passphrase, clean) {
    if (this.encrypted)
      throw new Error('Master key is already encrypted.');

    if (!passphrase)
      throw new Error('No passphrase provided.');

    const raw = this.writeKey();
    const iv = random.randomBytes(16);

    this.stop();

    const key = await this.derive(passphrase);
    const data = aes.encipher(raw, key, iv);

    this.key = null;
    this.mnemonic = null;
    this.encrypted = true;
    this.iv = iv;
    this.ciphertext = data;

    if (!clean) {
      cleanse(key);
      return null;
    }

    return key;
  }

  /**
   * Calculate key serialization size.
   * @returns {Number}
   */

  keySize() {
    let size = 0;

    size += this.key.getSize();
    size += 1;

    if (this.mnemonic)
      size += this.mnemonic.getSize();

    return size;
  }

  /**
   * Serialize key and menmonic to a single buffer.
   * @returns {Buffer}
   */

  writeKey() {
    const bw = bio.static(this.keySize());

    this.key.toWriter(bw, this.network);

    if (this.mnemonic) {
      bw.writeU8(1);
      this.mnemonic.toWriter(bw);
    } else {
      bw.writeU8(0);
    }

    return bw.render();
  }

  /**
   * Inject properties from serialized key.
   * @param {Buffer} data
   */

  readKey(data) {
    const br = bio.read(data);

    this.key = HD.PrivateKey.fromReader(br, this.network);

    if (br.readU8() === 1)
      this.mnemonic = Mnemonic.fromReader(br);

    return this;
  }

  /**
   * Calculate serialization size.
   * @returns {Number}
   */

  getSize() {
    let size = 0;

    if (this.encrypted) {
      size += 1;
      size += encoding.sizeVarBytes(this.iv);
      size += encoding.sizeVarBytes(this.ciphertext);
      size += 13;
      return size;
    }

    size += 1;
    size += encoding.sizeVarlen(this.keySize());

    return size;
  }

  /**
   * Serialize the key in the form of:
   * `[enc-flag][iv?][ciphertext?][extended-key?]`
   * @returns {Buffer}
   */

  toWriter() {
    const bw = bio.static(this.getSize());

    if (this.encrypted) {
      bw.writeU8(1);
      bw.writeVarBytes(this.iv);
      bw.writeVarBytes(this.ciphertext);

      bw.writeU8(this.alg);
      bw.writeU32(this.N);
      bw.writeU32(this.r);
      bw.writeU32(this.p);

      return bw.render();
    }

    bw.writeU8(0);

    // NOTE: useless varint
    const size = this.keySize();
    bw.writeVarint(size);

    bw.writeBytes(this.key.toRaw(this.network));

    if (this.mnemonic) {
      bw.writeU8(1);
      this.mnemonic.toWriter(bw);
    } else {
      bw.writeU8(0);
    }

    return bw;
  }

  /**
   * Serialize the key in the form of:
   * `[enc-flag][iv?][ciphertext?][extended-key?]`
   * @returns {Buffer}
   */

  toRaw() {
    const size = this.getSize();
    return this.toWriter(bio.static(size)).render();
  }

  /**
   * Inject properties from serialized data.
   * @private
   * @param {Buffer} raw
   */

  fromRaw(raw, network) {
    const br = bio.read(raw);

    this.network = Network.get(network);
    this.encrypted = br.readU8() === 1;

    if (this.encrypted) {
      this.iv = br.readVarBytes();
      this.ciphertext = br.readVarBytes();

      this.alg = br.readU8();

      assert(MasterKey.algByVal[this.alg]);

      this.N = br.readU32();
      this.r = br.readU32();
      this.p = br.readU32();

      return this;
    }

    // NOTE: useless varint
    br.readVarint();

    this.key = HD.PrivateKey.fromRaw(br.readBytes(82), this.network);

    if (br.readU8() === 1)
      this.mnemonic = Mnemonic.fromReader(br);

    return this;
  }

  /**
   * Instantiate master key from serialized data.
   * @returns {MasterKey}
   */

  static fromReader(br) {
    return new this().fromReader(br);
  }

  /**
   * Instantiate master key from serialized data.
   * @returns {MasterKey}
   */

  static fromRaw(raw) {
    return new this().fromRaw(raw);
  }

  /**
   * Inject properties from an HDPrivateKey.
   * @private
   * @param {HDPrivateKey} key
   * @param {Mnemonic?} mnemonic
   */

  fromKey(key, mnemonic, network) {
    this.encrypted = false;
    this.iv = null;
    this.ciphertext = null;
    this.key = key;
    this.mnemonic = mnemonic || null;
    this.network = Network.get(network);
    return this;
  }

  /**
   * Instantiate master key from an HDPrivateKey.
   * @param {HDPrivateKey} key
   * @param {Mnemonic?} mnemonic
   * @returns {MasterKey}
   */

  static fromKey(key, mnemonic, network) {
    return new this().fromKey(key, mnemonic, network);
  }

  /**
   * Convert master key to a jsonifiable object.
   * @param {Boolean?} unsafe - Whether to include
   * the key data in the JSON.
   * @returns {Object}
   */

  toJSON(unsafe) {
    if (this.encrypted) {
      return {
        encrypted: true,
        until: this.until,
        iv: this.iv.toString('hex'),
        ciphertext: unsafe ? this.ciphertext.toString('hex') : undefined,
        algorithm: MasterKey.algByVal[this.alg].toLowerCase(),
        N: this.N,
        r: this.r,
        p: this.p
      };
    }

    return {
      encrypted: false,
      key: unsafe ? this.key.toJSON(this.network) : undefined,
      mnemonic: unsafe && this.mnemonic ? this.mnemonic.toJSON() : undefined
    };
  }

  /**
   * Inspect the key.
   * @returns {Object}
   */

  inspect() {
    const json = this.toJSON(true);

    if (this.key)
      json.key = this.key.toJSON(this.network);

    if (this.mnemonic)
      json.mnemonic = this.mnemonic.toJSON();

    return json;
  }

  /**
   * Test whether an object is a MasterKey.
   * @param {Object} obj
   * @returns {Boolean}
   */

  static isMasterKey(obj) {
    return obj instanceof MasterKey;
  }
}

/**
 * Key derivation salt.
 * @const {Buffer}
 * @default
 */

MasterKey.SALT = Buffer.from('bcoin', 'ascii');

/**
 * Key derivation algorithms.
 * @enum {Number}
 * @default
 */

MasterKey.alg = {
  PBKDF2: 0,
  SCRYPT: 1
};

/**
 * Key derivation algorithms by value.
 * @enum {String}
 * @default
 */

MasterKey.algByVal = [
  'PBKDF2',
  'SCRYPT'
];

/*
 * Expose
 */

module.exports = MasterKey;
