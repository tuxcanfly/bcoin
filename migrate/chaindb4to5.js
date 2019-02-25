'use strict';

const assert = require('assert');
const bdb = require('bdb');
const layout = require('../lib/blockchain/layout');
const FileBlockStore = require('../lib/blockstore/file');

assert(process.argv.length > 2, 'Please pass in a database path.');

let parent = null;

// migration -
// chaindb: leveldb to flat files

const db = bdb.create({
  location: process.argv[2],
  memory: false,
  compression: true,
  cacheSize: 32 << 20,
  createIfMissing: false
});

const blockStore = new FileBlockStore({
  location: process.argv[2]
});

async function updateVersion() {
  console.log('Checking version.');

  const data = await db.get(layout.V.encode());
  assert(data, 'No version.');

  const ver = data.readUInt32LE(5, true);

  if (ver !== 4)
    throw Error(`DB is version ${ver}.`);

  console.log('Updating version to %d.', ver + 1);

  const buf = Buffer.allocUnsafe(5 + 4);
  buf.write('chain', 0, 'ascii');
  buf.writeUInt32LE(5, 5, true);

  parent.put(layout.V.encode(), buf);
}

async function migrateBlocks() {
  console.log('Migrating blocks');

  const iter = db.iterator({
    gte: layout.b.min(),
    lte: layout.b.max(),
    keys: true,
    values: true
  });

  let total = 0;
  await iter.each(async (key, value) => {
    ++total;
    if (++total % 10 === 0) {
      console.log('Migrated up %d blocks.', total);
    }
    await blockStore.write(key, value);
  });

  total = 0;

  // TODO: journaling state
  while (await iter.next()) {
    const {key} = iter;

    parent.del(key);

    if (++total % 10000 === 0) {
      console.log('Cleaned up %d blocks.', total);
      await parent.write();
      parent = db.batch();
    }
  }
}

/*
 * Execute
 */

(async () => {
  await db.open();
  await blockStore.open();

  console.log('Opened %s.', process.argv[2]);

  parent = db.batch();

  await updateVersion();
  await migrateBlocks();

  await parent.write();
  await db.close();
  await blockStore.close();
})().then(() => {
  console.log('Migration complete.');
  process.exit(0);
}).catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
