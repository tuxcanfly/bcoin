/*!
 * indexer.js - indexer for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const EventEmitter = require('events');
const IndexDB = require('./indexdb');

/**
 * Index
 */

class Indexer extends EventEmitter {
  /**
   * Create a plugin.
   * @constructor
   * @param {Options} options
   */

  constructor(options) {
    super();

    this.db = new IndexDB(options);
    this.init();
  }

  init() {
    this.db.on('error', err => this.emit('error', err));
  }

  /**
   * Open the index
   * @returns {Promise}
   */

  async open() {
    await this.db.open();
  }

  /**
   * Close the index
   * @returns {Promise}
   */

  async close() {
    await this.db.close();
  }

  /**
   * Get tip.
   * @param {Hash} hash
   * @returns {Promise}
   */

  getTip() {
    return this.db.getTip();
  }
}

/*
 * Expose
 */

module.exports = Indexer;
