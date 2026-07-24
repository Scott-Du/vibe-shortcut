const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createLatestIntentQueue,
  orderVirtualDisplayProfileIndexes
} = require('../electron/virtual-display');

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

test('a delayed stale callback cannot overwrite the latest display intent', async () => {
  const intents = createLatestIntentQueue();
  const first = intents.begin();
  const second = intents.begin();
  const applied = [];

  const staleResult = await intents.enqueue(first, async () => {
    applied.push('stale');
    return { ok: true };
  });
  const latestResult = await intents.enqueue(second, async () => {
    applied.push('latest');
    return { ok: true };
  });

  assert.equal(staleResult.stale, true);
  assert.equal(latestResult.ok, true);
  assert.deepEqual(applied, ['latest']);
});

test('the latest intent runs after an older operation already in progress', async () => {
  const intents = createLatestIntentQueue();
  const first = intents.begin();
  let releaseFirst;
  let markFirstEntered;
  const firstBlocked = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstEntered = new Promise((resolve) => {
    markFirstEntered = resolve;
  });
  const applied = [];

  const firstOperation = intents.enqueue(first, async () => {
    applied.push('first-start');
    markFirstEntered();
    await firstBlocked;
    applied.push('first-end');
    return { ok: true };
  });
  await firstEntered;

  const second = intents.begin();
  const secondOperation = intents.enqueue(second, async () => {
    applied.push('second');
    return { ok: true };
  });
  releaseFirst();

  await firstOperation;
  const latestResult = await secondOperation;
  assert.equal(latestResult.ok, true);
  assert.deepEqual(applied, ['first-start', 'first-end', 'second']);
});
