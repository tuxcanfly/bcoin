'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('../lib/utils/fs');
const bench = require('./bench');
const co = require('../lib/utils/co');
const layout = require('../lib/blockchain/layout');
const networks = require('../lib/protocol/networks');
const LevelDOWN = require('leveldown');

const TESTDB = './leveldb-test';

const rm = async (dir) => {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const fp = path.join(dir, file);
    const stat = await fs.lstat(fp);
    if (stat.isDirectory()) {
      rm(fp);
    } else {
      await fs.unlink(fp);
    }
  }
  fs.rmdir(dir);
};

const leveldb = new LevelDOWN(TESTDB);

(async () => {
  const open = co.promisify(leveldb.open);
  await open.call(leveldb);

  // Write Block
  {
    const key = networks.main.genesis.hash;
    const value = networks.main.genesisBlock;
    const put = co.promisify(leveldb.put);

    const end = bench('write block');

    for (let i = 0; i < 1000000; i++) {
      await put.call(leveldb, key, value);
    }

    end(1000000);
  }

  // Read Block
  {
    const key = layout.b(networks.main.genesis.hash);
    const value = networks.main.genesisBlock;

    const put = co.promisify(leveldb.put);
    const get = co.promisify(leveldb.get);

    const end = bench('read block');
    await put.call(leveldb, key, value);
    const expected = await get.call(leveldb, key);
    assert.strictEqual(expected.toString(), value);

    for (let i = 0; i < 1000000; i++) {
      await get.call(leveldb, key);
    }

    end(1000000);
  }

  const close = co.promisify(leveldb.close);
  await close.call(leveldb);

  await rm(TESTDB);
})();
