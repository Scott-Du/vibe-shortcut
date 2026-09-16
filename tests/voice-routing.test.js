const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function loadMain() {
  const filename = path.resolve(__dirname, '../electron/main.js');
  const mainRequire = createRequire(filename);
  const context = vm.createContext({
    require: (name) => name === 'electron' ? {} : mainRequire(name),
    process, Buffer, setTimeout, clearTimeout
  });
  // Load the real routing/config functions without starting an Electron instance.
  const source = fs.readFileSync(filename, 'utf8').split('const gotSingleInstanceLock =')[0];
  vm.runInContext(source, context, { filename });
  return context;
}

test('a saved custom Doubao mode sends a voice RPC, not simulated Ctrl+U', async () => {
  const main = loadMain();
  const config = main.mergeConfig({
    schemaVersion: 11,
    buttons: [{ id: 'voice', shortcut: 'Ctrl+I' }],
    voiceModes: {
      activeId: 'lightning',
      options: { lightning: { label: '豆包', shortcut: 'Ctrl+U' } }
    }
  });
  assert.equal(config.buttons.find((button) => button.id === 'voice').shortcut, 'Ctrl+U');
  main.findDoubaoRpcPath = () => 'test-rpc.dll';
  const calls = [];
  main.sendInputActions = async (actions) => { calls.push(actions); return { ok: true }; };
  main.sendNativeShortcut = () => assert.fail('Doubao voice must not fall through to simulated keys');
  const active = config.voiceModes.options[config.voiceModes.activeId];
  assert.equal((await main.sendShortcut(active.shortcut, { kind: 'voice', label: active.label })).ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].type, 'doubaoVoice');
});

test('WeChat and ordinary Ctrl+U buttons still use native key injection', async () => {
  const main = loadMain();
  const calls = [];
  main.sendNativeShortcut = async (shortcut) => { calls.push(shortcut); return { ok: true }; };
  main.sendInputActions = () => assert.fail('other providers must not invoke Doubao');
  await main.sendShortcut('Ctrl+U', { kind: 'voice', label: '微信输入法' });
  await main.sendShortcut('Ctrl+U');
  assert.deepEqual(calls, ['Ctrl+U', 'Ctrl+U']);
});

test('a missing Doubao installation reports failure without sending keys to the document', async () => {
  const main = loadMain();
  main.findDoubaoRpcPath = () => '';
  main.sendNativeShortcut = () => assert.fail('do not silently send the voice chord to the editor');
  const result = await main.sendShortcut('Ctrl+U', { kind: 'voice', label: '豆包' });
  assert.equal(result.ok, false);
  assert.match(result.error, /not found/);
});
