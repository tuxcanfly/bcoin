'use strict';

const bcoin = require('../..');
const fs = require('bfile');
const Logger = require('blgr');

// Setup logger to see what's Bcoin doing.
const logger = new Logger({
  level: 'info'
});

// Create chain for testnet, stored in memory by default.
// To store the chain on disk at the `prefix` location,
// set `memory: false`.
const chain = new bcoin.Chain({
  logger: logger,
  memory: true,
  network: 'testnet'
});

const mempool = new bcoin.Mempool({ chain: chain });

// Create a network pool of peers with a limit of 8 peers.
const pool = new bcoin.Pool({
  chain: chain,
  mempool: mempool,
  maxPeers: 8
});

// Create a chain indexer which indexes tx by hash
const indexer = new bcoin.TXIndexer({
  logger: logger,
  memory: true,
  network: 'testnet',
  chain: chain
});

// Open the chain, pool and indexer
(async function() {
  await logger.open();

  await pool.open();

  // Connect, start retrieving and relaying txs
  await pool.connect();

  // Start the blockchain sync.
  pool.startSync();

  await chain.open();

  await indexer.open();

  console.log('Current height:', chain.height);

  // Watch the action
  chain.on('block', (block) => {
    console.log('block: %s', block.rhash());
  });

  mempool.on('tx', (tx) => {
    console.log('tx: %s', tx.rhash);
  });

  pool.on('tx', (tx) => {
    console.log('tx: %s', tx.rhash);
  });

  await new Promise(r => setTimeout(r, 300));

  await pool.stopSync();

  const tip = await indexer.getTip();
  const block = await chain.getBlock(tip.hash);
  const meta = await indexer.getMeta(block.txs[0].hash());
  const tx = meta.tx;
  const view = await indexer.getSpentView(tx);

  console.log(`Tx with hash ${tx.rhash()}:`, meta);
  console.log(`Tx input: ${tx.getInputValue(view)},` +
    ` output: ${tx.getOutputValue()}, fee: ${tx.getFee(view)}`);

  await indexer.close();
  await chain.close();
  await pool.close();
})();

(async () => {
  // Ensure the directory exists if we are writing to disk
  if (!chain.options.memory)
    await fs.mkdirp(chain.options.prefix);

  await chain.open();

  // Connect the blockchain to the network
  await pool.open();
  await pool.connect();
  pool.startSync();

  // Monitor blockchain height and react when we hit the target
  chain.on('connect', async (entry, block) => {
    const height = entry.height;
    console.log(
      `Height: ${chain.height} ` +
      `Block: ${entry.rhash()} ` +
      `TXs: ${block.txs.length}`
    );

    if (height === 1000) {
      const entry = await chain.getEntry(1000);
      console.log('Block at height 1000:\n', entry);

      // testnet tx at height 500
      const txhash =
        'fc407d7a3b819daa5cf1ecc2c2a4b103c3782104d1425d170993bd534779a0da';
      const txhashBuffer = Buffer.from(txhash, 'hex').reverse();

      const txmeta = await chain.db.getMeta(txhashBuffer);
      const tx = txmeta.tx;
      const coinview = await chain.db.getSpentView(tx);

      console.log(`Tx with hash ${txhash}:\n`, txmeta);
      console.log(
        `\n  Input value: ${tx.getInputValue(coinview)}` +
        `\n  Output value: ${tx.getOutputValue()}` +
        `\n  Fee: ${tx.getFee(coinview)}`
      );

      // testnet block at height 800
      const hash =
        Buffer.from(
          '000000004df86f64cca38c6587df348e0c6849ebee628b3f840f552c707cc862',
          'hex'
        );
      // chainDB indexes blocks by the REVERSE (little endian) hash
      const block = await chain.getBlock(hash.reverse());
      console.log(`Block with hash ${hash.toString('hex')}:`, block);

      process.exit(1);
    }
  });
})().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
