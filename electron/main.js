const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, protocol, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEV_URL = 'http://127.0.0.1:5173';

const DEFAULT_CONFIG = {
  schemaVersion: 3,
  buttons: [
    {
      id: 'voice',
      label: '语音',
      iconType: 'lucide',
      icon: 'Mic',
      image: '',
      shortcut: 'Ctrl+I'
    },
    {
      id: 'send',
      label: '发送',
      iconType: 'lucide',
      icon: 'SendHorizontal',
      image: '',
      shortcut: 'Enter'
    },
    {
      id: 'delete',
      label: '删除',
      iconType: 'lucide',
      icon: 'Delete',
      image: '',
      shortcut: 'Backspace'
    }
  ],
  voiceModes: {
    activeId: 'lightning',
    options: {
      wechat: {
        id: 'wechat',
        label: '微信输入法',
        iconType: 'image',
        icon: 'MessageCircle',
        image: 'vibe-asset://voice-wechat.png',
        shortcut: 'Ctrl+Win+Shift'
      },
      lightning: {
        id: 'lightning',
        label: '闪电说',
        iconType: 'image',
        icon: 'Zap',
        image: 'vibe-asset://voice-lightning.png',
        shortcut: 'Ctrl+I'
      }
    }
  },
  window: {
    corner: 'bottom-right',
    buttonSize: 64,
    gap: 10,
    opacity: 0.78
  }
};

let floatingWindow;
let settingsWindow;
let tray;
let config;
let repeatProcess;
let sideActionsOpen = false;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function mergeConfig(value) {
  const rawValue = value && typeof value === 'object' ? value : {};
  const rawSchemaVersion = Number(rawValue.schemaVersion) || 1;
  const isLegacyConfig = rawSchemaVersion < DEFAULT_CONFIG.schemaVersion;
  const legacyVoiceButton = Array.isArray(rawValue.buttons)
    ? rawValue.buttons.find((button) => button && button.id === 'voice')
    : null;

  const next = {
    ...DEFAULT_CONFIG,
    ...rawValue,
    schemaVersion: DEFAULT_CONFIG.schemaVersion,
    window: {
      ...DEFAULT_CONFIG.window,
      ...(rawValue.window ? rawValue.window : {})
    },
    buttons: Array.isArray(value && value.buttons) && value.buttons.length
      ? value.buttons
      : DEFAULT_CONFIG.buttons
  };

  next.buttons = next.buttons.map((button, index) => ({
    id: button.id || `button-${Date.now()}-${index}`,
    label: button.label || `按钮 ${index + 1}`,
    iconType: button.iconType === 'image' ? 'image' : 'lucide',
    icon: button.icon || 'Circle',
    image: button.image || '',
    shortcut: button.shortcut || ''
  }));

  next.voiceModes = mergeVoiceModes(rawValue.voiceModes, legacyVoiceButton, rawSchemaVersion);
  next.window.buttonSize = clamp(Number(next.window.buttonSize) || 64, 48, 112);
  next.window.gap = clamp(Number(next.window.gap) || 10, 4, 24);
  next.window.opacity = clamp(Number(next.window.opacity) || 0.78, 0.25, 1);
  next.window.corner = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(next.window.corner)
    ? next.window.corner
    : DEFAULT_CONFIG.window.corner;

  if (rawSchemaVersion < 2 && (!rawValue.window || rawValue.window.corner === 'top-right')) {
    next.window.corner = 'bottom-right';
  }

  return next;
}

function mergeVoiceModes(value, legacyVoiceButton, schemaVersion) {
  const source = value && typeof value === 'object' ? value : {};
  const sourceOptions = source.options && typeof source.options === 'object' ? source.options : {};
  const defaults = DEFAULT_CONFIG.voiceModes.options;
  const options = {};

  for (const id of ['wechat', 'lightning']) {
    const fallback = defaults[id];
    const option = sourceOptions[id] && typeof sourceOptions[id] === 'object' ? sourceOptions[id] : {};
    options[id] = {
      ...fallback,
      ...option,
      id,
      label: option.label || fallback.label,
      iconType: option.iconType === 'image' ? 'image' : 'lucide',
      icon: option.icon || fallback.icon,
      image: option.image || '',
      shortcut: option.shortcut || fallback.shortcut
    };

    if (schemaVersion < 3) {
      const usingOldDefaultIcon =
        !option.image ||
        (id === 'wechat' && option.iconType !== 'image' && (!option.icon || option.icon === 'MessageCircle')) ||
        (id === 'lightning' && option.iconType !== 'image' && (!option.icon || option.icon === 'Zap'));
      if (usingOldDefaultIcon) {
        options[id].iconType = fallback.iconType;
        options[id].icon = fallback.icon;
        options[id].image = fallback.image;
      }
      if (id === 'wechat' && (!option.shortcut || option.shortcut === 'Ctrl+Alt+W')) {
        options[id].shortcut = fallback.shortcut;
      }
    }
  }

  if (!value && legacyVoiceButton && legacyVoiceButton.shortcut) {
    options.lightning.shortcut = legacyVoiceButton.shortcut;
  }

  const activeId = options[source.activeId] ? source.activeId : DEFAULT_CONFIG.voiceModes.activeId;
  return { activeId, options };
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return mergeConfig(JSON.parse(raw));
  } catch {
    return mergeConfig(DEFAULT_CONFIG);
  }
}

function saveConfig(nextConfig) {
  config = mergeConfig(nextConfig);
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
  resizeFloatingWindow();
  broadcastConfig();
  return config;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function floatingSize() {
  const padding = 12;
  const edgePadding = 8;
  const buttonSize = config.window.buttonSize;
  const gap = config.window.gap;
  const buttonCount = Math.max(config.buttons.length, 1);
  const stackHeight = buttonCount * buttonSize + (buttonCount - 1) * gap;
  const shellWidth = buttonSize + padding * 2;
  const shellHeight = padding * 2 + stackHeight;
  const sideButtonSize = Math.round(buttonSize * 0.78);
  const sideExtraWidth = sideActionsOpen ? sideButtonSize * 2 + gap * 3 : 0;

  return {
    width: Math.round(shellWidth + edgePadding * 2 + sideExtraWidth),
    height: Math.round(shellHeight + edgePadding * 2)
  };
}

function floatingBounds() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const margin = 18;
  const size = floatingSize();
  const x = config.window.corner.includes('right')
    ? workArea.x + workArea.width - size.width - margin
    : workArea.x + margin;
  const y = config.window.corner.includes('bottom')
    ? workArea.y + workArea.height - size.height - margin
    : workArea.y + margin;

  return { x: Math.round(x), y: Math.round(y), ...size };
}

function loadRenderer(window, mode) {
  if (!app.isPackaged && !process.env.VIBE_SHORTCUT_LOAD_DIST) {
    window.loadURL(`${DEV_URL}?mode=${mode}`);
    return;
  }

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
    query: { mode }
  });
}

function assetPath(...segments) {
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '..', 'assets');

  return path.join(basePath, ...segments);
}

function registerAssetProtocol() {
  protocol.registerFileProtocol('vibe-asset', (request, callback) => {
    try {
      const parsed = new URL(request.url);
      const rawName = parsed.hostname || parsed.pathname.replace(/^\/+/, '');
      const safeName = path.basename(decodeURIComponent(rawName));
      callback({ path: assetPath(safeName) });
    } catch {
      callback({ error: -2 });
    }
  });
}

function iconPath(name) {
  const target = assetPath(name);
  return fs.existsSync(target) ? target : undefined;
}

function createFloatingWindow() {
  const bounds = floatingBounds();
  floatingWindow = new BrowserWindow({
    ...bounds,
    ...(iconPath('app-icon.ico') ? { icon: iconPath('app-icon.ico') } : {}),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    show: false,
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
  floatingWindow.once('ready-to-show', () => floatingWindow.showInactive());
  floatingWindow.on('closed', () => {
    floatingWindow = null;
  });
  loadRenderer(floatingWindow, 'floating');
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 820,
    height: 680,
    minWidth: 720,
    minHeight: 560,
    ...(iconPath('app-icon.ico') ? { icon: iconPath('app-icon.ico') } : {}),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  loadRenderer(settingsWindow, 'settings');
}

function resizeFloatingWindow() {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  floatingWindow.setBounds(floatingBounds());
  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
}

function trayIcon() {
  for (const name of ['tray-icon.ico', 'tray-icon.png', 'app-icon.ico', 'app-icon.png']) {
    const image = nativeImage.createFromPath(assetPath(name));
    if (!image.isEmpty()) return image;
  }

  return nativeImage.createEmpty();
}

function createTray() {
  if (tray) return;

  tray = new Tray(trayIcon());
  tray.setToolTip('Vibe Shortcut');
  updateTrayMenu();
  tray.on('click', () => createSettingsWindow());
}

function updateTrayMenu() {
  if (!tray) return;
  const startup = getStartupState();

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '设置',
      click: () => createSettingsWindow()
    },
    {
      label: '显示悬浮窗',
      click: () => {
        if (!floatingWindow || floatingWindow.isDestroyed()) createFloatingWindow();
        floatingWindow.showInactive();
      }
    },
    {
      label: '开机自启动',
      type: 'checkbox',
      checked: startup.enabled,
      enabled: startup.supported,
      click: (menuItem) => {
        setStartupEnabled(menuItem.checked);
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit()
    }
  ]));
}

function broadcastConfig() {
  for (const target of [floatingWindow, settingsWindow]) {
    if (target && !target.isDestroyed()) {
      target.webContents.send('config:changed', config);
    }
  }
}

function shortcutToSendKeys(shortcut) {
  const parts = String(shortcut || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return '';

  const key = parts.pop();
  let prefix = '';

  for (const modifier of parts) {
    const normalized = modifier.toLowerCase();
    if (normalized === 'ctrl' || normalized === 'control') prefix += '^';
    else if (normalized === 'shift') prefix += '+';
    else if (normalized === 'alt' || normalized === 'option') prefix += '%';
    else if (normalized === 'win' || normalized === 'meta' || normalized === 'cmd') {
      throw new Error('PowerShell SendKeys does not support Win/Meta shortcuts yet. Use Ctrl/Alt/Shift shortcuts for now.');
    }
  }

  const normalizedKey = key.toLowerCase();
  const special = {
    enter: '{ENTER}',
    return: '{ENTER}',
    backspace: '{BACKSPACE}',
    delete: '{DELETE}',
    del: '{DELETE}',
    esc: '{ESC}',
    escape: '{ESC}',
    tab: '{TAB}',
    space: ' ',
    up: '{UP}',
    arrowup: '{UP}',
    down: '{DOWN}',
    arrowdown: '{DOWN}',
    left: '{LEFT}',
    arrowleft: '{LEFT}',
    right: '{RIGHT}',
    arrowright: '{RIGHT}',
    home: '{HOME}',
    end: '{END}',
    pageup: '{PGUP}',
    pagedown: '{PGDN}',
    insert: '{INSERT}'
  };

  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) {
    return `${prefix}{${key.toUpperCase()}}`;
  }

  if (special[normalizedKey]) {
    return `${prefix}${special[normalizedKey]}`;
  }

  if (key.length === 1) {
    return `${prefix}${escapeSendKeysChar(key.toLowerCase())}`;
  }

  return `${prefix}{${key.toUpperCase()}}`;
}

function shortcutNeedsNativeSender(shortcut) {
  const parts = String(shortcut || '')
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (!parts.length) return false;
  return parts.some((part) => ['win', 'meta', 'cmd'].includes(part)) || parts.every(isModifierPart);
}

function isModifierPart(value) {
  return ['ctrl', 'control', 'shift', 'alt', 'option', 'win', 'meta', 'cmd'].includes(value);
}

function shortcutToNativeEvents(shortcut) {
  const parts = String(shortcut || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  const modifiers = [];
  let key = null;

  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === 'ctrl' || normalized === 'control') modifiers.push({ name: 'Ctrl', vk: 0x11 });
    else if (normalized === 'shift') modifiers.push({ name: 'Shift', vk: 0x10 });
    else if (normalized === 'alt' || normalized === 'option') modifiers.push({ name: 'Alt', vk: 0x12 });
    else if (normalized === 'win' || normalized === 'meta' || normalized === 'cmd') modifiers.push({ name: 'Win', vk: 0x5b });
    else key = part;
  }

  const events = [];
  const uniqueModifiers = [];
  for (const modifier of modifiers) {
    if (!uniqueModifiers.some((item) => item.vk === modifier.vk)) uniqueModifiers.push(modifier);
  }

  for (const modifier of uniqueModifiers) events.push({ vk: modifier.vk, up: false });

  if (key) {
    const keyVk = keyToVirtualKey(key);
    if (!keyVk) throw new Error(`Native sender does not support ${key}.`);
    events.push({ vk: keyVk, up: false });
    events.push({ vk: keyVk, up: true });
  }

  for (const modifier of [...uniqueModifiers].reverse()) events.push({ vk: modifier.vk, up: true });
  return events;
}

function keyToVirtualKey(key) {
  const normalized = key.toLowerCase();
  const special = {
    enter: 0x0d,
    return: 0x0d,
    backspace: 0x08,
    delete: 0x2e,
    del: 0x2e,
    esc: 0x1b,
    escape: 0x1b,
    tab: 0x09,
    space: 0x20,
    up: 0x26,
    arrowup: 0x26,
    down: 0x28,
    arrowdown: 0x28,
    left: 0x25,
    arrowleft: 0x25,
    right: 0x27,
    arrowright: 0x27,
    home: 0x24,
    end: 0x23,
    pageup: 0x21,
    pagedown: 0x22,
    insert: 0x2d
  };

  if (special[normalized]) return special[normalized];
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) return 0x70 + Number(key.slice(1)) - 1;
  if (/^[a-z]$/i.test(key)) return key.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
  return null;
}

function sendNativeShortcut(shortcut) {
  return new Promise((resolve) => {
    let events;
    try {
      events = shortcutToNativeEvents(shortcut);
    } catch (error) {
      resolve({ ok: false, error: error.message });
      return;
    }

    if (!events.length) {
      resolve({ ok: false, error: 'Shortcut is empty.' });
      return;
    }

    const eventCommands = [];
    for (const event of events) {
      eventCommands.push(`[NativeKeyboard]::keybd_event(${event.vk}, 0, ${event.up ? 2 : 0}, [UIntPtr]::Zero)`);
      eventCommands.push('Start-Sleep -Milliseconds 35');
    }

    const command = [
      'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public static class NativeKeyboard { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); }\'',
      'Start-Sleep -Milliseconds 45',
      ...eventCommands
    ].join('; ');

    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
    child.on('exit', (code) => {
      resolve(code === 0 ? { ok: true } : { ok: false, error: stderr.trim() || `PowerShell exited with code ${code}` });
    });
  });
}

function escapeSendKeysChar(value) {
  return value.replace(/[+^%~()[\]{}]/g, '{$&}');
}

function sendShortcut(shortcut) {
  return new Promise((resolve) => {
    if (shortcutNeedsNativeSender(shortcut)) {
      sendNativeShortcut(shortcut).then(resolve);
      return;
    }

    let sendKeys;
    try {
      sendKeys = shortcutToSendKeys(shortcut);
    } catch (error) {
      resolve({ ok: false, error: error.message });
      return;
    }

    if (!sendKeys) {
      resolve({ ok: false, error: 'Shortcut is empty.' });
      return;
    }

    const escaped = sendKeys.replace(/'/g, "''");
    const command = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Start-Sleep -Milliseconds 45',
      `[System.Windows.Forms.SendKeys]::SendWait('${escaped}')`
    ].join('; ');

    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
    child.on('exit', (code) => {
      resolve(code === 0 ? { ok: true } : { ok: false, error: stderr.trim() || `PowerShell exited with code ${code}` });
    });
  });
}

async function sendShortcutSequence(shortcuts) {
  if (!Array.isArray(shortcuts) || !shortcuts.length) {
    return { ok: false, error: 'Shortcut sequence is empty.' };
  }

  for (const shortcut of shortcuts) {
    const result = await sendShortcut(shortcut);
    if (!result.ok) return result;
  }

  return { ok: true };
}

function startRepeatShortcut(shortcut) {
  stopRepeatShortcut();

  let sendKeys;
  try {
    sendKeys = shortcutToSendKeys(shortcut);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  if (!sendKeys) return { ok: false, error: 'Shortcut is empty.' };

  const escaped = sendKeys.replace(/'/g, "''");
  const command = [
    'Add-Type -AssemblyName System.Windows.Forms',
    `while ($true) { [System.Windows.Forms.SendKeys]::SendWait('${escaped}'); Start-Sleep -Milliseconds 72 }`
  ].join('; ');

  repeatProcess = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    windowsHide: true
  });

  repeatProcess.on('exit', () => {
    repeatProcess = null;
  });
  repeatProcess.on('error', () => {
    repeatProcess = null;
  });

  return { ok: true };
}

function stopRepeatShortcut() {
  if (repeatProcess && !repeatProcess.killed) {
    try {
      repeatProcess.kill();
    } catch {
      // Best effort: the process only exists while a repeat key is held.
    }
  }
  repeatProcess = null;
  return { ok: true };
}

function setSideActionsOpen(nextOpen) {
  sideActionsOpen = Boolean(nextOpen);
  resizeFloatingWindow();
  return { ok: true, open: sideActionsOpen };
}

function startupPath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function getStartupState() {
  if (!app.isPackaged) {
    return { enabled: false, supported: false };
  }

  const settings = app.getLoginItemSettings({
    path: startupPath()
  });
  return { enabled: settings.openAtLogin, supported: true };
}

function setStartupEnabled(enabled) {
  if (!app.isPackaged) {
    return { enabled: false, supported: false };
  }

  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: startupPath(),
    args: []
  });

  const state = getStartupState();
  broadcastStartup(state);
  return state;
}

function broadcastStartup(state = getStartupState()) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('startup:changed', state);
  }
}

function registerIpc() {
  ipcMain.handle('config:get', () => config);
  ipcMain.handle('config:save', (_event, nextConfig) => saveConfig(nextConfig));
  ipcMain.handle('shortcut:send', (_event, shortcut) => sendShortcut(shortcut));
  ipcMain.handle('shortcut:sendSequence', (_event, shortcuts) => sendShortcutSequence(shortcuts));
  ipcMain.handle('shortcut:startRepeat', (_event, shortcut) => startRepeatShortcut(shortcut));
  ipcMain.handle('shortcut:stopRepeat', () => stopRepeatShortcut());
  ipcMain.handle('floating:setSideActionsOpen', (_event, open) => setSideActionsOpen(open));
  ipcMain.handle('startup:get', () => getStartupState());
  ipcMain.handle('startup:set', (_event, enabled) => {
    const state = setStartupEnabled(enabled);
    updateTrayMenu();
    return state;
  });
  ipcMain.handle('settings:open', () => createSettingsWindow());
  ipcMain.handle('settings:close', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  });
  ipcMain.handle('image:choose', async () => {
    const result = await dialog.showOpenDialog(settingsWindow || floatingWindow, {
      title: '选择按钮图片',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }
      ]
    });

    if (result.canceled || !result.filePaths.length) return null;
    return `file://${result.filePaths[0].replace(/\\/g, '/')}`;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!floatingWindow || floatingWindow.isDestroyed()) {
      createFloatingWindow();
    } else {
      floatingWindow.showInactive();
      floatingWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  });

  app.whenReady().then(() => {
    config = loadConfig();
    registerAssetProtocol();
    registerIpc();
    createFloatingWindow();
    createTray();

    app.on('activate', () => {
      if (!floatingWindow) createFloatingWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
