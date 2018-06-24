'use strict';

const assert = require('assert');
const path = require('path');
const bdb = require('bdb');
const fs = require('bfile');
const chainlayout = require('../lib/blockchain/layout');
const indexlayout = require('../lib/indexer/layout.js');
const txindexlayout = require('../lib/indexer/txindexer/layout.js');
const addrindexlayout = require('../lib/indexer/addrindexer/layout.js');
const records = require('../lib/indexer/records');
const Network = require('../lib/protocol/network');
const ChainEntry = require('../lib/blockchain/chainentry');
const TXMeta = require('../lib/primitives/txmeta');
const Block = require('../lib/primitives/block');
const UndoCoins = require('../lib/coins/undocoins');
const CoinView = require('../lib/coins/coinview');

const {
  ChainState,
  BlockMeta
} = records;

// changes:
// removes tx, addr indexes i.e layout.t, layout.T, layout.C

assert(process.argv.length > 2, 'Please pass in a chain database path.');
assert(process.argv.length > 3, 'Please pass in a index database prefix.');
assert(process.argv.length > 4, 'Please pass in network.');

async function ensure(path) {
  return fs.mkdirp(path);
}

const chaindb = bdb.create({
  location: process.argv[2],
  memory: false,
  compression: true,
  cacheSize: 32 << 20,
  createIfMissing: false
});

const txindexdb = bdb.create({
  location: path.join(process.argv[3], 'tx'),
  memory: false,
  compression: true,
  cacheSize: 32 << 20,
  createIfMissing: true
});

const addrindexdb = bdb.create({
  location: path.join(process.argv[3], 'address'),
  memory: false,
  compression: true,
  cacheSize: 32 << 20,
  createIfMissing: true
});

async function removeKey(name, key) {
  const iter = chaindb.iterator({
    gte: key.min(),
    lte: key.max(),
    reverse: true,
    keys: true
  });

  let batch = chaindb.batch();
  let total = 0;

  while (await iter.next()) {
    const {key} = iter;
    batch.del(key);

    if (++total % 10000 === 0) {
      console.log('Cleaned up %d %s index records.', total, name);
      await batch.write();
      batch = chaindb.batch();
    }
  }
  await batch.write();

  console.log('Cleaned up %d %s index records.', total, name);
}

async function verifyNetwork(db, network) {
    const b = db.batch();
    b.put(indexlayout.O.build(), fromU32(network.magic));
    return b.write();
}

async function syncState(db) {
  const hashes = await chaindb.values({
    gte: chainlayout.H.min(),
    lte: chainlayout.H.max(),
    parse: data => data.toString('hex')
  });

  const b = db.batch();

  let tip = null;
  for (let height = 0; height < hashes.length; height++) {
    const hash = hashes[height];
    const meta = new BlockMeta(hash, height);
    b.put(indexlayout.h.build(height), meta.toHash());
    tip = meta;
  }

  assert(tip);

  const state = new ChainState();
  state.startHeight = 0;
  state.height = tip.height;

  b.put(indexlayout.R.build(), state.toRaw());

  await b.write();
}

async function getEntry(height) {
  const data = await chaindb.get(chainlayout.H.build(height));

  if (!data)
    return null;

  const hash = data.toString('hex');

  const raw = await chaindb.get(chainlayout.e.build(hash));

  if (!raw)
    return null;

  return ChainEntry.fromRaw(raw);
}

async function getBlock(hash) {
  const data = await chaindb.get(chainlayout.b.build(hash));

  if (!data)
    return null;

  return Block.fromRaw(data);
}

async function getBlockView(block) {
  const data = await chaindb.get(chainlayout.u.build(block.hash()));

  if (!data)
    return new UndoCoins();

  const undo = UndoCoins.fromRaw(data);
  const view = new CoinView();

  if (undo.isEmpty())
    return view;

  for (let i = block.txs.length - 1; i > 0; i--) {
    const tx = block.txs[i];

    for (let j = tx.inputs.length - 1; j >= 0; j--) {
      const input = tx.inputs[j];
      undo.apply(view, input.prevout);
    }
  }

  // Undo coins should be empty.
  assert(undo.isEmpty(), 'Undo coins data inconsistency.');

  return view;
}

async function indexTX(entry, block, view) {
  const b = txindexdb.batch();

  for (let i = 0; i < block.txs.length; i++) {
    const tx = block.txs[i];
    const hash = tx.hash();
    const meta = TXMeta.fromTX(tx, entry, i);
    b.put(txindexlayout.t.build(hash), meta.toRaw());
  }

  return b.write();
}

async function indexAddress(entry, block, view) {
  const b = addrindexdb.batch();

  for (let i = 0; i < block.txs.length; i++) {
    const tx = block.txs[i];
    const hash = tx.hash();
    for (const addr of tx.getHashes(view))
      b.put(addrindexlayout.T.build(addr, hash), null);

    if (!tx.isCoinbase()) {
      for (const {prevout} of tx.inputs) {
        const {hash, index} = prevout;
        const coin = view.getOutput(prevout);
        assert(coin);

        const addr = coin.getHash();

        if (!addr)
          continue;

        b.del(addrindexlayout.C.build(addr, hash, index));
      }
    }

    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];
      const addr = output.getHash();

      if (!addr)
        continue;

      b.put(addrindexlayout.C.build(addr, hash, i), null);
    }
  }

  return b.write();
}

async function indexChain() {
  for (let i = 0; ; i++) {
    const entry = await getEntry(i);
    if (!entry)
      break;

    const block = await getBlock(entry.hash);
    assert(block);

    const view = await getBlockView(block);
    assert(view);

    if (entry.height % 10000 === 0)
      console.log('indexed block: %d.', entry.height);

    await indexTX(entry, block, view);
    await indexAddress(entry, block, view);
  }
}

function fromU32(num) {
  const data = Buffer.allocUnsafe(4);
  data.writeUInt32LE(num, 0, true);
  return data;
}

/*
 * Execute
 */

(async () => {
  await ensure(process.argv[3]);
  await chaindb.open();

  const network = Network.get(process.argv[4]);

  console.log('Opened %s.', process.argv[2]);
  console.log('Checking version.');
  await chaindb.verify(chainlayout.V.build(), 'chain', 4);

  const t = bdb.key('t', ['hash256']);
  const T = bdb.key('T', ['hash', 'hash256']);
  const C = bdb.key('C', ['hash', 'hash256', 'uint32']);

  await removeKey('hash -> tx', t);
  await removeKey('addr -> tx', T);
  await removeKey('addr -> coin', C);

  console.log('Compacting database...');
  await chaindb.compactRange();

  console.log('Updating version to %d.', 5);
  await chaindb.del(chainlayout.V.build());
  await chaindb.verify(chainlayout.V.build(), 'chain', 5);

  console.log('Indexing chain. This may take a while...');
  // Create index db
  await txindexdb.open();
  await txindexdb.verify(indexlayout.V.build(), 'index', 7);

  await addrindexdb.open();
  await addrindexdb.verify(indexlayout.V.build(), 'index', 7);

  await verifyNetwork(txindexdb, network);
  await verifyNetwork(addrindexdb, network);

  await syncState(txindexdb);
  await syncState(addrindexdb);

  await indexChain();

  console.log('Indexing complete.');

  await chaindb.close();
  await txindexdb.close();
  await addrindexdb.close();
})().then(() => {
  console.log('Migration complete.');
  process.exit(0);
}).catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
