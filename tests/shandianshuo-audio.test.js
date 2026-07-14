const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  formatCaptureDeviceName,
  parseRecordingState,
  readAudioDeviceConfig,
  writeAudioDeviceConfig
} = require('../electron/shandianshuo-audio');

test('formats Windows capture endpoint names like Shandianshuo', () => {
  assert.equal(
    formatCaptureDeviceName('麦克风阵列', '网易虚拟音频设备'),
    '麦克风阵列 (网易虚拟音频设备)'
  );
  assert.equal(formatCaptureDeviceName('麦克风', '麦克风'), '麦克风');
});

test('detects the latest recording state from Shandianshuo logs', () => {
  const started = 'INFO Recording started - session_id: abc';
  const stopped = 'INFO Recording stopped - duration: 1000ms';
  assert.equal(parseRecordingState(`${started}\n${stopped}`), 'idle');
  assert.equal(parseRecordingState(`${stopped}\n${started}`), 'recording');
  assert.equal(parseRecordingState('INFO application started'), 'idle');
});

test('updates only audio_device and preserves unknown Shandianshuo settings', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-shortcut-audio-'));
  const configFile = path.join(directory, 'config.json');
  const original = {
    audio_device: 'system',
    unrelated: { nested: true },
    list: [1, 2, 3]
  };
  fs.writeFileSync(configFile, JSON.stringify(original, null, 2), 'utf8');

  try {
    const result = writeAudioDeviceConfig(configFile, '麦克风阵列 (网易虚拟音频设备)');
    assert.equal(result.ok, true);
    const updated = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.equal(updated.audio_device, '麦克风阵列 (网易虚拟音频设备)');
    assert.deepEqual(updated.unrelated, original.unrelated);
    assert.deepEqual(updated.list, original.list);
    assert.equal(readAudioDeviceConfig(configFile).audioDevice, updated.audio_device);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
