/*!
 * layout.js - txindexer layout for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const bdb = require('bdb');

/*
 * TXIndexer Database Layout:
 *  t[hash] -> extended tx
*/

const layout = Object.assign({
  t: bdb.key('t', ['hash256'])
}, require('../layout'));

/*
 * Expose
 */

module.exports = layout;
