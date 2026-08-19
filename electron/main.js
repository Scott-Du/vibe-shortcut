const { app, BrowserWindow, Menu, Tray, clipboard, dialog, ipcMain, nativeImage, protocol, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  GAMEVIEWER_ADAPTER_NAME,
  applyVirtualDisplayCandidates,
  applyVirtualDisplayProfile,
  createDisplayRefreshProfiles,
  createLatestIntentQueue,
  getVirtualDisplayStatus,
  orderVirtualDisplayProfileIndexes,
  refreshVirtualDisplayProfile
} = require('./virtual-display');
const { GameViewerSessionWatcher } = require('./gameviewer-session');
const {
  DEFAULT_REMOTE_AUDIO_DEVICE,
  SYSTEM_AUDIO_DEVICE,
  ShandianshuoAudioController,
  listCaptureDevices
} = require('./shandianshuo-audio');
const {
  isDoubaoVoiceShortcut,
  shortcutNeedsNativeSender,
  shortcutToNativeEvents
} = require('./shortcut-input');

const DEV_URL = 'http://127.0.0.1:5173';
const LIGHTNING_VOICE_IMAGE = 'vibe-asset://voice-lightning.png';
const DOUBAO_VOICE_IMAGE = 'vibe-asset://voice-doubao.png';
const DEFAULT_PUNCTUATION_ITEMS = [
  { id: 'comma', label: '逗号', text: '，' },
  { id: 'period', label: '句号', text: '。' },
  { id: 'exclamation', label: '感叹号', text: '！' },
  { id: 'quote', label: '中文引号', text: '「」', afterShortcut: 'Left' }
];
const DEFAULT_DISPLAY_PRESETS = [
  { id: 'preset-1', label: '设置一', width: 2000, height: 1200, scale: 200, orientation: 'portrait', target: 'gameviewer-virtual' },
  { id: 'preset-2', label: '设置二', width: 2000, height: 1200, scale: 200, orientation: 'landscape', target: 'gameviewer-virtual' }
];
const VIRTUAL_DISPLAY_COMPATIBILITY_RESOLUTIONS = [
  { width: 1920, height: 1200, mode: 'phone' }
];
const DEFAULT_VIRTUAL_DISPLAY = {
  adapterName: GAMEVIEWER_ADAPTER_NAME,
  autoRestore: true,
  lastOrientation: 'portrait',
  lastPresetId: 'preset-1'
};
const DEFAULT_REMOTE_AUTOMATION = {
  microphoneEnabled: true,
  localAudioDevice: SYSTEM_AUDIO_DEVICE,
  remoteAudioDevice: DEFAULT_REMOTE_AUDIO_DEVICE,
  resetFloatingWindow: true
};
const WM_DISPLAYCHANGE = 0x007E;
const WM_DEVICECHANGE = 0x0219;
const DBT_DEVNODES_CHANGED = 0x0007;

const DEFAULT_CONFIG = {
  schemaVersion: 7,
  buttons: [
    {
      id: 'punctuation',
      label: '标点',
      iconType: 'lucide',
      icon: 'Braces',
      image: '',
      shortcut: ''
    },
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
  punctuationItems: DEFAULT_PUNCTUATION_ITEMS,
  displayPresets: DEFAULT_DISPLAY_PRESETS,
  virtualDisplay: DEFAULT_VIRTUAL_DISPLAY,
  remoteAutomation: DEFAULT_REMOTE_AUTOMATION,
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
        image: LIGHTNING_VOICE_IMAGE,
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
let inputSenderProcess;
let inputSenderBuffer = '';
let inputSenderRequestId = 0;
let virtualDisplayRestoreTimer;
let virtualDisplayVerifyTimer;
let virtualDisplayRestoreInProgress = false;
let virtualDisplaySuppressUntil = 0;
let virtualDisplaySessionResolution;
const virtualDisplayIntent = createLatestIntentQueue();
let virtualDisplayNativeOrigin;
let gameViewerSessionConnected;
let gameViewerSessionWatcher;
let gameViewerSessionAutomationTimer;
let nativeDisplayChangeAt = 0;
let floatingResetTimer;
let shandianshuoAudioController;
const inputSenderPending = new Map();

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function mergeConfig(value) {
  const rawValue = value && typeof value === 'object' ? value : {};
  const rawSchemaVersion = Number(rawValue.schemaVersion) || 1;
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

  next.buttons = ensureRequiredButtons(next.buttons);
  next.punctuationItems = mergePunctuationItems(rawValue.punctuationItems);
  next.displayPresets = mergeDisplayPresets(rawValue.displayPresets, rawSchemaVersion);
  next.virtualDisplay = mergeVirtualDisplay(rawValue.virtualDisplay, next.displayPresets);
  next.remoteAutomation = mergeRemoteAutomation(rawValue.remoteAutomation);
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

function ensureRequiredButtons(buttons) {
  const existingIds = new Set(buttons.map((button) => button.id));
  const requiredButtons = DEFAULT_CONFIG.buttons.filter((button) => !existingIds.has(button.id));
  return [
    ...requiredButtons,
    ...buttons
  ];
}

function mergePunctuationItems(value) {
  const items = Array.isArray(value) && value.length ? value : DEFAULT_PUNCTUATION_ITEMS;
  return items
    .map((item, index) => ({
      id: item && item.id ? String(item.id) : `punctuation-${index}`,
      label: item && Object.prototype.hasOwnProperty.call(item, 'label') ? String(item.label) : `标点 ${index + 1}`,
      text: item && item.text ? String(item.text) : '',
      afterShortcut: item && item.afterShortcut ? String(item.afterShortcut) : ''
    }));
}

function mergeDisplayPresets(value, schemaVersion = DEFAULT_CONFIG.schemaVersion) {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_DISPLAY_PRESETS;
  const presets = source
    .map((preset, index) => normalizeDisplayPreset(preset, index, schemaVersion))
    .filter(Boolean);
  return presets.length ? presets : DEFAULT_DISPLAY_PRESETS.map((preset, index) => normalizeDisplayPreset(preset, index));
}

function normalizeDisplayPreset(value, index = 0, schemaVersion = DEFAULT_CONFIG.schemaVersion) {
  const preset = value && typeof value === 'object' ? value : {};
  const fallback = DEFAULT_DISPLAY_PRESETS[index] || DEFAULT_DISPLAY_PRESETS[0];
  const id = preset.id ? String(preset.id) : `preset-${index + 1}`;
  const migrateBuiltInPreset = schemaVersion < 6 && ['preset-1', 'preset-2'].includes(id);
  const orientation = migrateBuiltInPreset
    ? fallback.orientation
    : (['landscape', 'portrait', 'landscape-flipped', 'portrait-flipped'].includes(preset.orientation)
        ? preset.orientation
        : fallback.orientation);

  return {
    id,
    label: preset.label ? String(preset.label) : `设置${index + 1}`,
    width: migrateBuiltInPreset
      ? fallback.width
      : clamp(Math.round(Number(preset.width) || fallback.width), 320, 10000),
    height: migrateBuiltInPreset
      ? fallback.height
      : clamp(Math.round(Number(preset.height) || fallback.height), 320, 10000),
    scale: migrateBuiltInPreset
      ? 200
      : clamp(Math.round(Number(preset.scale) || fallback.scale), 100, 350),
    orientation,
    target: 'gameviewer-virtual'
  };
}

function mergeVirtualDisplay(value, displayPresets) {
  const source = value && typeof value === 'object' ? value : {};
  const orientations = ['landscape', 'portrait', 'landscape-flipped', 'portrait-flipped'];
  const lastOrientation = orientations.includes(source.lastOrientation)
    ? source.lastOrientation
    : DEFAULT_VIRTUAL_DISPLAY.lastOrientation;
  const requestedPresetId = source.lastPresetId ? String(source.lastPresetId) : '';
  const matchingPreset = displayPresets.find((preset) => preset.id === requestedPresetId)
    || displayPresets.find((preset) => preset.orientation === lastOrientation)
    || displayPresets[0];

  return {
    adapterName: GAMEVIEWER_ADAPTER_NAME,
    autoRestore: source.autoRestore !== false,
    lastOrientation: matchingPreset?.orientation || lastOrientation,
    lastPresetId: matchingPreset?.id || DEFAULT_VIRTUAL_DISPLAY.lastPresetId
  };
}

function mergeRemoteAutomation(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    microphoneEnabled: source.microphoneEnabled !== false,
    localAudioDevice: typeof source.localAudioDevice === 'string' && source.localAudioDevice.trim()
      ? source.localAudioDevice.trim()
      : DEFAULT_REMOTE_AUTOMATION.localAudioDevice,
    remoteAudioDevice: typeof source.remoteAudioDevice === 'string' && source.remoteAudioDevice.trim()
      ? source.remoteAudioDevice.trim()
      : DEFAULT_REMOTE_AUTOMATION.remoteAudioDevice,
    resetFloatingWindow: source.resetFloatingWindow !== false
  };
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

    const usesBundledLightningImage =
      id === 'lightning'
      && options[id].iconType === 'image'
      && options[id].image === LIGHTNING_VOICE_IMAGE;
    if (usesBundledLightningImage && /(?:豆包|doubao)/i.test(options[id].label)) {
      options[id].image = DOUBAO_VOICE_IMAGE;
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

function saveConfig(nextConfig, options = {}) {
  const previousLayoutSignature = config ? floatingLayoutSignature(config) : null;
  const previousRemoteSignature = config ? remoteAutomationSignature(config) : null;
  const previousDisplaySignature = config ? virtualDisplayConfigSignature(config) : null;
  config = mergeConfig(nextConfig);
  const nextLayoutSignature = floatingLayoutSignature(config);
  const nextRemoteSignature = remoteAutomationSignature(config);
  const nextDisplaySignature = virtualDisplayConfigSignature(config);
  if (
    previousDisplaySignature !== null
    && previousDisplaySignature !== nextDisplaySignature
    && !options.preserveVirtualDisplayIntent
  ) {
    beginVirtualDisplayIntent();
  }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
  if (!options.preserveFloatingBounds && previousLayoutSignature !== nextLayoutSignature) {
    resizeFloatingWindow();
  } else {
    updateFloatingWindowShape();
  }
  broadcastConfig();
  if (
    config.virtualDisplay.autoRestore
    && gameViewerSessionConnected === true
    && !options.skipVirtualDisplayRestore
  ) {
    scheduleVirtualDisplayRestore();
  } else {
    clearTimeout(virtualDisplayRestoreTimer);
    clearTimeout(virtualDisplayVerifyTimer);
  }
  if (previousRemoteSignature !== nextRemoteSignature) {
    syncRemoteMicrophone(gameViewerSessionConnected);
  }
  return config;
}

function floatingLayoutSignature(targetConfig) {
  return JSON.stringify({
    window: targetConfig.window,
    buttonCount: Array.isArray(targetConfig.buttons) ? targetConfig.buttons.length : 0
  });
}

function remoteAutomationSignature(targetConfig) {
  return JSON.stringify(targetConfig.remoteAutomation || DEFAULT_REMOTE_AUTOMATION);
}

function virtualDisplayConfigSignature(targetConfig) {
  return JSON.stringify({
    displayPresets: targetConfig.displayPresets,
    virtualDisplay: targetConfig.virtualDisplay
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function floatingSize(open = true) {
  const padding = 12;
  const edgePadding = 8;
  const buttonSize = config.window.buttonSize;
  const gap = config.window.gap;
  const buttonCount = Math.max(config.buttons.length, 1);
  const stackHeight = buttonCount * buttonSize + (buttonCount - 1) * gap;
  const shellWidth = buttonSize + padding * 2;
  const shellHeight = padding * 2 + stackHeight;
  const sideButtonSize = Math.round(buttonSize * 0.78);
  const sideExtraWidth = open ? sideButtonSize * 2 + gap * 3 : 0;

  return {
    width: Math.round(shellWidth + edgePadding * 2 + sideExtraWidth),
    height: Math.round(shellHeight + edgePadding * 2)
  };
}

function floatingBounds() {
  const display = floatingTargetDisplay();
  const workArea = display.workArea;
  const margin = 18;
  const size = floatingSize(true);
  const x = config.window.corner.includes('right')
    ? workArea.x + workArea.width - size.width - margin
    : workArea.x + margin;
  const y = config.window.corner.includes('bottom')
    ? workArea.y + workArea.height - size.height - margin
    : workArea.y + margin;

  return { x: Math.round(x), y: Math.round(y), ...size };
}

function floatingTargetDisplay() {
  if (gameViewerSessionConnected === true && virtualDisplayNativeOrigin) {
    const matchingDisplay = screen.getAllDisplays().find((display) => (
      display.nativeOrigin?.x === virtualDisplayNativeOrigin.x
      && display.nativeOrigin?.y === virtualDisplayNativeOrigin.y
    ));
    if (matchingDisplay) return matchingDisplay;
  }
  return screen.getPrimaryDisplay();
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

  if (process.platform === 'win32') {
    floatingWindow.hookWindowMessage(WM_DISPLAYCHANGE, () => {
      if (Date.now() < virtualDisplaySuppressUntil) return;
      nativeDisplayChangeAt = Date.now();
      scheduleVirtualDisplayRestoreForActiveSession(3000);
    });
    floatingWindow.hookWindowMessage(WM_DEVICECHANGE, (wParam) => {
      const eventType = Buffer.isBuffer(wParam) && wParam.length >= 4
        ? wParam.readUInt32LE(0)
        : Number(wParam);
      const followsDisplayChange = Date.now() - nativeDisplayChangeAt < 7000;
      if (
        eventType !== DBT_DEVNODES_CHANGED
        || !followsDisplayChange
        || Date.now() < virtualDisplaySuppressUntil
      ) return;
      scheduleVirtualDisplayRestoreForActiveSession(1200);
    });
  }

  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
  updateFloatingWindowShape();
  floatingWindow.once('ready-to-show', () => {
    floatingWindow.showInactive();
    updateTrayMenu();
  });
  floatingWindow.on('show', () => updateTrayMenu());
  floatingWindow.on('hide', () => updateTrayMenu());
  floatingWindow.on('closed', () => {
    floatingWindow = null;
    updateTrayMenu();
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
  updateFloatingWindowShape();
  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
}

function updateFloatingWindowShape() {
  if (!floatingWindow || floatingWindow.isDestroyed() || typeof floatingWindow.setShape !== 'function') return;

  const expandedSize = floatingSize(true);
  if (sideActionsOpen) {
    floatingWindow.setShape([{ x: 0, y: 0, width: expandedSize.width, height: expandedSize.height }]);
    return;
  }

  const compactSize = floatingSize(false);
  floatingWindow.setShape([{
    x: expandedSize.width - compactSize.width,
    y: 0,
    width: compactSize.width,
    height: compactSize.height
  }]);
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
  tray.on('click', () => showDisplayPresetMenu());
  tray.on('right-click', () => updateTrayMenu());
}

function updateTrayMenu() {
  if (!tray) return;
  const startup = getStartupState();
  const floatingVisible = isFloatingWindowVisible();

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '设置',
      click: () => createSettingsWindow()
    },
    {
      label: '显示悬浮窗',
      type: 'checkbox',
      checked: floatingVisible,
      click: () => toggleFloatingWindowVisibility()
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

function isFloatingWindowVisible() {
  return Boolean(floatingWindow && !floatingWindow.isDestroyed() && floatingWindow.isVisible());
}

function toggleFloatingWindowVisibility() {
  if (isFloatingWindowVisible()) {
    floatingWindow.hide();
  } else {
    if (!floatingWindow || floatingWindow.isDestroyed()) createFloatingWindow();
    floatingWindow.showInactive();
    floatingWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  updateTrayMenu();
}

function showDisplayPresetMenu() {
  if (!tray) return;
  const presets = Array.isArray(config.displayPresets) && config.displayPresets.length
    ? config.displayPresets
    : DEFAULT_DISPLAY_PRESETS;

  const menu = Menu.buildFromTemplate([
    {
      label: `悬浮窗回到${windowCornerLabel(config.window.corner)}`,
      click: () => resetFloatingWindowToDefaultPosition()
    },
    { type: 'separator' },
    ...presets.map((preset, index) => ({
      label: displayPresetMenuLabel(preset, index),
      type: 'checkbox',
      checked: preset.id === config.virtualDisplay.lastPresetId,
      click: () => applyDisplayPresetFromTray(preset)
    }))
  ]);

  tray.popUpContextMenu(menu);
}

function windowCornerLabel(corner) {
  return {
    'top-left': '左上角',
    'top-right': '右上角',
    'bottom-left': '左下角',
    'bottom-right': '右下角'
  }[corner] || '默认位置';
}

function resetFloatingWindowToDefaultPosition() {
  if (!floatingWindow || floatingWindow.isDestroyed()) {
    createFloatingWindow();
    return;
  }

  resizeFloatingWindow();
  floatingWindow.showInactive();
  floatingWindow.setAlwaysOnTop(true, 'screen-saver');
}

function scheduleFloatingWindowReset(delay = 800) {
  clearTimeout(floatingResetTimer);
  floatingResetTimer = setTimeout(() => {
    floatingResetTimer = undefined;
    resetFloatingWindowToDefaultPosition();
  }, delay);
}

function displayPresetMenuLabel(preset, index) {
  const normalized = normalizeDisplayPreset(preset, index);
  const orientationText = {
    landscape: '横向',
    portrait: '纵向',
    'landscape-flipped': '横向翻转',
    'portrait-flipped': '纵向翻转'
  }[normalized.orientation] || normalized.orientation;
  return `${normalized.label} · ${orientationText} · ${normalized.width}×${normalized.height} · ${normalized.scale}%`;
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

function inputSenderScript() {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public static class NativeInput {
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public UInt32 type; public INPUTUNION u; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION {
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public HARDWAREINPUT hi;
  }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {
    public UInt16 wVk; public UInt16 wScan; public UInt32 dwFlags; public UInt32 time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {
    public Int32 dx; public Int32 dy; public UInt32 mouseData; public UInt32 dwFlags; public UInt32 time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] public struct HARDWAREINPUT {
    public UInt32 uMsg; public UInt16 wParamL; public UInt16 wParamH;
  }
  [DllImport("user32.dll", SetLastError=true)] public static extern UInt32 SendInput(UInt32 nInputs, INPUT[] pInputs, Int32 cbSize);
  [DllImport("user32.dll")] public static extern UInt32 MapVirtualKey(UInt32 uCode, UInt32 uMapType);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] static extern UInt32 GetWindowThreadProcessId(IntPtr hWnd, out UInt32 processId);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(UInt32 idAttach, UInt32 idAttachTo, bool attach);
  [DllImport("kernel32.dll")] static extern UInt32 GetCurrentThreadId();
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryW(string path);
  [DllImport("kernel32.dll", CharSet=CharSet.Ansi, SetLastError=true)] static extern IntPtr GetProcAddress(IntPtr module, string name);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate UInt32 RpcFocus(IntPtr context);
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate UInt32 RpcSimpleMessage(IntPtr context, UInt32 message, UInt32 param1, UInt32 param2);
  static IntPtr doubaoRpcModule;
  static RpcFocus doubaoFocusIn;
  static RpcFocus doubaoFocusOut;
  static RpcSimpleMessage doubaoSimpleMessage;
  public static void SendChar(UInt16 scan, bool keyUp) {
    INPUT[] inputs = new INPUT[1];
    inputs[0].type = 1;
    inputs[0].u.ki.wVk = 0;
    inputs[0].u.ki.wScan = scan;
    inputs[0].u.ki.dwFlags = 0x0004u | (keyUp ? 0x0002u : 0u);
    inputs[0].u.ki.time = 0;
    inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;
    UInt32 sent = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    if (sent == 0) throw new InvalidOperationException("SendInput failed " + Marshal.GetLastWin32Error());
  }
  public static void SendKey(UInt16 vk, bool keyUp, bool extended) {
    INPUT[] inputs = new INPUT[1];
    inputs[0].type = 1;
    inputs[0].u.ki.wVk = 0;
    inputs[0].u.ki.wScan = (UInt16)MapVirtualKey(vk, 0);
    inputs[0].u.ki.dwFlags = 0x0008u | (keyUp ? 0x0002u : 0u) | (extended ? 0x0001u : 0u);
    inputs[0].u.ki.time = 0;
    inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;
    UInt32 sent = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    if (sent == 0) throw new InvalidOperationException("SendInput failed " + Marshal.GetLastWin32Error());
  }
  static T LoadExport<T>(string name) where T : class {
    IntPtr address = GetProcAddress(doubaoRpcModule, name);
    if (address == IntPtr.Zero) throw new InvalidOperationException("Doubao RPC export is missing: " + name);
    return Marshal.GetDelegateForFunctionPointer(address, typeof(T)) as T;
  }
  static void EnsureDoubaoRpc(string rpcPath) {
    if (doubaoRpcModule != IntPtr.Zero) return;
    doubaoRpcModule = LoadLibraryW(rpcPath);
    if (doubaoRpcModule == IntPtr.Zero) {
      throw new InvalidOperationException("Unable to load Doubao RPC library " + Marshal.GetLastWin32Error());
    }
    doubaoFocusIn = LoadExport<RpcFocus>("RpcPipe_FocusIn");
    doubaoFocusOut = LoadExport<RpcFocus>("RpcPipe_FocusOut");
    doubaoSimpleMessage = LoadExport<RpcSimpleMessage>("RpcPipe_SimpleMessage");
  }
  static void MakeForeground(IntPtr target, bool setFocus) {
    UInt32 processId;
    UInt32 currentThread = GetCurrentThreadId();
    UInt32 foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out processId);
    UInt32 targetThread = GetWindowThreadProcessId(target, out processId);
    bool attachedForeground = foregroundThread != 0
      && foregroundThread != currentThread
      && AttachThreadInput(currentThread, foregroundThread, true);
    bool attachedTarget = targetThread != 0
      && targetThread != currentThread
      && targetThread != foregroundThread
      && AttachThreadInput(currentThread, targetThread, true);

    try {
      BringWindowToTop(target);
      SetForegroundWindow(target);
      if (setFocus) SetFocus(target);
    } finally {
      if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
      if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
    }
  }
  public static void ToggleDoubaoVoice(string rpcPath, string pipeName) {
    EnsureDoubaoRpc(rpcPath);
    IntPtr previousForeground = GetForegroundWindow();
    IntPtr rpcContext = Marshal.StringToHGlobalAnsi(pipeName);
    Form focusWindow = new Form();
    bool focusRegistered = false;

    try {
      focusWindow.FormBorderStyle = FormBorderStyle.None;
      focusWindow.ShowInTaskbar = false;
      focusWindow.StartPosition = FormStartPosition.Manual;
      focusWindow.Location = new Point(-32000, -32000);
      focusWindow.Size = new Size(1, 1);
      focusWindow.Opacity = 0.01;
      focusWindow.Show();
      focusWindow.Activate();
      Application.DoEvents();
      MakeForeground(focusWindow.Handle, true);

      for (int attempt = 0; attempt < 5 && GetForegroundWindow() != focusWindow.Handle; attempt++) {
        Application.DoEvents();
        Thread.Sleep(10);
        MakeForeground(focusWindow.Handle, true);
      }
      if (GetForegroundWindow() != focusWindow.Handle) {
        throw new InvalidOperationException("Unable to acquire temporary foreground focus for Doubao voice input.");
      }

      Thread.Sleep(30);
      doubaoFocusIn(rpcContext);
      focusRegistered = true;
      doubaoSimpleMessage(rpcContext, 0x3e9, 0, 0);
      Thread.Sleep(120);
    } finally {
      if (focusRegistered) doubaoFocusOut(rpcContext);
      if (previousForeground != IntPtr.Zero) {
        MakeForeground(previousForeground, false);
        Application.DoEvents();
      }
      focusWindow.Hide();
      focusWindow.Dispose();
      Marshal.FreeHGlobal(rpcContext);
    }
  }
}
'@ -ReferencedAssemblies System.Windows.Forms,System.Drawing
while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $id = ''
  try {
    $request = $line | ConvertFrom-Json
    $id = [string]$request.id
    foreach ($action in $request.actions) {
      if ($action.type -eq 'char') {
        [NativeInput]::SendChar([UInt16]$action.scan, $false)
        Start-Sleep -Milliseconds 2
        [NativeInput]::SendChar([UInt16]$action.scan, $true)
        Start-Sleep -Milliseconds 2
      } elseif ($action.type -eq 'key') {
        [NativeInput]::SendKey([UInt16]$action.vk, [bool]$action.up, [bool]$action.extended)
        Start-Sleep -Milliseconds 8
      } elseif ($action.type -eq 'sleep') {
        Start-Sleep -Milliseconds ([int]$action.ms)
      } elseif ($action.type -eq 'doubaoVoice') {
        [NativeInput]::ToggleDoubaoVoice([string]$action.rpcPath, [string]$action.pipeName)
      }
    }
    [pscustomobject]@{ id = $id; ok = $true } | ConvertTo-Json -Compress
  } catch {
    [pscustomobject]@{ id = $id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  }
}
`;
}

function ensureInputSender() {
  if (inputSenderProcess && !inputSenderProcess.killed && inputSenderProcess.stdin.writable) {
    return inputSenderProcess;
  }

  inputSenderBuffer = '';
  inputSenderProcess = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from(inputSenderScript(), 'utf16le').toString('base64')
  ], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  inputSenderProcess.stdout.on('data', (chunk) => {
    inputSenderBuffer += chunk.toString();
    const lines = inputSenderBuffer.split(/\r?\n/);
    inputSenderBuffer = lines.pop() || '';
    for (const line of lines) handleInputSenderLine(line);
  });

  inputSenderProcess.stderr.on('data', () => {
    // Keep stderr drained; request-level errors are reported through stdout.
  });

  inputSenderProcess.on('error', (error) => {
    rejectPendingInputRequests(error.message);
  });

  inputSenderProcess.on('exit', (code) => {
    inputSenderProcess = null;
    inputSenderBuffer = '';
    rejectPendingInputRequests(`Input sender exited with code ${code}`);
  });

  return inputSenderProcess;
}

function handleInputSenderLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let result;
  try {
    result = JSON.parse(trimmed);
  } catch {
    return;
  }

  const pending = inputSenderPending.get(String(result.id));
  if (!pending) return;

  clearTimeout(pending.timeout);
  inputSenderPending.delete(String(result.id));
  pending.resolve(result.ok ? { ok: true } : { ok: false, error: result.error || 'Input sender failed.' });
}

function rejectPendingInputRequests(error) {
  for (const [id, pending] of inputSenderPending.entries()) {
    clearTimeout(pending.timeout);
    pending.resolve({ ok: false, error });
    inputSenderPending.delete(id);
  }
}

function stopInputSender() {
  if (!inputSenderProcess || inputSenderProcess.killed) return;
  try {
    inputSenderProcess.stdin.end();
  } catch {
    // Best-effort shutdown.
  }
  try {
    inputSenderProcess.kill();
  } catch {
    // Best-effort shutdown.
  }
  inputSenderProcess = null;
  inputSenderBuffer = '';
  rejectPendingInputRequests('Input sender stopped.');
}

function sendInputActions(actions) {
  if (!actions.length) return Promise.resolve({ ok: false, error: 'Input action list is empty.' });

  return new Promise((resolve) => {
    const child = ensureInputSender();
    const id = String(++inputSenderRequestId);
    const timeout = setTimeout(() => {
      inputSenderPending.delete(id);
      resolve({ ok: false, error: 'Input sender timed out.' });
    }, 5000);

    inputSenderPending.set(id, { resolve, timeout });
    child.stdin.write(`${JSON.stringify({ id, actions })}\n`, 'utf8', (error) => {
      if (!error || !inputSenderPending.has(id)) return;
      clearTimeout(timeout);
      inputSenderPending.delete(id);
      resolve({ ok: false, error: error.message });
    });
  });
}

function nativeEventsToInputActions(events) {
  return events.map((event) => {
    if (event.sleep) return { type: 'sleep', ms: event.sleep };
    return { type: 'key', vk: event.vk, up: event.up, extended: event.extended };
  });
}

function sendNativeEvents(events) {
  if (!events.length) return Promise.resolve({ ok: false, error: 'Shortcut is empty.' });
  return sendInputActions(nativeEventsToInputActions(events));
}

function sendNativeShortcut(shortcut) {
  let events;
  try {
    events = shortcutToNativeEvents(shortcut);
  } catch (error) {
    return Promise.resolve({ ok: false, error: error.message });
  }

  return sendNativeEvents(events);
}

function findDoubaoRpcPath() {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  for (const root of roots) {
    const candidate = path.join(root, 'DoubaoIME', 'rpc.dll');
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

function sendDoubaoVoiceShortcut(shortcut, context) {
  if (!isDoubaoVoiceShortcut(shortcut, context)) return null;
  const rpcPath = findDoubaoRpcPath();
  if (!rpcPath) return Promise.resolve({ ok: false, error: 'Doubao IME RPC library was not found.' });
  return sendInputActions([{
    type: 'doubaoVoice',
    rpcPath,
    pipeName: '\\\\.\\pipe\\ObricIme\\oime-server'
  }]);
}

function sendNativeShortcutSequence(shortcuts) {
  const events = [];

  try {
    for (const shortcut of shortcuts) {
      events.push(...shortcutToNativeEvents(shortcut));
      events.push({ sleep: 45 });
    }
  } catch (error) {
    return Promise.resolve({ ok: false, error: error.message });
  }

  return sendNativeEvents(events);
}

function shortcutSequenceNeedsNativeSender(shortcuts) {
  return shortcuts.some((shortcut) => shortcutNeedsNativeSender(shortcut));
}

function shortcutsToSendKeys(shortcuts) {
  return shortcuts.map((shortcut) => shortcutToSendKeys(shortcut)).join('');
}

function sendKeysPayload(sendKeys) {
  return new Promise((resolve) => {
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

    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', command], {
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

function sendText(text, afterShortcut) {
  const value = String(text || '');
  if (!value) return Promise.resolve({ ok: false, error: 'Text is empty.' });

  const previousText = clipboard.readText();
  clipboard.writeText(value);

  const shortcuts = ['Ctrl+V'];
  const trailingShortcut = String(afterShortcut || '').trim();
  if (trailingShortcut) shortcuts.push(trailingShortcut);

  return sendNativeShortcutSequence(shortcuts).then((result) => {
    setTimeout(() => {
      try {
        if (clipboard.readText() === value) clipboard.writeText(previousText);
      } catch {
        // Clipboard restore is best-effort.
      }
    }, 180);
    return result;
  });
}

function escapeSendKeysChar(value) {
  return value.replace(/[+^%~()[\]{}]/g, '{$&}');
}

function sendShortcut(shortcut, context) {
  const doubaoResult = sendDoubaoVoiceShortcut(shortcut, context);
  if (doubaoResult) return doubaoResult;

  return sendNativeShortcut(shortcut).then((nativeResult) => {
    if (nativeResult.ok || shortcutNeedsNativeSender(shortcut)) return nativeResult;

    let sendKeys;
    try {
      sendKeys = shortcutToSendKeys(shortcut);
    } catch (error) {
      return { ok: false, error: error.message };
    }

    if (!sendKeys) return { ok: false, error: 'Shortcut is empty.' };
    return sendKeysPayload(sendKeys);
  });
}

async function sendShortcutSequence(shortcuts) {
  if (!Array.isArray(shortcuts) || !shortcuts.length) {
    return { ok: false, error: 'Shortcut sequence is empty.' };
  }

  const nativeResult = await sendNativeShortcutSequence(shortcuts);
  if (nativeResult.ok) return nativeResult;

  if (!shortcutSequenceNeedsNativeSender(shortcuts)) {
    try {
      const sendKeys = shortcutsToSendKeys(shortcuts);
      const sendKeysResult = await sendKeysPayload(sendKeys);
      if (sendKeysResult.ok) return sendKeysResult;
    } catch {
      // Fall back to sending each shortcut below.
    }
  }

  for (const shortcut of shortcuts) {
    const result = await sendShortcut(shortcut);
    if (!result.ok) return result;
  }

  return { ok: true };
}

async function applyDisplayPresetFromTray(preset) {
  const intentRevision = beginVirtualDisplayIntent();
  const normalized = rememberVirtualDisplayPreset(preset, {
    preserveVirtualDisplayIntent: true,
    skipVirtualDisplayRestore: true
  });
  const result = await applyDisplayPreset(normalized, {
    preferSession: false,
    forceMode: true,
    roundTripIfMatching: true,
    intentRevision
  });
  if (result.stale || !virtualDisplayIntent.isCurrent(intentRevision)) return result;
  const failedStep = [...result.results].reverse().find((step) => !step.ok);
  const waitingForConnection = !result.ok && failedStep?.step === 'detect' && !failedStep.connected;
  const appliedPreset = result.preset || normalized;
  const appliedDimensions = effectiveDisplayDimensions(appliedPreset);
  const compatibilityText = result.candidateIndex > 0 ? '（手机兼容模式）' : '';

  if (result.ok && config.remoteAutomation.resetFloatingWindow) {
    scheduleFloatingWindowReset(800);
  }

  if (result.ok && config.virtualDisplay.autoRestore) {
    clearTimeout(virtualDisplayVerifyTimer);
    virtualDisplayVerifyTimer = setTimeout(
      () => verifyVirtualDisplayRestore({
        requestedPreset: normalized,
        appliedPreset,
        candidateIndex: result.candidateIndex,
        retryCount: 0,
        forceMode: true,
        intentRevision
      }),
      3200
    );
  }

  if (tray && typeof tray.displayBalloon === 'function') {
    tray.displayBalloon({
      title: waitingForConnection ? '已记住虚拟屏方向' : (result.ok ? '已应用 UU 虚拟屏预设' : 'UU 虚拟屏预设未完全应用'),
      content: waitingForConnection
        ? 'UU 虚拟屏连接后会自动应用该方向。'
        : result.ok
          ? `${appliedDimensions.width} × ${appliedDimensions.height}、${appliedPreset.scale}% ${compatibilityText}已应用到 UU 虚拟屏。`
        : failedStep?.error || '请检查当前屏幕是否支持该分辨率或方向。'
    });
  } else if (!result.ok && !waitingForConnection) {
    dialog.showErrorBox('UU 虚拟屏预设未完全应用', failedStep?.error || '请检查当前虚拟屏是否支持该分辨率或方向。');
  }

  return result;
}

function rememberVirtualDisplayPreset(preset, saveOptions = {}) {
  const normalized = normalizeDisplayPreset(preset);
  const nextConfig = {
    ...config,
    virtualDisplay: {
      ...config.virtualDisplay,
      lastOrientation: normalized.orientation,
      lastPresetId: normalized.id
    }
  };
  saveConfig(nextConfig, {
    preserveFloatingBounds: true,
    ...saveOptions
  });
  return config.displayPresets.find((item) => item.id === normalized.id) || normalized;
}

function compatibleDisplayProfiles(preset) {
  const normalized = normalizeDisplayPreset(preset);
  const profiles = [normalized];
  if (normalized.width === 2000 && normalized.height === 1200) {
    for (const resolution of VIRTUAL_DISPLAY_COMPATIBILITY_RESOLUTIONS) {
      profiles.push({
        ...normalized,
        width: resolution.width,
        height: resolution.height,
        compatibilityMode: resolution.mode
      });
    }
  }
  return profiles;
}

function sessionCandidateIndex(profiles) {
  if (!virtualDisplaySessionResolution) return -1;
  return profiles.findIndex((profile) => (
    profile.width === virtualDisplaySessionResolution.width
    && profile.height === virtualDisplaySessionResolution.height
  ));
}

function canTryCompatibleProfile(result) {
  return Boolean(
    result.connected
    && ['display-test', 'display', 'verify'].includes(result.step)
  );
}

function beginVirtualDisplayIntent() {
  clearTimeout(virtualDisplayRestoreTimer);
  virtualDisplayRestoreTimer = undefined;
  clearTimeout(virtualDisplayVerifyTimer);
  virtualDisplayVerifyTimer = undefined;
  return virtualDisplayIntent.begin();
}

function applyDisplayPreset(preset, options = {}) {
  const intentRevision = Number.isInteger(options.intentRevision)
    ? options.intentRevision
    : virtualDisplayIntent.current();
  return virtualDisplayIntent.enqueue(
    intentRevision,
    () => applyDisplayPresetNow(preset, { ...options, intentRevision })
  );
}

async function applyDisplayPresetNow(preset, options = {}) {
  const profiles = compatibleDisplayProfiles(preset);
  const requestedIndex = Number.isInteger(options.candidateIndex)
    ? clamp(options.candidateIndex, 0, profiles.length - 1)
    : -1;
  const rememberedIndex = options.preferSession === false ? -1 : sessionCandidateIndex(profiles);
  const candidateIndexes = orderVirtualDisplayProfileIndexes(profiles.length, {
    requestedIndex,
    rememberedIndex,
    preferSession: options.preferSession,
    allowFallback: options.allowFallback
  });
  const firstIndex = candidateIndexes[0];
  const result = await applyVirtualDisplayCandidates(
    profiles,
    candidateIndexes,
    async (candidate, candidateIndex) => {
      const applyProfile = async (profile) => {
        virtualDisplaySuppressUntil = Date.now() + 12000;
        return rememberVirtualDisplayStatus(
          await applyVirtualDisplayProfile(profile, config.virtualDisplay.adapterName, {
            forceMode: true
          })
        );
      };

      if (options.roundTripIfMatching) {
        const currentStatus = await readVirtualDisplayStatus();
        if (!virtualDisplayIntent.isCurrent(options.intentRevision)) {
          return { ok: false, stale: true };
        }
        if (displayStatusMatchesPreset(currentStatus, candidate)) {
          return refreshVirtualDisplayProfile(
            candidate,
            createDisplayRefreshProfiles(profiles, candidateIndex),
            applyProfile,
            {
              isCurrent: () => virtualDisplayIntent.isCurrent(options.intentRevision),
              canContinue: canTryCompatibleProfile
            }
          );
        }
      }

      virtualDisplaySuppressUntil = Date.now() + 5000;
      return rememberVirtualDisplayStatus(
        await applyVirtualDisplayProfile(candidate, config.virtualDisplay.adapterName, {
          forceMode: options.forceMode === true
        })
      );
    },
    {
      isCurrent: () => virtualDisplayIntent.isCurrent(options.intentRevision),
      canContinue: (displayResult) => (
        options.allowFallback !== false && canTryCompatibleProfile(displayResult)
      )
    }
  );

  if (result.ok) {
    virtualDisplaySessionResolution = {
      width: result.preset.width,
      height: result.preset.height,
      deviceName: result.results.at(-1)?.deviceName || ''
    };
  }

  return result.candidateIndex >= 0
    ? result
    : { ...result, preset: profiles[firstIndex], candidateIndex: firstIndex };
}

function getAutoRestorePreset() {
  const presets = Array.isArray(config.displayPresets) && config.displayPresets.length
    ? config.displayPresets
    : DEFAULT_DISPLAY_PRESETS;
  return presets.find((preset) => preset.id === config.virtualDisplay.lastPresetId)
    || presets.find((preset) => preset.orientation === config.virtualDisplay.lastOrientation)
    || presets[0];
}

function displayStatusMatchesPreset(status, preset) {
  const orientationCodes = {
    landscape: 0,
    portrait: 1,
    'landscape-flipped': 2,
    'portrait-flipped': 3
  };
  const orientation = orientationCodes[preset.orientation] ?? 1;
  const portrait = orientation % 2 === 1;
  const expectedWidth = portrait ? preset.height : preset.width;
  const expectedHeight = portrait ? preset.width : preset.height;
  return Boolean(
    status.connected
    && status.ok
    && status.width === expectedWidth
    && status.height === expectedHeight
    && status.orientation === orientation
    && status.scale === preset.scale
  );
}

function effectiveDisplayDimensions(preset) {
  const portrait = ['portrait', 'portrait-flipped'].includes(preset.orientation);
  return {
    width: portrait ? preset.height : preset.width,
    height: portrait ? preset.width : preset.height
  };
}

function scheduleVirtualDisplayRestore(delay = 1500) {
  if (!config?.virtualDisplay?.autoRestore) return;
  if (Date.now() < virtualDisplaySuppressUntil) return;
  clearTimeout(virtualDisplayRestoreTimer);
  virtualDisplayRestoreTimer = setTimeout(() => {
    virtualDisplayRestoreTimer = undefined;
    runVirtualDisplayRestore();
  }, delay);
}

function scheduleVirtualDisplayRestoreForActiveSession(delay) {
  if (gameViewerSessionConnected !== true) return;
  scheduleVirtualDisplayRestore(delay);
}

async function runVirtualDisplayRestore(context = {}) {
  if (virtualDisplayRestoreInProgress || !config?.virtualDisplay?.autoRestore) return;
  if (Date.now() < virtualDisplaySuppressUntil) return;
  const intentRevision = Number.isInteger(context.intentRevision)
    ? context.intentRevision
    : virtualDisplayIntent.current();
  if (!virtualDisplayIntent.isCurrent(intentRevision)) return;
  virtualDisplayRestoreInProgress = true;
  try {
    const requestedPreset = context.requestedPreset || getAutoRestorePreset();
    const profiles = compatibleDisplayProfiles(requestedPreset);
    const preferSession = context.preferSession !== false;
    const rememberedIndex = preferSession ? sessionCandidateIndex(profiles) : -1;
    const candidateIndex = Number.isInteger(context.candidateIndex)
      ? clamp(context.candidateIndex, 0, profiles.length - 1)
      : (rememberedIndex >= 0 ? rememberedIndex : 0);
    const expectedPreset = profiles[candidateIndex];
    const status = await readVirtualDisplayStatus();
    if (!virtualDisplayIntent.isCurrent(intentRevision)) return;
    if (!status.connected) {
      virtualDisplaySessionResolution = undefined;
      return;
    }
    if (displayStatusMatchesPreset(status, expectedPreset) && !context.forceMode) return;

    const result = await applyDisplayPreset(requestedPreset, {
      candidateIndex: Number.isInteger(context.candidateIndex) ? candidateIndex : undefined,
      preferSession,
      forceMode: context.forceMode === true,
      allowFallback: !Number.isInteger(context.candidateIndex) || candidateIndex < profiles.length - 1,
      roundTripIfMatching: context.roundTripIfMatching === true,
      intentRevision
    });
    if (result.stale || !virtualDisplayIntent.isCurrent(intentRevision)) return;
    if (!result.ok) {
      notifyVirtualDisplayFailure(result.results.at(-1)?.error);
      return;
    }

    clearTimeout(virtualDisplayVerifyTimer);
    virtualDisplayVerifyTimer = setTimeout(
      () => verifyVirtualDisplayRestore({
        requestedPreset,
        appliedPreset: result.preset,
        candidateIndex: result.candidateIndex,
        forceMode: context.forceMode === true,
        roundTripIfMatching: context.roundTripIfMatching === true,
        intentRevision,
        retryCount: result.candidateIndex === candidateIndex
          ? (Number(context.retryCount) || 0)
          : 0
      }),
      3200
    );
  } finally {
    virtualDisplayRestoreInProgress = false;
  }
}

async function verifyVirtualDisplayRestore(context) {
  if (!config?.virtualDisplay?.autoRestore) return;
  if (!virtualDisplayIntent.isCurrent(context.intentRevision)) return;
  const status = await readVirtualDisplayStatus();
  if (!virtualDisplayIntent.isCurrent(context.intentRevision)) return;
  if (!status.connected) {
    virtualDisplaySessionResolution = undefined;
    return;
  }
  if (displayStatusMatchesPreset(status, context.appliedPreset)) return;

  if (context.retryCount < 1) {
    await runVirtualDisplayRestore({
      requestedPreset: context.requestedPreset,
      candidateIndex: context.candidateIndex,
      forceMode: context.forceMode === true,
      roundTripIfMatching: context.roundTripIfMatching === true,
      retryCount: context.retryCount + 1,
      intentRevision: context.intentRevision
    });
    return;
  }

  notifyVirtualDisplayFailure('UU 再次覆盖了目标分辨率；将在下次显示变化时重新尝试。');
}

function notifyVirtualDisplayFailure(message) {
  const content = message || '请检查 UU 虚拟屏是否支持该分辨率、方向和缩放比例。';
  if (tray && typeof tray.displayBalloon === 'function') {
    tray.displayBalloon({ title: 'UU 虚拟屏自动恢复失败', content });
  }
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function rememberVirtualDisplayStatus(status) {
  if (status?.connected) {
    virtualDisplayNativeOrigin = {
      x: Number(status.positionX) || 0,
      y: Number(status.positionY) || 0
    };
  } else if (status?.step === 'detect') {
    virtualDisplayNativeOrigin = undefined;
  }
  return status;
}

async function readVirtualDisplayStatus() {
  return rememberVirtualDisplayStatus(
    await getVirtualDisplayStatus(config.virtualDisplay.adapterName)
  );
}

function syncRemoteMicrophone(connected) {
  const automation = config.remoteAutomation || DEFAULT_REMOTE_AUTOMATION;
  if (!automation.microphoneEnabled || connected === undefined) {
    shandianshuoAudioController?.cancelPending();
    return;
  }
  shandianshuoAudioController?.requestDevice(
    connected ? automation.remoteAudioDevice : automation.localAudioDevice
  );
}

async function applyRemoteSessionAutomation(connected, options = {}) {
  const automation = config.remoteAutomation || DEFAULT_REMOTE_AUTOMATION;
  syncRemoteMicrophone(connected);

  if (connected && config.virtualDisplay.autoRestore) {
    clearTimeout(virtualDisplayRestoreTimer);
    virtualDisplayRestoreTimer = undefined;
    while (virtualDisplayRestoreInProgress) await wait(150);
    if (Date.now() < virtualDisplaySuppressUntil) {
      await wait(virtualDisplaySuppressUntil - Date.now() + 100);
    }
    await runVirtualDisplayRestore({
      preferSession: options.connectionChanged || options.entrySync ? false : undefined,
      forceMode: Boolean(options.connectionChanged || options.entrySync),
      roundTripIfMatching: Boolean(options.connectionChanged || options.entrySync),
      intentRevision: options.intentRevision
    });
  }

  if ((options.connectionChanged || options.entrySync) && automation.resetFloatingWindow) {
    scheduleFloatingWindowReset(800);
  }
}

function scheduleGameViewerSessionAutomation(connected) {
  gameViewerSessionConnected = connected;
  clearTimeout(gameViewerSessionAutomationTimer);
  const intentRevision = beginVirtualDisplayIntent();
  gameViewerSessionAutomationTimer = setTimeout(() => {
    gameViewerSessionAutomationTimer = undefined;
    applyRemoteSessionAutomation(connected, {
      connectionChanged: true,
      entrySync: connected,
      intentRevision
    }).catch((error) => notifyVirtualDisplayFailure(error.message));
  }, connected ? 700 : 250);
}

function registerGameViewerSessionAutomation() {
  gameViewerSessionWatcher = new GameViewerSessionWatcher({
    onSessionChanged: ({ connected }) => scheduleGameViewerSessionAutomation(connected)
  }).start();
}

function notifyRemoteAutomationFailure(message) {
  if (tray && typeof tray.displayBalloon === 'function') {
    tray.displayBalloon({
      title: '闪电说麦克风切换失败',
      content: message || '请检查闪电说和录音设备状态。'
    });
  }
}

function broadcastShandianshuoStatus(status) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('shandianshuo:statusChanged', status);
  }
}

async function getShandianshuoAudioDevices() {
  const result = await listCaptureDevices();
  const devices = [
    { id: SYSTEM_AUDIO_DEVICE, label: '自动选择', active: true, system: true },
    ...result.devices
  ];
  const knownIds = new Set(devices.map((device) => device.id));
  for (const audioDevice of [config.remoteAutomation.localAudioDevice, config.remoteAutomation.remoteAudioDevice]) {
    if (!knownIds.has(audioDevice)) {
      devices.push({ id: audioDevice, label: audioDevice, active: false, system: false });
      knownIds.add(audioDevice);
    }
  }
  return { ok: result.ok, devices, error: result.error || '' };
}

function registerVirtualDisplayAutomation() {
  const schedule = () => {
    if (Date.now() < virtualDisplaySuppressUntil) return;
    scheduleVirtualDisplayRestoreForActiveSession(1800);
  };
  screen.on('display-added', schedule);
  screen.on('display-metrics-changed', schedule);
  screen.on('display-removed', schedule);
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
  const open = Boolean(nextOpen);
  if (sideActionsOpen === open) return { ok: true, open: sideActionsOpen };

  sideActionsOpen = open;
  updateFloatingWindowShape();
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
  ipcMain.handle('config:save', (_event, nextConfig, options) => saveConfig(nextConfig, options));
  ipcMain.handle('shortcut:send', (_event, shortcut, context) => sendShortcut(shortcut, context));
  ipcMain.handle('shortcut:sendSequence', (_event, shortcuts) => sendShortcutSequence(shortcuts));
  ipcMain.handle('text:send', (_event, text, afterShortcut) => sendText(text, afterShortcut));
  ipcMain.handle('text:insert', (_event, text, afterShortcut) => sendText(text, afterShortcut));
  ipcMain.handle('shortcut:startRepeat', (_event, shortcut) => startRepeatShortcut(shortcut));
  ipcMain.handle('shortcut:stopRepeat', () => stopRepeatShortcut());
  ipcMain.handle('floating:setSideActionsOpen', (_event, open) => setSideActionsOpen(open));
  ipcMain.handle('startup:get', () => getStartupState());
  ipcMain.handle('startup:set', (_event, enabled) => {
    const state = setStartupEnabled(enabled);
    updateTrayMenu();
    return state;
  });
  ipcMain.handle('shandianshuo:listAudioDevices', () => getShandianshuoAudioDevices());
  ipcMain.handle('shandianshuo:getStatus', () => shandianshuoAudioController?.getStatus() || null);
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

    if (!config) return;
    if (config.remoteAutomation.resetFloatingWindow) {
      scheduleFloatingWindowReset(100);
    }
    if (gameViewerSessionConnected === true) {
      applyDisplayPresetFromTray(getAutoRestorePreset()).catch((error) => {
        notifyVirtualDisplayFailure(error.message);
      });
    }
  });

  app.whenReady().then(() => {
    config = loadConfig();
    registerAssetProtocol();
    shandianshuoAudioController = new ShandianshuoAudioController({
      appDataPath: app.getPath('appData'),
      notify: notifyRemoteAutomationFailure,
      onStatusChanged: broadcastShandianshuoStatus
    });
    registerIpc();
    createFloatingWindow();
    createTray();
    ensureInputSender();
    registerGameViewerSessionAutomation();
    registerVirtualDisplayAutomation();

    app.on('activate', () => {
      if (!floatingWindow) createFloatingWindow();
    });
  });

  app.on('before-quit', () => {
    clearTimeout(virtualDisplayRestoreTimer);
    clearTimeout(virtualDisplayVerifyTimer);
    clearTimeout(gameViewerSessionAutomationTimer);
    clearTimeout(floatingResetTimer);
    gameViewerSessionWatcher?.dispose();
    shandianshuoAudioController?.dispose();
    stopInputSender();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
