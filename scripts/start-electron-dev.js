const http = require('http');
const { spawn } = require('child_process');
const electronPath = require('electron');

const target = 'http://127.0.0.1:5173';
const startedAt = Date.now();
const timeoutMs = 30_000;

function waitForVite() {
  http
    .get(target, (response) => {
      response.resume();
      if (response.statusCode && response.statusCode < 500) {
        startElectron();
        return;
      }
      retry();
    })
    .on('error', retry);
}

function retry() {
  if (Date.now() - startedAt > timeoutMs) {
    console.error(`Timed out waiting for ${target}`);
    process.exit(1);
  }
  setTimeout(waitForVite, 250);
}

function startElectron() {
  const child = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    windowsHide: false
  });

  child.on('exit', (code) => process.exit(code || 0));
  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
}

waitForVite();
