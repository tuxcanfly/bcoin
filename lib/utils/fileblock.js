/*!
 * fileblock.js - fileblock object for bcoin
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

/**
 * FileBlock
 * @alias module:utils.FileBlock
 * @constructor
 * @param {Function?} options
 */

function FileBlock(options) {
  if (!(this instanceof FileBlock))
    return new FileBlock(options);

  this.fd = null;
  this.file = 0;
}

FileBlock.prototype.toRaw = function toRaw() {
};

module.exports = FileBlock;
