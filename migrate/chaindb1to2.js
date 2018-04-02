'use strict';

const assert = require('assert');
const BDB = require('bdb');
const bio = require('bufio');
const networks = require('../lib/protocol/networks');
const OldCoins = require('./coins-old');
const Coins = require('../lib/coins/coins');
const UndoCoins = require('../lib/coins/undocoins');
const Coin = require('../lib/primitives/coin');
const Output = require('../lib/primitives/output');
const {encoding} = bio;

let file = process.argv[2];
let batch;

assert(typeof file === 'string', 'Please pass in a database path.');

file = file.replace(/\.ldb\/?$/, '');

const db = new BDB({
  location: file,
  db: 'leveldb',
  compression: true,
  cacheSize: 32 << 20,
  createIfMissing: false,
  bufferKeys: true
});

const options = {};
options.spv = process.argv.indexOf('--spv') !== -1;
options.prune = process.argv.indexOf('--prune') !== -1;
options.indexTX = process.argv.indexOf('--index-tx') !== -1;
options.indexAddress = process.argv.indexOf('--index-address') !== -1;
options.network = networks.main;

const index = process.argv.indexOf('--network');

if (index !== -1) {
  options.network = networks[process.argv[index + 1]];
  assert(options.network, 'Invalid network.');
}

async function updateVersion() {
  console.log('Checking version.');

  const data = await db.get('V');

  if (!data)
    throw new Error('No DB version found!');

  let ver = data.readUInt32LE(0, true);

  if (ver !== 1)
    throw Error(`DB is version ${ver}.`);

  ver = Buffer.allocUnsafe(4);
  ver.writeUInt32LE(2, 0, true);
  batch.put('V', ver);
}

async function checkTipIndex() {
  const keys = await db.keys({
    gte: pair('p', encoding.ZERO_HASH),
    lte: pair('p', encoding.MAX_HASH)
  });

  if (keys.length === 0) {
    console.log('No tip index found.');
    console.log('Please run migrate/ensure-tip-index.js first!');
    process.exit(1);
    return undefined;
  }

  if (keys.length < 3) {
    console.log('Note: please run ensure-tip-index.js if you haven\'t yet.');
    return new Promise(r => setTimeout(r, 2000));
  }

  return undefined;
}

async function updateOptions() {
  if (await db.has('O'))
    return;

  if (process.argv.indexOf('--network') === -1) {
    console.log('Warning: no options found in chaindb.');
    console.log('Make sure you selected the correct options');
    console.log('which may include any of:');
    console.log('`--network [name]`, `--spv`, `--witness`,');
    console.log('`--prune`, `--index-tx`, and `--index-address`.');
    console.log('Continuing migration in 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));
  }

  batch.put('O', defaultOptions());
}

async function updateDeployments() {
  if (await db.has('v'))
    return;

  if (process.argv.indexOf('--network') === -1) {
    console.log('Warning: no deployment table found.');
    console.log('Make sure `--network` is set properly.');
    console.log('Continuing migration in 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));
  }

  batch.put('v', defaultDeployments());
}

async function reserializeCoins() {
  let total = 0;

  const iter = db.iterator({
    gte: pair('c', encoding.ZERO_HASH),
    lte: pair('c', encoding.MAX_HASH),
    values: true
  });

  while (await iter.next()) {
    const {key, value} = iter;
    const hash = key.toString('hex', 1, 33);
    const old = OldCoins.fromRaw(value, hash);

    const coins = new Coins();
    coins.version = old.version;
    coins.hash = old.hash;
    coins.height = old.height;
    coins.coinbase = old.coinbase;

    for (let i = 0; i < old.outputs.length; i++) {
      const coin = old.get(i);

      if (!coin) {
        coins.outputs.push(null);
        continue;
      }

      const output = new Output();
      output.script = coin.script;
      output.value = coin.value;

      if (!output.script.isUnspendable())
        coins.addOutput(coin.index, output);
    }

    coins.cleanup();

    batch.put(key, coins.toRaw());

    if (++total % 100000 === 0)
      console.log('Reserialized %d coins.', total);
  }

  console.log('Reserialized %d coins.', total);
}

async function reserializeUndo() {
  let total = 0;

  const iter = db.iterator({
    gte: pair('u', encoding.ZERO_HASH),
    lte: pair('u', encoding.MAX_HASH),
    values: true
  });

  for (;;) {
    const item = await iter.next();

    if (!item)
      break;

    const br = bio.read(item.value);
    const undo = new UndoCoins();

    while (br.left()) {
      undo.push(null);
      injectCoin(undo.top(), Coin.fromReader(br));
    }

    batch.put(item.key, undo.toRaw());

    if (++total % 10000 === 0)
      console.log('Reserialized %d undo coins.', total);
  }

  console.log('Reserialized %d undo coins.', total);
}

function write(data, str, off) {
  if (Buffer.isBuffer(str))
    return str.copy(data, off);
  return data.write(str, off, 'hex');
}

function pair(prefix, hash) {
  const key = Buffer.allocUnsafe(33);
  if (typeof prefix === 'string')
    prefix = prefix.charCodeAt(0);
  key[0] = prefix;
  write(key, hash, 1);
  return key;
}

function injectCoin(undo, coin) {
  const output = new Output();

  output.value = coin.value;
  output.script = coin.script;

  undo.output = output;
  undo.version = coin.version;
  undo.height = coin.height;
  undo.coinbase = coin.coinbase;
}

function defaultOptions() {
  const bw = bio.write();
  let flags = 0;

  if (options.spv)
    flags |= 1 << 0;

  flags |= 1 << 1;

  if (options.prune)
    flags |= 1 << 2;

  if (options.indexTX)
    flags |= 1 << 3;

  if (options.indexAddress)
    flags |= 1 << 4;

  bw.writeU32(options.network.magic);
  bw.writeU32(flags);
  bw.writeU32(0);

  return bw.render();
}

function defaultDeployments() {
  const bw = bio.write();

  bw.writeU8(options.network.deploys.length);

  for (let i = 0; i < options.network.deploys.length; i++) {
    const deployment = options.network.deploys[i];
    bw.writeU8(deployment.bit);
    bw.writeU32(deployment.startTime);
    bw.writeU32(deployment.timeout);
  }

  return bw.render();
}

(async () => {
  await db.open();
  console.log('Opened %s.', file);
  batch = db.batch();
  await updateVersion();
  await checkTipIndex();
  await updateOptions();
  await updateDeployments();
  await reserializeCoins();
  await reserializeUndo();
  await batch.write();
})().then(() => {
  console.log('Migration complete.');
  process.exit(0);
});
