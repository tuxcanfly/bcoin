'use strict';

const fs = require('fs');
const assert = require('assert');
const Block = require('../lib/primitives/block');
const BlockIO = require('../lib/utils/blockio');
const BlockStream = require('../lib/utils/blockstream');
const Chain = require('../lib/blockchain/chain');

let location = process.argv[2];
const from = process.argv[3];
assert(typeof location === 'string', 'Please pass in a database path.');
assert(typeof from === 'string', 'Please pass in a blocks path.');

location = location.replace(/\.fdb\/?$/, '');

const chain = new Chain({
  db: 'ffldb',
  location: location,
  network: 'simnet'
});

const blockio = BlockIO({
  location: from,
  network: 'simnet'
});

const blockstream = new BlockStream({network: 'simnet'});

blockstream.on('data', async (chunk) => {
  const block = Block.fromRaw(chunk);
  const hash = block.rhash();
  try {
    await chain.add(block);
    console.log('imported block %s', hash);
  } catch (e) {
    console.warn('%s: ', e);
  }
});

const end = new Promise((resolve, reject) => {
    blockstream.on('close', () => resolve());
    blockstream.on('error', reject);
});

async function importflatfiles() {
  const [file] = await blockio.scanFiles();
  for (let i=0; i <= file; i++) {
    const path = blockio.filepath(i);
    const blockfile = fs.createReadStream(path);
    blockfile.pipe(blockstream);
    await end;
  }
};

(async () => {
  await chain.open();
  console.log('Opened %s.', location);
  await importflatfiles();
  await chain.close();
})().then(() => {
  console.log('Migration complete.');
  process.exit(0);
});
