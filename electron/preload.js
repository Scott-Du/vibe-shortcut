const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vibeShortcut', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  sendShortcut: (shortcut) => ipcRenderer.invoke('shortcut:send', shortcut),
  sendShortcutSequence: (shortcuts) => ipcRenderer.invoke('shortcut:sendSequence', shortcuts),
  sendText: (text, afterShortcut) => ipcRenderer.invoke('text:send', text, afterShortcut),
  applyTabletPreset: (preset) => ipcRenderer.invoke('display:applyTabletPreset', preset),
  setSideActionsOpen: (open) => ipcRenderer.invoke('floating:setSideActionsOpen', open),
  resetFloatingPosition: () => ipcRenderer.invoke('floating:resetPosition'),
  moveFloatingDrag: (payload) => ipcRenderer.invoke('floating:moveDrag', payload),
  endFloatingDrag: () => ipcRenderer.invoke('floating:endDrag'),
  closeTrayMenu: () => ipcRenderer.invoke('trayQuick:close'),
  getStartup: () => ipcRenderer.invoke('startup:get'),
  setStartup: (enabled) => ipcRenderer.invoke('startup:set', enabled),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  closeSettings: () => ipcRenderer.invoke('settings:close'),
  chooseImage: () => ipcRenderer.invoke('image:choose'),
  onConfigChanged: (callback) => {
    const listener = (_event, config) => callback(config);
    ipcRenderer.on('config:changed', listener);
    return () => ipcRenderer.removeListener('config:changed', listener);
  },
  onStartupChanged: (callback) => {
    const listener = (_event, startup) => callback(startup);
    ipcRenderer.on('startup:changed', listener);
    return () => ipcRenderer.removeListener('startup:changed', listener);
  }
});
