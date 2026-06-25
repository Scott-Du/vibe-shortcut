import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Icons from 'lucide-react';
import './styles.css';

const LONG_PRESS_MS = 380;
const DELETE_TO_CURSOR_HEAD_HOLD_MS = 2000;
const MODIFIER_ONLY_COMMIT_MS = 700;
const DELETE_TO_CURSOR_HEAD_SEQUENCE = ['Ctrl+Shift+Home', 'Backspace'];
const VOICE_MODE_ORDER = ['wechat', 'lightning'];
const PUNCTUATION_TOOL_ITEMS = [
  { id: 'copy', label: '复制', icon: 'Copy', shortcut: 'Ctrl+C' },
  { id: 'paste', label: '粘贴', icon: 'ClipboardPaste', shortcut: 'Ctrl+V' },
  { id: 'cut', label: '剪切', icon: 'Scissors', shortcut: 'Ctrl+X' }
];
const TabletModeIcon = Icons.TabletSmartphone || Icons.Tablet || Icons.MonitorSmartphone || Icons.PanelTop;
const defaultTabletPreset = {
  width: 0,
  height: 0,
  scale: 175,
  orientation: 'portrait'
};
const defaultPunctuationItems = [
  { id: 'comma', label: '逗号', text: '，' },
  { id: 'period', label: '句号', text: '。' },
  { id: 'exclamation', label: '感叹号', text: '！' },
  { id: 'quote', label: '中文引号', text: '「」', afterShortcut: 'Left' }
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
  schemaVersion: 5,
  buttons: [
    { id: 'punctuation', label: '标点', iconType: 'lucide', icon: 'Braces', image: '', shortcut: '' },
    { id: 'voice', label: '语音', iconType: 'lucide', icon: 'Mic', image: '', shortcut: 'Ctrl+I' },
    { id: 'send', label: '发送', iconType: 'lucide', icon: 'SendHorizontal', image: '', shortcut: 'Enter' },
    { id: 'delete', label: '删除', iconType: 'lucide', icon: 'Delete', image: '', shortcut: 'Backspace' }
  ],
  punctuationItems: defaultPunctuationItems,
  tabletPreset: defaultTabletPreset,
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
  sendText: async (text) => {
    console.info(`Preview text: ${text}`);
    return { ok: true };
  },
  applyTabletPreset: async (preset) => {
    console.info('Preview tablet preset:', preset);
    return { ok: true };
  },
  setSideActionsOpen: async () => ({ ok: true }),
  resetFloatingPosition: async () => ({ ok: true }),
  moveFloatingDrag: async () => ({ ok: true }),
  endFloatingDrag: async () => ({ ok: true }),
  closeTrayMenu: async () => ({ ok: true }),
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
  if (mode === 'settings') return <SettingsApp />;
  if (mode === 'tray') return <TrayQuickMenu />;
  return <FloatingPanel />;
}

function FloatingPanel() {
  const [config, setConfig] = useConfig();
  const [activeId, setActiveId] = useState(null);
  const [sideActionType, setSideActionTypeState] = useState(null);
  const pressRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const pointerCleanupRef = useRef(null);
  const sideActionTypeRef = useRef(null);
  const sideActionCloseTimerRef = useRef(null);
  const deleteRepeatTimerRef = useRef(null);
  const deleteToHeadTimerRef = useRef(null);
  const deleteRepeatActiveRef = useRef(false);
  const deleteRepeatInFlightRef = useRef(null);
  const shellPressRef = useRef(null);
  const shellDragFrameRef = useRef(null);
  const shellDragPayloadRef = useRef(null);

  useEffect(() => {
    const handleSafetyStop = () => {
      resetInteraction({ closeSideActions: true });
    };

    window.addEventListener('blur', handleSafetyStop);
    window.addEventListener('pagehide', handleSafetyStop);
    document.addEventListener('visibilitychange', handleSafetyStop);

    return () => {
      window.removeEventListener('blur', handleSafetyStop);
      window.removeEventListener('pagehide', handleSafetyStop);
      document.removeEventListener('visibilitychange', handleSafetyStop);
      resetInteraction({ closeSideActions: true });
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
    clearSideActionCloseTimer();
    sideActionTypeRef.current = type;
    setSideActionTypeState(type);
    api.setSideActionsOpen(Boolean(type));
  }

  function pulse(id) {
    setActiveId(id);
    window.setTimeout(() => setActiveId(null), 160);
  }

  async function triggerShortcut(id, shortcut) {
    pulse(id);
    await api.sendShortcut(shortcut);
  }

  async function triggerButton(button) {
    if (isVoiceButton(button)) {
      const activeMode = getActiveVoiceMode(config);
      await triggerShortcut(`voice:${activeMode.id}`, activeMode.shortcut);
      return;
    }

    if (isPunctuationButton(button)) {
      pulse(button.id);
      setSideActionType(sideActionTypeRef.current === 'punctuation' ? null : 'punctuation');
      return;
    }

    await triggerShortcut(button.id, button.shortcut);
  }

  async function triggerDeleteToCursorHead() {
    pulse('delete-head');
    await api.sendShortcutSequence(DELETE_TO_CURSOR_HEAD_SEQUENCE);
  }

  async function insertPunctuation(item) {
    pulse('punctuation');
    await api.sendText(item.text, item.afterShortcut);
    setSideActionType(null);
  }

  async function runPunctuationTool(tool) {
    pulse(`punctuation:${tool.id}`);
    await api.sendShortcut(tool.shortcut);
    setSideActionType(null);
  }

  function isInsideButton(target) {
    return Boolean(target && typeof target.closest === 'function' && target.closest('button'));
  }

  function startShellInteraction(event) {
    if (event.button !== 0 || isInsideButton(event.target)) return;
    if (event.detail > 1) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    shellPressRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      dragStarted: false
    };
  }

  function moveShellInteraction(event) {
    const press = shellPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;

    const distance = Math.hypot(event.screenX - press.startX, event.screenY - press.startY);
    if (!press.dragStarted && distance < 4) return;

    press.dragStarted = true;
    event.preventDefault();
    event.stopPropagation();
    scheduleShellDragMove(press, event);
  }

  function endShellInteraction(event) {
    const press = shellPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    shellPressRef.current = null;
    if (press.dragStarted) {
      flushShellDragMove();
      Promise.resolve(api.endFloatingDrag()).catch(() => null);
    }
  }

  function scheduleShellDragMove(press, event) {
    shellDragPayloadRef.current = {
      startX: press.startX,
      startY: press.startY,
      currentX: event.screenX,
      currentY: event.screenY
    };

    if (shellDragFrameRef.current) return;
    shellDragFrameRef.current = window.requestAnimationFrame(() => {
      shellDragFrameRef.current = null;
      flushShellDragMove();
    });
  }

  function flushShellDragMove() {
    const payload = shellDragPayloadRef.current;
    shellDragPayloadRef.current = null;
    if (!payload) return;
    Promise.resolve(api.moveFloatingDrag(payload)).catch(() => null);
  }

  function clearShellDragState() {
    shellPressRef.current = null;
    shellDragPayloadRef.current = null;
    if (shellDragFrameRef.current) {
      window.cancelAnimationFrame(shellDragFrameRef.current);
      shellDragFrameRef.current = null;
    }
    Promise.resolve(api.endFloatingDrag()).catch(() => null);
  }

  async function resetFloatingPosition(event) {
    if (isInsideButton(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    resetInteraction({ closeSideActions: true });
    await api.resetFloatingPosition();
  }

  function startPress(event, button) {
    if (event.button === 2) return;
    event.preventDefault();
    const keepPunctuationOpen = isPunctuationButton(button) && sideActionTypeRef.current === 'punctuation';
    resetInteraction({ closeSideActions: !keepPunctuationOpen });
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const press = {
      button,
      pointerId: event.pointerId,
      startScreen: { x: event.screenX, y: event.screenY },
      longPress: false,
      longActionFired: false,
      deleteToHeadTriggered: false
    };
    pressRef.current = press;
    attachPressListeners(press.pointerId);

    longPressTimerRef.current = window.setTimeout(() => {
      handleLongPress(press);
    }, LONG_PRESS_MS);

    if (isRepeatDeleteButton(button)) {
      deleteToHeadTimerRef.current = window.setTimeout(() => {
        runHeldDeleteToCursorHead(press);
      }, DELETE_TO_CURSOR_HEAD_HOLD_MS);
    }
  }

  function handleLongPress(press) {
    if (pressRef.current !== press) return;
    press.longPress = true;

    if (isVoiceButton(press.button)) {
      setSideActionType('voice');
      return;
    }

    if (isPunctuationButton(press.button)) {
      setSideActionType('punctuation');
      return;
    }

    if (isRepeatDeleteButton(press.button)) {
      enterDeleteRepeating();
      return;
    }

    if (isSendButton(press.button)) {
      press.longActionFired = true;
      pulse(press.button.id);
      api.sendShortcut('Ctrl+Enter');
    }
  }

  function enterDeleteRepeating() {
    startDeleteRepeat();
  }

  async function runHeldDeleteToCursorHead(press) {
    if (pressRef.current !== press || press.deleteToHeadTriggered) return;

    press.deleteToHeadTriggered = true;
    clearDeleteToHeadTimer();
    clearLongPressTimer();
    setSideActionType(null);
    await stopDeleteRepeat({ waitForInFlight: true });
    await triggerDeleteToCursorHead();
  }

  function startDeleteRepeat() {
    stopDeleteRepeat();
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

  async function finishPress(options = {}) {
    const { finalize = true, closeSideActions = false } = options;
    const press = pressRef.current;

    clearLongPressTimer();
    clearDeleteToHeadTimer();
    detachPressListeners();
    pressRef.current = null;
    await stopDeleteRepeat({ waitForInFlight: true });

    if (!press) {
      if (closeSideActions) setSideActionType(null);
      return;
    }

    if (!finalize) {
      if (closeSideActions || !press.longPress || isRepeatDeleteButton(press.button)) setSideActionType(null);
      return;
    }

    if (!press.longPress) {
      if (isPunctuationButton(press.button)) {
        await triggerButton(press.button);
        return;
      }
      setSideActionType(null);
      if (isRepeatDeleteButton(press.button)) {
        await triggerShortcut(press.button.id, press.button.shortcut || 'Backspace');
        return;
      }
      await triggerButton(press.button);
      return;
    }

    if (isRepeatDeleteButton(press.button)) {
      setSideActionType(null);
      return;
    }

    if (!press.longActionFired && !isVoiceButton(press.button) && !isPunctuationButton(press.button)) {
      setSideActionType(null);
    }
  }

  function resetInteraction(options = {}) {
    clearLongPressTimer();
    clearDeleteToHeadTimer();
    detachPressListeners();
    stopDeleteRepeat();
    clearSideActionCloseTimer();
    pressRef.current = null;
    clearShellDragState();
    if (options.closeSideActions) setSideActionType(null);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function clearDeleteToHeadTimer() {
    if (deleteToHeadTimerRef.current) {
      window.clearTimeout(deleteToHeadTimerRef.current);
      deleteToHeadTimerRef.current = null;
    }
  }

  function attachPressListeners(pointerId) {
    detachPressListeners();

    const matchesPointer = (event) => event.pointerId === pointerId;
    const onPointerMove = (event) => {
      if (!matchesPointer(event)) return;
    };
    const onPointerUp = (event) => {
      if (matchesPointer(event)) finishPress({ finalize: true });
    };
    const onPointerCancel = (event) => {
      if (matchesPointer(event)) finishPress({ finalize: false, closeSideActions: true });
    };

    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    pointerCleanupRef.current = () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
    };
  }

  function detachPressListeners() {
    if (pointerCleanupRef.current) {
      pointerCleanupRef.current();
      pointerCleanupRef.current = null;
    }
  }

  function scheduleSideActionClose() {
    clearSideActionCloseTimer();
    sideActionCloseTimerRef.current = window.setTimeout(() => {
      sideActionCloseTimerRef.current = null;
      if (!pressRef.current) setSideActionType(null);
    }, 1600);
  }

  function clearSideActionCloseTimer() {
    if (sideActionCloseTimerRef.current) {
      window.clearTimeout(sideActionCloseTimerRef.current);
      sideActionCloseTimerRef.current = null;
    }
  }

  async function handleButtonContextMenu(event, button) {
    event.preventDefault();
    event.stopPropagation();
    resetInteraction({ closeSideActions: true });

    if (isVoiceButton(button)) {
      setSideActionType('voice');
      return;
    }

    if (isPunctuationButton(button)) {
      setSideActionType('punctuation');
      return;
    }

    if (isSendButton(button)) {
      pulse(button.id);
      await api.sendShortcut('Ctrl+Enter');
      return;
    }
  }

  async function selectVoiceMode(modeId) {
    const nextConfig = {
      ...config,
      voiceModes: {
        ...voiceModes,
        activeId: modeId
      }
    };
    const saved = await api.saveConfig(nextConfig);
    setConfig(saved);
    setSideActionType(null);
  }

  function renderSideActions() {
    if (!sideActionType) return null;

    const targetId = sideActionType === 'voice' ? 'voice' : 'punctuation';
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
            {PUNCTUATION_TOOL_ITEMS.map((tool) => {
              const ToolIcon = Icons[tool.icon] || Icons.Circle;
              return (
                <button
                  key={tool.id}
                  type="button"
                  className="side-action-button punctuation-action punctuation-tool-action"
                  title={tool.label}
                  aria-label={tool.label}
                  onClick={() => runPunctuationTool(tool)}
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
                onClick={() => insertPunctuation(item)}
              >
                <span className="punctuation-glyph">{item.text}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return null;
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
        <section
          className="floating-shell"
          onPointerDown={startShellInteraction}
          onPointerMove={moveShellInteraction}
          onPointerUp={endShellInteraction}
          onPointerCancel={endShellInteraction}
          onLostPointerCapture={endShellInteraction}
          onDoubleClick={resetFloatingPosition}
        >
          <div className="shortcut-stack">
            {buttons.map((button) => (
              <button
                key={button.id}
                className={`shortcut-button ${activeId === button.id ? 'is-active' : ''}`}
                title={buttonTitle(button, config)}
                type="button"
                onPointerDown={(event) => startPress(event, button)}
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

function TrayQuickMenu() {
  const [config] = useConfig();

  if (!config) return null;

  const tabletPreset = getTabletPreset(config);

  async function applyTabletMode() {
    await api.applyTabletPreset(tabletPreset);
    await api.closeTrayMenu();
  }

  return (
    <main className="tray-menu-stage" onContextMenu={(event) => event.preventDefault()}>
      <section className="tray-menu-panel">
        <button type="button" className="tray-menu-item" onClick={applyTabletMode}>
          <TabletModeIcon size={17} />
          <span>适配平板</span>
        </button>

      </section>
    </main>
  );
}

function SettingsApp() {
  const [config, setConfig] = useConfig();
  const [draft, setDraft] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [recordingId, setRecordingId] = useState(null);
  const [startup, setStartup] = useState({ enabled: false, supported: false });
  const recorderRef = useRef(null);
  const modifierRecordTimerRef = useRef(null);

  useEffect(() => {
    if (!config) return;
    setDraft(config);
    setSelectedId((current) => current || config.buttons[0]?.id || null);
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

  const selectedButton = draft.buttons.find((button) => button.id === selectedId) || draft.buttons[0];
  const voiceModes = getVoiceModes(draft);
  const tabletPreset = getTabletPreset(draft);

  function setWindowPatch(patch) {
    setDraft((current) => ({
      ...current,
      window: {
        ...current.window,
        ...patch
      }
    }));
  }

  function setTabletPresetPatch(patch) {
    setDraft((current) => ({
      ...current,
      tabletPreset: {
        ...getTabletPreset(current),
        ...patch
      }
    }));
  }

  function updateButton(id, patch) {
    setDraft((current) => ({
      ...current,
      buttons: current.buttons.map((button) => (button.id === id ? { ...button, ...patch } : button))
    }));
  }

  function updateVoiceMode(id, patch) {
    setDraft((current) => {
      const currentVoiceModes = getVoiceModes(current);
      return {
        ...current,
        voiceModes: {
          ...currentVoiceModes,
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
    setDraft((current) => ({
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
      icon: 'Sparkle',
      image: '',
      shortcut: 'Ctrl+I'
    };
    setDraft((current) => ({
      ...current,
      buttons: [...current.buttons, nextButton]
    }));
    setSelectedId(id);
  }

  function removeSelectedButton() {
    if (!selectedButton || draft.buttons.length <= 1) return;
    const nextButtons = draft.buttons.filter((button) => button.id !== selectedButton.id);
    setDraft((current) => ({ ...current, buttons: nextButtons }));
    setSelectedId(nextButtons[0]?.id || null);
  }

  function moveSelectedButton(direction) {
    if (!selectedButton) return;
    const index = draft.buttons.findIndex((button) => button.id === selectedButton.id);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.buttons.length) return;
    const nextButtons = [...draft.buttons];
    const [item] = nextButtons.splice(index, 1);
    nextButtons.splice(nextIndex, 0, item);
    setDraft((current) => ({ ...current, buttons: nextButtons }));
  }

  async function chooseButtonImage() {
    if (!selectedButton) return;
    const image = await api.chooseImage();
    if (image) {
      updateButton(selectedButton.id, { iconType: 'image', image });
    }
  }

  async function chooseVoiceModeImage(modeId) {
    const image = await api.chooseImage();
    if (image) {
      updateVoiceMode(modeId, { iconType: 'image', image });
    }
  }

  async function save() {
    const saved = await api.saveConfig(draft);
    setDraft(saved);
  }

  async function toggleStartup(event) {
    const nextStartup = await api.setStartup(event.target.checked);
    setStartup(nextStartup);
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
          <aside className="button-list-panel">
            <div className="panel-heading">
              <span>按钮</span>
              <button className="small-icon-button" type="button" onClick={addButton} title="新增按钮">
                <Icons.Plus size={17} />
              </button>
            </div>

            <div className="button-list">
              {draft.buttons.map((button) => (
                <button
                  key={button.id}
                  type="button"
                  className={`button-list-item ${button.id === selectedButton?.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedId(button.id)}
                >
                  <span className="button-list-icon">
                    <ButtonIcon button={button} size={18} />
                  </span>
                  <span className="button-list-copy">
                    <strong>{button.label}</strong>
                    <small>{shortcutLabelForButton(button, draft)}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="list-actions">
              <button type="button" onClick={() => moveSelectedButton(-1)} title="上移">
                <Icons.ArrowUp size={16} />
              </button>
              <button type="button" onClick={() => moveSelectedButton(1)} title="下移">
                <Icons.ArrowDown size={16} />
              </button>
              <button type="button" onClick={removeSelectedButton} title="删除按钮" disabled={draft.buttons.length <= 1}>
                <Icons.Trash2 size={16} />
              </button>
            </div>
          </aside>

          <section className="editor-panel">
            {selectedButton ? (
              <>
                <div className="form-section">
                  <h2>按钮内容</h2>
                  <label className="field">
                    <span>名称</span>
                    <input
                      value={selectedButton.label}
                      onChange={(event) => updateButton(selectedButton.id, { label: event.target.value })}
                    />
                  </label>

                  <div className="field-row">
                    <label className="field">
                      <span>图标类型</span>
                      <select
                        value={selectedButton.iconType}
                        onChange={(event) => updateButton(selectedButton.id, { iconType: event.target.value })}
                      >
                        <option value="lucide">内置图标</option>
                        <option value="image">自定义图片</option>
                      </select>
                    </label>

                    {selectedButton.iconType === 'lucide' ? (
                      <label className="field">
                        <span>Lucide 图标名</span>
                        <input
                          value={selectedButton.icon}
                          onChange={(event) => updateButton(selectedButton.id, { icon: event.target.value })}
                          placeholder="Mic"
                        />
                      </label>
                    ) : (
                      <div className="field image-field">
                        <span>图片</span>
                        <button type="button" onClick={chooseButtonImage}>
                          <Icons.ImagePlus size={16} />
                          选择图片
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-section">
                  <h2>快捷键</h2>
                  <div className="shortcut-recorder">
                    <div>
                      <span>当前</span>
                      <strong>{shortcutLabelForButton(selectedButton, draft)}</strong>
                    </div>
                    <button
                      ref={recorderRef}
                      type="button"
                      className={recordingId === `button:${selectedButton.id}` ? 'is-recording' : ''}
                      onClick={() => setRecordingId(`button:${selectedButton.id}`)}
                    >
                      {recordingId === `button:${selectedButton.id}` ? '按下快捷键...' : '录制快捷键'}
                    </button>
                  </div>
                </div>

                <div className="form-section">
                  <h2>语音模式</h2>
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
                                <label className="field">
                                  <span>Lucide 图标名</span>
                                  <input
                                    value={voiceMode.icon}
                                    onChange={(event) => updateVoiceMode(modeId, { icon: event.target.value })}
                                  />
                                </label>
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

                <div className="form-section">
                  <h2>窗口</h2>
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

                <div className="form-section">
                  <h2>系统</h2>
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
                  <h2>平板适配预设</h2>
                  <div className="field-row">
                    <label className="field">
                      <span>分辨率宽度</span>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={tabletPreset.width || ''}
                        placeholder="保持当前"
                        onChange={(event) => setTabletPresetPatch({ width: Number(event.target.value) || 0 })}
                      />
                    </label>
                    <label className="field">
                      <span>分辨率高度</span>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={tabletPreset.height || ''}
                        placeholder="保持当前"
                        onChange={(event) => setTabletPresetPatch({ height: Number(event.target.value) || 0 })}
                      />
                    </label>
                  </div>

                  <div className="field-row">
                    <label className="field">
                      <span>缩放比例</span>
                      <input
                        type="number"
                        min="100"
                        max="350"
                        step="25"
                        value={tabletPreset.scale}
                        onChange={(event) => setTabletPresetPatch({ scale: Number(event.target.value) || 175 })}
                      />
                    </label>
                    <label className="field">
                      <span>屏幕方向</span>
                      <select
                        value={tabletPreset.orientation}
                        onChange={(event) => setTabletPresetPatch({ orientation: event.target.value })}
                      >
                        <option value="portrait">纵向</option>
                        <option value="landscape">横向</option>
                        <option value="portrait-flipped">纵向翻转</option>
                        <option value="landscape-flipped">横向翻转</option>
                      </select>
                    </label>
                  </div>

                  <p className="field-hint">从右下角托盘图标左键菜单点击“适配平板”后应用；缩放比例可能需要注销或重新登录后完全生效。</p>
                </div>
              </>
            ) : null}
          </section>
        </div>

        <footer className="settings-footer">
          <button type="button" className="ghost-button" onClick={() => setDraft(config)}>
            还原
          </button>
          <button type="button" className="primary-button" onClick={save}>
            <Icons.Save size={17} />
            保存并应用
          </button>
        </footer>
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

  const Icon = Icons[button.icon] || Icons.Circle;
  return <Icon size={size} strokeWidth={2.35} />;
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

function getTabletPreset(config) {
  const source = config.tabletPreset || defaultTabletPreset;
  const orientation = ['landscape', 'portrait', 'landscape-flipped', 'portrait-flipped'].includes(source.orientation)
    ? source.orientation
    : defaultTabletPreset.orientation;

  return {
    width: Math.max(0, Math.round(Number(source.width) || 0)),
    height: Math.max(0, Math.round(Number(source.height) || 0)),
    scale: Math.min(Math.max(Math.round(Number(source.scale) || defaultTabletPreset.scale), 100), 350),
    orientation
  };
}

function getPunctuationItems(config) {
  const source = defaultPunctuationItems;

  return source
    .map((item, index) => ({
      id: item.id || `punctuation-${index}`,
      label: item.label || `标点 ${index + 1}`,
      text: item.text || '',
      afterShortcut: item.afterShortcut || ''
    }))
    .filter((item) => item.text);
}

function shortcutLabelForButton(button, config) {
  if (isVoiceButton(button)) {
    const activeMode = getActiveVoiceMode(config);
    return `${activeMode.label} · ${activeMode.shortcut || '未设置'}`;
  }

  if (isPunctuationButton(button)) {
    return '点击展开标点';
  }

  return button.shortcut || '未设置';
}

function buttonTitle(button, config) {
  if (isVoiceButton(button)) {
    const activeMode = getActiveVoiceMode(config);
    return `${button.label} · ${activeMode.label} · ${activeMode.shortcut || '未设置'}`;
  }

  if (isPunctuationButton(button)) {
    return `${button.label} · 点击展开标点`;
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

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
