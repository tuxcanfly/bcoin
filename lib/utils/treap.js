/*!
 * treap.js - treap
 * Copyright (c) 2016-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
let SENTINEL;

/**
 * A treap.
 * @alias module:utils.Treap
 * @constructor
 * @param {Function} compare - Comparator.
 * @param {Boolean?} unique
 */

function Treap(compare, unique) {
  if (!(this instanceof Treap))
    return new Treap(compare, unique);

  assert(typeof compare === 'function');

  this.root = SENTINEL;
  this.compare = compare;
  this.unique = unique || false;
}

/**
 * Clear the treap.
 */

Treap.prototype.reset = function reset() {
  this.root = SENTINEL;
};

/**
 * Treap Node
 * @constructor
 * @ignore
 * @private
 * @param {Buffer} key
 * @param {Buffer} value
 * @param {Number} priority
 * @property {Buffer} key
 * @property {Buffer} value
 * @property {Number} priority
 * @property {TreapNode|TreapSentinel} left
 * @property {TreapNode|TreapSentinel} right
 */

function TreapNode(key, value, priority) {
  this.key = key;
  this.value = value;
  this.priority = priority;
  this.left = SENTINEL;
  this.right = SENTINEL;
}

// TODO
Treap.prototype.insert = function insert(key, value) {
};

Treap.prototype.remove = function remove(key) {
};

Treap.prototype.snapshot = function snapshot() {
};

SENTINEL = new TreapSentinel();

/**
 * Treap Sentinel Node
 * @constructor
 * @ignore
 * @property {null} key
 * @property {null} value
 * @property {Number} [priority=0]
 * @property {null} parent
 * @property {null} left
 * @property {null} right
 */

function TreapSentinel() {
  this.key = null;
  this.value = null;
  this.priority = 0;
  this.left = null;
  this.right = null;
}

/**
 * Inspect the rbt node.
 * @returns {String}
 */

TreapSentinel.prototype.inspect = function inspect() {
  return 'NIL';
};

/**
 * Test whether the node is a leaf.
 * Always returns true.
 * @returns {Boolean}
 */

TreapSentinel.prototype.isNull = function isNull() {
  return true;
};
