'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('../lib/utils/fs');
const bench = require('./bench');
const co = require('../lib/utils/co');
const layout = require('../lib/blockchain/layout');
const networks = require('../lib/protocol/networks');
const FlatFileDB = require('../lib/db/ffldb');

const TESTDB = './ffldb-test';

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

const ffldb = new FlatFileDB(TESTDB);

(async () => {
  const open = co.promisify(ffldb.open);
  try {
    await open.call(ffldb);
  } catch (e) {
    throw e;
  }

  // Block
  {
    const key = layout.b(networks.main.genesis.hash);
    const value = networks.main.genesisBlock;

    const put = co.promisify(ffldb.put);
    const get = co.promisify(ffldb.get);

    const end = bench('block');
    await put.call(ffldb, key, value);
    const expected = await get.call(ffldb, key);
    assert.strictEqual(expected.toString(), value);
    end(1);
  }

  const close = co.promisify(ffldb.close);
  await close.call(ffldb);

  await rm(TESTDB);
})();
