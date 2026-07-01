const { app, BrowserWindow, Menu, Tray, clipboard, dialog, ipcMain, nativeImage, protocol, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEV_URL = 'http://127.0.0.1:5173';
const DEFAULT_PUNCTUATION_ITEMS = [
  { id: 'comma', label: '逗号', text: '，' },
  { id: 'period', label: '句号', text: '。' },
  { id: 'exclamation', label: '感叹号', text: '！' },
  { id: 'quote', label: '中文引号', text: '「」', afterShortcut: 'Left' }
];
const DEFAULT_DISPLAY_PRESETS = [
  { id: 'preset-1', label: '设置一', width: 0, height: 0, scale: 175, orientation: 'portrait' },
  { id: 'preset-2', label: '设置二', width: 0, height: 0, scale: 100, orientation: 'landscape' }
];

const DEFAULT_CONFIG = {
  schemaVersion: 5,
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
let inputSenderProcess;
let inputSenderBuffer = '';
let inputSenderRequestId = 0;
const inputSenderPending = new Map();

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

  next.buttons = ensureRequiredButtons(next.buttons);
  next.punctuationItems = mergePunctuationItems(rawValue.punctuationItems);
  next.displayPresets = mergeDisplayPresets(rawValue.displayPresets);
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
      label: item && item.label ? String(item.label) : `标点 ${index + 1}`,
      text: item && item.text ? String(item.text) : '',
      afterShortcut: item && item.afterShortcut ? String(item.afterShortcut) : ''
    }))
    .filter((item) => item.text);
}

function mergeDisplayPresets(value) {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_DISPLAY_PRESETS;
  const presets = source
    .map((preset, index) => normalizeDisplayPreset(preset, index))
    .filter(Boolean);
  return presets.length ? presets : DEFAULT_DISPLAY_PRESETS.map((preset, index) => normalizeDisplayPreset(preset, index));
}

function normalizeDisplayPreset(value, index = 0) {
  const preset = value && typeof value === 'object' ? value : {};
  const fallback = DEFAULT_DISPLAY_PRESETS[index] || DEFAULT_DISPLAY_PRESETS[0];
  const orientation = ['landscape', 'portrait', 'landscape-flipped', 'portrait-flipped'].includes(preset.orientation)
    ? preset.orientation
    : fallback.orientation;

  return {
    id: preset.id ? String(preset.id) : `preset-${index + 1}`,
    label: preset.label ? String(preset.label) : `设置${index + 1}`,
    width: clamp(Math.round(Number(preset.width) || 0), 0, 10000),
    height: clamp(Math.round(Number(preset.height) || 0), 0, 10000),
    scale: clamp(Math.round(Number(preset.scale) || fallback.scale), 100, 350),
    orientation
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
  config = mergeConfig(nextConfig);
  const nextLayoutSignature = floatingLayoutSignature(config);
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
  if (!options.preserveFloatingBounds && previousLayoutSignature !== nextLayoutSignature) {
    resizeFloatingWindow();
  } else {
    updateFloatingWindowShape();
  }
  broadcastConfig();
  return config;
}

function floatingLayoutSignature(targetConfig) {
  return JSON.stringify({
    window: targetConfig.window,
    buttonCount: Array.isArray(targetConfig.buttons) ? targetConfig.buttons.length : 0
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
  const display = screen.getPrimaryDisplay();
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
  updateFloatingWindowShape();
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

function showDisplayPresetMenu() {
  if (!tray) return;
  const presets = Array.isArray(config.displayPresets) && config.displayPresets.length
    ? config.displayPresets
    : DEFAULT_DISPLAY_PRESETS;

  const menu = Menu.buildFromTemplate(presets.map((preset, index) => ({
    label: displayPresetMenuLabel(preset, index),
    click: () => applyDisplayPresetFromTray(preset)
  })));

  tray.popUpContextMenu(menu);
}

function displayPresetMenuLabel(preset, index) {
  const normalized = normalizeDisplayPreset(preset, index);
  const orientationText = {
    landscape: '横向',
    portrait: '纵向',
    'landscape-flipped': '横向翻转',
    'portrait-flipped': '纵向翻转'
  }[normalized.orientation] || normalized.orientation;
  return `${normalized.label} · ${orientationText} · ${normalized.scale}%`;
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

  for (const modifier of uniqueModifiers) events.push(keyEvent(modifier.vk, false));

  if (key) {
    const keyVk = keyToVirtualKey(key);
    if (!keyVk) throw new Error(`Native sender does not support ${key}.`);
    events.push(keyEvent(keyVk, false));
    events.push(keyEvent(keyVk, true));
  }

  for (const modifier of [...uniqueModifiers].reverse()) events.push(keyEvent(modifier.vk, true));
  return events;
}

function keyEvent(vk, up) {
  return { vk, up, extended: isExtendedVirtualKey(vk) };
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

function isExtendedVirtualKey(vk) {
  return new Set([
    0x21, // PageUp
    0x22, // PageDown
    0x23, // End
    0x24, // Home
    0x25, // Left
    0x26, // Up
    0x27, // Right
    0x28, // Down
    0x2d, // Insert
    0x2e, // Delete
    0x5b // Left Windows
  ]).has(vk);
}

function inputSenderScript() {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
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
}
'@
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

function sendShortcut(shortcut) {
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

function runPowerShell(command) {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
    child.on('exit', (code) => {
      resolve(code === 0
        ? { ok: true, output: stdout.trim() }
        : { ok: false, error: stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}` });
    });
  });
}

async function applyDisplayPresetFromTray(preset) {
  const result = await applyDisplayPreset(preset);
  const failedStep = result.results.find((step) => !step.ok);

  if (tray && typeof tray.displayBalloon === 'function') {
    tray.displayBalloon({
      title: result.ok ? '已应用屏幕预设' : '屏幕预设未完全应用',
      content: result.ok
        ? '分辨率和方向已提交；缩放比例可能需要注销或重新登录后完全生效。'
        : failedStep?.error || '请检查当前屏幕是否支持该分辨率或方向。'
    });
  } else if (!result.ok) {
    dialog.showErrorBox('屏幕预设未完全应用', failedStep?.error || '请检查当前屏幕是否支持该分辨率或方向。');
  }

  return result;
}

async function applyDisplayPreset(preset) {
  const normalized = normalizeDisplayPreset(preset);
  const results = [];

  const displayResult = await applyDisplayMode(normalized);
  results.push({ step: 'display', ...displayResult });
  resizeFloatingWindow();

  const scaleResult = await applyDisplayScale(normalized.scale);
  results.push({ step: 'scale', ...scaleResult, needsSignOut: true });

  return {
    ok: results.every((result) => result.ok),
    preset: normalized,
    results
  };
}

function applyDisplayMode(preset) {
  const orientationCodes = {
    landscape: 0,
    portrait: 1,
    'landscape-flipped': 2,
    'portrait-flipped': 3
  };
  const orientation = orientationCodes[preset.orientation] ?? 1;
  const width = Number(preset.width) || 0;
  const height = Number(preset.height) || 0;
  const typeDefinition = [
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class DisplaySettings {',
    '  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]',
    '  public struct DEVMODE {',
    '    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;',
    '    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra;',
    '    public int dmFields;',
    '    public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;',
    '    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;',
    '    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;',
    '    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight;',
    '    public int dmDisplayFlags; public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent;',
    '    public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2;',
    '    public int dmPanningWidth; public int dmPanningHeight;',
    '  }',
    '  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern int EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);',
    '  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern int ChangeDisplaySettingsEx(string deviceName, ref DEVMODE devMode, IntPtr hwnd, int flags, IntPtr lParam);',
    '  public static int Apply(int width, int height, int orientation) {',
    '    DEVMODE mode = new DEVMODE();',
    '    mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));',
    '    EnumDisplaySettings(null, -1, ref mode);',
    '    int nextWidth = width > 0 && height > 0 ? width : mode.dmPelsWidth;',
    '    int nextHeight = width > 0 && height > 0 ? height : mode.dmPelsHeight;',
    '    if (!(width > 0 && height > 0) && ((mode.dmDisplayOrientation % 2) != (orientation % 2))) { int swap = nextWidth; nextWidth = nextHeight; nextHeight = swap; }',
    '    mode.dmFields = 0x80 | 0x80000 | 0x100000;',
    '    mode.dmDisplayOrientation = orientation;',
    '    mode.dmPelsWidth = nextWidth;',
    '    mode.dmPelsHeight = nextHeight;',
    '    return ChangeDisplaySettingsEx(null, ref mode, IntPtr.Zero, 0, IntPtr.Zero);',
    '  }',
    '}'
  ].join(' ');
  const encodedType = Buffer.from(typeDefinition, 'utf16le').toString('base64');
  const command = [
    `$type = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedType}'))`,
    'Add-Type -TypeDefinition $type',
    `$result = [DisplaySettings]::Apply(${width}, ${height}, ${orientation})`,
    'if ($result -ne 0) { throw "ChangeDisplaySettingsEx returned $result" }'
  ].join('; ');

  return runPowerShell(command);
}

function applyDisplayScale(scale) {
  const dpi = Math.round(96 * clamp(Number(scale) || DEFAULT_DISPLAY_PRESETS[0].scale, 100, 350) / 100);
  const command = [
    `Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name Win8DpiScaling -Type DWord -Value 1`,
    `Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name LogPixels -Type DWord -Value ${dpi}`,
    'Start-Process -FilePath rundll32.exe -ArgumentList "user32.dll,UpdatePerUserSystemParameters" -WindowStyle Hidden'
  ].join('; ');

  return runPowerShell(command);
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
  ipcMain.handle('shortcut:send', (_event, shortcut) => sendShortcut(shortcut));
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
    ensureInputSender();

    app.on('activate', () => {
      if (!floatingWindow) createFloatingWindow();
    });
  });

  app.on('before-quit', () => {
    stopInputSender();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
