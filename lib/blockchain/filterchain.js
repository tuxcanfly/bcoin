/*!
 * filterchain.js - additional blockchain management for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const Chain = require('./chain');

/**
 * FilterChain
 * @alias module:blockchain.FilterChain
 * @property {ChainDB} db
 * @property {ChainEntry?} tip
 * @property {Number} height
 * @property {DeploymentState} state
 * @emits FilterChain#open
 * @emits FilterChain#error
 * @emits FilterChain#block
 * @emits FilterChain#competitor
 * @emits FilterChain#resolved
 * @emits FilterChain#checkpoint
 * @emits FilterChain#fork
 * @emits FilterChain#reorganize
 * @emits FilterChain#invalid
 * @emits FilterChain#exists
 * @emits FilterChain#connect
 * @emits FilterChain#reconnect
 * @emits FilterChain#disconnect
 */

class FilterChain extends Chain {
  /**
   * Create a filterchain.
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    super(options);
  }
}

/**
 * Filter
 * @ignore
 */

class Filter {
  /**
   * Create a filter.
   * @constructor
   */

  constructor(type) {
      this.type = type;
  }
}

/**
 * Filter types.
 * @enum {Number}
 * @default
 */

Filter.types = {
  REGULAR: 0,
  EXTENDED: 1
};

/*
 * Expose
 */

exports.Filter = Filter;
exports.FilterChain = FilterChain;
