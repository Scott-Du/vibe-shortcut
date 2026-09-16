import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Icons from 'lucide-react';
import './styles.css';

const LONG_PRESS_MS = 380;
const DELETE_TO_CURSOR_HEAD_HOLD_MS = 2000;
const MODIFIER_ONLY_COMMIT_MS = 700;
const DELETE_TO_HEAD_SEQUENCE = ['Ctrl+Shift+Home', 'Backspace'];
const VOICE_MODE_ORDER = ['wechat', 'lightning'];
const DeleteToHeadIcon = Icons.ArrowLeftToLine || Icons.CornerUpLeft || Icons.Delete;
const PUNCTUATION_TOOL_ITEMS = [
  { id: 'copy', label: '复制', icon: 'Copy', shortcut: 'Ctrl+C' },
  { id: 'paste', label: '粘贴', icon: 'Clipboard', shortcut: 'Ctrl+V' },
  { id: 'cut', label: '剪切', icon: 'Scissors', shortcut: 'Ctrl+X' }
];
const defaultPunctuationTools = {
  screenshot: {
    id: 'screenshot',
    label: '截图',
    icon: 'ScanLine',
    shortcut: 'Ctrl+Q'
  }
};
const defaultPunctuationItems = [
  { id: 'comma', label: '逗号', text: '，' },
  { id: 'period', label: '句号', text: '。' },
  { id: 'exclamation', label: '感叹号', text: '！' },
  { id: 'quote', label: '中文引号', text: '「」', afterShortcut: 'Left' }
];
const defaultDisplayPresets = [
  { id: 'preset-1', label: '设置一', orientation: 'portrait', target: 'gameviewer-virtual' },
  { id: 'preset-2', label: '设置二', orientation: 'landscape', target: 'gameviewer-virtual' }
];
const defaultVirtualDisplay = {
  adapterName: 'GameViewer Virtual Display Adapter',
  lastOrientation: 'portrait',
  lastPresetId: 'preset-1'
};
const defaultRemoteAutomation = {
  refreshVirtualDisplayScale: true,
  resetFloatingWindow: true
};
const SETTINGS_SECTIONS = [
  { id: 'buttons', label: '按钮' },
  { id: 'voice', label: '语音' },
  { id: 'punctuation', label: '标点' },
  { id: 'appearance', label: '外观' },
  { id: 'display', label: '屏幕' },
  { id: 'system', label: '系统' }
];
const ICON_PICKER_ITEMS = [
  { icon: 'Mic', label: '话筒' },
  { icon: 'SendHorizontal', label: '发送' },
  { icon: 'Delete', label: '删除' },
  { icon: 'Braces', label: '标点' },
  { icon: 'Keyboard', label: '键盘' },
  { icon: 'MessageCircle', label: '消息' },
  { icon: 'Zap', label: '闪电' },
  { icon: 'Clipboard', label: '粘贴' },
  { icon: 'Copy', label: '复制' },
  { icon: 'Scissors', label: '剪切' },
  { icon: 'MousePointerClick', label: '点击' },
  { icon: 'Settings', label: '设置' },
  { icon: 'Monitor', label: '屏幕' },
  { icon: 'TabletSmartphone', label: '平板' },
  { icon: 'Command', label: '命令' },
  { icon: 'CornerDownLeft', label: '回车' },
  { icon: 'CornerUpLeft', label: '撤回' },
  { icon: 'Trash2', label: '清理' },
  { icon: 'Search', label: '搜索' },
  { icon: 'Plus', label: '增加' },
  { icon: 'Minus', label: '减少' },
  { icon: 'Home', label: '主页' },
  { icon: 'User', label: '用户' },
  { icon: 'PenLine', label: '编辑' },
  { icon: 'FileText', label: '文档' },
  { icon: 'Image', label: '图片' },
  { icon: 'Camera', label: '相机' },
  { icon: 'Volume2', label: '音量' },
  { icon: 'Headphones', label: '耳机' },
  { icon: 'Bot', label: '智能' },
  { icon: 'Sparkles', label: '灵感' },
  { icon: 'Star', label: '星标' },
  { icon: 'Heart', label: '喜欢' },
  { icon: 'Bell', label: '提醒' },
  { icon: 'Circle', label: '圆形' },
  { icon: 'Square', label: '方形' }
];

const defaultVoiceModes = {
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
};

const previewConfig = {
  schemaVersion: 11,
  buttons: [
    { id: 'punctuation', label: '标点', iconType: 'lucide', icon: 'Braces', image: '', shortcut: '' },
    { id: 'voice', label: '语音', iconType: 'lucide', icon: 'Mic', image: '', shortcut: 'Ctrl+I' },
    { id: 'send', label: '发送', iconType: 'lucide', icon: 'SendHorizontal', image: '', shortcut: 'Enter' },
    { id: 'delete', label: '删除', iconType: 'lucide', icon: 'Delete', image: '', shortcut: 'Backspace' }
  ],
  punctuationItems: defaultPunctuationItems,
  punctuationTools: defaultPunctuationTools,
  displayPresets: defaultDisplayPresets,
  virtualDisplay: defaultVirtualDisplay,
  remoteAutomation: defaultRemoteAutomation,
  voiceModes: defaultVoiceModes,
  window: { corner: 'bottom-right', buttonSize: 64, gap: 10, opacity: 0.78 }
};

const api = window.vibeShortcut || {
  getConfig: async () => {
    const saved = window.localStorage.getItem('vibe-shortcut-preview');
    return saved ? JSON.parse(saved) : previewConfig;
  },
  saveConfig: async (config) => {
    window.localStorage.setItem('vibe-shortcut-preview', JSON.stringify(config));
    return config;
  },
  sendShortcut: async (shortcut) => {
    console.info(`Preview shortcut: ${shortcut}`);
    return { ok: true };
  },
  sendShortcutSequence: async (shortcuts) => {
    console.info(`Preview shortcut sequence: ${shortcuts.join(', ')}`);
    return { ok: true };
  },
  sendText: async (text, afterShortcut) => {
    console.info(`Preview text: ${text}${afterShortcut ? ` then ${afterShortcut}` : ''}`);
    return { ok: true };
  },
  insertText: async (text, afterShortcut) => {
    console.info(`Preview text insert: ${text}${afterShortcut ? ` then ${afterShortcut}` : ''}`);
    return { ok: true };
  },
  startRepeatShortcut: async (shortcut) => {
    console.info(`Preview repeat shortcut: ${shortcut}`);
    return { ok: true };
  },
  stopRepeatShortcut: async () => ({ ok: true }),
  setSideActionsOpen: async () => ({ ok: true }),
  getStartup: async () => ({ enabled: false, supported: false }),
  setStartup: async () => ({ enabled: false, supported: false }),
  openSettings: () => {
    window.location.href = `${window.location.origin}${window.location.pathname}?mode=settings`;
  },
  closeSettings: () => {
    window.location.href = `${window.location.origin}${window.location.pathname}?mode=floating`;
  },
  chooseImage: async () => null,
  onConfigChanged: () => () => {},
  onStartupChanged: () => () => {}
};

const mode = new URLSearchParams(window.location.search).get('mode') || 'floating';

function App() {
  return mode === 'settings' ? <SettingsApp /> : <FloatingPanel />;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
}

function FloatingPanel() {
  const [config, setConfig] = useConfig();
  const [activeId, setActiveId] = useState(null);
  const [sideActionType, setSideActionTypeState] = useState(null);
  const [deleteHeadArmed, setDeleteHeadArmed] = useState(false);
  const repeatDelayRef = useRef(null);
  const repeatingRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const pressedButtonRef = useRef(null);
  const deleteHeadRef = useRef(null);
  const deleteToHeadTimerRef = useRef(null);
  const deleteToHeadTriggeredRef = useRef(false);
  const deleteRepeatTimerRef = useRef(null);
  const deleteRepeatActiveRef = useRef(false);
  const deleteRepeatInFlightRef = useRef(null);
  const sideActionRequestRef = useRef(0);

  useEffect(() => {
    return () => {
      sideActionRequestRef.current += 1;
      stopRepeat();
      api.setSideActionsOpen(false);
    };
  }, []);

  if (!config) return null;

  const buttons = config.buttons;
  const voiceModes = getVoiceModes(config);
  const buttonSize = config.window.buttonSize;
  const sideButtonSize = Math.round(buttonSize * 0.78);
  const style = {
    '--button-size': `${buttonSize}px`,
    '--side-button-size': `${sideButtonSize}px`,
    '--button-gap': `${config.window.gap}px`,
    '--glass-opacity': config.window.opacity
  };

  function setSideActionType(type) {
    const nextType = type || null;
    const requestId = sideActionRequestRef.current + 1;
    sideActionRequestRef.current = requestId;
    setDeleteHeadArmed(false);

    if (nextType) {
      return api.setSideActionsOpen(true).finally(() => {
        if (sideActionRequestRef.current !== requestId) return;
        window.requestAnimationFrame(() => {
          if (sideActionRequestRef.current === requestId) {
            setSideActionTypeState(nextType);
          }
        });
      });
      return;
    }

    setSideActionTypeState(null);
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        if (sideActionRequestRef.current !== requestId) {
          resolve();
          return;
        }

        Promise.resolve(api.setSideActionsOpen(false))
          .catch(() => {})
          .finally(resolve);
      });
    });
  }

  function pulse(id) {
    setActiveId(id);
    window.setTimeout(() => setActiveId(null), 160);
  }

  async function triggerShortcut(id, shortcut, context) {
    pulse(id);
    await api.sendShortcut(shortcut, context);
  }

  async function triggerButton(button) {
    if (isVoiceButton(button)) {
      const activeMode = getActiveVoiceMode(config);
      await triggerShortcut(`voice:${activeMode.id}`, activeMode.shortcut, {
        kind: 'voice',
        modeId: activeMode.id,
        label: activeMode.label
      });
      return;
    }

    if (isPunctuationButton(button)) {
      pulse(button.id);
      setSideActionType(sideActionType === 'punctuation' ? null : 'punctuation');
      return;
    }

    await triggerShortcut(button.id, button.shortcut);
  }

  async function triggerDeleteToHead() {
    pulse('delete-head');
    await api.sendShortcutSequence(DELETE_TO_HEAD_SEQUENCE);
  }

  async function triggerPunctuationItem(item) {
    pulse(`punctuation:${item.id}`);
    if (api.sendText) await api.sendText(item.text, item.afterShortcut);
    else await api.insertText(item.text, item.afterShortcut);
  }

  async function triggerPunctuationTool(tool) {
    pulse(`punctuation:${tool.id}`);

    if (tool.id === 'screenshot') {
      await setSideActionType(null);
      await waitForPaint();
      await sleep(40);
    }

    await api.sendShortcut(tool.shortcut);
  }

  function openVoiceSelector(button, options = {}) {
    longPressTriggeredRef.current = true;
    if (options.pulseButton !== false) pulse(button.id);
    setSideActionType('voice');
  }

  async function handleButtonContextMenu(event, button) {
    event.preventDefault();
    event.stopPropagation();

    if (repeatDelayRef.current) {
      window.clearTimeout(repeatDelayRef.current);
      repeatDelayRef.current = null;
    }
    if (repeatingRef.current) {
      repeatingRef.current = false;
      api.stopRepeatShortcut();
    }

    longPressTriggeredRef.current = false;
    pressedButtonRef.current = null;

    if (isVoiceButton(button)) {
      if (sideActionType === 'voice') {
        setSideActionType(null);
      } else {
        openVoiceSelector(button, { pulseButton: false });
      }
      return;
    }

    if (isPunctuationButton(button)) {
      setSideActionType(sideActionType === 'punctuation' ? null : 'punctuation');
      return;
    }

    if (isSendButton(button)) {
      pulse(button.id);
      await api.sendShortcut('Ctrl+Enter');
      return;
    }

    if (isRepeatDeleteButton(button)) {
      setSideActionType(null);
      await triggerDeleteToHead();
      return;
    }

    setSideActionType(null);
  }

  function startPress(event, button) {
    if (event.button === 2) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    longPressTriggeredRef.current = false;
    pressedButtonRef.current = button;
    deleteToHeadTriggeredRef.current = false;

    if (sideActionType) setSideActionType(null);

    if (isVoiceButton(button)) {
      repeatDelayRef.current = window.setTimeout(() => {
        openVoiceSelector(button);
      }, LONG_PRESS_MS);
      return;
    }

    if (isRepeatDeleteButton(button)) {
      repeatDelayRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        startDeleteRepeat();
      }, LONG_PRESS_MS);
      deleteToHeadTimerRef.current = window.setTimeout(() => {
        runHeldDeleteToHead(button);
      }, DELETE_TO_CURSOR_HEAD_HOLD_MS);
      return;
    }

    if (isSendButton(button)) {
      repeatDelayRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        pulse(button.id);
        api.sendShortcut('Ctrl+Enter');
      }, LONG_PRESS_MS);
      return;
    }

    triggerButton(button);
  }

  function movePress(event) {
    if (!pressedButtonRef.current || sideActionType !== 'delete') return;
    setDeleteHeadArmed(isPointerInside(event, deleteHeadRef.current));
  }

  async function stopPress(event, finalize = true) {
    const pressedButton = pressedButtonRef.current;
    const wasLongPress = longPressTriggeredRef.current;
    const deleteToHeadTriggered = deleteToHeadTriggeredRef.current;
    const shouldDeleteToHead =
      finalize &&
      pressedButton &&
      isRepeatDeleteButton(pressedButton) &&
      wasLongPress &&
      isPointerInside(event, deleteHeadRef.current);

    if (repeatDelayRef.current) {
      window.clearTimeout(repeatDelayRef.current);
      repeatDelayRef.current = null;
    }
    clearDeleteToHeadTimer();
    if (pressedButton && isRepeatDeleteButton(pressedButton)) {
      await stopDeleteRepeat({ waitForInFlight: true });
    }

    longPressTriggeredRef.current = false;
    pressedButtonRef.current = null;
    deleteToHeadTriggeredRef.current = false;

    if (pressedButton && isRepeatDeleteButton(pressedButton)) {
      setSideActionType(null);
      if (shouldDeleteToHead && !deleteToHeadTriggered) {
        await triggerDeleteToHead();
      } else if (finalize && !wasLongPress && !deleteToHeadTriggered) {
        await triggerShortcut(pressedButton.id, pressedButton.shortcut || 'Backspace');
      }
      return;
    }

    if (finalize && pressedButton && isVoiceButton(pressedButton) && !wasLongPress) {
      triggerButton(pressedButton);
      return;
    }

    if (finalize && pressedButton && isSendButton(pressedButton) && !wasLongPress) {
      triggerButton(pressedButton);
    }
  }

  function stopRepeat() {
    if (repeatDelayRef.current) {
      window.clearTimeout(repeatDelayRef.current);
      repeatDelayRef.current = null;
    }
    clearDeleteToHeadTimer();
    repeatingRef.current = false;
    longPressTriggeredRef.current = false;
    pressedButtonRef.current = null;
    deleteToHeadTriggeredRef.current = false;
    setDeleteHeadArmed(false);
    api.stopRepeatShortcut();
    stopDeleteRepeat();
  }

  function clearDeleteToHeadTimer() {
    if (deleteToHeadTimerRef.current) {
      window.clearTimeout(deleteToHeadTimerRef.current);
      deleteToHeadTimerRef.current = null;
    }
  }

  function startDeleteRepeat() {
    stopDeleteRepeat();
    repeatingRef.current = true;
    deleteRepeatActiveRef.current = true;

    const tick = () => {
      if (!deleteRepeatActiveRef.current || deleteRepeatInFlightRef.current) return;
      deleteRepeatInFlightRef.current = api.sendShortcut('Backspace')
        .catch(() => null)
        .finally(() => {
          deleteRepeatInFlightRef.current = null;
        });
    };

    tick();
    deleteRepeatTimerRef.current = window.setInterval(tick, 110);
  }

  async function stopDeleteRepeat(options = {}) {
    repeatingRef.current = false;
    deleteRepeatActiveRef.current = false;
    if (deleteRepeatTimerRef.current) {
      window.clearInterval(deleteRepeatTimerRef.current);
      deleteRepeatTimerRef.current = null;
    }

    if (options.waitForInFlight && deleteRepeatInFlightRef.current) {
      await deleteRepeatInFlightRef.current.catch(() => null);
      await sleep(35);
    }
  }

  async function runHeldDeleteToHead(button) {
    if (pressedButtonRef.current !== button || deleteToHeadTriggeredRef.current) return;

    deleteToHeadTriggeredRef.current = true;
    longPressTriggeredRef.current = true;
    clearDeleteToHeadTimer();
    if (repeatDelayRef.current) {
      window.clearTimeout(repeatDelayRef.current);
      repeatDelayRef.current = null;
    }
    setSideActionType(null);
    await stopDeleteRepeat({ waitForInFlight: true });
    await triggerDeleteToHead();
  }

  async function selectVoiceMode(modeId) {
    const nextConfig = {
      ...config,
      voiceModes: {
        ...voiceModes,
        activeId: modeId
      }
    };
    const saved = await api.saveConfig(nextConfig, { preserveFloatingBounds: true });
    setConfig(saved);
    setSideActionType(null);
  }

  function renderSideActions() {
    if (!sideActionType) return null;

    const targetId = sideActionType === 'voice' ? 'voice' : sideActionType === 'punctuation' ? 'punctuation' : 'delete';
    const rowIndex = Math.max(buttons.findIndex((button) => button.id === targetId), 0);
    const top = 12 + rowIndex * (buttonSize + config.window.gap) + buttonSize / 2;

    if (sideActionType === 'voice') {
      return (
        <div className="side-action-row" style={{ top: `${top}px` }} onPointerDown={(event) => event.stopPropagation()}>
          {VOICE_MODE_ORDER.map((modeId) => {
            const voiceMode = voiceModes.options[modeId];
            const selected = voiceModes.activeId === modeId;
            return (
              <button
                key={modeId}
                type="button"
                className={`side-action-button ${selected ? 'is-selected' : ''}`}
                title={`${voiceMode.label} · ${voiceMode.shortcut || '未设置'}`}
                onClick={() => selectVoiceMode(modeId)}
              >
                <ButtonIcon button={voiceMode} size={Math.round(sideButtonSize * 0.46)} />
              </button>
            );
          })}
        </div>
      );
    }

    if (sideActionType === 'punctuation') {
      return (
        <div className="side-action-column punctuation-panel" onPointerDown={(event) => event.stopPropagation()}>
          <div className="punctuation-tool-column">
            {getPunctuationToolItems(config).map((tool) => {
              const ToolIcon = Icons[tool.icon] || Icons.Circle;
              return (
                <button
                  key={tool.id}
                  type="button"
                  className="side-action-button punctuation-action punctuation-tool-action"
                  title={tool.label}
                  aria-label={tool.label}
                  onClick={() => triggerPunctuationTool(tool)}
                >
                  <ToolIcon size={Math.round(sideButtonSize * 0.38)} strokeWidth={2.4} />
                </button>
              );
            })}
          </div>
          <div className="punctuation-mark-column">
            {getPunctuationItems(config).map((item) => (
              <button
                key={item.id}
                type="button"
                className="side-action-button punctuation-action"
                title={item.label}
                onClick={() => triggerPunctuationItem(item)}
              >
                <span className="punctuation-glyph">{item.text}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="side-action-row" style={{ top: `${top}px` }}>
        <button
          ref={deleteHeadRef}
          type="button"
          className={`side-action-button danger-action ${deleteHeadArmed ? 'is-armed' : ''}`}
          title="删到光标前"
        >
          <DeleteToHeadIcon size={Math.round(sideButtonSize * 0.45)} strokeWidth={2.4} />
        </button>
      </div>
    );
  }

  return (
    <main
      className={`floating-stage ${sideActionType ? 'has-side-actions' : ''}`}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && sideActionType) setSideActionType(null);
      }}
    >
      <div className="floating-layout" style={style}>
        {renderSideActions()}
        <section className="floating-shell">
          <div className="shortcut-stack">
            {buttons.map((button) => (
              <button
                key={button.id}
                className={`shortcut-button ${activeId === button.id ? 'is-active' : ''}`}
                title={buttonTitle(button, config)}
                type="button"
                onPointerDown={(event) => startPress(event, button)}
                onPointerMove={movePress}
                onPointerUp={(event) => stopPress(event, true)}
                onPointerCancel={(event) => stopPress(event, false)}
                onLostPointerCapture={(event) => stopPress(event, false)}
                onContextMenu={(event) => handleButtonContextMenu(event, button)}
              >
                <ButtonIcon button={button} size={Math.round(buttonSize * 0.42)} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingsApp() {
  const [config, setConfig] = useConfig();
  const [draft, setDraft] = useState(null);
  const [activeSection, setActiveSection] = useState('buttons');
  const [recordingId, setRecordingId] = useState(null);
  const [iconPicker, setIconPicker] = useState(null);
  const [iconSearch, setIconSearch] = useState('');
  const [startup, setStartup] = useState({ enabled: false, supported: false });
  const recorderRef = useRef(null);
  const modifierRecordTimerRef = useRef(null);
  const draftReadyRef = useRef(false);
  const saveRequestRef = useRef(0);

  useEffect(() => {
    if (!config || draftReadyRef.current) return;
    setDraft(config);
    draftReadyRef.current = true;
  }, [config]);

  useEffect(() => {
    let mounted = true;
    api.getStartup().then((nextStartup) => {
      if (mounted) setStartup(nextStartup);
    });
    const unsubscribe = api.onStartupChanged((nextStartup) => setStartup(nextStartup));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!recordingId) return undefined;

    const clearModifierRecordTimer = () => {
      if (modifierRecordTimerRef.current) {
        window.clearTimeout(modifierRecordTimerRef.current);
        modifierRecordTimerRef.current = null;
      }
    };

    const commitShortcut = (shortcut) => {
      if (!shortcut) return;
      clearModifierRecordTimer();
      if (recordingId.startsWith('voice:')) {
        updateVoiceMode(recordingId.replace('voice:', ''), { shortcut });
      } else if (recordingId.startsWith('button:')) {
        updateButton(recordingId.replace('button:', ''), { shortcut });
      } else if (recordingId === 'tool:screenshot') {
        updateScreenshotTool({ shortcut });
      }
      setRecordingId(null);
    };

    const onKeyDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const shortcut = formatShortcut(event);
      if (!shortcut) return;

      const isModifierOnly = !normalizeKey(event.key);
      if (!isModifierOnly) {
        commitShortcut(shortcut);
        return;
      }

      clearModifierRecordTimer();
      const modifierCount = shortcut.split('+').length;
      if (modifierCount >= 3) {
        commitShortcut(shortcut);
        return;
      }

      modifierRecordTimerRef.current = window.setTimeout(() => {
        commitShortcut(shortcut);
      }, MODIFIER_ONLY_COMMIT_MS);
    };

    window.addEventListener('keydown', onKeyDown, true);
    recorderRef.current?.focus();
    return () => {
      clearModifierRecordTimer();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [recordingId]);

  if (!draft) return null;

  const buttons = Array.isArray(draft.buttons) ? draft.buttons : [];
  const voiceModes = getVoiceModes(draft);
  const punctuationItems = getEditablePunctuationItems(draft);
  const punctuationTools = getPunctuationTools(draft);
  const displayPresets = getEditableDisplayPresets(draft);
  const remoteAutomation = getRemoteAutomation(draft);

  function commitDraft(updater, options) {
    setDraft((current) => {
      if (!current) return current;
      const nextDraft = typeof updater === 'function' ? updater(current) : updater;
      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;
      api.saveConfig(nextDraft, options).then((saved) => {
        if (saveRequestRef.current !== requestId) return;
        setConfig(saved);
        setDraft(saved);
      }).catch((error) => {
        console.error('Failed to save config', error);
      });
      return nextDraft;
    });
  }

  function setWindowPatch(patch) {
    commitDraft((current) => ({
      ...current,
      window: {
        ...current.window,
        ...patch
      }
    }));
  }

  function updateButton(id, patch) {
    commitDraft((current) => ({
      ...current,
      buttons: current.buttons.map((button) => (button.id === id ? { ...button, ...patch } : button))
    }));
  }

  function updateVoiceMode(id, patch) {
    commitDraft((current) => {
      const currentVoiceModes = getVoiceModes(current);
      return {
        ...current,
        voiceModes: {
          ...currentVoiceModes,
          activeId: Object.prototype.hasOwnProperty.call(patch, 'shortcut') ? id : currentVoiceModes.activeId,
          options: {
            ...currentVoiceModes.options,
            [id]: {
              ...currentVoiceModes.options[id],
              ...patch
            }
          }
        }
      };
    });
  }

  function setActiveVoiceMode(id) {
    commitDraft((current) => ({
      ...current,
      voiceModes: {
        ...getVoiceModes(current),
        activeId: id
      }
    }));
  }

  function addButton() {
    const id = `button-${Date.now()}`;
    const nextButton = {
      id,
      label: '新按钮',
      iconType: 'lucide',
      icon: 'Sparkles',
      image: '',
      shortcut: 'Ctrl+I'
    };
    commitDraft((current) => ({
      ...current,
      buttons: [...current.buttons, nextButton]
    }));
  }

  function removeButton(id) {
    if (buttons.length <= 1) return;
    commitDraft((current) => ({
      ...current,
      buttons: current.buttons.filter((button) => button.id !== id)
    }));
  }

  function moveButton(id, direction) {
    commitDraft((current) => ({
      ...current,
      buttons: moveById(current.buttons, id, direction)
    }));
  }

  async function chooseButtonImage(id) {
    const image = await api.chooseImage();
    if (image) {
      updateButton(id, { iconType: 'image', image });
    }
  }

  async function chooseVoiceModeImage(modeId) {
    const image = await api.chooseImage();
    if (image) {
      updateVoiceMode(modeId, { iconType: 'image', image });
    }
  }

  function addPunctuationItem() {
    const id = `punctuation-${Date.now()}`;
    commitDraft((current) => ({
      ...current,
      punctuationItems: [
        ...getEditablePunctuationItems(current),
        { id, label: '新标点', text: '', afterShortcut: '' }
      ]
    }));
  }

  function updatePunctuationItem(id, patch) {
    commitDraft((current) => ({
      ...current,
      punctuationItems: getEditablePunctuationItems(current).map((item) => (
        item.id === id ? { ...item, ...patch } : item
      ))
    }));
  }

  function updateScreenshotTool(patch) {
    commitDraft((current) => ({
      ...current,
      punctuationTools: {
        ...getPunctuationTools(current),
        screenshot: {
          ...getPunctuationTools(current).screenshot,
          ...patch
        }
      }
    }), { preserveFloatingBounds: true });
  }

  function removePunctuationItem(id) {
    if (punctuationItems.length <= 1) return;
    commitDraft((current) => ({
      ...current,
      punctuationItems: getEditablePunctuationItems(current).filter((item) => item.id !== id)
    }));
  }

  function movePunctuationItem(id, direction) {
    commitDraft((current) => ({
      ...current,
      punctuationItems: moveById(getEditablePunctuationItems(current), id, direction)
    }));
  }

  function addDisplayPreset() {
    const id = `preset-${Date.now()}`;
    const index = displayPresets.length + 1;
    commitDraft((current) => ({
      ...current,
      displayPresets: [
        ...getEditableDisplayPresets(current),
        { id, label: `设置${index}`, orientation: 'landscape', target: 'gameviewer-virtual' }
      ]
    }));
  }

  function updateDisplayPreset(id, patch) {
    commitDraft((current) => ({
      ...current,
      displayPresets: getEditableDisplayPresets(current).map((preset) => (
        preset.id === id ? { ...preset, ...patch } : preset
      ))
    }));
  }

  function setRemoteAutomationPatch(patch) {
    commitDraft((current) => ({
      ...current,
      remoteAutomation: {
        ...getRemoteAutomation(current),
        ...patch
      }
    }), { preserveFloatingBounds: true });
  }

  function removeDisplayPreset(id) {
    if (displayPresets.length <= 1) return;
    commitDraft((current) => ({
      ...current,
      displayPresets: getEditableDisplayPresets(current).filter((preset) => preset.id !== id)
    }));
  }

  function moveDisplayPreset(id, direction) {
    commitDraft((current) => ({
      ...current,
      displayPresets: moveById(getEditableDisplayPresets(current), id, direction)
    }));
  }

  function restoreDefaults() {
    commitDraft(previewConfig);
  }

  function openIconPicker(targetType, id, currentIcon) {
    setIconSearch('');
    setIconPicker({ targetType, id, currentIcon: currentIcon || 'Circle' });
  }

  function closeIconPicker() {
    setIconPicker(null);
  }

  function chooseLucideIcon(iconName) {
    if (!iconPicker) return;
    if (iconPicker.targetType === 'voice') {
      updateVoiceMode(iconPicker.id, { iconType: 'lucide', icon: iconName });
    } else {
      updateButton(iconPicker.id, { iconType: 'lucide', icon: iconName });
    }
    closeIconPicker();
  }

  function renderIconSelect(iconName, onClick) {
    const label = iconLabel(iconName);
    return (
      <button type="button" className="icon-select-button" onClick={onClick}>
        <span className="icon-select-preview">
          <LucideIcon name={iconName} size={20} />
        </span>
        <span className="icon-select-copy">
          <strong>{label}</strong>
          <small>{iconName || 'Circle'}</small>
        </span>
        <Icons.ChevronDown size={16} />
      </button>
    );
  }

  function renderIconPicker() {
    if (!iconPicker) return null;
    const query = iconSearch.trim().toLowerCase();
    const filteredIcons = ICON_PICKER_ITEMS.filter((item) => (
      !query ||
      item.icon.toLowerCase().includes(query) ||
      item.label.toLowerCase().includes(query)
    ));

    return (
      <div
        className="icon-picker-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeIconPicker();
        }}
      >
        <div className="icon-picker" role="dialog" aria-label="选择图标">
          <div className="icon-picker-header">
            <strong>选择图标</strong>
            <button type="button" onClick={closeIconPicker} title="关闭">
              <Icons.X size={16} />
            </button>
          </div>
          <label className="icon-picker-search">
            <Icons.Search size={15} />
            <input
              value={iconSearch}
              onChange={(event) => setIconSearch(event.target.value)}
              placeholder="搜索图标"
              autoFocus
            />
          </label>
          <div className="icon-picker-grid">
            {filteredIcons.map((item) => (
              <button
                key={item.icon}
                type="button"
                className={`icon-picker-item ${item.icon === iconPicker.currentIcon ? 'is-selected' : ''}`}
                onClick={() => chooseLucideIcon(item.icon)}
                title={`${item.label} · ${item.icon}`}
              >
                <LucideIcon name={item.icon} size={21} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  async function toggleStartup(event) {
    const nextStartup = await api.setStartup(event.target.checked);
    setStartup(nextStartup);
  }

  function renderButtonsSection() {
    return (
      <div className="settings-section-page">
        <div className="section-heading">
          <div>
            <h2>按钮</h2>
            <p>悬浮框里的主按钮</p>
          </div>
          <button className="small-icon-button" type="button" onClick={addButton} title="新增按钮">
            <Icons.Plus size={17} />
          </button>
        </div>

        <div className="button-config-list">
          {buttons.map((button, index) => {
            const recording = recordingId === `button:${button.id}`;
            return (
              <div className="button-config-card" key={button.id}>
                <div className="item-config-header">
                  <span className="button-list-icon">
                    <ButtonIcon button={button} size={18} />
                  </span>
                  <strong>{button.label || `按钮 ${index + 1}`}</strong>
                  <div className="row-actions">
                    <button type="button" onClick={() => moveButton(button.id, -1)} title="上移" disabled={index === 0}>
                      <Icons.ArrowUp size={15} />
                    </button>
                    <button type="button" onClick={() => moveButton(button.id, 1)} title="下移" disabled={index === buttons.length - 1}>
                      <Icons.ArrowDown size={15} />
                    </button>
                    <button type="button" onClick={() => removeButton(button.id)} title="删除按钮" disabled={buttons.length <= 1}>
                      <Icons.Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="field-row">
                  <label className="field">
                    <span>名称</span>
                    <input
                      value={button.label}
                      onChange={(event) => updateButton(button.id, { label: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>图标类型</span>
                    <select
                      value={button.iconType}
                      onChange={(event) => updateButton(button.id, { iconType: event.target.value })}
                    >
                      <option value="lucide">内置图标</option>
                      <option value="image">自定义图片</option>
                    </select>
                  </label>
                </div>

                <div className="field-row">
                  {button.iconType === 'lucide' ? (
                    <div className="field">
                      <span>图标</span>
                      {renderIconSelect(button.icon, () => openIconPicker('button', button.id, button.icon))}
                    </div>
                  ) : (
                    <div className="field image-field">
                      <span>图片</span>
                      <button type="button" onClick={() => chooseButtonImage(button.id)}>
                        <Icons.ImagePlus size={16} />
                        选择图片
                      </button>
                    </div>
                  )}

                  {!isVoiceButton(button) && (
                    <label className="field">
                      <span>快捷键</span>
                      <div className="inline-recorder">
                        <strong>{shortcutLabelForButton(button, draft)}</strong>
                        <button
                          ref={recording ? recorderRef : null}
                          type="button"
                          className={recording ? 'is-recording' : ''}
                          onClick={() => setRecordingId(`button:${button.id}`)}
                        >
                          {recording ? '按键中' : '录制'}
                        </button>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderVoiceSection() {
    return (
      <div className="settings-section-page">
        <div className="section-heading">
          <div>
            <h2>语音</h2>
            <p>当前使用：{getActiveVoiceMode(draft).label} · {getActiveVoiceMode(draft).shortcut || '未设置'}</p>
          </div>
        </div>

        <div className="voice-mode-list">
          {VOICE_MODE_ORDER.map((modeId) => {
            const voiceMode = voiceModes.options[modeId];
            const selected = voiceModes.activeId === modeId;
            const recording = recordingId === `voice:${modeId}`;
            return (
              <div key={modeId} className={`voice-mode-card ${selected ? 'is-selected' : ''}`}>
                <button
                  type="button"
                  className="voice-mode-selector"
                  onClick={() => setActiveVoiceMode(modeId)}
                  title="设为当前语音模式"
                >
                  <ButtonIcon button={voiceMode} size={22} />
                </button>

                <div className="voice-mode-fields">
                  <div className="field-row">
                    <button type="button" disabled={selected} onClick={() => setActiveVoiceMode(modeId)}>
                      {selected ? '当前使用' : '使用此模式'}
                    </button>
                    <span>录制快捷键后自动使用此模式</span>
                  </div>
                  <div className="field-row">
                    <label className="field">
                      <span>名称</span>
                      <input
                        value={voiceMode.label}
                        onChange={(event) => updateVoiceMode(modeId, { label: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>快捷键</span>
                      <div className="inline-recorder">
                        <strong>{voiceMode.shortcut || '未设置'}</strong>
                        <button
                          ref={recording ? recorderRef : null}
                          type="button"
                          className={recording ? 'is-recording' : ''}
                          onClick={() => setRecordingId(`voice:${modeId}`)}
                        >
                          {recording ? '按键中' : '录制'}
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="field-row">
                    <label className="field">
                      <span>图标类型</span>
                      <select
                        value={voiceMode.iconType}
                        onChange={(event) => updateVoiceMode(modeId, { iconType: event.target.value })}
                      >
                        <option value="lucide">内置图标</option>
                        <option value="image">自定义图片</option>
                      </select>
                    </label>
                    {voiceMode.iconType === 'lucide' ? (
                      <div className="field">
                        <span>图标</span>
                        {renderIconSelect(voiceMode.icon, () => openIconPicker('voice', modeId, voiceMode.icon))}
                      </div>
                    ) : (
                      <div className="field image-field">
                        <span>图片</span>
                        <button type="button" onClick={() => chooseVoiceModeImage(modeId)}>
                          <Icons.ImagePlus size={16} />
                          选择图片
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderPunctuationSection() {
    const screenshotRecording = recordingId === 'tool:screenshot';
    return (
      <div className="settings-section-page">
        <div className="section-heading">
          <div>
            <h2>标点</h2>
            <p>标点面板里的可选项</p>
          </div>
          <button className="small-icon-button" type="button" onClick={addPunctuationItem} title="新增标点">
            <Icons.Plus size={17} />
          </button>
        </div>

        <div className="form-section">
          <div className="tool-shortcut-setting">
            <span className="button-list-icon"><Icons.ScanLine size={18} /></span>
            <span className="tool-shortcut-label">
              <strong>截图</strong>
              <small>显示在复制、粘贴、剪切下方</small>
            </span>
            <div className="inline-recorder">
              <strong>{punctuationTools.screenshot.shortcut || '未设置'}</strong>
              <button
                ref={screenshotRecording ? recorderRef : null}
                type="button"
                className={screenshotRecording ? 'is-recording' : ''}
                onClick={() => setRecordingId('tool:screenshot')}
              >
                {screenshotRecording ? '按键中' : '录制'}
              </button>
            </div>
          </div>
        </div>

        <div className="punctuation-config-list">
          {punctuationItems.map((item, index) => (
            <div className="punctuation-config-row" key={item.id}>
              <div className="punctuation-preview">{item.text || '·'}</div>
              <label className="field">
                <span>名称</span>
                <input
                  value={item.label}
                  placeholder={`标点 ${index + 1}`}
                  onChange={(event) => updatePunctuationItem(item.id, { label: event.target.value })}
                />
              </label>
              <label className="field">
                <span>输入内容</span>
                <input
                  value={item.text}
                  onChange={(event) => updatePunctuationItem(item.id, { text: event.target.value })}
                />
              </label>
              <label className="field">
                <span>插入后</span>
                <select
                  value={item.afterShortcut || ''}
                  onChange={(event) => updatePunctuationItem(item.id, { afterShortcut: event.target.value })}
                >
                  <option value="">不移动</option>
                  <option value="Left">光标左移</option>
                </select>
              </label>
              <div className="row-actions">
                <button type="button" onClick={() => movePunctuationItem(item.id, -1)} title="上移" disabled={index === 0}>
                  <Icons.ArrowUp size={15} />
                </button>
                <button type="button" onClick={() => movePunctuationItem(item.id, 1)} title="下移" disabled={index === punctuationItems.length - 1}>
                  <Icons.ArrowDown size={15} />
                </button>
                <button type="button" onClick={() => removePunctuationItem(item.id)} title="删除标点" disabled={punctuationItems.length <= 1}>
                  <Icons.Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderAppearanceSection() {
    return (
      <div className="settings-section-page">
        <div className="section-heading">
          <div>
            <h2>外观</h2>
            <p>悬浮框显示样式</p>
          </div>
        </div>

        <div className="form-section">
          <div className="field-row">
            <label className="field">
              <span>角落</span>
              <select value={draft.window.corner} onChange={(event) => setWindowPatch({ corner: event.target.value })}>
                <option value="top-right">右上</option>
                <option value="top-left">左上</option>
                <option value="bottom-right">右下</option>
                <option value="bottom-left">左下</option>
              </select>
            </label>
            <label className="field">
              <span>按钮大小 {draft.window.buttonSize}px</span>
              <input
                type="range"
                min="48"
                max="112"
                value={draft.window.buttonSize}
                onChange={(event) => setWindowPatch({ buttonSize: Number(event.target.value) })}
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>透明度 {Math.round(draft.window.opacity * 100)}%</span>
              <input
                type="range"
                min="25"
                max="100"
                value={Math.round(draft.window.opacity * 100)}
                onChange={(event) => setWindowPatch({ opacity: Number(event.target.value) / 100 })}
              />
            </label>
            <label className="field">
              <span>间距 {draft.window.gap}px</span>
              <input
                type="range"
                min="4"
                max="24"
                value={draft.window.gap}
                onChange={(event) => setWindowPatch({ gap: Number(event.target.value) })}
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  function renderDisplaySection() {
    return (
      <div className="settings-section-page">
        <div className="section-heading">
          <div>
            <h2>屏幕</h2>
            <p>UU 虚拟屏预设</p>
          </div>
          <button className="small-icon-button" type="button" onClick={addDisplayPreset} title="新增屏幕预设">
            <Icons.Plus size={17} />
          </button>
        </div>

        <div className="form-section virtual-display-section">
          <div className="virtual-display-target">
            <span className="virtual-display-icon"><Icons.Monitor size={18} /></span>
            <span>
              <strong>UU 虚拟屏</strong>
              <small>仅操作 GameViewer Virtual Display Adapter</small>
              <small>分辨率跟随 UU；连接后可重放 UU 当前缩放</small>
            </span>
          </div>
        </div>

        <div className="form-section remote-automation-section">
          <label className="switch-field">
            <span>
              <strong>连接后刷新 UU 缩放</strong>
              <small>读取本次设备的 UU 缩放配置并重新应用，不固定比例</small>
            </span>
            <input
              type="checkbox"
              checked={remoteAutomation.refreshVirtualDisplayScale}
              onChange={(event) => setRemoteAutomationPatch({ refreshVirtualDisplayScale: event.target.checked })}
            />
          </label>
          <label className="switch-field">
            <span>
              <strong>恢复悬浮窗默认位置</strong>
              <small>UU 连接或断开后回到外观中设置的角落</small>
            </span>
            <input
              type="checkbox"
              checked={remoteAutomation.resetFloatingWindow}
              onChange={(event) => setRemoteAutomationPatch({ resetFloatingWindow: event.target.checked })}
            />
          </label>
        </div>

        <div className="display-preset-list">
          {displayPresets.map((preset, index) => (
            <div className="display-preset-card" key={preset.id}>
              <div className="item-config-header">
                <strong>{preset.label || `设置${index + 1}`}</strong>
                <div className="row-actions">
                  <button type="button" onClick={() => moveDisplayPreset(preset.id, -1)} title="上移" disabled={index === 0}>
                    <Icons.ArrowUp size={15} />
                  </button>
                  <button type="button" onClick={() => moveDisplayPreset(preset.id, 1)} title="下移" disabled={index === displayPresets.length - 1}>
                    <Icons.ArrowDown size={15} />
                  </button>
                  <button type="button" onClick={() => removeDisplayPreset(preset.id)} title="删除预设" disabled={displayPresets.length <= 1}>
                    <Icons.Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="field-row">
                <label className="field">
                  <span>名称</span>
                  <input
                    value={preset.label}
                    onChange={(event) => updateDisplayPreset(preset.id, { label: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>方向</span>
                  <select
                    value={preset.orientation}
                    onChange={(event) => updateDisplayPreset(preset.id, { orientation: event.target.value })}
                  >
                    <option value="landscape">横向</option>
                    <option value="portrait">纵向</option>
                    <option value="landscape-flipped">横向翻转</option>
                    <option value="portrait-flipped">纵向翻转</option>
                  </select>
                </label>
              </div>

              <div className="system-display-note">
                <Icons.Info size={15} />
                <span>手动点击预设时只切换方向，沿用系统当前像素尺寸与缩放。</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderSystemSection() {
    return (
      <div className="settings-section-page">
        <div className="section-heading">
          <div>
            <h2>系统</h2>
            <p>Windows 启动行为</p>
          </div>
        </div>

        <div className="form-section">
          <label className={`switch-field ${startup.supported ? '' : 'is-disabled'}`}>
            <span>
              <strong>开机自启动</strong>
              <small>{startup.supported ? '跟随 Windows 登录启动' : '打包版中可用'}</small>
            </span>
            <input
              type="checkbox"
              checked={startup.enabled}
              disabled={!startup.supported}
              onChange={toggleStartup}
            />
          </label>
        </div>

        <div className="form-section">
          <button type="button" className="danger-ghost-button" onClick={restoreDefaults}>
            <Icons.RotateCcw size={16} />
            全部恢复默认
          </button>
        </div>
      </div>
    );
  }

  function renderActiveSection() {
    if (activeSection === 'voice') return renderVoiceSection();
    if (activeSection === 'punctuation') return renderPunctuationSection();
    if (activeSection === 'appearance') return renderAppearanceSection();
    if (activeSection === 'display') return renderDisplaySection();
    if (activeSection === 'system') return renderSystemSection();
    return renderButtonsSection();
  }

  return (
    <main className="settings-stage">
      <section className="settings-card">
        <header className="settings-titlebar">
          <div>
            <p className="eyebrow">Vibe Shortcut</p>
            <h1>快捷键面板设置</h1>
          </div>
          <button className="icon-window-button" type="button" onClick={() => api.closeSettings()} title="关闭">
            <Icons.X size={18} />
          </button>
        </header>

        <div className="settings-grid">
          <aside className="settings-nav" aria-label="设置分类">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-button ${activeSection === section.id ? 'is-selected' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </aside>

          <section className="editor-panel">
            {renderActiveSection()}
          </section>
        </div>
        {renderIconPicker()}
      </section>
    </main>
  );
}

function useConfig() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.getConfig().then((nextConfig) => {
      if (mounted) setConfig(nextConfig);
    });
    const unsubscribe = api.onConfigChanged((nextConfig) => setConfig(nextConfig));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return [config, setConfig];
}

function ButtonIcon({ button, size }) {
  if (button.iconType === 'image' && button.image) {
    return <img className="custom-button-image" src={button.image} alt="" draggable="false" />;
  }

  return <LucideIcon name={button.icon} size={size} />;
}

function LucideIcon({ name, size }) {
  const Icon = Icons[name] || Icons.Circle;
  return <Icon size={size} strokeWidth={2.35} />;
}

function iconLabel(iconName) {
  return ICON_PICKER_ITEMS.find((item) => item.icon === iconName)?.label || iconName || '圆形';
}

function getVoiceModes(config) {
  const source = config.voiceModes || defaultVoiceModes;
  const sourceOptions = source.options || {};
  const options = {};

  for (const id of VOICE_MODE_ORDER) {
    const fallback = defaultVoiceModes.options[id];
    const option = sourceOptions[id] || {};
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
  }

  const activeId = options[source.activeId] ? source.activeId : defaultVoiceModes.activeId;
  return { activeId, options };
}

function getActiveVoiceMode(config) {
  const voiceModes = getVoiceModes(config);
  return voiceModes.options[voiceModes.activeId] || voiceModes.options.lightning;
}

function getPunctuationItems(config) {
  const items = Array.isArray(config.punctuationItems) && config.punctuationItems.length
    ? config.punctuationItems
    : defaultPunctuationItems;

  return items
    .map((item, index) => ({
      id: item.id || `punctuation-${index}`,
      label: item.label || `标点 ${index + 1}`,
      text: item.text || '',
      afterShortcut: item.afterShortcut || ''
    }))
    .filter((item) => item.text);
}

function getEditablePunctuationItems(config) {
  const items = Array.isArray(config.punctuationItems) && config.punctuationItems.length
    ? config.punctuationItems
    : defaultPunctuationItems;

  return items.map((item, index) => ({
    id: item.id || `punctuation-${index}`,
    label: Object.prototype.hasOwnProperty.call(item, 'label') ? item.label : `标点 ${index + 1}`,
    text: item.text || '',
    afterShortcut: item.afterShortcut || ''
  }));
}

function getPunctuationTools(config) {
  const source = config.punctuationTools && typeof config.punctuationTools === 'object'
    ? config.punctuationTools
    : {};
  const screenshot = source.screenshot && typeof source.screenshot === 'object'
    ? source.screenshot
    : {};
  return {
    screenshot: {
      ...defaultPunctuationTools.screenshot,
      ...screenshot,
      id: 'screenshot'
    }
  };
}

function getPunctuationToolItems(config) {
  return [
    ...PUNCTUATION_TOOL_ITEMS,
    getPunctuationTools(config).screenshot
  ];
}

function getEditableDisplayPresets(config) {
  const presets = Array.isArray(config.displayPresets) && config.displayPresets.length
    ? config.displayPresets
    : defaultDisplayPresets;

  return presets.map((preset, index) => {
    const fallback = defaultDisplayPresets[index] || defaultDisplayPresets[0];
    return {
      id: preset.id || `preset-${index + 1}`,
      label: preset.label || `设置${index + 1}`,
      orientation: ['landscape', 'portrait', 'landscape-flipped', 'portrait-flipped'].includes(preset.orientation)
        ? preset.orientation
        : fallback.orientation,
      target: 'gameviewer-virtual'
    };
  });
}

function getRemoteAutomation(config) {
  const source = config.remoteAutomation && typeof config.remoteAutomation === 'object'
    ? config.remoteAutomation
    : defaultRemoteAutomation;
  return {
    refreshVirtualDisplayScale: source.refreshVirtualDisplayScale !== false,
    resetFloatingWindow: source.resetFloatingWindow !== false
  };
}

function moveById(items, id, direction) {
  const nextItems = [...items];
  const index = nextItems.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= nextItems.length) return items;
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(nextIndex, 0, item);
  return nextItems;
}

function shortcutLabelForButton(button, config) {
  if (isPunctuationButton(button)) {
    return '标点面板';
  }

  if (isVoiceButton(button)) {
    const activeMode = getActiveVoiceMode(config);
    return `${activeMode.label} · ${activeMode.shortcut || '未设置'}`;
  }

  return button.shortcut || '未设置';
}

function buttonTitle(button, config) {
  if (isPunctuationButton(button)) {
    return `${button.label} · 标点面板`;
  }

  if (isVoiceButton(button)) {
    const activeMode = getActiveVoiceMode(config);
    return `${button.label} · ${activeMode.label} · ${activeMode.shortcut || '未设置'}`;
  }

  return `${button.label} · ${button.shortcut || '未设置'}`;
}

function isVoiceButton(button) {
  return button.id === 'voice';
}

function isPunctuationButton(button) {
  return button.id === 'punctuation';
}

function isRepeatDeleteButton(button) {
  const shortcut = String(button.shortcut || '').trim().toLowerCase();
  return button.id === 'delete' || shortcut === 'backspace' || shortcut === 'delete';
}

function isSendButton(button) {
  const shortcut = String(button.shortcut || '').trim().toLowerCase();
  return button.id === 'send' || shortcut === 'enter';
}

function isPointerInside(event, element) {
  if (!event || !element) return false;
  const rect = element.getBoundingClientRect();
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}

function formatShortcut(event) {
  const modifiers = [];
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.metaKey) modifiers.push('Win');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');

  const key = normalizeKey(event.key);
  if (!key) return modifiers.length >= 2 ? modifiers.join('+') : '';
  return [...modifiers, key].join('+');
}

function normalizeKey(key) {
  if (!key) return '';
  const ignored = new Set(['Control', 'Alt', 'Shift', 'Meta']);
  if (ignored.has(key)) return '';
  const aliases = {
    ' ': 'Space',
    Escape: 'Esc',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right'
  };
  if (aliases[key]) return aliases[key];
  if (key.length === 1) return key.toUpperCase();
  return key;
}

createRoot(document.getElementById('root')).render(<App />);
