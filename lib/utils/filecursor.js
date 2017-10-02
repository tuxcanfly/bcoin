/*!
 * filecursor.js - filecursor object for bcoin
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const fs = require('../utils/fs');

/**
 * FileCursor
 * @alias module:utils.FileCursor
 * @constructor
 * @param {Function?} options
 */

function FileCursor(file) {
  if (!(this instanceof FileCursor))
    return new FileCursor(file);

  this.file = file || 0;
  this.fd = fs.openSync(this.file, 'w');
  this.offset = 0;
}

FileCursor.prototype.rollover = async function rollover() {
  await fs.close(this.fd);
  this.file++;
  const fd = await fs.open(this.file, 'w');
  this.fd = fd;
  this.offset = 0;
};

/*
 * Expose
 */

module.exports = FileCursor;
