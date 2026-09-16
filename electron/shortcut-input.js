const MODIFIER_ONLY_HOLD_MS = 120;

function isModifierPart(value) {
  return ['ctrl', 'control', 'shift', 'alt', 'option', 'win', 'meta', 'cmd'].includes(value);
}

function shortcutNeedsNativeSender(shortcut) {
  const parts = splitShortcut(shortcut).map((part) => part.toLowerCase());
  if (!parts.length) return false;
  return parts.some((part) => ['win', 'meta', 'cmd'].includes(part)) || parts.every(isModifierPart);
}

function isDoubaoVoiceShortcut(shortcut, context = {}) {
  // Voice activation belongs to the selected provider, not its default hotkey.
  // Custom shortcuts (e.g. Ctrl+U) need the same Doubao RPC path as Ctrl+Win.
  return context?.kind === 'voice'
    && /(?:豆包|doubao)/i.test(String(context.label || ''))
    && splitShortcut(shortcut).length > 0;
}

function shortcutToNativeEvents(shortcut) {
  const parts = splitShortcut(shortcut);
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
  } else if (uniqueModifiers.length >= 2) {
    // Modifier-only shortcuts need a human-scale chord hold so low-level hooks can observe them.
    events.push({ sleep: MODIFIER_ONLY_HOLD_MS });
  }

  for (const modifier of [...uniqueModifiers].reverse()) events.push(keyEvent(modifier.vk, true));
  return events;
}

function splitShortcut(shortcut) {
  return String(shortcut || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
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
    0x21,
    0x22,
    0x23,
    0x24,
    0x25,
    0x26,
    0x27,
    0x28,
    0x2d,
    0x2e,
    0x5b
  ]).has(vk);
}

module.exports = {
  MODIFIER_ONLY_HOLD_MS,
  isDoubaoVoiceShortcut,
  shortcutNeedsNativeSender,
  shortcutToNativeEvents
};
