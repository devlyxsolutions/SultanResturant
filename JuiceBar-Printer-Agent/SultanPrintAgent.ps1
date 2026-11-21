# ==============================================================================
# SULTAN RESTAURANT - DEDICATED STATION THERMAL PRINT AGENT (v2.1 GUI)
# Runs inside Microsoft-signed Windows PowerShell (100% immune to Windows 11
# Smart App Control / unsigned .exe blocks) with a permanent Desktop GUI window.
# ==============================================================================
param(
    [switch]$Test,
    [switch]$Minimized,
    [string]$Server = "",
    [string]$Station = "",
    [string]$Printer = ""
)

$ErrorActionPreference = "Stop"

try {
    Add-Type -AssemblyName System.Drawing
    Add-Type -AssemblyName System.Windows.Forms

    $csharpCode = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

public class SultanDesktopPrintAgent : Form
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    public static bool SendRawBytesToPrinter(string printerName, byte[] rawBytes, out string errorMsg)
    {
        errorMsg = "";
        if (string.IsNullOrWhiteSpace(printerName)) { errorMsg = "No printer selected"; return false; }
        if (rawBytes == null || rawBytes.Length == 0) { errorMsg = "Empty print buffer"; return false; }

        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Sultan Station KOT";
        di.pDataType = "RAW";

        try
        {
            if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero))
            {
                errorMsg = "OpenPrinter failed for '" + printerName + "' (Win32 error " + Marshal.GetLastWin32Error() + ")";
                return false;
            }
            if (!StartDocPrinter(hPrinter, 1, di))
            {
                ClosePrinter(hPrinter);
                errorMsg = "StartDocPrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")";
                return false;
            }
            if (!StartPagePrinter(hPrinter))
            {
                EndDocPrinter(hPrinter);
                ClosePrinter(hPrinter);
                errorMsg = "StartPagePrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")";
                return false;
            }

            IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(rawBytes.Length);
            bool bSuccess = false;
            try
            {
                Marshal.Copy(rawBytes, 0, pUnmanagedBytes, rawBytes.Length);
                int dwWritten = 0;
                bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, rawBytes.Length, out dwWritten);
                if (!bSuccess) errorMsg = "WritePrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")";
            }
            finally
            {
                Marshal.FreeCoTaskMem(pUnmanagedBytes);
                EndPagePrinter(hPrinter);
                EndDocPrinter(hPrinter);
                ClosePrinter(hPrinter);
            }
            return bSuccess;
        }
        catch (Exception ex)
        {
            errorMsg = ex.Message;
            if (hPrinter != IntPtr.Zero) { try { ClosePrinter(hPrinter); } catch { } }
            return false;
        }
    }

    private static bool IsVirtualPrinter(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return true;
        string lower = name.ToLowerInvariant();
        return lower.Contains("print to pdf") || lower.Contains("xps document") || lower.Contains("onenote")
            || lower.Contains("fax") || lower.Contains("adobe pdf") || lower.Contains("foxit") || lower.Contains("nitro");
    }

    private static bool LooksLikeThermalPrinter(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return false;
        string lower = name.ToLowerInvariant();
        return lower.Contains("pos") || lower.Contains("80") || lower.Contains("58") || lower.Contains("thermal")
            || lower.Contains("receipt") || lower.Contains("xprinter") || lower.Contains("xp-") || lower.Contains("blackcopper")
            || lower.Contains("bc-") || lower.Contains("epson") || lower.Contains("tm-") || lower.Contains("rongta")
            || lower.Contains("rp80") || lower.Contains("bixolon") || lower.Contains("star") || lower.Contains("gp-")
            || lower.Contains("juice") || lower.Contains("kitchen");
    }

    private static List<string> GetInstalledPrinters()
    {
        List<string> list = new List<string>();
        try
        {
            foreach (string p in PrinterSettings.InstalledPrinters)
                if (!string.IsNullOrWhiteSpace(p)) list.Add(p);
        }
        catch { }
        return list;
    }

    private static string ResolveTargetPrinter(string requestedName, string configuredName, List<string> installed)
    {
        if (!string.IsNullOrWhiteSpace(requestedName) && !requestedName.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
        {
            foreach (string p in installed)
                if (p.Equals(requestedName, StringComparison.OrdinalIgnoreCase)) return p;
        }
        if (!string.IsNullOrWhiteSpace(configuredName) && !configuredName.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
        {
            foreach (string p in installed)
                if (p.Equals(configuredName, StringComparison.OrdinalIgnoreCase)) return p;
        }
        foreach (string p in installed)
            if (!IsVirtualPrinter(p) && LooksLikeThermalPrinter(p)) return p;
        try
        {
            PrinterSettings ps = new PrinterSettings();
            if (!string.IsNullOrWhiteSpace(ps.PrinterName) && !IsVirtualPrinter(ps.PrinterName))
                return ps.PrinterName;
        }
        catch { }
        foreach (string p in installed)
            if (!IsVirtualPrinter(p)) return p;
        return installed.Count > 0 ? installed[0] : "";
    }

    private static string ExtractJsonString(string json, string key)
    {
        if (string.IsNullOrEmpty(json)) return null;
        string pattern = "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"";
        Match m = Regex.Match(json, pattern);
        if (!m.Success) return null;
        try { return Regex.Unescape(m.Groups[1].Value); }
        catch { return m.Groups[1].Value; }
    }

    private static string EscapeJson(string s)
    {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
    }

    private static byte[] BuildLocalTestSlip(string station, string pcName, string printerName)
    {
        List<byte> buf = new List<byte>();
        Action<string> add = s => buf.AddRange(Encoding.ASCII.GetBytes(s));
        add("\x1b@\x1ba\x01\x1b!\x30");
        add("SULTAN RESTAURANT\n");
        add("\x1b!\x10");
        add((station == "juice" ? "JUICE BAR PRINTER" : "KITCHEN PRINTER") + " OK\n");
        add("\x1b!\x00");
        add("------------------------------------------\n");
        add("\x1ba\x00");
        add("Station: " + station.ToUpperInvariant() + "\n");
        add("PC Name: " + pcName + "\n");
        add("Printer: " + printerName + "\n");
        add("Time:    " + DateTime.Now.ToString("dd MMM yyyy hh:mm:ss tt") + "\n");
        add("------------------------------------------\n");
        add("\x1ba\x01");
        add("Direct Thermal Print Agent Ready!\n");
        add("\n\n\n\n\x1dV\x00");
        return buf.ToArray();
    }

    private static string HttpGet(string url, int timeoutMs)
    {
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
        req.Method = "GET";
        req.Timeout = timeoutMs;
        req.ReadWriteTimeout = timeoutMs;
        req.KeepAlive = false;
        req.Proxy = null;
        req.UserAgent = "SultanPrintAgent/2.1";
        using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
        using (StreamReader sr = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
        {
            return sr.ReadToEnd();
        }
    }

    private static void HttpPostJson(string url, string jsonBody, int timeoutMs)
    {
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
        req.Method = "POST";
        req.ContentType = "application/json";
        req.Timeout = timeoutMs;
        req.ReadWriteTimeout = timeoutMs;
        req.KeepAlive = false;
        req.Proxy = null;
        req.UserAgent = "SultanPrintAgent/2.1";
        byte[] data = Encoding.UTF8.GetBytes(jsonBody);
        req.ContentLength = data.Length;
        using (Stream s = req.GetRequestStream()) { s.Write(data, 0, data.Length); }
        using (HttpWebResponse res = (HttpWebResponse)req.GetResponse()) { }
    }

    private volatile bool _running = true;
    private bool _allowRealExit = false;
    private string _serverUrl;
    private string _station;
    private string _configuredPrinter;
    private string _configPath;
    private string _pcName;
    private int _printedCount = 0;
    private Thread _workerThread;

    private Panel _statusBanner;
    private Label _lblStatusTitle;
    private Label _lblStatusSub;
    private TextBox _txtServerUrl;
    private ComboBox _cmbPrinter;
    private TextBox _txtLog;
    private NotifyIcon _trayIcon;

    public static string GetWindowTitle(string station)
    {
        return station == "juice"
            ? "Sultan Restaurant - Juice Bar Printer Agent"
            : "Sultan Restaurant - Main Kitchen Printer Agent";
    }

    public SultanDesktopPrintAgent(string serverUrl, string station, string configuredPrinter, string configPath, bool startMinimized)
    {
        _serverUrl = serverUrl;
        _station = station;
        _configuredPrinter = configuredPrinter;
        _configPath = configPath;
        _pcName = Environment.MachineName;

        InitializeUi();
        RefreshPrintersList();
        AppendLog("Started Sultan " + (_station == "juice" ? "Juice Bar" : "Kitchen") + " Printer Agent v2.1");
        AppendLog("PC: " + _pcName + " | Central Hub: " + _serverUrl);

        _workerThread = new Thread(PollLoop);
        _workerThread.IsBackground = true;
        _workerThread.Start();

        if (startMinimized) this.WindowState = FormWindowState.Minimized;
    }

    private void InitializeUi()
    {
        bool isJuice = _station == "juice";
        Color accent = isJuice ? Color.FromArgb(255, 149, 0) : Color.FromArgb(213, 169, 67);
        Color bgDark = Color.FromArgb(20, 20, 24);
        Color panelDark = Color.FromArgb(30, 30, 36);

        this.Text = GetWindowTitle(_station);
        this.Size = new Size(590, 525);
        this.MinimumSize = new Size(540, 480);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.BackColor = bgDark;
        this.ForeColor = Color.White;
        this.Font = new Font("Segoe UI", 9.5f);
        this.Icon = SystemIcons.Application;

        _statusBanner = new Panel { Dock = DockStyle.Top, Height = 76, BackColor = Color.FromArgb(48, 35, 16) };
        _lblStatusTitle = new Label
        {
            Text = "CONNECTING TO SULTAN HUB...",
            Font = new Font("Segoe UI", 12.5f, FontStyle.Bold),
            ForeColor = accent,
            AutoSize = true,
            Location = new Point(16, 12)
        };
        _lblStatusSub = new Label
        {
            Text = "Station: " + (isJuice ? "JUICE BAR ONLY (Zero Kitchen Conflict)" : "MAIN KITCHEN ONLY"),
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(220, 220, 225),
            AutoSize = true,
            Location = new Point(16, 42)
        };
        _statusBanner.Controls.Add(_lblStatusTitle);
        _statusBanner.Controls.Add(_lblStatusSub);
        this.Controls.Add(_statusBanner);

        Panel cfgPanel = new Panel
        {
            Location = new Point(16, 90),
            Size = new Size(542, 118),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            BackColor = panelDark
        };

        cfgPanel.Controls.Add(new Label { Text = "Central Hub URL:", ForeColor = Color.FromArgb(190, 190, 200), Location = new Point(12, 16), AutoSize = true });

        _txtServerUrl = new TextBox
        {
            Text = _serverUrl,
            Location = new Point(135, 13),
            Size = new Size(288, 25),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            BackColor = Color.FromArgb(18, 18, 22),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };
        cfgPanel.Controls.Add(_txtServerUrl);

        Button btnSave = new Button
        {
            Text = "Save & Apply",
            Location = new Point(430, 12),
            Size = new Size(98, 27),
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            FlatStyle = FlatStyle.Flat,
            BackColor = accent,
            ForeColor = Color.Black,
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold)
        };
        btnSave.Click += OnSaveConfigClick;
        cfgPanel.Controls.Add(btnSave);

        cfgPanel.Controls.Add(new Label { Text = "Local USB Printer:", ForeColor = Color.FromArgb(190, 190, 200), Location = new Point(12, 54), AutoSize = true });

        _cmbPrinter = new ComboBox
        {
            Location = new Point(135, 51),
            Size = new Size(288, 25),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            DropDownStyle = ComboBoxStyle.DropDownList,
            BackColor = Color.FromArgb(18, 18, 22),
            ForeColor = Color.White
        };
        _cmbPrinter.SelectedIndexChanged += (s, e) =>
        {
            if (_cmbPrinter.SelectedItem != null)
            {
                string val = _cmbPrinter.SelectedItem.ToString();
                _configuredPrinter = val.StartsWith("AUTO") ? "AUTO" : val;
            }
        };
        cfgPanel.Controls.Add(_cmbPrinter);

        Button btnRefresh = new Button
        {
            Text = "Refresh",
            Location = new Point(430, 50),
            Size = new Size(98, 27),
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(52, 52, 60),
            ForeColor = Color.White
        };
        btnRefresh.Click += (s, e) => { RefreshPrintersList(); AppendLog("Refreshed local Windows printers."); };
        cfgPanel.Controls.Add(btnRefresh);

        cfgPanel.Controls.Add(new Label
        {
            Text = "Keep this window open or minimized to tray. Incoming " + (isJuice ? "Juice Bar" : "Kitchen") + " slips print automatically!",
            ForeColor = Color.FromArgb(145, 160, 175),
            Font = new Font("Segoe UI", 8.5f),
            Location = new Point(12, 88),
            AutoSize = true
        });
        this.Controls.Add(cfgPanel);

        this.Controls.Add(new Label
        {
            Text = "LIVE PRINT ACTIVITY LOG:",
            ForeColor = Color.FromArgb(160, 160, 175),
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            Location = new Point(16, 218),
            AutoSize = true
        });

        _txtLog = new TextBox
        {
            Location = new Point(16, 238),
            Size = new Size(542, 184),
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BackColor = Color.FromArgb(12, 12, 15),
            ForeColor = Color.FromArgb(110, 231, 183),
            Font = new Font("Consolas", 9f),
            BorderStyle = BorderStyle.FixedSingle
        };
        this.Controls.Add(_txtLog);

        Panel btnBar = new Panel { Dock = DockStyle.Bottom, Height = 54, BackColor = panelDark };

        Button btnTest = new Button
        {
            Text = "Print Test Slip",
            Location = new Point(16, 11),
            Size = new Size(135, 32),
            FlatStyle = FlatStyle.Flat,
            BackColor = accent,
            ForeColor = Color.Black,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        btnTest.Click += OnTestPrintClick;
        btnBar.Controls.Add(btnTest);

        Button btnTray = new Button
        {
            Text = "Minimize to Tray",
            Location = new Point(162, 11),
            Size = new Size(135, 32),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(52, 52, 62),
            ForeColor = Color.White
        };
        btnTray.Click += (s, e) => MinimizeToTray();
        btnBar.Controls.Add(btnTray);

        Button btnExit = new Button
        {
            Text = "Stop & Exit",
            Location = new Point(450, 11),
            Size = new Size(108, 32),
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(153, 27, 27),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        btnExit.Click += (s, e) => { _allowRealExit = true; _running = false; this.Close(); };
        btnBar.Controls.Add(btnExit);
        this.Controls.Add(btnBar);

        _trayIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Sultan " + (isJuice ? "Juice Bar" : "Kitchen") + " Printer Agent",
            Visible = true
        };
        _trayIcon.DoubleClick += (s, e) => RestoreFromTray();
        ContextMenu trayMenu = new ContextMenu();
        trayMenu.MenuItems.Add("Show Window", (s, e) => RestoreFromTray());
        trayMenu.MenuItems.Add("Print Test Slip", OnTestPrintClick);
        trayMenu.MenuItems.Add("-");
        trayMenu.MenuItems.Add("Exit Printer Agent", (s, e) => { _allowRealExit = true; _running = false; this.Close(); });
        _trayIcon.ContextMenu = trayMenu;

        this.FormClosing += (s, e) =>
        {
            if (!_allowRealExit && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                MinimizeToTray();
                return;
            }
            _running = false;
            try { _trayIcon.Visible = false; _trayIcon.Dispose(); } catch { }
        };
    }

    private void MinimizeToTray()
    {
        this.Hide();
        try
        {
            _trayIcon.ShowBalloonTip(2500, "Sultan Printer Agent Active",
                "Still printing " + (_station == "juice" ? "Juice Bar" : "Kitchen") + " slips automatically. Double-click icon to reopen.",
                ToolTipIcon.Info);
        }
        catch { }
    }

    private void RestoreFromTray()
    {
        this.Show();
        this.WindowState = FormWindowState.Normal;
        this.BringToFront();
        this.Activate();
    }

    private void RefreshPrintersList()
    {
        List<string> installed = GetInstalledPrinters();
        string resolved = ResolveTargetPrinter(null, _configuredPrinter, installed);
        _cmbPrinter.Items.Clear();
        _cmbPrinter.Items.Add("AUTO (Detected: " + (string.IsNullOrEmpty(resolved) ? "None" : resolved) + ")");
        foreach (string p in installed) _cmbPrinter.Items.Add(p);

        int idx = 0;
        if (!string.IsNullOrWhiteSpace(_configuredPrinter) && !_configuredPrinter.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
        {
            for (int i = 1; i < _cmbPrinter.Items.Count; i++)
                if (_cmbPrinter.Items[i].ToString().Equals(_configuredPrinter, StringComparison.OrdinalIgnoreCase)) { idx = i; break; }
        }
        _cmbPrinter.SelectedIndex = idx;
    }

    private void OnSaveConfigClick(object sender, EventArgs e)
    {
        string url = (_txtServerUrl.Text ?? "").Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(url)) { MessageBox.Show("Please enter Central Hub URL (e.g. http://192.168.1.10:5050)."); return; }
        _serverUrl = url;
        if (_cmbPrinter.SelectedItem != null)
        {
            string sel = _cmbPrinter.SelectedItem.ToString();
            _configuredPrinter = sel.StartsWith("AUTO") ? "AUTO" : sel;
        }
        try
        {
            File.WriteAllLines(_configPath, new[]
            {
                "# Sultan Restaurant Dedicated Station Thermal Print Agent Config",
                "SERVER=" + _serverUrl,
                "STATION=" + _station,
                "PRINTER=" + _configuredPrinter
            });
            AppendLog("Saved config -> Hub: " + _serverUrl + " | Printer: " + _configuredPrinter);
        }
        catch (Exception ex) { AppendLog("Config save warning: " + ex.Message); }
    }

    private void OnTestPrintClick(object sender, EventArgs e)
    {
        List<string> installed = GetInstalledPrinters();
        string target = ResolveTargetPrinter(null, _configuredPrinter, installed);
        if (string.IsNullOrEmpty(target))
        {
            MessageBox.Show("No physical thermal printer detected on this PC! Check USB cable.", "No Printer Found", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        string err;
        bool ok = SendRawBytesToPrinter(target, BuildLocalTestSlip(_station, _pcName, target), out err);
        if (ok) AppendLog("[TEST OK] Printed test slip directly to " + target);
        else
        {
            AppendLog("[TEST FAIL] " + err);
            MessageBox.Show("Test print failed on '" + target + "':\n" + err, "Print Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void AppendLog(string msg)
    {
        if (this.IsDisposed) return;
        string line = "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg + Environment.NewLine;
        try
        {
            Action append = () =>
            {
                if (_txtLog != null && !_txtLog.IsDisposed)
                {
                    if (_txtLog.TextLength > 20000) _txtLog.Clear();
                    _txtLog.AppendText(line);
                }
            };
            if (this.InvokeRequired) this.BeginInvoke(append); else append();
        }
        catch { }
    }

    private void UpdateStatusBanner(bool connected, string titleText, string subText)
    {
        if (this.IsDisposed) return;
        try
        {
            Action apply = () =>
            {
                if (this.IsDisposed) return;
                _statusBanner.BackColor = connected ? Color.FromArgb(14, 58, 42) : Color.FromArgb(68, 38, 12);
                _lblStatusTitle.ForeColor = connected ? Color.FromArgb(52, 211, 153) : Color.FromArgb(251, 191, 36);
                _lblStatusTitle.Text = titleText;
                _lblStatusSub.Text = subText;
            };
            if (this.InvokeRequired) this.BeginInvoke(apply); else apply();
        }
        catch { }
    }

    private void PollLoop()
    {
        bool wasConnected = false;
        while (_running)
        {
            try
            {
                List<string> installed = GetInstalledPrinters();
                string activePrinter = ResolveTargetPrinter(null, _configuredPrinter, installed);
                string printersCsv = string.Join("||", installed.ToArray());

                string pollUrl = _serverUrl
                    + "/api/print-agent/poll?station=" + Uri.EscapeDataString(_station)
                    + "&pc=" + Uri.EscapeDataString(_pcName)
                    + "&printer=" + Uri.EscapeDataString(activePrinter ?? "")
                    + "&printers=" + Uri.EscapeDataString(printersCsv);

                string resp = HttpGet(pollUrl, 22000);
                if (!wasConnected)
                {
                    wasConnected = true;
                    AppendLog("CONNECTED to Sultan Hub (" + _serverUrl + ") -> Printer: " + (string.IsNullOrEmpty(activePrinter) ? "NONE" : activePrinter));
                }

                UpdateStatusBanner(
                    true,
                    "ONLINE - " + (_station == "juice" ? "JUICE BAR" : "KITCHEN") + " PRINTER READY",
                    "Hub: " + _serverUrl + "  |  Printer: " + (string.IsNullOrEmpty(activePrinter) ? "NONE" : activePrinter) + "  |  Printed: " + _printedCount
                );

                string serverConfiguredPrinter = ExtractJsonString(resp, "configuredPrinter");
                if (!string.IsNullOrWhiteSpace(serverConfiguredPrinter) && !serverConfiguredPrinter.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
                    _configuredPrinter = serverConfiguredPrinter;

                string jobId = ExtractJsonString(resp, "jobId");
                string rawBase64 = ExtractJsonString(resp, "rawBase64");
                if (!string.IsNullOrWhiteSpace(jobId) && !string.IsNullOrWhiteSpace(rawBase64))
                {
                    string ticketId = ExtractJsonString(resp, "ticketId") ?? "KOT";
                    string tableName = ExtractJsonString(resp, "tableName") ?? "";
                    string jobPrinter = ExtractJsonString(resp, "printerName");
                    string targetPrinter = ResolveTargetPrinter(jobPrinter, _configuredPrinter, installed);

                    AppendLog("Printing " + _station.ToUpperInvariant() + " KOT #" + ticketId + " (" + tableName + ") -> " + targetPrinter + "...");
                    bool printed = false;
                    string printError = "";
                    try
                    {
                        byte[] rawBytes = Convert.FromBase64String(rawBase64);
                        printed = SendRawBytesToPrinter(targetPrinter, rawBytes, out printError);
                    }
                    catch (Exception ex) { printError = ex.Message; }

                    if (printed)
                    {
                        _printedCount++;
                        AppendLog("PRINTED OK #" + ticketId + " on " + targetPrinter + " (Total: " + _printedCount + ")");
                        UpdateStatusBanner(
                            true,
                            "ONLINE - " + (_station == "juice" ? "JUICE BAR" : "KITCHEN") + " PRINTER READY",
                            "Hub: " + _serverUrl + "  |  Printer: " + targetPrinter + "  |  Printed: " + _printedCount
                        );
                    }
                    else AppendLog("PRINT FAILED #" + ticketId + ": " + printError);

                    try
                    {
                        string ackJson = "{\"jobId\":\"" + EscapeJson(jobId) + "\",\"ticketId\":\"" + EscapeJson(ticketId)
                            + "\",\"station\":\"" + EscapeJson(_station) + "\",\"success\":" + (printed ? "true" : "false")
                            + ",\"printerName\":\"" + EscapeJson(targetPrinter) + "\",\"pcName\":\"" + EscapeJson(_pcName)
                            + "\",\"error\":\"" + EscapeJson(printError) + "\"}";
                        HttpPostJson(_serverUrl + "/api/print-agent/ack", ackJson, 8000);
                    }
                    catch (Exception ackEx) { AppendLog("ACK warning: " + ackEx.Message); }
                    Thread.Sleep(150);
                }
            }
            catch (Exception ex)
            {
                if (wasConnected) { wasConnected = false; AppendLog("Connection paused: " + ex.Message + " (retrying in 3s...)"); }
                else AppendLog("Waiting for Sultan Hub at " + _serverUrl + " (" + ex.Message + ")");
                UpdateStatusBanner(false, "WAITING FOR SULTAN HUB...", "Retrying " + _serverUrl + " — check LAN/Wi-Fi connection");
                for (int i = 0; i < 30 && _running; i++) Thread.Sleep(100);
            }
        }
    }

    public static void RunApp(string baseDir, string serverOverride, string stationOverride, string printerOverride, bool testOnly, bool startMinimized)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string serverUrl = "http://192.168.1.10:5050";
        string station = "juice";
        string configuredPrinter = "AUTO";
        string configPath = Path.Combine(baseDir, "agent-config.txt");

        if (File.Exists(configPath))
        {
            try
            {
                foreach (string rawLine in File.ReadAllLines(configPath))
                {
                    string line = rawLine.Trim();
                    if (line.Length == 0 || line.StartsWith("#") || line.StartsWith(";")) continue;
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    string k = line.Substring(0, eq).Trim().ToUpperInvariant();
                    string v = line.Substring(eq + 1).Trim();
                    if (string.IsNullOrEmpty(v)) continue;
                    if (k == "SERVER" || k == "SERVER_URL") serverUrl = v.TrimEnd('/');
                    else if (k == "STATION") station = v.ToLowerInvariant();
                    else if (k == "PRINTER" || k == "PRINTER_NAME") configuredPrinter = v;
                }
            }
            catch { }
        }

        if (!string.IsNullOrWhiteSpace(serverOverride)) serverUrl = serverOverride.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(stationOverride)) station = stationOverride.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(printerOverride)) configuredPrinter = printerOverride.Trim();

        if (testOnly)
        {
            List<string> installed = GetInstalledPrinters();
            string target = ResolveTargetPrinter(null, configuredPrinter, installed);
            if (string.IsNullOrEmpty(target))
            {
                MessageBox.Show("No physical thermal printer found on this PC!\nInstalled printers: " + string.Join(", ", installed.ToArray()), "Sultan Printer Test", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            string err;
            bool ok = SendRawBytesToPrinter(target, BuildLocalTestSlip(station, Environment.MachineName, target), out err);
            if (ok) MessageBox.Show("Test slip printed successfully to:\n" + target, "Sultan Printer Test - OK", MessageBoxButtons.OK, MessageBoxIcon.Information);
            else MessageBox.Show("Print failed on '" + target + "':\n" + err, "Sultan Printer Test - Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        bool createdNew;
        string mutexName = "Global\\SultanDesktopPrintAgent_" + station;
        using (Mutex mutex = new Mutex(true, mutexName, out createdNew))
        {
            if (!createdNew)
            {
                IntPtr existingHwnd = FindWindow(null, GetWindowTitle(station));
                if (existingHwnd != IntPtr.Zero)
                {
                    ShowWindow(existingHwnd, 9);
                    SetForegroundWindow(existingHwnd);
                }
                else
                {
                    MessageBox.Show(
                        "Sultan " + (station == "juice" ? "Juice Bar" : "Kitchen") + " Printer Agent is ALREADY running in the system tray (bottom-right near the clock)!\n\nDouble-click its tray icon to open the window.",
                        "Sultan Printer Agent Already Running",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
                return;
            }

            Application.Run(new SultanDesktopPrintAgent(serverUrl, station, configuredPrinter, configPath, startMinimized));
        }
    }
}
'@

    if (-not ("SultanDesktopPrintAgent" -as [type])) {
        Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies System.Drawing, System.Windows.Forms -ErrorAction Stop
    }

    [SultanDesktopPrintAgent]::RunApp($PSScriptRoot, $Server, $Station, $Printer, [bool]$Test, [bool]$Minimized)
} catch {
    $errLog = Join-Path $PSScriptRoot "agent-error.log"
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $($_.Exception.ToString())`r`n"
    try { Add-Content -Path $errLog -Value $msg } catch {}
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "Sultan Printer Agent error:`n`n$($_.Exception.Message)`n`nDetails saved to agent-error.log",
            "Sultan Printer Agent Error",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "Press Enter to close"
    }
}
