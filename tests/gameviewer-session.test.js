const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  GameViewerSessionWatcher,
  parseGameViewerSessionEvents
} = require('../electron/gameviewer-session');

test('parses UU remote connection and disconnection events in order', () => {
  const events = parseGameViewerSessionEvents([
    '[I] report event: event_connect_start, suc: 1',
    '[I] unrelated display status',
    '[I] peer_control_connection: disconnected, peer_id=1'
  ].join('\n'));

  assert.deepEqual(
    events.map((event) => event.connected),
    [true, false]
  );
});

test('parses real-time UU desktop client state events', () => {
  const events = parseGameViewerSessionEvents([
    '[I] [NewUi::DeviceDataManager::processChangeSelfDeviceInfo] connected, device id: tablet',
    '[I] [NewUi::DeviceDataManager::processChangeSelfDeviceInfo] onEventDeviceInfoChanged disconnect'
  ].join('\n'));

  assert.deepEqual(
    events.map((event) => event.connected),
    [true, false]
  );
});

test('parses current UU controlled-session state events', () => {
  const events = parseGameViewerSessionEvents([
    '[14:31:29.495 I] Client.Session: controlled_session result=changed previous_connected=0 current_connected=1 (@ home_controlled_session_presenter.cpp:87)',
    '[14:33:27.234 I] Client.Session: controlled_session result=changed previous_connected=1 current_connected=1 (@ home_controlled_session_presenter.cpp:87)',
    '[14:35:50.428 I] Client.Session: controlled_session result=changed previous_connected=1 current_connected=0 (@ home_controlled_session_presenter.cpp:87)'
  ].join('\n'));

  assert.deepEqual(
    events.map((event) => event.connected),
    [true, true, false]
  );
});

test('ignores unrelated GameViewer log lines', () => {
  assert.deepEqual(
    parseGameViewerSessionEvents('[I] current screen rect width:2000 height:1200'),
    []
  );
});

test('initial log history emits only the latest session state', () => {
  const emitted = [];
  const watcher = new GameViewerSessionWatcher({
    onSessionChanged: (event) => emitted.push(event.connected)
  });

  watcher.consume([
    '[I] report event: event_connect_start, suc: 1',
    '[I] peer_control_connection: disconnected, peer_id=1',
    '[I] report event: event_connect_start, suc: 1',
    ''
  ].join('\n'));

  assert.deepEqual(emitted, [true]);
});

test('live log updates continue to emit real state transitions', () => {
  const emitted = [];
  const watcher = new GameViewerSessionWatcher({
    onSessionChanged: (event) => emitted.push(event.connected)
  });

  watcher.consume('[I] report event: event_connect_start, suc: 1\n');
  watcher.consume('[I] peer_control_connection: disconnected, peer_id=1\n');

  assert.deepEqual(emitted, [true, false]);
});

test('watches appended UU client log records even without directory notifications', async () => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-gameviewer-'));
  const logPath = path.join(logDirectory, 'log_test.txt');
  fs.writeFileSync(
    logPath,
    '[I] [NewUi::DeviceDataManager::processChangeSelfDeviceInfo] onEventDeviceInfoChanged disconnect\n'
  );

  const emitted = [];
  let resolveConnected;
  const connected = new Promise((resolve) => {
    resolveConnected = resolve;
  });
  const watcher = new GameViewerSessionWatcher({
    logDirectory,
    onSessionChanged: (event) => {
      emitted.push(event.connected);
      if (event.connected) resolveConnected();
    }
  }).start();

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    fs.appendFileSync(
      logPath,
      '[I] [NewUi::DeviceDataManager::processChangeSelfDeviceInfo] connected, device id: tablet\n'
    );
    await Promise.race([
      connected,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('Timed out waiting for appended GameViewer log event.')),
        2000
      ))
    ]);
    assert.deepEqual(emitted, [false, true]);
  } finally {
    watcher.dispose();
    fs.rmSync(logDirectory, { recursive: true, force: true });
  }
});
