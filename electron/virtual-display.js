const { spawn } = require('child_process');

const GAMEVIEWER_ADAPTER_NAME = 'GameViewer Virtual Display Adapter';
const POWERSHELL_TIMEOUT_MS = 15000;

const WINDOWS_DISPLAY_SOURCE = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Threading;

public sealed class VirtualDisplayResult
{
    public bool Ok { get; set; }
    public bool Connected { get; set; }
    public bool Changed { get; set; }
    public string Step { get; set; }
    public string Error { get; set; }
    public string AdapterName { get; set; }
    public string DeviceName { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public int Orientation { get; set; }
    public int Scale { get; set; }
}

public static class VibeVirtualDisplay
{
    private const uint DISPLAY_DEVICE_ATTACHED_TO_DESKTOP = 0x1;
    private const uint DISPLAY_DEVICE_PRIMARY_DEVICE = 0x4;
    private const int ENUM_CURRENT_SETTINGS = -1;
    private const int DISP_CHANGE_SUCCESSFUL = 0;
    private const int CDS_TEST = 0x2;
    private const int DM_DISPLAYORIENTATION = 0x80;
    private const int DM_PELSWIDTH = 0x80000;
    private const int DM_PELSHEIGHT = 0x100000;
    private const uint QDC_ONLY_ACTIVE_PATHS = 0x2;
    private const int DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME = 1;
    private const int DISPLAYCONFIG_DEVICE_INFO_GET_DPI_SCALE = -3;
    private const int DISPLAYCONFIG_DEVICE_INFO_SET_DPI_SCALE = -4;

    private static readonly int[] DpiValues = new int[]
    {
        100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500
    };

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DISPLAY_DEVICE
    {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
        public uint StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DEVMODE
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public short dmSpecVersion;
        public short dmDriverVersion;
        public short dmSize;
        public short dmDriverExtra;
        public int dmFields;
        public int dmPositionX;
        public int dmPositionY;
        public int dmDisplayOrientation;
        public int dmDisplayFixedOutput;
        public short dmColor;
        public short dmDuplex;
        public short dmYResolution;
        public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public short dmLogPixels;
        public int dmBitsPerPel;
        public int dmPelsWidth;
        public int dmPelsHeight;
        public int dmDisplayFlags;
        public int dmDisplayFrequency;
        public int dmICMMethod;
        public int dmICMIntent;
        public int dmMediaType;
        public int dmDitherType;
        public int dmReserved1;
        public int dmReserved2;
        public int dmPanningWidth;
        public int dmPanningHeight;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LUID
    {
        public uint LowPart;
        public int HighPart;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_PATH_SOURCE_INFO
    {
        public LUID adapterId;
        public uint id;
        public uint modeInfoIdx;
        public uint statusFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_RATIONAL
    {
        public uint Numerator;
        public uint Denominator;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_PATH_TARGET_INFO
    {
        public LUID adapterId;
        public uint id;
        public uint modeInfoIdx;
        public uint outputTechnology;
        public uint rotation;
        public uint scaling;
        public DISPLAYCONFIG_RATIONAL refreshRate;
        public uint scanLineOrdering;
        public int targetAvailable;
        public uint statusFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_PATH_INFO
    {
        public DISPLAYCONFIG_PATH_SOURCE_INFO sourceInfo;
        public DISPLAYCONFIG_PATH_TARGET_INFO targetInfo;
        public uint flags;
    }

    [StructLayout(LayoutKind.Explicit, Size = 48)]
    private struct DISPLAYCONFIG_MODE_INFO_UNION
    {
        [FieldOffset(0)] public long data0;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_MODE_INFO
    {
        public uint infoType;
        public uint id;
        public LUID adapterId;
        public DISPLAYCONFIG_MODE_INFO_UNION modeInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_DEVICE_INFO_HEADER
    {
        public int type;
        public uint size;
        public LUID adapterId;
        public uint id;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DISPLAYCONFIG_SOURCE_DEVICE_NAME
    {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER header;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string viewGdiDeviceName;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_SOURCE_DPI_SCALE_GET
    {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER header;
        public int minScaleRel;
        public int curScaleRel;
        public int maxScaleRel;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_SOURCE_DPI_SCALE_SET
    {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER header;
        public int scaleRel;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int ChangeDisplaySettingsEx(string deviceName, ref DEVMODE devMode, IntPtr hwnd, int flags, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern int GetDisplayConfigBufferSizes(uint flags, out uint numPathArrayElements, out uint numModeInfoArrayElements);

    [DllImport("user32.dll")]
    private static extern int QueryDisplayConfig(
        uint flags,
        ref uint numPathArrayElements,
        [Out] DISPLAYCONFIG_PATH_INFO[] pathArray,
        ref uint numModeInfoArrayElements,
        [Out] DISPLAYCONFIG_MODE_INFO[] modeInfoArray,
        IntPtr currentTopologyId);

    [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
    private static extern int DisplayConfigGetSourceName(ref DISPLAYCONFIG_SOURCE_DEVICE_NAME requestPacket);

    [DllImport("user32.dll", EntryPoint = "DisplayConfigGetDeviceInfo")]
    private static extern int DisplayConfigGetDpi(ref DISPLAYCONFIG_SOURCE_DPI_SCALE_GET requestPacket);

    [DllImport("user32.dll", EntryPoint = "DisplayConfigSetDeviceInfo")]
    private static extern int DisplayConfigSetDpi(ref DISPLAYCONFIG_SOURCE_DPI_SCALE_SET setPacket);

    public static VirtualDisplayResult GetStatus(string adapterName)
    {
        DISPLAY_DEVICE display;
        if (!TryFindVirtualDisplay(adapterName, out display))
        {
            return NewResult(true, false, adapterName, "detect", "");
        }

        DEVMODE mode;
        if (!TryGetCurrentMode(display.DeviceName, out mode))
        {
            return NewResult(false, true, adapterName, "display", "无法读取 UU 虚拟屏当前显示模式。");
        }

        VirtualDisplayResult result = NewResult(true, true, adapterName, "status", "");
        result.DeviceName = display.DeviceName;
        result.Width = mode.dmPelsWidth;
        result.Height = mode.dmPelsHeight;
        result.Orientation = mode.dmDisplayOrientation;

        string dpiError;
        int currentScale;
        if (!TryGetDpi(display.DeviceName, out currentScale, out dpiError))
        {
            result.Ok = false;
            result.Step = "scale";
            result.Error = dpiError;
            return result;
        }

        result.Scale = currentScale;
        return result;
    }

    public static VirtualDisplayResult Apply(string adapterName, int baseWidth, int baseHeight, int orientation, int scale)
    {
        DISPLAY_DEVICE display;
        if (!TryFindVirtualDisplay(adapterName, out display))
        {
            return NewResult(false, false, adapterName, "detect", "UU 虚拟屏未连接；已保留方向选择，连接后会自动应用。");
        }

        if (baseWidth <= 0 || baseHeight <= 0 || orientation < 0 || orientation > 3)
        {
            return NewResult(false, true, adapterName, "validate", "虚拟屏分辨率或方向无效。");
        }

        int targetWidth = (orientation % 2 == 0) ? baseWidth : baseHeight;
        int targetHeight = (orientation % 2 == 0) ? baseHeight : baseWidth;
        DEVMODE mode;
        if (!TryGetCurrentMode(display.DeviceName, out mode))
        {
            return NewResult(false, true, adapterName, "display", "无法读取 UU 虚拟屏当前显示模式。");
        }

        bool changed = false;
        if (mode.dmPelsWidth != targetWidth || mode.dmPelsHeight != targetHeight || mode.dmDisplayOrientation != orientation)
        {
            mode.dmFields = DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYORIENTATION;
            mode.dmPelsWidth = targetWidth;
            mode.dmPelsHeight = targetHeight;
            mode.dmDisplayOrientation = orientation;

            int testResult = ChangeDisplaySettingsEx(display.DeviceName, ref mode, IntPtr.Zero, CDS_TEST, IntPtr.Zero);
            if (testResult != DISP_CHANGE_SUCCESSFUL)
            {
                return NewResult(false, true, adapterName, "display-test", "UU 虚拟屏不支持所选分辨率或方向，测试返回 " + testResult + "。");
            }

            int applyResult = ChangeDisplaySettingsEx(display.DeviceName, ref mode, IntPtr.Zero, 0, IntPtr.Zero);
            if (applyResult != DISP_CHANGE_SUCCESSFUL)
            {
                return NewResult(false, true, adapterName, "display", "应用 UU 虚拟屏显示模式失败，返回 " + applyResult + "。");
            }
            changed = true;
        }

        Thread.Sleep(450);
        if (!TryFindVirtualDisplayWithRetry(adapterName, out display))
        {
            VirtualDisplayResult disconnected = NewResult(false, false, adapterName, "scale", "分辨率切换后 UU 虚拟屏暂时不可用。");
            disconnected.Changed = changed;
            return disconnected;
        }

        string dpiError;
        if (!TrySetDpi(display.DeviceName, scale, out dpiError))
        {
            VirtualDisplayResult dpiFailure = GetStatus(adapterName);
            dpiFailure.Ok = false;
            dpiFailure.Step = "scale";
            dpiFailure.Error = dpiError;
            dpiFailure.Changed = changed;
            return dpiFailure;
        }

        VirtualDisplayResult verified = WaitForExpected(adapterName, targetWidth, targetHeight, orientation, scale);
        verified.Changed = changed || verified.Changed;
        return verified;
    }

    private static VirtualDisplayResult WaitForExpected(string adapterName, int width, int height, int orientation, int scale)
    {
        VirtualDisplayResult latest = null;
        for (int attempt = 0; attempt < 6; attempt++)
        {
            Thread.Sleep(200);
            latest = GetStatus(adapterName);
            if (latest.Ok && latest.Connected && latest.Width == width && latest.Height == height && latest.Orientation == orientation && latest.Scale == scale)
            {
                return latest;
            }
        }

        if (latest == null)
        {
            latest = NewResult(false, false, adapterName, "verify", "无法验证 UU 虚拟屏设置。");
        }
        else
        {
            latest.Ok = false;
            latest.Step = "verify";
            latest.Error = "UU 虚拟屏设置未保持为目标值。";
        }
        return latest;
    }

    private static VirtualDisplayResult NewResult(bool ok, bool connected, string adapterName, string step, string error)
    {
        VirtualDisplayResult result = new VirtualDisplayResult();
        result.Ok = ok;
        result.Connected = connected;
        result.AdapterName = adapterName;
        result.Step = step;
        result.Error = error;
        result.DeviceName = "";
        return result;
    }

    private static bool TryFindVirtualDisplay(string adapterName, out DISPLAY_DEVICE selected)
    {
        selected = new DISPLAY_DEVICE();
        bool found = false;
        for (uint index = 0; index < 64; index++)
        {
            DISPLAY_DEVICE candidate = new DISPLAY_DEVICE();
            candidate.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
            if (!EnumDisplayDevices(null, index, ref candidate, 0))
            {
                break;
            }
            if ((candidate.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP) == 0)
            {
                continue;
            }
            if (!string.Equals(candidate.DeviceString, adapterName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }
            if (!found)
            {
                selected = candidate;
                found = true;
            }
            if ((candidate.StateFlags & DISPLAY_DEVICE_PRIMARY_DEVICE) != 0)
            {
                selected = candidate;
                return true;
            }
        }
        return found;
    }

    private static bool TryFindVirtualDisplayWithRetry(string adapterName, out DISPLAY_DEVICE selected)
    {
        for (int attempt = 0; attempt < 8; attempt++)
        {
            if (TryFindVirtualDisplay(adapterName, out selected))
            {
                return true;
            }
            Thread.Sleep(150);
        }
        selected = new DISPLAY_DEVICE();
        return false;
    }

    private static bool TryGetCurrentMode(string deviceName, out DEVMODE mode)
    {
        mode = new DEVMODE();
        mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
        return EnumDisplaySettings(deviceName, ENUM_CURRENT_SETTINGS, ref mode);
    }

    private static bool TryFindDisplaySource(string deviceName, out LUID adapterId, out uint sourceId, out string error)
    {
        adapterId = new LUID();
        sourceId = 0;
        error = "";
        for (int attempt = 0; attempt < 3; attempt++)
        {
            uint pathCount;
            uint modeCount;
            int sizeResult = GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, out pathCount, out modeCount);
            if (sizeResult != 0)
            {
                error = "读取活动显示路径失败，返回 " + sizeResult + "。";
                return false;
            }

            DISPLAYCONFIG_PATH_INFO[] paths = new DISPLAYCONFIG_PATH_INFO[Math.Max(pathCount, 1)];
            DISPLAYCONFIG_MODE_INFO[] modes = new DISPLAYCONFIG_MODE_INFO[Math.Max(modeCount, 1)];
            int queryResult = QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, ref pathCount, paths, ref modeCount, modes, IntPtr.Zero);
            if (queryResult == 122)
            {
                continue;
            }
            if (queryResult != 0)
            {
                error = "查询活动显示路径失败，返回 " + queryResult + "。";
                return false;
            }

            for (int index = 0; index < pathCount; index++)
            {
                DISPLAYCONFIG_SOURCE_DEVICE_NAME sourceName = new DISPLAYCONFIG_SOURCE_DEVICE_NAME();
                sourceName.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
                sourceName.header.size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DEVICE_NAME));
                sourceName.header.adapterId = paths[index].sourceInfo.adapterId;
                sourceName.header.id = paths[index].sourceInfo.id;
                if (DisplayConfigGetSourceName(ref sourceName) != 0)
                {
                    continue;
                }
                if (!string.Equals(sourceName.viewGdiDeviceName, deviceName, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                adapterId = paths[index].sourceInfo.adapterId;
                sourceId = paths[index].sourceInfo.id;
                return true;
            }

            error = "未找到 UU 虚拟屏对应的活动显示源。";
            return false;
        }

        error = "显示拓扑持续变化，暂时无法定位 UU 虚拟屏。";
        return false;
    }

    private static bool TryGetDpi(string deviceName, out int currentScale, out string error)
    {
        currentScale = 0;
        error = "";
        LUID adapterId;
        uint sourceId;
        if (!TryFindDisplaySource(deviceName, out adapterId, out sourceId, out error))
        {
            return false;
        }

        DISPLAYCONFIG_SOURCE_DPI_SCALE_GET packet;
        if (!TryGetDpiPacket(adapterId, sourceId, out packet, out error))
        {
            return false;
        }

        int recommendedIndex = Math.Abs(packet.minScaleRel);
        int currentIndex = recommendedIndex + Math.Max(packet.minScaleRel, Math.Min(packet.curScaleRel, packet.maxScaleRel));
        if (currentIndex < 0 || currentIndex >= DpiValues.Length)
        {
            error = "Windows 返回了无法识别的虚拟屏缩放档位。";
            return false;
        }

        currentScale = DpiValues[currentIndex];
        return true;
    }

    private static bool TrySetDpi(string deviceName, int desiredScale, out string error)
    {
        error = "";
        int desiredIndex = Array.IndexOf(DpiValues, desiredScale);
        if (desiredIndex < 0)
        {
            error = "缩放比例必须是 Windows 支持的标准档位。";
            return false;
        }

        LUID adapterId;
        uint sourceId;
        if (!TryFindDisplaySource(deviceName, out adapterId, out sourceId, out error))
        {
            return false;
        }

        DISPLAYCONFIG_SOURCE_DPI_SCALE_GET current;
        if (!TryGetDpiPacket(adapterId, sourceId, out current, out error))
        {
            return false;
        }

        int recommendedIndex = Math.Abs(current.minScaleRel);
        int minimumIndex = recommendedIndex + current.minScaleRel;
        int maximumIndex = recommendedIndex + current.maxScaleRel;
        if (desiredIndex < minimumIndex || desiredIndex > maximumIndex || maximumIndex >= DpiValues.Length)
        {
            error = "UU 虚拟屏不支持 " + desiredScale + "% 缩放。";
            return false;
        }

        int currentIndex = recommendedIndex + Math.Max(current.minScaleRel, Math.Min(current.curScaleRel, current.maxScaleRel));
        if (currentIndex == desiredIndex)
        {
            return true;
        }

        DISPLAYCONFIG_SOURCE_DPI_SCALE_SET setPacket = new DISPLAYCONFIG_SOURCE_DPI_SCALE_SET();
        setPacket.header.type = DISPLAYCONFIG_DEVICE_INFO_SET_DPI_SCALE;
        setPacket.header.size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DPI_SCALE_SET));
        setPacket.header.adapterId = adapterId;
        setPacket.header.id = sourceId;
        setPacket.scaleRel = desiredIndex - recommendedIndex;
        if (setPacket.header.size != 24)
        {
            error = "当前 Windows 的 DPI 数据结构与预期不一致。";
            return false;
        }

        int setResult = DisplayConfigSetDpi(ref setPacket);
        if (setResult != 0)
        {
            error = "设置 UU 虚拟屏缩放失败，返回 " + setResult + "。";
            return false;
        }
        return true;
    }

    private static bool TryGetDpiPacket(LUID adapterId, uint sourceId, out DISPLAYCONFIG_SOURCE_DPI_SCALE_GET packet, out string error)
    {
        packet = new DISPLAYCONFIG_SOURCE_DPI_SCALE_GET();
        packet.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_DPI_SCALE;
        packet.header.size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DPI_SCALE_GET));
        packet.header.adapterId = adapterId;
        packet.header.id = sourceId;
        error = "";
        if (packet.header.size != 32)
        {
            error = "当前 Windows 的 DPI 数据结构与预期不一致。";
            return false;
        }

        int getResult = DisplayConfigGetDpi(ref packet);
        if (getResult != 0)
        {
            error = "读取 UU 虚拟屏缩放失败，返回 " + getResult + "。";
            return false;
        }
        return true;
    }
}
`;

const encodedWindowsDisplaySource = Buffer.from(WINDOWS_DISPLAY_SOURCE, 'utf16le').toString('base64');

function powershellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeResult(value) {
  const result = value && typeof value === 'object' ? value : {};
  return {
    ok: Boolean(result.Ok),
    connected: Boolean(result.Connected),
    changed: Boolean(result.Changed),
    step: result.Step || '',
    error: result.Error || '',
    adapterName: result.AdapterName || GAMEVIEWER_ADAPTER_NAME,
    deviceName: result.DeviceName || '',
    width: Number(result.Width) || 0,
    height: Number(result.Height) || 0,
    orientation: Number.isFinite(Number(result.Orientation)) ? Number(result.Orientation) : 0,
    scale: Number(result.Scale) || 0
  };
}

function invokeDisplayMethod(method, args) {
  const serializedArgs = args.map((value) => (
    typeof value === 'number' ? String(Math.trunc(value)) : powershellString(value)
  ));
  const command = [
    '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)',
    `$source = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedWindowsDisplaySource}'))`,
    'Add-Type -TypeDefinition $source',
    `$result = [VibeVirtualDisplay]::${method}(${serializedArgs.join(', ')})`,
    '$result | ConvertTo-Json -Compress'
  ].join('; ');

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
        windowsHide: true
      });
    } catch (error) {
      resolve({ ok: false, connected: false, step: 'powershell', error: error.message });
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
      finish({ ok: false, connected: false, step: 'timeout', error: '读取或设置 UU 虚拟屏超时。' });
    }, POWERSHELL_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      finish({ ok: false, connected: false, step: 'powershell', error: error.message });
    });
    child.on('exit', (code) => {
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      const jsonLine = [...lines].reverse().find((line) => line.trim().startsWith('{'));
      if (code !== 0 || !jsonLine) {
        finish({
          ok: false,
          connected: false,
          step: 'powershell',
          error: stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}`
        });
        return;
      }
      try {
        finish(normalizeResult(JSON.parse(jsonLine)));
      } catch (error) {
        finish({ ok: false, connected: false, step: 'parse', error: error.message });
      }
    });
    child.stdin.end(command);
  });
}

function getVirtualDisplayStatus(adapterName = GAMEVIEWER_ADAPTER_NAME) {
  return invokeDisplayMethod('GetStatus', [adapterName]);
}

function applyVirtualDisplayProfile(profile, adapterName = GAMEVIEWER_ADAPTER_NAME) {
  const orientationCodes = {
    landscape: 0,
    portrait: 1,
    'landscape-flipped': 2,
    'portrait-flipped': 3
  };
  return invokeDisplayMethod('Apply', [
    adapterName,
    Number(profile.width) || 0,
    Number(profile.height) || 0,
    orientationCodes[profile.orientation] ?? 1,
    Number(profile.scale) || 0
  ]);
}

module.exports = {
  GAMEVIEWER_ADAPTER_NAME,
  applyVirtualDisplayProfile,
  getVirtualDisplayStatus
};
