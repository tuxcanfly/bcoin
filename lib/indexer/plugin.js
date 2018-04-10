/*!
 * plugin.js - indexer plugin for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const Indexer = require('./indexer');
const NodeClient = require('./nodeclient');

/**
 * @exports plugin
 */

const plugin = exports;

/**
 * Plugin
 * @extends Index
 */

class Plugin extends Indexer {
  /**
   * Create a plugin.
   * @constructor
   * @param {Node} node
   */

  constructor(node) {
    // TODO: fix config.filter for index config
    const options = {
      network: node.network,
      client : new NodeClient(node),
      logger: node.logger,
      prefix: node.config.filter('index').prefix,
      memory: node.config.filter('index').bool('memory', node.memory),
      maxFiles: node.config.filter('index').uint('max-files'),
      cacheSize: node.config.filter('index').mb('cache-size'),
      indexTX: node.config.bool('index-tx'),
      indexAddress: node.config.bool('index-address'),
      indexFilters: node.config.bool('index-filters')
    };

    super(options);
  }
}

/**
 * Plugin name.
 * @const {String}
 */

plugin.id = 'indexer';

/**
 * Plugin initialization.
 * @param {Node} node
 * @returns {Plugin}
 */

plugin.init = function init(node) {
  return new Plugin(node);
};
