/*!
 * fileloc.js - fileloc object for bcoin
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

/**
 * FileLocation
 * @alias module:utils.FileLocation
 * @constructor
 * @param {Function?} options
 */

function FileLocation(options) {
  if (!(this instanceof FileLocation))
    return new FileLocation(options);

  this.file = null;
  this.offset = 0;
  this.len = 0;
}

module.exports = FileLocation;

