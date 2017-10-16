'use strict';

const stream = require('stream');
const Network = require('../protocol/network');

function BlockStream(options) {
  stream.Transform.call(this);

  this.network = Network.primary;
  if (options.network != null)
    this.network = Network.get(options.network);

  // this.delimiter = Uint32Array.from(this.network.magic);
  this.delimiter = Uint8Array.from([0x16, 0x1c, 0x14, 0x12]);
  this._chunk = Buffer.from('');
};

Object.setPrototypeOf(BlockStream.prototype, stream.Transform.prototype);

BlockStream.prototype._transform = function _transform(chunk, encoding, done) {
  this._chunk = Buffer.concat([this._chunk, chunk]);
  const start = this._chunk.indexOf(this.delimiter);
  const end = this._chunk.indexOf(this.delimiter, start+1);
  if (start > -1) {
    if (end > -1) {
      this.push(this._chunk.slice(start+8, end-4));
      this._chunk = this._chunk.slice(end);
    } else {
      this._chunk = this._chunk.slice(start);
    }
  }
  done();
};

BlockStream.prototype._flush = function _flush(done) {
  this.push(this._chunk.slice(8, -4));
  done();
};

module.exports = BlockStream;
