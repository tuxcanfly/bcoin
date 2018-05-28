/*!
 * plugin.js - addrindexer plugin for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const AddrIndexer = require('./addrindexer');
const NodeClient = require('../nodeclient');

/**
 * @exports plugin
 */

const plugin = exports;

/**
 * Plugin
 * @extends Index
 */

class Plugin extends AddrIndexer {
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
      cacheSize: node.config.filter('index').mb('cache-size')
    };

    super(options);
  }
}

/**
 * Plugin name.
 * @const {String}
 */

plugin.id = 'addrindexer';

/**
 * Plugin initialization.
 * @param {Node} node
 * @returns {Plugin}
 */

plugin.init = function init(node) {
  return new Plugin(node);
};
