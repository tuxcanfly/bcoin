'use strict';

const bcoin = require('../bcoin');

const CONFIRMATIONS = 2; // set to n-1 for n blocks
const id='primary';
const httpWallet = bcoin.http.Wallet({
  id: id ,
  'network': 'testnet'
});

const rpcClient = new bcoin.http.RPCClient({
  network: 'testnet'
});

(async () => {
  const coins = await httpWallet.getCoins();
  const height = await rpcClient.execute('getblockcount');
  let balance = 0;
  for (const coin of coins) {
    if (height >= coin['height'] + CONFIRMATIONS) {
      balance  += coin['value'];
    }
  }
  console.log(balance);
})();
