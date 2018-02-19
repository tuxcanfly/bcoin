'use strict';

const bcoin = require('../..');
const Chain = bcoin.Chain;
const Pool = bcoin.Pool;
const WalletDB = bcoin.WalletDB;

bcoin.set('testnet');

// SPV chains only store the chain headers.
const chain = new Chain({
  db: 'leveldb',
  location: process.env.HOME + '/neutrino',
  neutrino: true
});

const pool = new Pool({
  chain: chain,
  neutrino: true,
  maxPeers: 8
});

const walletdb = new WalletDB({ db: 'memory' });

(async () => {
  await pool.open();
  await walletdb.open();

  const wallet = await walletdb.create();

  const address = await wallet.receiveAddress();
  console.log('Created wallet with address %s', address);

  // Add our address to watching outputs.
  pool.watchAddress(address);

  // Connect, start retrieving and relaying txs
  await pool.connect();

  // Start the blockchain sync.
  pool.startSync();

  pool.on('tx', async (tx) => {
    console.log('received TX');

    await walletdb.addTX(tx);
    console.log('Transaction added to walletDB');
  });

  wallet.on('balance', (balance) => {
    console.log('Balance updated.');
    console.log(bcoin.amount.btc(balance.unconfirmed));
  });
})().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
