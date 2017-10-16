'use strict';

const bcoin = require('../');
const fs = require('fs');
const assert = require('assert');
const BlockIO = require('../lib/utils/blockio');
const BlockStream = require('../lib/utils/blockstream');

const location = process.argv[2];
assert(typeof location === 'string', 'Please pass in a blocks path.');

const blockio = BlockIO({
  location: location,
  maxFileSize: 512 * 1024 * 1024,
  network: 'simnet'
});

const blockstream = new BlockStream({network: 'simnet'});

blockstream.on('data', (chunk) => {
  const b = bcoin.block.fromRaw(chunk);
  console.log(b.rhash());
});

const end = new Promise((resolve, reject) => {
    blockstream.on('end', () => resolve());
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
  await blockio.open();
  console.log('Opened %s.', location);
  await importflatfiles();
  await blockio.close();
})().then(() => {
  console.log('Migration complete.');
  process.exit(0);
});
