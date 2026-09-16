const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createOrientationDisplayProfile,
  createLatestIntentQueue
} = require('../electron/virtual-display');

test('orientation profile keeps the connected device dimensions', () => {
  const preset = { id: 'portrait', orientation: 'portrait' };
  assert.deepEqual(
    createOrientationDisplayProfile(preset, { width: 1080, height: 2400 }),
    {
      id: 'portrait',
      orientation: 'portrait',
      width: 2400,
      height: 1080
    }
  );
});

test('orientation profile normalizes a landscape device without changing its dimensions', () => {
  const profile = createOrientationDisplayProfile(
    { id: 'landscape', orientation: 'landscape' },
    { width: 2504, height: 2312 }
  );

  assert.equal(profile.width, 2504);
  assert.equal(profile.height, 2312);
  assert.equal(profile.orientation, 'landscape');
});

test('orientation profile rejects a missing display size', () => {
  assert.equal(createOrientationDisplayProfile({ orientation: 'portrait' }, { width: 0, height: 0 }), null);
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
