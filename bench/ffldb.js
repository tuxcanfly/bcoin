'use strict';

const fs = require('../lib/utils/fs');
const bench = require('./bench');
const FlatFileDB = require('../lib/db/ffldb');
const layout = require('../lib/blockchain/layout');
const networks = require('../lib/protocol/networks');

const ffldb = new FlatFileDB({
  location: './ffldb-test'
});

(async () => {
  // Open and Create
  await ffldb.open();

  // Block Header
  {
    const key = layout.b(networks.main.genesis.hash);
    const value = networks.main.genesisBlock;

    ffldb.put(key, value);
    // dbcache commit

    const end = bench('block header');
    await ffldb.get(layout.b());
    end();
  }

  await fs.unlink('./ffldb-test');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
