const { spawn } = require('child_process');
const electronPath = require('electron');

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VIBE_SHORTCUT_LOAD_DIST: '1'
  },
  windowsHide: false
});

child.on('exit', (code) => process.exit(code || 0));
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
