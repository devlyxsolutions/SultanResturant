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

public class SultanPrintAgentForm : Form
{
    // --- Win32 Raw ESC/POS Printing via winspool.Drv ---
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
        if (string.IsNullOrWhiteSpace(printerName))
        {
            errorMsg = "No printer selected";
            return false;
        }
        if (rawBytes == null || rawBytes.Length == 0)
        {
            errorMsg = "Empty print buffer";
            return false;
        }

        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Sultan Station KOT";
        di.pDataType = "RAW";

        try
        {
            if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero))
            {
                int err = Marshal.GetLastWin32Error();
                errorMsg = "OpenPrinter failed for '" + printerName + "' (Win32 error " + err + ")";
                return false;
            }
            if (!StartDocPrinter(hPrinter, 1, di))
            {
                int err = Marshal.GetLastWin32Error();
                ClosePrinter(hPrinter);
                errorMsg = "StartDocPrinter failed (Win32 error " + err + ")";
                return false;
            }
            if (!StartPagePrinter(hPrinter))
            {
                int err = Marshal.GetLastWin32Error();
                EndDocPrinter(hPrinter);
                ClosePrinter(hPrinter);
                errorMsg = "StartPagePrinter failed (Win32 error " + err + ")";
                return false;
            }

            IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(rawBytes.Length);
            bool bSuccess = false;
            try
            {
                Marshal.Copy(rawBytes, 0, pUnmanagedBytes, rawBytes.Length);
                int dwWritten = 0;
                bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, rawBytes.Length, out dwWritten);
                if (!bSuccess)
                {
                    int err = Marshal.GetLastWin32Error();
                    errorMsg = "WritePrinter failed (Win32 error " + err + ")";
                }
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
            if (hPrinter != IntPtr.Zero)
            {
                try { ClosePrinter(hPrinter); } catch { }
            }
            return false;
        }
    }

    // --- Printer Discovery ---
    private static bool IsVirtualPrinter(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return true;
        string lower = name.ToLowerInvariant();
        return lower.Contains("print to pdf")
            || lower.Contains("xps document")
            || lower.Contains("onenote")
            || lower.Contains("fax")
            || lower.Contains("adobe pdf")
            || lower.Contains("foxit")
            || lower.Contains("nitro");
    }

    private static bool LooksLikeThermalPrinter(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return false;
        string lower = name.ToLowerInvariant();
        return lower.Contains("pos")
            || lower.Contains("80")
            || lower.Contains("58")
            || lower.Contains("thermal")
            || lower.Contains("receipt")
            || lower.Contains("xprinter")
            || lower.Contains("xp-")
            || lower.Contains("blackcopper")
            || lower.Contains("bc-")
            || lower.Contains("epson")
            || lower.Contains("tm-")
            || lower.Contains("rongta")
            || lower.Contains("rp80")
            || lower.Contains("bixolon")
            || lower.Contains("star")
            || lower.Contains("gp-")
            || lower.Contains("juice")
            || lower.Contains("kitchen");
    }

    private static List<string> GetInstalledPrinters()
    {
        List<string> list = new List<string>();
        try
        {
            foreach (string p in PrinterSettings.InstalledPrinters)
            {
                if (!string.IsNullOrWhiteSpace(p)) list.Add(p);
            }
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

    // --- Minimal JSON Helpers ---
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
        add("\x1b@");
        add("\x1ba\x01");
        add("\x1b!\x30");
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
        add("\n\n\n\n");
        add("\x1dV\x00");
        return buf.ToArray();
    }

    // --- HTTP Helpers ---
    private static string HttpGet(string url, int timeoutMs)
    {
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
        req.Method = "GET";
        req.Timeout = timeoutMs;
        req.ReadWriteTimeout = timeoutMs;
        req.KeepAlive = false;
        req.Proxy = null; // Bypass slow Windows proxy auto-detect on LAN!
        req.UserAgent = "SultanPrintAgent/2.0";

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
        req.UserAgent = "SultanPrintAgent/2.0";

        byte[] data = Encoding.UTF8.GetBytes(jsonBody);
        req.ContentLength = data.Length;
        using (Stream s = req.GetRequestStream())
        {
            s.Write(data, 0, data.Length);
        }
        using (HttpWebResponse res = (HttpWebResponse)req.GetResponse()) { }
    }

    // --- Instance State & UI Controls ---
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
    private Button _btnTestPrint;
    private Button _btnSaveConfig;
    private Button _btnRefreshPrinters;
    private Button _btnMinimizeTray;
    private Button _btnExit;
    private NotifyIcon _trayIcon;

    public static string GetWindowTitleForStation(string station)
    {
        return station == "juice"
            ? "Sultan Restaurant - Juice Bar Printer Agent"
            : "Sultan Restaurant - Main Kitchen Printer Agent";
    }

    public SultanPrintAgentForm(string serverUrl, string station, string configuredPrinter, string configPath, bool startMinimized)
    {
        _serverUrl = serverUrl;
        _station = station;
        _configuredPrinter = configuredPrinter;
        _configPath = configPath;
        _pcName = Environment.MachineName;

        InitializeUi();
        RefreshPrintersList();
        AppendLog("Started Sultan " + (_station == "juice" ? "Juice Bar" : "Kitchen") + " Printer Agent v2.0");
        AppendLog("PC: " + _pcName + " | Central Hub: " + _serverUrl);

        _workerThread = new Thread(PollLoop);
        _workerThread.IsBackground = true;
        _workerThread.Start();

        if (startMinimized)
        {
            this.WindowState = FormWindowState.Minimized;
        }
    }

    private void InitializeUi()
    {
        bool isJuice = _station == "juice";
        Color accent = isJuice ? Color.FromArgb(255, 149, 0) : Color.FromArgb(213, 169, 67);
        Color bgDark = Color.FromArgb(20, 20, 24);
        Color panelDark = Color.FromArgb(30, 30, 36);

        this.Text = GetWindowTitleForStation(_station);
        this.Size = new Size(580, 520);
        this.MinimumSize = new Size(540, 480);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.BackColor = bgDark;
        this.ForeColor = Color.White;
        this.Font = new Font("Segoe UI", 9.5f);
        this.Icon = SystemIcons.Application;

        // Top Header Banner
        _statusBanner = new Panel();
        _statusBanner.Dock = DockStyle.Top;
        _statusBanner.Height = 76;
        _statusBanner.BackColor = Color.FromArgb(48, 35, 16);
        _statusBanner.Padding = new Padding(16, 12, 16, 10);

        _lblStatusTitle = new Label();
        _lblStatusTitle.Text = "CONNECTING TO SULTAN HUB...";
        _lblStatusTitle.Font = new Font("Segoe UI", 12.5f, FontStyle.Bold);
        _lblStatusTitle.ForeColor = accent;
        _lblStatusTitle.AutoSize = true;
        _lblStatusTitle.Location = new Point(16, 12);

        _lblStatusSub = new Label();
        _lblStatusSub.Text = "Station: " + (isJuice ? "JUICE BAR ONLY (Never conflicts with Kitchen)" : "MAIN KITCHEN ONLY");
        _lblStatusSub.Font = new Font("Segoe UI", 9f);
        _lblStatusSub.ForeColor = Color.FromArgb(220, 220, 225);
        _lblStatusSub.AutoSize = true;
        _lblStatusSub.Location = new Point(16, 42);

        _statusBanner.Controls.Add(_lblStatusTitle);
        _statusBanner.Controls.Add(_lblStatusSub);
        this.Controls.Add(_statusBanner);

        // Config Panel
        Panel cfgPanel = new Panel();
        cfgPanel.Location = new Point(16, 90);
        cfgPanel.Size = new Size(532, 118);
        cfgPanel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        cfgPanel.BackColor = panelDark;

        Label lblServer = new Label();
        lblServer.Text = "Central Hub URL:";
        lblServer.ForeColor = Color.FromArgb(190, 190, 200);
        lblServer.Location = new Point(12, 16);
        lblServer.AutoSize = true;
        cfgPanel.Controls.Add(lblServer);

        _txtServerUrl = new TextBox();
        _txtServerUrl.Text = _serverUrl;
        _txtServerUrl.Location = new Point(135, 13);
        _txtServerUrl.Size = new Size(280, 25);
        _txtServerUrl.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _txtServerUrl.BackColor = Color.FromArgb(18, 18, 22);
        _txtServerUrl.ForeColor = Color.White;
        _txtServerUrl.BorderStyle = BorderStyle.FixedSingle;
        cfgPanel.Controls.Add(_txtServerUrl);

        _btnSaveConfig = new Button();
        _btnSaveConfig.Text = "Save & Apply";
        _btnSaveConfig.Location = new Point(422, 12);
        _btnSaveConfig.Size = new Size(98, 27);
        _btnSaveConfig.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnSaveConfig.FlatStyle = FlatStyle.Flat;
        _btnSaveConfig.BackColor = accent;
        _btnSaveConfig.ForeColor = Color.Black;
        _btnSaveConfig.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        _btnSaveConfig.Click += OnSaveConfigClick;
        cfgPanel.Controls.Add(_btnSaveConfig);

        Label lblPrinter = new Label();
        lblPrinter.Text = "Local USB Printer:";
        lblPrinter.ForeColor = Color.FromArgb(190, 190, 200);
        lblPrinter.Location = new Point(12, 54);
        lblPrinter.AutoSize = true;
        cfgPanel.Controls.Add(lblPrinter);

        _cmbPrinter = new ComboBox();
        _cmbPrinter.Location = new Point(135, 51);
        _cmbPrinter.Size = new Size(280, 25);
        _cmbPrinter.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbPrinter.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbPrinter.BackColor = Color.FromArgb(18, 18, 22);
        _cmbPrinter.ForeColor = Color.White;
        _cmbPrinter.SelectedIndexChanged += (s, e) =>
        {
            if (_cmbPrinter.SelectedItem != null)
            {
                string val = _cmbPrinter.SelectedItem.ToString();
                _configuredPrinter = val.StartsWith("AUTO") ? "AUTO" : val;
            }
        };
        cfgPanel.Controls.Add(_cmbPrinter);

        _btnRefreshPrinters = new Button();
        _btnRefreshPrinters.Text = "Refresh";
        _btnRefreshPrinters.Location = new Point(422, 50);
        _btnRefreshPrinters.Size = new Size(98, 27);
        _btnRefreshPrinters.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnRefreshPrinters.FlatStyle = FlatStyle.Flat;
        _btnRefreshPrinters.BackColor = Color.FromArgb(52, 52, 60);
        _btnRefreshPrinters.ForeColor = Color.White;
        _btnRefreshPrinters.Click += (s, e) =>
        {
            RefreshPrintersList();
            AppendLog("Refreshed local Windows printers.");
        };
        cfgPanel.Controls.Add(_btnRefreshPrinters);

        Label lblHint = new Label();
        lblHint.Text = "Keep this app running (or minimized to tray). All " + (isJuice ? "Juice Bar" : "Kitchen") + " slips print automatically!";
        lblHint.ForeColor = Color.FromArgb(145, 160, 175);
        lblHint.Font = new Font("Segoe UI", 8.5f);
        lblHint.Location = new Point(12, 88);
        lblHint.AutoSize = true;
        cfgPanel.Controls.Add(lblHint);

        this.Controls.Add(cfgPanel);

        // Live Log Label & Box
        Label lblLog = new Label();
        lblLog.Text = "LIVE PRINT ACTIVITY LOG:";
        lblLog.ForeColor = Color.FromArgb(160, 160, 175);
        lblLog.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        lblLog.Location = new Point(16, 218);
        lblLog.AutoSize = true;
        this.Controls.Add(lblLog);

        _txtLog = new TextBox();
        _txtLog.Location = new Point(16, 238);
        _txtLog.Size = new Size(532, 180);
        _txtLog.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        _txtLog.Multiline = true;
        _txtLog.ReadOnly = true;
        _txtLog.ScrollBars = ScrollBars.Vertical;
        _txtLog.BackColor = Color.FromArgb(12, 12, 15);
        _txtLog.ForeColor = Color.FromArgb(110, 231, 183);
        _txtLog.Font = new Font("Consolas", 9f);
        _txtLog.BorderStyle = BorderStyle.FixedSingle;
        this.Controls.Add(_txtLog);

        // Bottom Buttons Bar
        Panel btnBar = new Panel();
        btnBar.Dock = DockStyle.Bottom;
        btnBar.Height = 54;
        btnBar.BackColor = panelDark;
        btnBar.Padding = new Padding(14, 10, 14, 10);

        _btnTestPrint = new Button();
        _btnTestPrint.Text = "Print Test Slip";
        _btnTestPrint.Location = new Point(16, 11);
        _btnTestPrint.Size = new Size(135, 32);
        _btnTestPrint.FlatStyle = FlatStyle.Flat;
        _btnTestPrint.BackColor = accent;
        _btnTestPrint.ForeColor = Color.Black;
        _btnTestPrint.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        _btnTestPrint.Click += OnTestPrintClick;
        btnBar.Controls.Add(_btnTestPrint);

        _btnMinimizeTray = new Button();
        _btnMinimizeTray.Text = "Minimize to Tray";
        _btnMinimizeTray.Location = new Point(162, 11);
        _btnMinimizeTray.Size = new Size(135, 32);
        _btnMinimizeTray.FlatStyle = FlatStyle.Flat;
        _btnMinimizeTray.BackColor = Color.FromArgb(52, 52, 62);
        _btnMinimizeTray.ForeColor = Color.White;
        _btnMinimizeTray.Click += (s, e) => MinimizeToTray();
        btnBar.Controls.Add(_btnMinimizeTray);

        _btnExit = new Button();
        _btnExit.Text = "Stop & Exit";
        _btnExit.Location = new Point(440, 11);
        _btnExit.Size = new Size(108, 32);
        _btnExit.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnExit.FlatStyle = FlatStyle.Flat;
        _btnExit.BackColor = Color.FromArgb(153, 27, 27);
        _btnExit.ForeColor = Color.White;
        _btnExit.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        _btnExit.Click += (s, e) =>
        {
            _allowRealExit = true;
            _running = false;
            this.Close();
        };
        btnBar.Controls.Add(_btnExit);

        this.Controls.Add(btnBar);

        // System Tray Icon
        _trayIcon = new NotifyIcon();
        _trayIcon.Icon = SystemIcons.Application;
        _trayIcon.Text = "Sultan " + (isJuice ? "Juice Bar" : "Kitchen") + " Printer Agent";
        _trayIcon.Visible = true;
        _trayIcon.DoubleClick += (s, e) => RestoreFromTray();

        ContextMenu trayMenu = new ContextMenu();
        trayMenu.MenuItems.Add("Show Window", (s, e) => RestoreFromTray());
        trayMenu.MenuItems.Add("Print Test Slip", OnTestPrintClick);
        trayMenu.MenuItems.Add("-");
        trayMenu.MenuItems.Add("Exit Printer Agent", (s, e) =>
        {
            _allowRealExit = true;
            _running = false;
            this.Close();
        });
        _trayIcon.ContextMenu = trayMenu;

        // Clicking X minimizes to tray instead of killing the printer accidentally
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
            _trayIcon.ShowBalloonTip(2500, "Sultan Printer Agent Running",
                "Still listening for " + (_station == "juice" ? "Juice Bar" : "Kitchen") + " KOT slips. Double-click tray icon to open.",
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
        foreach (string p in installed)
        {
            _cmbPrinter.Items.Add(p);
        }

        int idx = 0;
        if (!string.IsNullOrWhiteSpace(_configuredPrinter) && !_configuredPrinter.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
        {
            for (int i = 1; i < _cmbPrinter.Items.Count; i++)
            {
                if (_cmbPrinter.Items[i].ToString().Equals(_configuredPrinter, StringComparison.OrdinalIgnoreCase))
                {
                    idx = i;
                    break;
                }
            }
        }
        _cmbPrinter.SelectedIndex = idx;
    }

    private void OnSaveConfigClick(object sender, EventArgs e)
    {
        string url = (_txtServerUrl.Text ?? "").Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(url))
        {
            MessageBox.Show("Please enter a valid Central Hub URL (e.g. http://192.168.1.10:5050).", "Invalid URL", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
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
        catch (Exception ex)
        {
            AppendLog("Warning saving agent-config.txt: " + ex.Message);
        }
    }

    private void OnTestPrintClick(object sender, EventArgs e)
    {
        List<string> installed = GetInstalledPrinters();
        string target = ResolveTargetPrinter(null, _configuredPrinter, installed);
        if (string.IsNullOrEmpty(target))
        {
            MessageBox.Show("No physical thermal printer detected on this PC! Check USB cable and Windows Printers.", "No Printer Found", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        string err;
        byte[] testBytes = BuildLocalTestSlip(_station, _pcName, target);
        bool ok = SendRawBytesToPrinter(target, testBytes, out err);
        if (ok)
        {
            AppendLog("[TEST OK] Printed test slip directly to " + target);
        }
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
            if (this.InvokeRequired)
            {
                this.BeginInvoke((Action)(() =>
                {
                    if (_txtLog != null && !_txtLog.IsDisposed)
                    {
                        if (_txtLog.TextLength > 20000) _txtLog.Clear();
                        _txtLog.AppendText(line);
                    }
                }));
            }
            else if (_txtLog != null && !_txtLog.IsDisposed)
            {
                if (_txtLog.TextLength > 20000) _txtLog.Clear();
                _txtLog.AppendText(line);
            }
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
            if (this.InvokeRequired) this.BeginInvoke(apply);
            else apply();
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
                if (!string.IsNullOrWhiteSpace(serverConfiguredPrinter)
                    && !serverConfiguredPrinter.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
                {
                    _configuredPrinter = serverConfiguredPrinter;
                }

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
                    catch (Exception ex)
                    {
                        printError = ex.Message;
                    }

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
                    else
                    {
                        AppendLog("PRINT FAILED #" + ticketId + ": " + printError);
                    }

                    try
                    {
                        string ackJson = "{"
                            + "\"jobId\":\"" + EscapeJson(jobId) + "\","
                            + "\"ticketId\":\"" + EscapeJson(ticketId) + "\","
                            + "\"station\":\"" + EscapeJson(_station) + "\","
                            + "\"success\":" + (printed ? "true" : "false") + ","
                            + "\"printerName\":\"" + EscapeJson(targetPrinter) + "\","
                            + "\"pcName\":\"" + EscapeJson(_pcName) + "\","
                            + "\"error\":\"" + EscapeJson(printError) + "\""
                            + "}";
                        HttpPostJson(_serverUrl + "/api/print-agent/ack", ackJson, 8000);
                    }
                    catch (Exception ackEx)
                    {
                        AppendLog("ACK warning: " + ackEx.Message);
                    }

                    Thread.Sleep(150);
                }
            }
            catch (Exception ex)
            {
                if (wasConnected)
                {
                    wasConnected = false;
                    AppendLog("Connection paused: " + ex.Message + " (retrying in 3s...)");
                }
                else
                {
                    AppendLog("Waiting for Sultan Hub at " + _serverUrl + " (" + ex.Message + ")");
                }
                UpdateStatusBanner(
                    false,
                    "WAITING FOR SULTAN HUB...",
                    "Retrying " + _serverUrl + " — check LAN/Wi-Fi connection"
                );
                for (int i = 0; i < 30 && _running; i++) Thread.Sleep(100);
            }
        }
    }

    private static void LoadConfigFile(string configPath, ref string serverUrl, ref string station, ref string printerName)
    {
        if (!File.Exists(configPath)) return;
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
                else if (k == "PRINTER" || k == "PRINTER_NAME") printerName = v;
            }
        }
        catch { }
    }

    private static void LogFatalError(string exeDir, Exception ex)
    {
        try
        {
            string logFile = Path.Combine(exeDir, "agent-error.log");
            File.AppendAllText(logFile, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + ex.ToString() + Environment.NewLine);
        }
        catch { }
    }

    [STAThread]
    public static int Main(string[] args)
    {
        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Application.ThreadException += (s, e) =>
            {
                LogFatalError(exeDir, e.Exception);
                MessageBox.Show("Sultan Printer Agent encountered an error:\n" + e.Exception.Message, "Sultan Printer Agent", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            };
            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                Exception ex = e.ExceptionObject as Exception;
                if (ex != null) LogFatalError(exeDir, ex);
            };

            string serverUrl = "http://192.168.1.10:5050";
            string station = "juice";
            string configuredPrinter = "AUTO";
            bool runTestOnly = false;
            bool startMinimized = false;

            string configPath = Path.Combine(exeDir, "agent-config.txt");
            LoadConfigFile(configPath, ref serverUrl, ref station, ref configuredPrinter);

            foreach (string arg in args)
            {
                if (arg.StartsWith("--server=", StringComparison.OrdinalIgnoreCase))
                    serverUrl = arg.Substring(9).Trim().TrimEnd('/');
                else if (arg.StartsWith("--station=", StringComparison.OrdinalIgnoreCase))
                    station = arg.Substring(10).Trim().ToLowerInvariant();
                else if (arg.StartsWith("--printer=", StringComparison.OrdinalIgnoreCase))
                    configuredPrinter = arg.Substring(10).Trim();
                else if (arg.Equals("--test", StringComparison.OrdinalIgnoreCase))
                    runTestOnly = true;
                else if (arg.Equals("--minimized", StringComparison.OrdinalIgnoreCase))
                    startMinimized = true;
            }

            if (runTestOnly)
            {
                List<string> installed = GetInstalledPrinters();
                string target = ResolveTargetPrinter(null, configuredPrinter, installed);
                if (string.IsNullOrEmpty(target))
                {
                    MessageBox.Show("No thermal printer found on this PC!\nInstalled printers: " + string.Join(", ", installed.ToArray()), "Sultan Printer Test", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return 2;
                }
                string testErr;
                bool ok = SendRawBytesToPrinter(target, BuildLocalTestSlip(station, Environment.MachineName, target), out testErr);
                if (ok)
                {
                    MessageBox.Show("Test slip printed successfully to:\n" + target, "Sultan Printer Test - OK", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
                MessageBox.Show("Print failed on '" + target + "':\n" + testErr, "Sultan Printer Test - Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 3;
            }

            // Single-instance check: if already open, bring existing window to front instead of silently exiting!
            bool createdNew;
            string mutexName = "Global\\SultanPrintAgent_" + station;
            using (Mutex mutex = new Mutex(true, mutexName, out createdNew))
            {
                if (!createdNew)
                {
                    IntPtr existingHwnd = FindWindow(null, GetWindowTitleForStation(station));
                    if (existingHwnd != IntPtr.Zero)
                    {
                        ShowWindow(existingHwnd, 9); // SW_RESTORE
                        SetForegroundWindow(existingHwnd);
                    }
                    else
                    {
                        MessageBox.Show(
                            "Sultan " + (station == "juice" ? "Juice Bar" : "Kitchen") + " Printer Agent is ALREADY running in the system tray (near the bottom-right clock)!\n\nDouble-click the tray icon near the clock to open it.",
                            "Sultan Printer Agent Already Running",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                    }
                    return 0;
                }

                SultanPrintAgentForm form = new SultanPrintAgentForm(serverUrl, station, configuredPrinter, configPath, startMinimized);
                Application.Run(form);
            }
            return 0;
        }
        catch (Exception ex)
        {
            LogFatalError(exeDir, ex);
            try
            {
                MessageBox.Show("Sultan Printer Agent startup error:\n\n" + ex.Message + "\n\nFull details saved to agent-error.log", "Sultan Printer Agent Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch { }
            return 1;
        }
    }
}
