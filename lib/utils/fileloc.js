/*!
 * fileloc.js - fileloc object for bcoin
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const BufferReader = require('../utils/reader');
const StaticWriter = require('../utils/staticwriter');

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

FileLocation.prototype.toRaw = function toRaw() {
  const bw = new StaticWriter(12);
  bw.writeU32(this.file);
  bw.writeU32(this.offset);
  bw.writeU32(this.len);
  return bw.render();
};

FileLocation.prototype.fromRaw = function fromRaw(data) {
  const br = new BufferReader(data);
  const file = br.readU32();
  const offset = br.readU32();
  const len = br.readU32();
  const loc = new FileLocation(file, offset, len);
  return loc;
};

module.exports = FileLocation;
