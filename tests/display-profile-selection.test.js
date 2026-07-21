const assert = require('node:assert/strict');
const test = require('node:test');

const { orderVirtualDisplayProfileIndexes } = require('../electron/virtual-display');

test('manual preset selection starts with the configured resolution', () => {
  assert.deepEqual(
    orderVirtualDisplayProfileIndexes(2, {
      rememberedIndex: 1,
      preferSession: false,
      allowFallback: true
    }),
    [0, 1]
  );
});

test('automatic restore can reuse the compatible session resolution', () => {
  assert.deepEqual(
    orderVirtualDisplayProfileIndexes(2, {
      rememberedIndex: 1,
      preferSession: true,
      allowFallback: true
    }),
    [1, 0]
  );
});

test('an explicit retry candidate remains authoritative', () => {
  assert.deepEqual(
    orderVirtualDisplayProfileIndexes(3, {
      requestedIndex: 2,
      rememberedIndex: 1,
      preferSession: true,
      allowFallback: false
    }),
    [2]
  );
});
