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

function FileLocation(file, offset, len) {
  if (!(this instanceof FileLocation))
    return new FileLocation(file, offset, len);

  this.file = file;
  this.offset = offset;
  this.len = len;
}

module.exports = FileLocation;
