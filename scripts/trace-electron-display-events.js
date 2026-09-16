const { app, powerMonitor, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const logPath = path.resolve(
  process.env.VIBE_DISPLAY_TRACE_LOG || path.join(process.cwd(), 'display-trace-electron.jsonl')
);

function displaySnapshot(display) {
  return {
    id: display.id,
    label: display.label,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    internal: display.internal,
    nativeOrigin: display.nativeOrigin
  };
}

function write(event, details = {}) {
  const record = {
    time: new Date().toISOString(),
    event,
    ...details,
    displays: screen.getAllDisplays().map(displaySnapshot)
  };
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf8');
}

app.whenReady().then(() => {
  write('trace-started');

  screen.on('display-added', (_event, display) => {
    write('display-added', { display: displaySnapshot(display) });
  });
  screen.on('display-removed', (_event, display) => {
    write('display-removed', { display: displaySnapshot(display) });
  });
  screen.on('display-metrics-changed', (_event, display, changedMetrics) => {
    write('display-metrics-changed', {
      display: displaySnapshot(display),
      changedMetrics
    });
  });

  for (const eventName of [
    'suspend',
    'resume',
    'lock-screen',
    'unlock-screen',
    'user-did-become-active',
    'user-did-resign-active'
  ]) {
    powerMonitor.on(eventName, () => write(`power-monitor:${eventName}`));
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => app.quit());
}
