const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MODIFIER_ONLY_HOLD_MS,
  isDoubaoVoiceShortcut,
  shortcutNeedsNativeSender,
  shortcutToNativeEvents
} = require('../electron/shortcut-input');

test('modifier-only Ctrl+Win is held before modifiers are released', () => {
  assert.deepEqual(shortcutToNativeEvents('Ctrl+Win'), [
    { vk: 0x11, up: false, extended: false },
    { vk: 0x5b, up: false, extended: true },
    { sleep: MODIFIER_ONLY_HOLD_MS },
    { vk: 0x5b, up: true, extended: true },
    { vk: 0x11, up: true, extended: false }
  ]);
});

test('ordinary shortcuts retain their existing event sequence', () => {
  assert.deepEqual(shortcutToNativeEvents('Ctrl+I'), [
    { vk: 0x11, up: false, extended: false },
    { vk: 0x49, up: false, extended: false },
    { vk: 0x49, up: true, extended: false },
    { vk: 0x11, up: true, extended: false }
  ]);
});

test('native sender is selected for Win and modifier-only shortcuts', () => {
  assert.equal(shortcutNeedsNativeSender('Ctrl+Win'), true);
  assert.equal(shortcutNeedsNativeSender('Ctrl+Alt'), true);
  assert.equal(shortcutNeedsNativeSender('Ctrl+I'), false);
});

test('Doubao RPC is selected only for its Ctrl+Win voice mode', () => {
  assert.equal(isDoubaoVoiceShortcut('Ctrl+Win', { kind: 'voice', label: '豆包' }), true);
  assert.equal(isDoubaoVoiceShortcut('Control+Meta', { kind: 'voice', label: 'Doubao Input' }), true);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+Win', { kind: 'voice', label: '闪电说' }), false);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+Win', { kind: 'button', label: '豆包' }), false);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+Win+Shift', { kind: 'voice', label: '豆包' }), false);
});
