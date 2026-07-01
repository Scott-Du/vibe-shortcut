const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vibeShortcut', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config, options) => ipcRenderer.invoke('config:save', config, options),
  sendShortcut: (shortcut) => ipcRenderer.invoke('shortcut:send', shortcut),
  sendShortcutSequence: (shortcuts) => ipcRenderer.invoke('shortcut:sendSequence', shortcuts),
  startRepeatShortcut: (shortcut) => ipcRenderer.invoke('shortcut:startRepeat', shortcut),
  stopRepeatShortcut: () => ipcRenderer.invoke('shortcut:stopRepeat'),
  setSideActionsOpen: (open) => ipcRenderer.invoke('floating:setSideActionsOpen', open),
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
