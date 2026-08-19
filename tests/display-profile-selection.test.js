const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyVirtualDisplayCandidates,
  createDisplayRefreshProfiles,
  createLatestIntentQueue,
  orderVirtualDisplayProfileIndexes,
  refreshVirtualDisplayProfile
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

test('same-orientation restore falls back once without an unsupported priming pulse', async () => {
  const profiles = [
    { width: 2000, height: 1200, orientation: 'portrait' },
    { width: 1920, height: 1200, orientation: 'portrait' }
  ];
  const applied = [];

  const result = await applyVirtualDisplayCandidates(
    profiles,
    [0, 1],
    async (profile, candidateIndex) => {
      applied.push(candidateIndex);
      return candidateIndex === 0
        ? { ok: false, connected: true, step: 'display-test', error: 'DISP_CHANGE_BADMODE' }
        : { ok: true, connected: true, step: 'status', changed: true };
    },
    {
      canContinue: (displayResult) => displayResult.connected
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.candidateIndex, 1);
  assert.equal(result.preset, profiles[1]);
  assert.deepEqual(applied, [0, 1]);
  assert.equal(result.results.length, 2);
});

test('matching preset refreshes through the opposite orientation and returns to target', async () => {
  const profiles = [
    { width: 2000, height: 1200, scale: 200, orientation: 'landscape' },
    { width: 1920, height: 1200, scale: 200, orientation: 'landscape' }
  ];
  const refreshProfiles = createDisplayRefreshProfiles(profiles, 0);
  assert.deepEqual(
    refreshProfiles.map((profile) => [profile.width, profile.height, profile.orientation]),
    [
      [2000, 1200, 'portrait'],
      [1920, 1200, 'portrait'],
      [1920, 1200, 'landscape']
    ]
  );

  const applied = [];
  const result = await refreshVirtualDisplayProfile(
    profiles[0],
    refreshProfiles,
    async (profile, phase) => {
      applied.push([profile.width, profile.height, profile.orientation, phase.transition]);
      return { ok: true, connected: true, step: 'status', changed: true };
    },
    {
      canContinue: () => true
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.refreshed, true);
  assert.deepEqual(applied, [
    [2000, 1200, 'portrait', true],
    [2000, 1200, 'landscape', false]
  ]);
});

test('matching fallback retries a supported opposite-orientation transition', async () => {
  const profiles = [
    { width: 2000, height: 1200, scale: 200, orientation: 'portrait' },
    { width: 1920, height: 1200, scale: 200, orientation: 'portrait' }
  ];
  const refreshProfiles = createDisplayRefreshProfiles(profiles, 1);
  const applied = [];
  const result = await refreshVirtualDisplayProfile(
    profiles[1],
    refreshProfiles,
    async (profile, phase) => {
      applied.push([profile.width, profile.orientation, phase.transition]);
      if (profile.width === 1920 && profile.orientation === 'landscape') {
        return { ok: true, connected: true, step: 'status' };
      }
      if (!phase.transition && profile.width === 1920 && profile.orientation === 'portrait') {
        return { ok: true, connected: true, step: 'status' };
      }
      return { ok: false, connected: true, step: 'display-test', error: 'BADMODE' };
    },
    {
      canContinue: (displayResult) => displayResult.step === 'display-test'
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(applied, [
    [1920, 'landscape', true],
    [1920, 'portrait', false]
  ]);
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
