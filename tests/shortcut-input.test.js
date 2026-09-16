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

test('Ctrl+U produces a complete key down and key up chord', () => {
  assert.deepEqual(shortcutToNativeEvents('Ctrl+U'), [
    { vk: 0x11, up: false, extended: false },
    { vk: 0x55, up: false, extended: false },
    { vk: 0x55, up: true, extended: false },
    { vk: 0x11, up: true, extended: false }
  ]);
});

test('native sender is selected for Win and modifier-only shortcuts', () => {
  assert.equal(shortcutNeedsNativeSender('Ctrl+Win'), true);
  assert.equal(shortcutNeedsNativeSender('Ctrl+Alt'), true);
  assert.equal(shortcutNeedsNativeSender('Ctrl+I'), false);
});

test('Doubao voice keeps its RPC route after changing the shortcut', () => {
  assert.equal(isDoubaoVoiceShortcut('Ctrl+Win', { kind: 'voice', label: '豆包' }), true);
  assert.equal(isDoubaoVoiceShortcut('Control+Meta', { kind: 'voice', label: 'Doubao Input' }), true);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+Win', { kind: 'voice', label: '闪电说' }), false);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+Win', { kind: 'button', label: '豆包' }), false);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+U', { kind: 'voice', label: '豆包' }), true);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+Win+Shift', { kind: 'voice', label: '豆包' }), true);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+U', { kind: 'voice', label: '微信输入法' }), false);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+U', { kind: 'button', label: '豆包' }), false);
  assert.equal(isDoubaoVoiceShortcut('', { kind: 'voice', label: '豆包' }), false);
  assert.equal(isDoubaoVoiceShortcut('Ctrl+U', null), false);
});
