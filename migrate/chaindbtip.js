'use strict';

const bcoin = require('../');
const assert = require('assert');
const layout = bcoin.blockchain.layout;
const encoding = require('../lib/utils/encoding');
const BufferReader = require('../lib/utils/reader');
const StaticWriter = require('../lib/utils/staticwriter');

let file = process.argv[2];
const tip = process.argv[3];
assert(typeof file === 'string', 'Please pass in a database path.');
assert(typeof tip === 'string', 'Please pass in the tip hash.');

file = file.replace(/\.ldb\/?$/, '');

const db = bcoin.ldb({
  location: file,
  db: 'leveldb',
  compression: true,
  cacheSize: 32 << 20,
  createIfMissing: false,
  bufferKeys: true
});

/**
 * Chain State
 * @alias module:blockchain.ChainState
 * @constructor
 */

function ChainState() {
  this.tip = encoding.NULL_HASH;
  this.tx = 0;
  this.coin = 0;
  this.value = 0;
  this.committed = false;
}

ChainState.prototype.commit = function commit(hash) {
  if (typeof hash !== 'string')
    hash = hash.toString('hex');
  this.tip = hash;
  this.committed = true;
  return this.toRaw();
};

ChainState.prototype.toRaw = function toRaw() {
  const bw = new StaticWriter(56);
  bw.writeHash(this.tip);
  bw.writeU64(this.tx);
  bw.writeU64(this.coin);
  bw.writeU64(this.value);
  return bw.render();
};

ChainState.fromRaw = function fromRaw(data) {
  const state = new ChainState();
  const br = new BufferReader(data);
  state.tip = br.readHash('hex');
  state.tx = br.readU64();
  state.coin = br.readU64();
  state.value = br.readU64();
  return state;
};

async function updateChainState() {
  const raw = await db.get(layout.R);
  const state = ChainState.fromRaw(raw);
  db.put(layout.R, state.commit(tip));
  console.log('Updated chain state to tip %s', tip);
};

(async () => {
  await db.open();
  console.log('Opened %s.', file);
  await updateChainState();
  await db.close();
})().then(() => {
  console.log('Migration complete.');
  process.exit(0);
});
