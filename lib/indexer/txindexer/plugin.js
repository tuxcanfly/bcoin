/*!
 * plugin.js - txindexer plugin for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const fs = require('bfile');
const path = require('path');
const TXIndexer = require('./txindexer');
const ChainClient = require('../chainclient');

/**
 * @exports plugin
 */

const plugin = exports;

/**
 * Plugin
 * @extends Index
 */

class Plugin extends TXIndexer {
  /**
   * Create a plugin.
   * @constructor
   * @param {Node} node
   */

  constructor(node) {
    const config = node.config.filter('index');

    const options = {
      network: node.network,
      client : new ChainClient(node.chain),
      logger: node.logger,
      prefix: config.str('prefix'),
      memory: config.bool('memory', node.memory),
      maxFiles: config.uint('max-files'),
      cacheSize: config.mb('cache-size')
    };

    if (options.prefix === null) {
      options.prefix = path.join(config.prefix, 'index');
      fs.mkdirpSync(options.prefix);
    }

    super(options);
  }
}

/**
 * Plugin name.
 * @const {String}
 */

plugin.id = 'txindexer';

/**
 * Plugin initialization.
 * @param {Node} node
 * @returns {Plugin}
 */

plugin.init = function init(node) {
  return new Plugin(node);
};
