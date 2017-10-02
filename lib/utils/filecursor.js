/*!
 * filecursor.js - filecursor object for bcoin
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

/**
 * FileCursor
 * @alias module:utils.FileCursor
 * @constructor
 * @param {Function?} options
 */

function FileCursor(options) {
  if (!(this instanceof FileCursor))
    return new FileCursor(options);

  this.fd = null;
  this.file = 0;
}

FileCursor.prototype.rollover = function rollover() {
};

/*
 * Expose
 */

module.exports = FileCursor;
