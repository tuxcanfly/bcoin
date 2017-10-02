/*!
 * filecursor.js - filecursor object for bcoin
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const fs = require('../utils/fs');
const util = require('util');
const path = require('path');

/**
 * FileCursor
 * @alias module:utils.FileCursor
 * @constructor
 * @param {Function?} options
 */

function FileCursor(location, file) {
  if (!(this instanceof FileCursor))
    return new FileCursor(location, file);

  this.file = 0;
  this.offset = 0;
  this.location = location;
  this.fd = null;
}

FileCursor.prototype.open = async function open() {
  const filepath =
    path.join(this.location, util.format('%d.fdb', this.file).padStart(13, 0));
  this.fd = fs.openSync(filepath, 'w');
};

FileCursor.prototype.close = async function close() {
  await fs.close(this.fd);
};

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
