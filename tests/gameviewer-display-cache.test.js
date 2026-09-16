const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  parseGameViewerDisplayCache,
  readGameViewerConfiguredScale
} = require('../electron/virtual-display');

const SAMPLE_CACHE = String.raw`[0]
device_name=\\.\DISPLAY1
monitor_friendly_name=Mi Monitor
width=2560
height=1440
dpi_scale=225
[1]
device_name=\\.\DISPLAY5
monitor_friendly_name=
width=2504
height=2312
dpi_scale=300
`;

test('parses GameViewer display cache sections', () => {
  const entries = parseGameViewerDisplayCache(SAMPLE_CACHE);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].device_name, String.raw`\\.\DISPLAY1`);
  assert.equal(entries[1].dpi_scale, '300');
});

test('reads only the exact UU virtual display scale from the cache', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-display-cache-'));
  const cachePath = path.join(directory, 'cache_setting.ini');
  fs.writeFileSync(cachePath, SAMPLE_CACHE);

  try {
    const result = readGameViewerConfiguredScale(String.raw`\\.\DISPLAY5`, { cachePath });
    assert.equal(result.ok, true);
    assert.equal(result.scale, 300);
    assert.equal(result.deviceName, String.raw`\\.\DISPLAY5`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('does not fall back to a physical display when the virtual entry is absent', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-display-cache-'));
  const cachePath = path.join(directory, 'cache_setting.ini');
  fs.writeFileSync(cachePath, SAMPLE_CACHE.split('[1]')[0]);

  try {
    const result = readGameViewerConfiguredScale(String.raw`\\.\DISPLAY5`, { cachePath });
    assert.equal(result.ok, false);
    assert.equal(result.step, 'scale-config');
    assert.match(result.error, /DISPLAY5/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
