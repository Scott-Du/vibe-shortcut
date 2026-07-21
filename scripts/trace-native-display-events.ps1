param(
  [Parameter(Mandatory = $true)]
  [string]$LogPath
)

$resolvedLogPath = [System.IO.Path]::GetFullPath($LogPath)
$source = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public sealed class DisplayEventTraceForm : Form
{
    private const int WM_SETTINGCHANGE = 0x001A;
    private const int WM_DEVMODECHANGE = 0x001B;
    private const int WM_DISPLAYCHANGE = 0x007E;
    private const int WM_DEVICECHANGE = 0x0219;
    private const int WM_POWERBROADCAST = 0x0218;
    private const int WM_WTSSESSION_CHANGE = 0x02B1;
    private const int NOTIFY_FOR_THIS_SESSION = 0;
    private readonly string logPath;

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

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool EnumDisplayDevices(string device, uint index, ref DISPLAY_DEVICE display, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool EnumDisplaySettings(string device, int mode, ref DEVMODE settings);

    [DllImport("wtsapi32.dll")]
    private static extern bool WTSRegisterSessionNotification(IntPtr window, int flags);

    [DllImport("wtsapi32.dll")]
    private static extern bool WTSUnRegisterSessionNotification(IntPtr window);

    public DisplayEventTraceForm(string path)
    {
        logPath = path;
        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.None;
        Opacity = 0;
        Width = 1;
        Height = 1;
        StartPosition = FormStartPosition.Manual;
        Left = -32000;
        Top = -32000;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        WTSRegisterSessionNotification(Handle, NOTIFY_FOR_THIS_SESSION);
        Log("trace-started", 0, 0);
    }

    protected override void OnHandleDestroyed(EventArgs e)
    {
        WTSUnRegisterSessionNotification(Handle);
        base.OnHandleDestroyed(e);
    }

    protected override void WndProc(ref Message message)
    {
        switch (message.Msg)
        {
            case WM_SETTINGCHANGE:
                Log("WM_SETTINGCHANGE", message.WParam.ToInt64(), message.LParam.ToInt64());
                break;
            case WM_DEVMODECHANGE:
                Log("WM_DEVMODECHANGE", message.WParam.ToInt64(), message.LParam.ToInt64());
                break;
            case WM_DISPLAYCHANGE:
                Log("WM_DISPLAYCHANGE", message.WParam.ToInt64(), message.LParam.ToInt64());
                break;
            case WM_DEVICECHANGE:
                Log("WM_DEVICECHANGE", message.WParam.ToInt64(), message.LParam.ToInt64());
                break;
            case WM_POWERBROADCAST:
                Log("WM_POWERBROADCAST", message.WParam.ToInt64(), message.LParam.ToInt64());
                break;
            case WM_WTSSESSION_CHANGE:
                Log("WM_WTSSESSION_CHANGE", message.WParam.ToInt64(), message.LParam.ToInt64());
                break;
        }
        base.WndProc(ref message);
    }

    private void Log(string eventName, long wParam, long lParam)
    {
        string line = String.Format(
            "{0:O}|{1}|wParam={2}|lParam={3}|{4}{5}",
            DateTime.Now,
            eventName,
            wParam,
            lParam,
            DisplaySnapshot(),
            Environment.NewLine);
        File.AppendAllText(logPath, line, new UTF8Encoding(false));
    }

    private static string DisplaySnapshot()
    {
        List<string> displays = new List<string>();
        for (uint index = 0; index < 64; index++)
        {
            DISPLAY_DEVICE display = new DISPLAY_DEVICE();
            display.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
            if (!EnumDisplayDevices(null, index, ref display, 0)) break;
            if (!String.Equals(display.DeviceString, "GameViewer Virtual Display Adapter", StringComparison.OrdinalIgnoreCase)) continue;

            DEVMODE mode = new DEVMODE();
            mode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
            bool activeMode = EnumDisplaySettings(display.DeviceName, -1, ref mode);
            displays.Add(String.Format(
                "{0}:{1}:flags=0x{2:X}:active={3}:pos={4},{5}:size={6}x{7}:orientation={8}",
                index,
                display.DeviceName,
                display.StateFlags,
                activeMode,
                mode.dmPositionX,
                mode.dmPositionY,
                mode.dmPelsWidth,
                mode.dmPelsHeight,
                mode.dmDisplayOrientation));
        }
        return String.Join(";", displays.ToArray());
    }

    public static void Run(string path)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new DisplayEventTraceForm(path));
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies @('System.Windows.Forms.dll', 'System.Drawing.dll')
[DisplayEventTraceForm]::Run($resolvedLogPath)
