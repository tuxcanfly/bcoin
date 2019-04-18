/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('./util/assert');
const reorg = require('./util/reorg');
const Script = require('../lib/script/script');
const Opcode = require('../lib/script/opcode');
const Address = require('../lib/primitives/address');
const Chain = require('../lib/blockchain/chain');
const WorkerPool = require('../lib/workers/workerpool');
const Miner = require('../lib/mining/miner');
const MemWallet = require('./util/memwallet');
const TXIndexer = require('../lib/indexer/txindexer');
const AddrIndexer = require('../lib/indexer/addrindexer');
const BlockStore = require('../lib/blockstore/level');
const FullNode = require('../lib/node/fullnode');
const Network = require('../lib/protocol/network');
const network = Network.get('regtest');
const {NodeClient, WalletClient} = require('bclient');
const {forValue} = require('./util/common');

const vectors = [
  // Secret for the public key vectors:
  // cVDJUtDjdaM25yNVVDLLX3hcHUfth4c7tY3rSc4hy9e8ibtCuj6G
  {
    addr: 'bcrt1qngw83fg8dz0k749cg7k3emc7v98wy0c7azaa6h',
    amount: 19.99,
    label: 'p2wpkh'
  },
  {
    addr: 'muZpTpBYhxmRFuCjLc7C6BBDF32C8XVJUi',
    amount: 1.99,
    label: 'p2pkh'
  },
  // Secrets for 1 of 2 multisig vectors:
  // cVDJUtDjdaM25yNVVDLLX3hcHUfth4c7tY3rSc4hy9e8ibtCuj6G
  // 93KCDD4LdP4BDTNBXrvKUCVES2jo9dAKKvhyWpNEMstuxDauHty
  {
    addr: 'bcrt1q2nj8e2nhmsa4hl9qw3xas7l5n2547h5uhlj47nc3pqfxaeq5rtjs9g328g',
    amount: 0.99,
    label: 'p2wsh'
  },
  {
    addr: '2Muy8nSQaMsMFAZwPyiXSEMTVFJv9iYuhwT',
    amount: 0.11,
    label: 'p2sh'
  }
];

const workers = new WorkerPool({
  enabled: true
});

const blocks = new BlockStore({
  memory: true,
  network
});

const chain = new Chain({
  memory: true,
  network,
  workers,
  blocks
});

const miner = new Miner({
  chain,
  version: 4,
  workers
});

const cpu = miner.cpu;

const wallet = new MemWallet({
  network
});

const txindexer = new TXIndexer({
  memory: true,
  network,
  chain,
  blocks
});

const addrindexer = new AddrIndexer({
  memory: true,
  network,
  chain,
  blocks
});

describe('Indexer', function() {
  this.timeout(120000);

  before(async () => {
    await blocks.open();
    await chain.open();
    await miner.open();
    await txindexer.open();
    await addrindexer.open();
  });

  after(async () => {
    await blocks.close();
    await chain.close();
    await miner.close();
    await txindexer.close();
    await addrindexer.close();
  });

  describe('Unit', function() {
    it('should not index transaction w/ invalid address', async () => {
      const indexer = new AddrIndexer({
        blocks: {},
        chain: {}
      });

      const ops = [];

      indexer.put = (key, value) => ops.push([key, value]);
      indexer.del = (key, value) => ops.push([key, value]);

      // Create a witness program version 1 with
      // 40 byte data push.
      const script = new Script();
      script.push(Opcode.fromSmall(1));
      script.push(Opcode.fromData(Buffer.alloc(40)));
      script.compile();
      const addr = Address.fromScript(script);

      const tx = {
        getAddresses: () => [addr],
        hash: () => Buffer.alloc(32)
      };

      const entry = {height: 323549};
      const block = {txs: [tx]};
      const view = {};

      indexer.indexBlock(entry, block, view);
      indexer.unindexBlock(entry, block, view);

      assert.equal(ops.length, 0);
    });

    it('should index transaction w/ valid address', async () => {
      const indexer = new AddrIndexer({
        blocks: {},
        chain: {}
      });

      const ops = [];

      indexer.put = (key, value) => ops.push([key, value]);
      indexer.del = (key, value) => ops.push([key, value]);

      // Create a witness program version 0 with
      // 20 byte data push.
      const script = new Script();
      script.push(Opcode.fromSmall(0));
      script.push(Opcode.fromData(Buffer.alloc(20)));
      script.compile();
      const addr = Address.fromScript(script);

      const tx = {
        getAddresses: () => [addr],
        hash: () => Buffer.alloc(32)
      };

      const entry = {height: 323549};
      const block = {txs: [tx]};
      const view = {};

      indexer.indexBlock(entry, block, view);
      indexer.unindexBlock(entry, block, view);

      assert.equal(ops.length, 6);
    });

    it('should error with limits', async () => {
      const indexer = new AddrIndexer({
        blocks: {},
        chain: {},
        maxTxs: 10
      });

      await assert.asyncThrows(async () => {
        await indexer.getHashesByAddress(vectors[0].addr, {limit: 11});
      }, 'Limit above max');
    });
  });

  describe('Index 10 blocks', function() {
    let addr = null;

    before(async () => {
      miner.addresses.length = 0;
      miner.addAddress(wallet.getReceive());

      addr = miner.getAddress();

      for (let i = 0; i < 10; i++) {
        const block = await cpu.mineBlock();
        assert(block);
        assert(await chain.add(block));
      }

      assert.strictEqual(chain.height, 10);
      assert.strictEqual(txindexer.height, 10);
      assert.strictEqual(addrindexer.height, 10);
    });

    it('should get txs by address', async () => {
      const hashes = await addrindexer.getHashesByAddress(miner.getAddress());
      assert.strictEqual(hashes.length, 10);
    });

    it('should get txs by address (limit)', async () => {
      const hashes = await addrindexer.getHashesByAddress(addr, {limit: 1});
      assert.strictEqual(hashes.length, 1);
    });

    it('should get txs by address (reverse)', async () => {
      const hashes = await addrindexer.getHashesByAddress(
        addr, {reverse: false});

      assert.strictEqual(hashes.length, 10);

      const reversed = await addrindexer.getHashesByAddress(
        addr, {reverse: true});

      assert.strictEqual(reversed.length, 10);

      for (let i = 0; i < 10; i++)
        assert.deepEqual(hashes[i], reversed[9 - i]);
    });

    it('should get txs by address after txid', async () => {
      const hashes = await addrindexer.getHashesByAddress(addr, {limit: 5});

      assert.strictEqual(hashes.length, 5);

      const txid = hashes[4];

      const next = await addrindexer.getHashesByAddress(
        addr, {after: txid, limit: 5});

      assert.strictEqual(next.length, 5);

      const all = await addrindexer.getHashesByAddress(addr);
      assert.strictEqual(all.length, 10);

      assert.deepEqual(hashes.concat(next), all);
    });

    it('should get txs by address after txid (reverse)', async () => {
      const hashes = await addrindexer.getHashesByAddress(
        addr, {limit: 5, reverse: true});

      assert.strictEqual(hashes.length, 5);

      const txid = hashes[4];

      const next = await addrindexer.getHashesByAddress(
        addr, {after: txid, limit: 5, reverse: true});

      assert.strictEqual(next.length, 5);

      const all = await addrindexer.getHashesByAddress(
        addr, {reverse: true});

      assert.strictEqual(all.length, 10);

      assert.deepEqual(hashes.concat(next), all);
    });

    it('should get tx and meta', async () => {
      const hashes = await addrindexer.getHashesByAddress(addr, {limit: 1});
      assert.equal(hashes.length, 1);
      const hash = hashes[0];

      const tx = await txindexer.getTX(hash);
      const meta = await txindexer.getMeta(hash);

      assert(meta.height);
      assert(meta.block);
      assert(meta.time);

      assert.deepEqual(meta.tx, tx);
    });

    it('should get null if not found for tx and meta', async () => {
      const hash = Buffer.alloc(32);

      const tx = await txindexer.getTX(hash);
      const meta = await txindexer.getMeta(hash);

      assert.strictEqual(tx, null);
      assert.strictEqual(meta, null);
    });
  });

  describe('Rescan and reorg', function() {
    it('should rescan and reindex 10 missed blocks', async () => {
      for (let i = 0; i < 10; i++) {
        const block = await cpu.mineBlock();
        assert(block);
        assert(await chain.add(block));
      }

      assert.strictEqual(chain.height, 20);
      assert.strictEqual(txindexer.height, 20);
      assert.strictEqual(addrindexer.height, 20);

      const hashes = await addrindexer.getHashesByAddress(miner.getAddress());
      assert.strictEqual(hashes.length, 20);

      for (const hash of hashes) {
        const meta = await txindexer.getMeta(hash);
        assert.bufferEqual(meta.tx.hash(), hash);
      }
    });

    it('should handle indexing a reorg', async () => {
      await reorg(chain, cpu, 10);

      assert.strictEqual(txindexer.height, 31);
      assert.strictEqual(addrindexer.height, 31);

      const hashes = await addrindexer.getHashesByAddress(miner.getAddress());
      assert.strictEqual(hashes.length, 31);

      for (const hash of hashes) {
        const meta = await txindexer.getMeta(hash);
        assert.bufferEqual(meta.tx.hash(), hash);
      }
    });
  });

  describe('HTTP', function() {
    this.timeout(120000);

    let node, nclient, wclient = null;

    const confirmed = [];
    const unconfirmed = [];

    const ports = {
      p2p: 49331,
      node: 49332,
      wallet: 49333
    };

    function sanitize(txs) {
      return txs.map((tx) => {
        // Remove mtime from the results for deep
        // comparisons as it can be variable.
        delete tx.mtime;
        return tx;
      });
    }

    before(async () => {
      this.timeout(120000);

      // Setup a testing node with txindex and addrindex
      // both enabled.
      node = new FullNode({
        network: 'regtest',
        apiKey: 'foo',
        walletAuth: true,
        memory: true,
        workers: true,
        indexTX: true,
        indexAddress: true,
        port: ports.p2p,
        httpPort: ports.node,
        plugins: [require('../lib/wallet/plugin')],
        env: {
          'BCOIN_WALLET_HTTP_PORT': ports.wallet.toString()
        }
      });

      await node.open();

      // Setup the node client to make calls to the node
      // to generate blocks and other tasks.
      nclient = new NodeClient({
        port: ports.node,
        apiKey: 'foo',
        timeout: 120000
      });

      await nclient.open();

      // Setup a test wallet to generate transactions for
      // testing various scenarios.
      wclient = new WalletClient({
        port: ports.wallet,
        apiKey: 'foo',
        timeout: 120000
      });

      await wclient.open();

      // Generate initial set of transactions and
      // send the coinbase to alice.
      const coinbase = await wclient.execute(
        'getnewaddress', ['default']);

      const blocks = await nclient.execute(
        'generatetoaddress', [150, coinbase]);

      assert.equal(blocks.length, 150);

      // Send to the vector addresses for several blocks.
      for (let i = 0; i < 10; i++) {
        for (const v of vectors) {
          const txid = await wclient.execute(
            'sendtoaddress', [v.addr, v.amount]);

          confirmed.push(txid);
        }

        const blocks = await nclient.execute(
          'generatetoaddress', [1, coinbase]);

        assert.equal(blocks.length, 1);
      }

      await forValue(node.chain, 'height', 160);

      // Send unconfirmed to the vector addresses.
      for (let i = 0; i < 5; i++) {
        for (const v of vectors) {
          const txid = await wclient.execute(
            'sendtoaddress', [v.addr, v.amount]);

          unconfirmed.push(txid);
        }
      }

      await forValue(node.mempool.map, 'size', 20);
    });

    after(async () => {
      await nclient.close();
      await wclient.close();
      await node.close();
    });

    for (const v of vectors) {
      it(`txs by ${v.label} addr`, async () => {
        const res = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {});

        assert.equal(res.length, 15);

        for (let i = 0; i < 10; i++)
          assert(confirmed.includes(res[i].hash));

        for (let i = 10; i < 15; i++)
          assert(unconfirmed.includes(res[i].hash));
      });

      it(`txs by ${v.label} addr (limit)`, async () => {
        const res = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 3});

        assert.equal(res.length, 3);

        for (const tx of res)
          assert(confirmed.includes(tx.hash));
      });

      it(`txs by ${v.label} addr (limit w/ unconf)`, async () => {
        const res = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 11});

        assert.equal(res.length, 11);

        for (let i = 0; i < 10; i++)
          assert(confirmed.includes(res[i].hash));

        for (let i = 10; i < 11; i++)
          assert(unconfirmed.includes(res[i].hash));
      });

      it(`txs by ${v.label} addr (reverse)`, async () => {
        const asc = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {reverse: false});

        assert.equal(asc.length, 15);

        const dsc = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {reverse: true});

        assert.equal(dsc.length, 15);

        for (let i = 0; i < 10; i++)
          assert(confirmed.includes(asc[i].hash));

        for (let i = 10; i < 15; i++)
          assert(unconfirmed.includes(asc[i].hash));

        // Check the the results are reverse
        // of each other.
        for (let i = 0; i < dsc.length; i++) {
          const atx = asc[i];
          const dtx = dsc[dsc.length - i - 1];
          assert.equal(atx.hash, dtx.hash);
        }
      });

      it(`txs by ${v.label} addr (after)`, async () => {
        const one = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 3});
        assert.strictEqual(one.length, 3);

        for (let i = 0; i < 3; i++)
          assert(confirmed.includes(one[i].hash));

        // The after hash is within the
        // confirmed transactions.
        const hash = one[2].hash;

        const two = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {after: hash, limit: 3});
        assert.strictEqual(one.length, 3);

        const all = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 6});
        assert.strictEqual(one.length, 3);

        assert.deepEqual(sanitize(one.concat(two)), sanitize(all));
      });

      it(`txs by ${v.label} addr (after w/ unconf)`, async () => {
        const one = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 11});
        assert.strictEqual(one.length, 11);

        for (let i = 0; i < 10; i++)
          assert(confirmed.includes(one[i].hash));

        for (let i = 10; i < 11; i++)
          assert(unconfirmed.includes(one[i].hash));

        // The after hash is within the
        // unconfirmed transactions.
        const hash = one[10].hash;

        const two = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {after: hash, limit: 1});
        assert.strictEqual(two.length, 1);
        assert(unconfirmed.includes(two[0].hash));

        const all = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 12});
        assert.strictEqual(all.length, 12);

        assert.deepEqual(sanitize(one.concat(two)), sanitize(all));
      });

      it(`txs by ${v.label} addr (after w/ unconf 2)`, async () => {
        const one = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 12});
        assert.strictEqual(one.length, 12);

        for (let i = 0; i < 10; i++)
          assert(confirmed.includes(one[i].hash));

        for (let i = 10; i < 12; i++)
          assert(unconfirmed.includes(one[i].hash));

        const hash = one[11].hash;

        const two = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {after: hash, limit: 10});
        assert.strictEqual(two.length, 3);

        for (let i = 0; i < 3; i++)
          assert(unconfirmed.includes(two[i].hash));

        const all = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 100});
        assert.strictEqual(all.length, 15);

        assert.deepEqual(sanitize(one.concat(two)), sanitize(all));
      });

      it(`txs by ${v.label} addr (after w/ unconf 3)`, async () => {
        const one = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 13});
        assert.strictEqual(one.length, 13);

        for (let i = 0; i < 10; i++)
          assert(confirmed.includes(one[i].hash));

        for (let i = 10; i < 13; i++)
          assert(unconfirmed.includes(one[i].hash));

        const hash = one[12].hash;

        const two = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {after: hash, limit: 1});
        assert.strictEqual(two.length, 1);
        assert(unconfirmed.includes(two[0].hash));

        const all = await nclient.request(
          'GET', `/tx/address/${v.addr}`, {limit: 14});
        assert.strictEqual(all.length, 14);

        assert.deepEqual(sanitize(one.concat(two)), sanitize(all));
      });

      it(`txs by ${v.label} addr (after, reverse)`, async () => {
        const one = await nclient.request(
          'GET', `/tx/address/${v.addr}`,
          {limit: 8, reverse: true});

        assert.strictEqual(one.length, 8);

        for (let i = 0; i < 5; i++)
          assert(unconfirmed.includes(one[i].hash));

        for (let i = 5; i < 8; i++)
          assert(confirmed.includes(one[i].hash));

        // The after hash is within the
        // confirmed transactions.
        const hash = one[7].hash;

        const two = await nclient.request(
          'GET', `/tx/address/${v.addr}`,
          {after: hash, limit: 3, reverse: true});

        assert.strictEqual(two.length, 3);

        for (let i = 0; i < 3; i++)
          assert(confirmed.includes(two[i].hash));

        const all = await nclient.request(
          'GET', `/tx/address/${v.addr}`,
          {limit: 11, reverse: true});

        assert.strictEqual(all.length, 11);

        for (let i = 0; i < 5; i++)
          assert(unconfirmed.includes(all[i].hash));

        for (let i = 5; i < 11; i++)
          assert(confirmed.includes(all[i].hash));

        assert.deepEqual(sanitize(one.concat(two)), sanitize(all));
      });

      it(`txs by ${v.label} addr (after, reverse w/ unconf)`, async () => {
        const one = await nclient.request(
          'GET', `/tx/address/${v.addr}`,
          {limit: 5, reverse: true});

        assert.strictEqual(one.length, 5);
        for (let i = 0; i < 5; i++)
          assert(unconfirmed.includes(one[i].hash));

        // The after hash is within the
        // unconfirmed transactions.
        const hash = one[4].hash;

        const two = await nclient.request(
          'GET', `/tx/address/${v.addr}`,
          {after: hash, limit: 3, reverse: true});

        assert.strictEqual(two.length, 3);

        for (let i = 0; i < 3; i++)
          assert(confirmed.includes(two[i].hash));

        const all = await nclient.request(
          'GET', `/tx/address/${v.addr}`,
          {limit: 8, reverse: true});

        assert.strictEqual(all.length, 8);

        for (let i = 0; i < 5; i++)
          assert(unconfirmed.includes(all[i].hash));

        for (let i = 5; i < 8; i++)
          assert(confirmed.includes(all[i].hash));

        assert.deepEqual(sanitize(one.concat(two)), sanitize(all));
      });

      it(`txs by ${v.label} addr (after, reverse w/ unconf 2)`, async () => {
        const one = await nclient.request(
          'GET', `/tx/address/${v.addr}`,
          {limit: 3, reverse: true});

        assert.strictEqual(one.length, 3);
        for (let i = 0; i < 3; i++)
          assert(unconfirmed.includes(one[i].hash));

        const hash = one[2].hash;

        const two = await nclient.request(
          'GET', `/tx/address/${v.addr}`,
          {after: hash, limit: 1, reverse: true});

        assert.strictEqual(two.length, 1);
        assert(unconfirmed.includes(two[0].hash));

        const all = await nclient.request(
          'GET', `/tx/address/${v.addr}`,
          {limit: 4, reverse: true});

        assert.strictEqual(all.length, 4);

        for (let i = 0; i < 4; i++)
          assert(unconfirmed.includes(all[i].hash));

        assert.deepEqual(sanitize(one.concat(two)), sanitize(all));
      });
    }

    describe('Errors', function() {
      it('will give error if limit is exceeded', async () => {
        await assert.asyncThrows(async () => {
          await nclient.request(
            'GET', `/tx/address/${vectors[0].addr}`, {limit: 101});
        }, 'Limit above max');
      });

      it('will give error with invalid after hash', async () => {
        await assert.asyncThrows(async () => {
          await nclient.request(
            'GET', `/tx/address/${vectors[0].addr}`, {after: 'deadbeef'});
        });
      });

      it('will give error with invalid reverse', async () => {
        await assert.asyncThrows(async () => {
          await nclient.request(
            'GET', `/tx/address/${vectors[0].addr}`, {reverse: 'sure'});
        });
      });
    });
  });
});
