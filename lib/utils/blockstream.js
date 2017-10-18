'use strict';

const stream = require('stream');
const util = require('../utils/util');
const Network = require('../protocol/network');

function BlockStream(options) {
  stream.Transform.call(this);

  this.network = Network.primary;
  if (options.network != null)
    this.network = Network.get(options.network);

  const magic = util.revHex(util.hex32(this.network.magic));
  this.delimiter = Buffer.from(magic, 'hex');
  this._stub = Buffer.from('');
};

Object.setPrototypeOf(BlockStream.prototype, stream.Transform.prototype);

BlockStream.prototype._transform = function _transform(chunk, encoding, done) {
  this._stub = Buffer.concat([this._stub, chunk]);

  let start, end = 0;

  for (;;) {
    start = this._stub.indexOf(this.delimiter, start);
    end = this._stub.indexOf(this.delimiter, start+1);

    if (end === -1) {
        this._stub = this._stub.slice(start);
        break;
    }

    this.push(this._stub.slice(start+8, end-4));
    start = end;
  }
  done();
};

BlockStream.prototype._flush = function _flush(done) {
  this.push(this._stub.slice(8, -4));
  done();
};

BlockStream.createBlockStream = function createBlockStream(options) {
  return new BlockStream(options);
};

module.exports = BlockStream;
