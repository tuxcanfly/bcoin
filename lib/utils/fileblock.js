/*!
 * fileblock.js - fileblock object for bcoin
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const StaticWriter = require('../utils/staticwriter');

/**
 * FileBlock
 * @alias module:utils.FileBlock
 * @constructor
 * @param {Function?} options
 */

function FileBlock(block, network) {
  if (!(this instanceof FileBlock))
    return new FileBlock(block, network);

  this.block = block;
  this.network = network;
}

FileBlock.prototype.toRaw = function toRaw() {
  const bw = new StaticWriter(this.block.length + 12);
  bw.writeU32(this.network.magic);
  bw.writeU32(this.block.length);
  bw.writeBytes(this.block);
  // TODO: implement checksum
  const checksum = 0x00;
  bw.writeU32(checksum);
  return bw.render();
};

module.exports = FileBlock;
