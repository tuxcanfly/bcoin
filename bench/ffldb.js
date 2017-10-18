'use strict';

const assert = require('../test/util/assert');
const fs = require('../lib/utils/fs');
const path = require('path');
const bench = require('./bench');
const networks = require('../lib/protocol/networks');
const Block = require('../lib/primitives/block');
const FlatFileDB = require('../lib/db/ffldb');
const BlockStream = require('../lib/utils/blockstream');

const TESTDB = './ffldb-test';
const TESTFDB = 'test/data/blocks.fdb';

const ffldb = new FlatFileDB(TESTDB, {'network': 'simnet'});
const keys = [];

const rm = async (dir) => {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const fp = path.join(dir, file);
    const stat = await fs.lstat(fp);
    if (stat.isDirectory()) {
      await rm(fp);
    } else {
      await fs.unlink(fp);
    }
  }
  fs.rmdir(dir);
};

(async () => {
  await ffldb.open();

  // Block
  {
    const key = networks.main.genesis.hash;

    const block = Buffer.from(networks.main.genesisBlock, 'hex');
    await ffldb.putBlock(key, block);

    const expected = await ffldb.getBlock(key);
    assert.bufferEqual(expected, block);

    const end = bench('block');

    for (let i = 0; i < 1000000; i++) {
      await ffldb.getBlock(key);
    }

    end(1000000);
  }

  // Blocks
  {
    const blockstream = new BlockStream({network: 'simnet'});

    const done = new Promise((resolve, reject) => {
      blockstream.on('data', async (chunk) => {
        const block = Block.fromRaw(chunk);
        const hash = block.hash();
        await ffldb.putBlock(hash, block.toRaw());
        keys.push(hash);
      })
      .on('finish', resolve)
      .on('error', reject);
    });

    const blockfile = fs.createReadStream(TESTFDB);
    blockfile.pipe(blockstream);
    await done;

    const end = bench('blocks');

    for (let i = 0; i < 10000; i++) {
      for (const key of keys)
        await ffldb.getBlock(key);
    }

    end(10000);
  }

  await ffldb.close();

  await rm(TESTDB);
})();
