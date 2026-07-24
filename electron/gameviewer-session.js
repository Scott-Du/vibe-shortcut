const fs = require('fs');
const path = require('path');

const CONNECT_PATTERN = 'report event: event_connect_start, suc: 1';
const DISCONNECT_PATTERN = 'peer_control_connection: disconnected';
const CLIENT_CONNECT_PATTERN = 'processChangeSelfDeviceInfo] connected, device id:';
const CLIENT_DISCONNECT_PATTERN = 'processChangeSelfDeviceInfo] onEventDeviceInfoChanged disconnect';
const GAMEVIEWER_LOG_PATTERN = /^log_.+\.txt$/i;
const INITIAL_TAIL_BYTES = 12 * 1024 * 1024;

function parseGameViewerSessionEvents(text) {
  const events = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.includes(CLIENT_CONNECT_PATTERN) || line.includes(CONNECT_PATTERN)) {
      events.push({ connected: true, line });
    } else if (line.includes(CLIENT_DISCONNECT_PATTERN) || line.includes(DISCONNECT_PATTERN)) {
      events.push({ connected: false, line });
    }
  }
  return events;
}

function defaultGameViewerLogDirectory() {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  return path.join(programFiles, 'Netease', 'GameViewer', 'log', 'client', 'log');
}

function latestGameViewerLog(logDirectory) {
  try {
    const candidates = fs.readdirSync(logDirectory)
      .filter((name) => GAMEVIEWER_LOG_PATTERN.test(name))
      .map((name) => {
        const filePath = path.join(logDirectory, name);
        return { filePath, modified: fs.statSync(filePath).mtimeMs };
      })
      .sort((left, right) => right.modified - left.modified);
    return candidates[0]?.filePath || '';
  } catch {
    return '';
  }
}

class GameViewerSessionWatcher {
  constructor(options = {}) {
    this.logDirectory = options.logDirectory || defaultGameViewerLogDirectory();
    this.onSessionChanged = options.onSessionChanged || (() => {});
    this.watchedFilePath = '';
    this.fileStatListener = null;
    this.directoryStatListener = null;
    this.filePath = '';
    this.offset = 0;
    this.remainder = '';
    this.connected = undefined;
    this.readTimer = null;
    this.reading = false;
    this.readAgain = false;
    this.needsLogSelection = false;
  }

  start() {
    this.selectCurrentLog(true);
    this.directoryStatListener = () => {
      this.needsLogSelection = true;
      this.scheduleRead(0);
    };
    fs.watchFile(
      this.logDirectory,
      { interval: 2000, persistent: false },
      this.directoryStatListener
    );
    return this;
  }

  dispose() {
    clearTimeout(this.readTimer);
    this.readTimer = null;
    if (this.watchedFilePath && this.fileStatListener) {
      fs.unwatchFile(this.watchedFilePath, this.fileStatListener);
    }
    if (this.directoryStatListener) {
      fs.unwatchFile(this.logDirectory, this.directoryStatListener);
    }
    this.watchedFilePath = '';
    this.fileStatListener = null;
    this.directoryStatListener = null;
  }

  scheduleRead(delay = 80) {
    clearTimeout(this.readTimer);
    this.readTimer = setTimeout(() => {
      this.readTimer = null;
      this.readChanges();
    }, delay);
  }

  watchCurrentLog(filePath) {
    if (filePath === this.watchedFilePath) return;
    if (this.watchedFilePath && this.fileStatListener) {
      fs.unwatchFile(this.watchedFilePath, this.fileStatListener);
    }

    this.watchedFilePath = filePath;
    this.fileStatListener = (current, previous) => {
      if (current.size === previous.size && current.mtimeMs === previous.mtimeMs) return;
      this.scheduleRead(0);
    };
    fs.watchFile(
      filePath,
      { interval: 400, persistent: false },
      this.fileStatListener
    );
  }

  selectCurrentLog(initial = false) {
    const nextPath = latestGameViewerLog(this.logDirectory);
    if (!nextPath) return false;
    if (nextPath === this.filePath && !initial) return true;

    this.filePath = nextPath;
    this.watchCurrentLog(nextPath);
    const size = fs.statSync(nextPath).size;
    this.offset = initial ? Math.max(0, size - INITIAL_TAIL_BYTES) : 0;
    this.remainder = '';
    this.needsLogSelection = false;
    this.readChanges();
    return true;
  }

  async readChanges() {
    if (this.reading) {
      this.readAgain = true;
      return;
    }
    this.reading = true;
    try {
      if (this.needsLogSelection || !this.filePath) {
        const latestPath = latestGameViewerLog(this.logDirectory);
        this.needsLogSelection = false;
        if (latestPath && latestPath !== this.filePath) {
          this.filePath = latestPath;
          this.watchCurrentLog(latestPath);
          this.offset = 0;
          this.remainder = '';
        }
      }
      if (!this.filePath) return;

      const stats = fs.statSync(this.filePath);
      if (stats.size < this.offset) {
        this.offset = 0;
        this.remainder = '';
      }
      if (stats.size === this.offset) return;

      const length = stats.size - this.offset;
      const handle = await fs.promises.open(this.filePath, 'r');
      try {
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, this.offset);
        this.offset = stats.size;
        this.consume(`${this.remainder}${buffer.toString('utf8')}`);
      } finally {
        await handle.close();
      }
    } catch {
      // The UU service can rotate the active log between the stat and read calls.
      this.needsLogSelection = true;
    } finally {
      this.reading = false;
      if (this.readAgain) {
        this.readAgain = false;
        this.scheduleRead(0);
      }
    }
  }

  consume(text) {
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline < 0) {
      this.remainder = text;
      return;
    }

    this.remainder = text.slice(lastNewline + 1);
    let events = parseGameViewerSessionEvents(text.slice(0, lastNewline + 1));
    if (this.connected === undefined && events.length > 1) {
      events = [events.at(-1)];
    }
    for (const event of events) {
      if (event.connected === this.connected) continue;
      this.connected = event.connected;
      this.onSessionChanged(event);
    }
  }
}

module.exports = {
  GameViewerSessionWatcher,
  defaultGameViewerLogDirectory,
  parseGameViewerSessionEvents
};
