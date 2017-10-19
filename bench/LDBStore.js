'use strict';

const assert = require('../test/util/assert');
const bench = require('./bench');
const networks = require('../lib/protocol/networks');
const createStore = require('../lib/blockchain/store');
const Network = require('../lib/protocol/network');
const LDB = require('../lib/db/ldb');
const CacheDB = require('../lib/db/cachedb');

const TESTDB = './store-test';

let db = new LDB({
  'location': TESTDB,
  'db': 'leveldb',
  'network': 'simnet',
  'flat': true
});

db = new CacheDB(db);
const store = createStore(db, {
  'location': TESTDB,
  'network': Network.get('simnet'),
  'flat': true
});

(async () => {
  await store.open();
  await store.db.open();

  // Read Block
  {
    const hash = networks.main.genesis.hash;
    const block = networks.main.genesisBlock;

    const raw = Buffer.from(block, 'hex');
    const batch = store.db.batch();
    await store.writeBlock(hash, raw, batch);
    await batch.write();
    const expected = await store.readBlock(hash);
    assert.bufferEqual(expected, raw);

    const end = bench('read block');
    for (let i = 0; i < 1000000; i++) {
      await store.readBlock(hash);
    }
    end(1000000);
  }

  await store.db.close();
  await store.db.destroy();
})();
