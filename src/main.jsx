import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Icons from 'lucide-react';
import './styles.css';

const LONG_PRESS_MS = 380;
const MODIFIER_ONLY_COMMIT_MS = 700;
const DELETE_TO_HEAD_SEQUENCE = ['Ctrl+Shift+Home', 'Backspace'];
const VOICE_MODE_ORDER = ['wechat', 'lightning'];
const DeleteToHeadIcon = Icons.ArrowLeftToLine || Icons.CornerUpLeft || Icons.Delete;
const PUNCTUATION_TOOL_ITEMS = [
  { id: 'copy', label: '复制', icon: 'Copy', shortcut: 'Ctrl+C' },
  { id: 'paste', label: '粘贴', icon: 'ClipboardPaste', shortcut: 'Ctrl+V' },
  { id: 'cut', label: '剪切', icon: 'Scissors', shortcut: 'Ctrl+X' }
];
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
  schemaVersion: 4,
  buttons: [
    { id: 'punctuation', label: '标点', iconType: 'lucide', icon: 'Braces', image: '', shortcut: '' },
    { id: 'voice', label: '语音', iconType: 'lucide', icon: 'Mic', image: '', shortcut: 'Ctrl+I' },
    { id: 'send', label: '发送', iconType: 'lucide', icon: 'SendHorizontal', image: '', shortcut: 'Enter' },
    { id: 'delete', label: '删除', iconType: 'lucide', icon: 'Delete', image: '', shortcut: 'Backspace' }
  ],
  punctuationItems: defaultPunctuationItems,
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
      api.setSideActionsOpen(true).finally(() => {
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
    window.requestAnimationFrame(() => {
      if (sideActionRequestRef.current === requestId) {
        api.setSideActionsOpen(false);
      }
    });
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
      setSideActionType(sideActionType === 'punctuation' ? null : 'punctuation');
      return;
    }

    await triggerShortcut(button.id, button.shortcut);
  }

  async function triggerDeleteToHead() {
    pulse('delete-head');
    await api.sendShortcutSequence(DELETE_TO_HEAD_SEQUENCE);
  }

  function previewPunctuationItem(item) {
    pulse(`punctuation:${item.id}`);
  }

  function previewPunctuationTool(tool) {
    pulse(`punctuation:${tool.id}`);
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
      openVoiceSelector(button, { pulseButton: false });
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

    if (sideActionType) setSideActionType(null);

    if (isVoiceButton(button)) {
      repeatDelayRef.current = window.setTimeout(() => {
        openVoiceSelector(button);
      }, LONG_PRESS_MS);
      return;
    }

    if (isRepeatDeleteButton(button)) {
      triggerButton(button);
      repeatDelayRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        repeatingRef.current = true;
        setSideActionType('delete');
        api.startRepeatShortcut(button.shortcut);
      }, LONG_PRESS_MS);
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
    if (repeatingRef.current) {
      repeatingRef.current = false;
      api.stopRepeatShortcut();
    }

    longPressTriggeredRef.current = false;
    pressedButtonRef.current = null;

    if (pressedButton && isRepeatDeleteButton(pressedButton)) {
      setSideActionType(null);
      if (shouldDeleteToHead) {
        await triggerDeleteToHead();
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
    repeatingRef.current = false;
    longPressTriggeredRef.current = false;
    pressedButtonRef.current = null;
    setDeleteHeadArmed(false);
    api.stopRepeatShortcut();
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
            {PUNCTUATION_TOOL_ITEMS.map((tool) => {
              const ToolIcon = Icons[tool.icon] || Icons.Circle;
              return (
                <button
                  key={tool.id}
                  type="button"
                  className="side-action-button punctuation-action punctuation-tool-action"
                  title={tool.label}
                  aria-label={tool.label}
                  onClick={() => previewPunctuationTool(tool)}
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
                onClick={() => previewPunctuationItem(item)}
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

  function setWindowPatch(patch) {
    setDraft((current) => ({
      ...current,
      window: {
        ...current.window,
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
