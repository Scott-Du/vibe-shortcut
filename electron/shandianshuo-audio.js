const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SYSTEM_AUDIO_DEVICE = 'system';
const DEFAULT_REMOTE_AUDIO_DEVICE = '麦克风阵列 (网易虚拟音频设备)';
const POWERSHELL_TIMEOUT_MS = 10000;
const DEVICE_WAIT_TIMEOUT_MS = 12000;
const RECORDING_POLL_MS = 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function powershellJson(command, timeoutMs = POWERSHELL_TIMEOUT_MS) {
  const script = [
    '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)',
    command
  ].join('; ');
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript], {
        windowsHide: true
      });
    } catch (error) {
      resolve({ ok: false, error: error.message });
      return;
    }

    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: '读取闪电说或录音设备状态超时。' });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => finish({ ok: false, error: error.message }));
    child.on('exit', (code) => {
      if (code !== 0) {
        finish({ ok: false, error: stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}` });
        return;
      }

      const output = stdout.trim();
      if (!output) {
        finish({ ok: true, value: null });
        return;
      }

      try {
        finish({ ok: true, value: JSON.parse(output) });
      } catch (error) {
        finish({ ok: false, error: `无法解析 Windows 设备状态：${error.message}` });
      }
    });
  });
}

function formatCaptureDeviceName(description, interfaceName) {
  const descriptionText = String(description || '').trim();
  const interfaceText = String(interfaceName || '').trim();
  if (!descriptionText) return interfaceText;
  if (!interfaceText || descriptionText === interfaceText) return descriptionText;
  return `${descriptionText} (${interfaceText})`;
}

async function listCaptureDevices() {
  const command = String.raw`
$base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture'
$items = @(Get-ChildItem -LiteralPath $base -ErrorAction Stop | ForEach-Object {
  $state = Get-ItemPropertyValue -LiteralPath $_.PSPath -Name DeviceState -ErrorAction SilentlyContinue
  $properties = Get-ItemProperty -LiteralPath ($_.PSPath + '\Properties') -ErrorAction SilentlyContinue
  $description = $properties.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
  $interfaceName = $properties.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
  if ($description -or $interfaceName) {
    [PSCustomObject]@{
      id = $_.PSChildName
      description = [string]$description
      interfaceName = [string]$interfaceName
      active = ($state -eq 1)
    }
  }
})
$items | ConvertTo-Json -Compress`;
  const result = await powershellJson(command);
  if (!result.ok) return { ok: false, devices: [], error: result.error };

  const rows = result.value == null ? [] : (Array.isArray(result.value) ? result.value : [result.value]);
  const seen = new Set();
  const devices = [];
  for (const row of rows) {
    const name = formatCaptureDeviceName(row.description, row.interfaceName);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    devices.push({
      id: name,
      label: name,
      active: Boolean(row.active)
    });
  }
  devices.sort((left, right) => Number(right.active) - Number(left.active) || left.label.localeCompare(right.label, 'zh-CN'));
  return { ok: true, devices };
}

function shandianshuoPaths(appDataPath) {
  const root = path.join(appDataPath, 'Shandianshuo');
  return {
    root,
    config: path.join(root, 'config.json'),
    logs: path.join(root, 'logs')
  };
}

function readAudioDeviceConfig(configFile) {
  if (!fs.existsSync(configFile)) {
    return { ok: false, exists: false, error: '未找到闪电说配置文件。' };
  }

  try {
    const value = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, exists: true, error: '闪电说配置文件格式不正确。' };
    }
    return {
      ok: true,
      exists: true,
      value,
      audioDevice: typeof value.audio_device === 'string' ? value.audio_device : SYSTEM_AUDIO_DEVICE
    };
  } catch (error) {
    return { ok: false, exists: true, error: `无法读取闪电说配置：${error.message}` };
  }
}

function writeAudioDeviceConfig(configFile, audioDevice) {
  const current = readAudioDeviceConfig(configFile);
  if (!current.ok) return current;

  const next = { ...current.value, audio_device: audioDevice };
  const suffix = `${process.pid}-${Date.now()}`;
  const temporaryFile = `${configFile}.vibe-shortcut-${suffix}.tmp`;
  const backupFile = `${configFile}.vibe-shortcut-${suffix}.bak`;

  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(configFile, backupFile);
    try {
      fs.renameSync(temporaryFile, configFile);
    } catch (error) {
      fs.renameSync(backupFile, configFile);
      throw error;
    }
    fs.rmSync(backupFile, { force: true });
    return { ok: true, audioDevice };
  } catch (error) {
    fs.rmSync(temporaryFile, { force: true });
    return { ok: false, exists: true, error: `无法更新闪电说麦克风：${error.message}` };
  }
}

function readLogTail(logFile, maxBytes = 256 * 1024) {
  const stat = fs.statSync(logFile);
  const length = Math.min(stat.size, maxBytes);
  const buffer = Buffer.alloc(length);
  const handle = fs.openSync(logFile, 'r');
  try {
    fs.readSync(handle, buffer, 0, length, stat.size - length);
  } finally {
    fs.closeSync(handle);
  }
  return buffer.toString('utf8');
}

function parseRecordingState(logText) {
  const text = String(logText || '');
  const startedAt = text.lastIndexOf('Recording started - session_id:');
  const stoppedAt = text.lastIndexOf('Recording stopped -');
  return startedAt > stoppedAt ? 'recording' : 'idle';
}

function getRecordingState(logDirectory) {
  try {
    if (!fs.existsSync(logDirectory)) return { ok: true, state: 'idle' };
    const latestLog = fs.readdirSync(logDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.log'))
      .map((entry) => {
        const file = path.join(logDirectory, entry.name);
        return { file, modifiedAt: fs.statSync(file).mtimeMs };
      })
      .sort((left, right) => right.modifiedAt - left.modifiedAt)[0];
    if (!latestLog) return { ok: true, state: 'idle' };
    return { ok: true, state: parseRecordingState(readLogTail(latestLog.file)) };
  } catch (error) {
    return { ok: false, state: 'unknown', error: `无法确认闪电说录音状态：${error.message}` };
  }
}

async function getShandianshuoProcesses() {
  const command = String.raw`
$items = @(Get-CimInstance Win32_Process -Filter "Name='shandianshuo.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
  [PSCustomObject]@{
    processId = [int]$_.ProcessId
    executablePath = [string]$_.ExecutablePath
    commandLine = [string]$_.CommandLine
  }
})
$items | ConvertTo-Json -Compress`;
  const result = await powershellJson(command);
  if (!result.ok) return { ok: false, processes: [], error: result.error };
  const rows = result.value == null ? [] : (Array.isArray(result.value) ? result.value : [result.value]);
  return {
    ok: true,
    processes: rows
      .map((item) => ({
        processId: Number(item.processId) || 0,
        executablePath: String(item.executablePath || ''),
        commandLine: String(item.commandLine || '')
      }))
      .filter((item) => item.processId > 0)
  };
}

async function stopProcesses(processes) {
  const processIds = processes.map((item) => Number(item.processId)).filter((value) => value > 0);
  if (!processIds.length) return { ok: true };
  const command = `$ids = @(${processIds.join(',')}); Stop-Process -Id $ids -Force -ErrorAction Stop; $true | ConvertTo-Json -Compress`;
  const result = await powershellJson(command);
  return result.ok ? { ok: true } : result;
}

function startShandianshuo(executablePath) {
  try {
    const child = spawn(executablePath, ['--autostart'], {
      cwd: path.dirname(executablePath),
      detached: true,
      windowsHide: true,
      stdio: 'ignore'
    });
    child.unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `无法重新启动闪电说：${error.message}` };
  }
}

class ShandianshuoAudioController {
  constructor(options) {
    this.paths = shandianshuoPaths(options.appDataPath);
    this.notify = typeof options.notify === 'function' ? options.notify : () => {};
    this.onStatusChanged = typeof options.onStatusChanged === 'function' ? options.onStatusChanged : () => {};
    this.desiredDevice = '';
    this.desiredRevision = 0;
    this.deviceWaitDeadline = 0;
    this.processing = false;
    this.retryTimer = null;
    this.status = {
      configExists: fs.existsSync(this.paths.config),
      appRunning: false,
      waitingForRecording: false,
      waitingForDevice: false,
      switching: false,
      desiredDevice: '',
      currentDevice: '',
      lastError: ''
    };
  }

  publish(patch = {}) {
    this.status = { ...this.status, ...patch };
    this.onStatusChanged({ ...this.status });
  }

  schedule(delayMs = 0) {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.processPending();
    }, delayMs);
  }

  requestDevice(audioDevice) {
    const target = String(audioDevice || '').trim();
    if (!target) return;
    this.desiredDevice = target;
    this.desiredRevision += 1;
    this.deviceWaitDeadline = Date.now() + DEVICE_WAIT_TIMEOUT_MS;
    this.publish({ desiredDevice: target, lastError: '' });
    this.schedule();
  }

  cancelPending() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.desiredDevice = '';
    this.desiredRevision += 1;
    this.publish({
      desiredDevice: '',
      waitingForRecording: false,
      waitingForDevice: false,
      switching: false
    });
  }

  async getStatus() {
    const current = readAudioDeviceConfig(this.paths.config);
    const processes = await getShandianshuoProcesses();
    this.publish({
      configExists: current.exists !== false,
      appRunning: processes.ok && processes.processes.length > 0,
      currentDevice: current.ok ? current.audioDevice : '',
      lastError: current.ok ? this.status.lastError : current.error
    });
    return { ...this.status };
  }

  async processPending() {
    if (this.processing || !this.desiredDevice) return;
    this.processing = true;
    const target = this.desiredDevice;
    const revision = this.desiredRevision;

    try {
      const current = readAudioDeviceConfig(this.paths.config);
      if (!current.ok) {
        this.fail(current.error);
        return;
      }

      const processResult = await getShandianshuoProcesses();
      if (!processResult.ok) {
        this.fail(processResult.error);
        return;
      }

      this.publish({
        configExists: true,
        appRunning: processResult.processes.length > 0,
        currentDevice: current.audioDevice
      });

      if (current.audioDevice === target) {
        this.completeRevision(revision, target);
        return;
      }

      if (target !== SYSTEM_AUDIO_DEVICE) {
        const deviceResult = await listCaptureDevices();
        const targetDevice = deviceResult.devices.find((device) => device.id === target);
        if (!deviceResult.ok || !targetDevice?.active) {
          if (Date.now() < this.deviceWaitDeadline) {
            this.publish({ waitingForDevice: true, waitingForRecording: false, switching: false });
            this.schedule(RECORDING_POLL_MS);
            return;
          }
          this.fail(deviceResult.error || `录音设备“${target}”当前不可用。`);
          return;
        }
      }

      if (processResult.processes.length) {
        const recording = getRecordingState(this.paths.logs);
        if (!recording.ok || recording.state === 'recording') {
          this.publish({
            waitingForRecording: true,
            waitingForDevice: false,
            switching: false,
            lastError: recording.ok ? '' : recording.error
          });
          this.schedule(RECORDING_POLL_MS);
          return;
        }
      }

      const executablePath = processResult.processes.find((item) => item.executablePath && fs.existsSync(item.executablePath))?.executablePath || '';
      if (processResult.processes.length && !executablePath) {
        this.fail('无法确定闪电说程序路径，已取消自动重启。');
        return;
      }

      this.publish({ switching: true, waitingForRecording: false, waitingForDevice: false, lastError: '' });
      if (processResult.processes.length) {
        const stopped = await stopProcesses(processResult.processes);
        if (!stopped.ok) {
          this.fail(`无法停止闪电说：${stopped.error}`);
          return;
        }
      }

      const written = writeAudioDeviceConfig(this.paths.config, target);
      if (!written.ok) {
        this.fail(written.error);
        return;
      }

      if (processResult.processes.length) {
        const started = startShandianshuo(executablePath);
        if (!started.ok) {
          this.fail(started.error);
          return;
        }
        const running = await this.waitForProcessStart();
        if (!running) {
          this.fail('闪电说配置已更新，但程序未能在后台重新启动。');
          return;
        }
      }

      this.publish({
        appRunning: processResult.processes.length > 0,
        currentDevice: target,
        switching: false,
        lastError: ''
      });
      this.completeRevision(revision, target);
    } catch (error) {
      this.fail(error.message);
    } finally {
      this.processing = false;
      if (this.desiredDevice && !this.retryTimer) this.schedule();
    }
  }

  completeRevision(revision, target) {
    if (this.desiredRevision === revision && this.desiredDevice === target) {
      this.desiredDevice = '';
      this.publish({
        desiredDevice: '',
        waitingForRecording: false,
        waitingForDevice: false,
        switching: false,
        lastError: ''
      });
    }
  }

  fail(error) {
    const message = String(error || '闪电说麦克风自动切换失败。');
    this.desiredDevice = '';
    this.publish({
      desiredDevice: '',
      waitingForRecording: false,
      waitingForDevice: false,
      switching: false,
      lastError: message
    });
    this.notify(message);
  }

  async waitForProcessStart() {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      await delay(350);
      const result = await getShandianshuoProcesses();
      if (result.ok && result.processes.length) return true;
    }
    return false;
  }

  dispose() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.desiredDevice = '';
  }
}

module.exports = {
  DEFAULT_REMOTE_AUDIO_DEVICE,
  SYSTEM_AUDIO_DEVICE,
  ShandianshuoAudioController,
  formatCaptureDeviceName,
  getRecordingState,
  listCaptureDevices,
  parseRecordingState,
  readAudioDeviceConfig,
  shandianshuoPaths,
  writeAudioDeviceConfig
};
