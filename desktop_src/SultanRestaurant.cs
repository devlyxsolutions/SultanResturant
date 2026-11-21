using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace SultanRestaurantDesktop
{
    public class SultanConfig
    {
        public string serverUrl = "http://192.168.1.10:5050";
        public string defaultStation = "login";
        public bool autoStartHub = true;
        public bool kioskPrinting = true;
        public bool autoLaunchApp = true;
        public bool autoStartOnBoot = false;

        public static string GetConfigPath()
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            return Path.Combine(dir, "sultan-pos-config.json");
        }

        public static SultanConfig Load()
        {
            SultanConfig cfg = new SultanConfig();
            string path = GetConfigPath();
            if (!File.Exists(path))
            {
                cfg.Save();
                return cfg;
            }

            try
            {
                string json = File.ReadAllText(path, Encoding.UTF8);
                cfg.serverUrl = ExtractJsonString(json, "serverUrl", "http://192.168.1.10:5050");
                cfg.defaultStation = ExtractJsonString(json, "defaultStation", "login");
                cfg.autoStartHub = ExtractJsonBool(json, "autoStartHub", true);
                cfg.kioskPrinting = ExtractJsonBool(json, "kioskPrinting", true);
                cfg.autoLaunchApp = ExtractJsonBool(json, "autoLaunchApp", true);
                cfg.autoStartOnBoot = ExtractJsonBool(json, "autoStartOnBoot", false);
            }
            catch {}
            return cfg;
        }

        public void Save()
        {
            try
            {
                string path = GetConfigPath();
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("{");
                sb.AppendLine("  \"serverUrl\": \"" + EscapeJson(serverUrl) + "\",");
                sb.AppendLine("  \"defaultStation\": \"" + EscapeJson(defaultStation) + "\",");
                sb.AppendLine("  \"autoStartHub\": " + (autoStartHub ? "true" : "false") + ",");
                sb.AppendLine("  \"kioskPrinting\": " + (kioskPrinting ? "true" : "false") + ",");
                sb.AppendLine("  \"autoLaunchApp\": " + (autoLaunchApp ? "true" : "false") + ",");
                sb.AppendLine("  \"autoStartOnBoot\": " + (autoStartOnBoot ? "true" : "false"));
                sb.AppendLine("}");
                File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
            }
            catch {}
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        private static string ExtractJsonString(string json, string key, string def)
        {
            Regex r = new Regex("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase);
            Match m = r.Match(json);
            if (m.Success) return m.Groups[1].Value;
            return def;
        }

        private static bool ExtractJsonBool(string json, string key, bool def)
        {
            Regex r = new Regex("\"" + key + "\"\\s*:\\s*(true|false)", RegexOptions.IgnoreCase);
            Match m = r.Match(json);
            if (m.Success) return m.Groups[1].Value.ToLower() == "true";
            return def;
        }
    }

    public static class ProcessHelper
    {
        public static Process HubProcess = null;

        public static bool IsPortListening(string host, int port, int timeoutMs = 700)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult ar = client.BeginConnect(host, port, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(timeoutMs);
                    if (!ok) return false;
                    client.EndConnect(ar);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        public static string FindNodeExecutable()
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string[] possiblePaths = new string[] {
                Path.Combine(baseDir, "node.exe"),
                Path.Combine(baseDir, "node", "node.exe"),
                Path.Combine(baseDir, "bin", "node.exe"),
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe"
            };

            foreach (string p in possiblePaths)
            {
                if (File.Exists(p)) return p;
            }

            // Test PATH
            try
            {
                Process p = new Process();
                p.StartInfo.FileName = "where.exe";
                p.StartInfo.Arguments = "node";
                p.StartInfo.UseShellExecute = false;
                p.StartInfo.RedirectStandardOutput = true;
                p.StartInfo.CreateNoWindow = true;
                p.Start();
                string outPath = p.StandardOutput.ReadLine();
                p.WaitForExit();
                if (!string.IsNullOrEmpty(outPath) && File.Exists(outPath.Trim()))
                {
                    return outPath.Trim();
                }
            }
            catch {}

            return "node";
        }

        public static bool StartHub(out string errorMsg)
        {
            errorMsg = "";
            if (IsPortListening("127.0.0.1", 5050))
            {
                return true; // Already running!
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverJsPath = Path.Combine(baseDir, "server.js");
            if (!File.Exists(serverJsPath))
            {
                // Check parent directory
                string parentJs = Path.Combine(Directory.GetParent(baseDir).FullName, "server.js");
                if (File.Exists(parentJs))
                {
                    baseDir = Directory.GetParent(baseDir).FullName;
                    serverJsPath = parentJs;
                }
                else
                {
                    // Check sibling SultanResturant folder (e.g. if folder is on Desktop)
                    string siblingJs = Path.Combine(Directory.GetParent(baseDir).FullName, "SultanResturant", "server.js");
                    if (File.Exists(siblingJs))
                    {
                        baseDir = Path.Combine(Directory.GetParent(baseDir).FullName, "SultanResturant");
                        serverJsPath = siblingJs;
                    }
                    else
                    {
                        string fallback = @"C:\Users\Nizaam Digital Sol\Desktop\SultanResturant\server.js";
                        if (File.Exists(fallback))
                        {
                            baseDir = Path.GetDirectoryName(fallback);
                            serverJsPath = fallback;
                        }
                        else
                        {
                            errorMsg = "server.js not found in " + baseDir;
                            return false;
                        }
                    }
                }
            }

            string nodeExe = FindNodeExecutable();

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                psi.Arguments = "\"" + serverJsPath + "\"";
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                HubProcess = Process.Start(psi);

                // Wait up to 10 seconds for port 5050 to answer
                for (int i = 0; i < 20; i++)
                {
                    Thread.Sleep(500);
                    if (IsPortListening("127.0.0.1", 5050, 400))
                    {
                        return true;
                    }
                }

                if (IsPortListening("127.0.0.1", 5050, 600)) return true;
                errorMsg = "Hub process started but port 5050 did not respond within 10s.";
                return false;
            }
            catch (Exception ex)
            {
                errorMsg = "Failed to launch Central Hub: " + ex.Message;
                return false;
            }
        }

        public static void StopHub()
        {
            if (HubProcess != null)
            {
                try
                {
                    if (!HubProcess.HasExited)
                    {
                        HubProcess.Kill();
                    }
                }
                catch {}
                HubProcess = null;
            }
        }

        public static string FindBrowserExecutable()
        {
            string[] browsers = new string[] {
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
            };

            foreach (string b in browsers)
            {
                if (File.Exists(b)) return b;
            }
            return null;
        }

        public static bool LaunchAppMode(string targetUrl, bool kioskPrinting, bool startMaximized, out string error)
        {
            error = "";
            string browser = FindBrowserExecutable();
            if (string.IsNullOrEmpty(browser))
            {
                // Fallback to default browser
                try
                {
                    Process.Start(targetUrl);
                    return true;
                }
                catch (Exception ex)
                {
                    error = "Could not open browser: " + ex.Message;
                    return false;
                }
            }

            string profileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SultanRestaurant", "POSProfile");
            try
            {
                if (!Directory.Exists(profileDir)) Directory.CreateDirectory(profileDir);
            }
            catch {}

            StringBuilder args = new StringBuilder();
            args.AppendFormat("--app=\"{0}\" ", targetUrl);
            args.AppendFormat("--user-data-dir=\"{0}\" ", profileDir);
            args.Append("--window-name=\"Sultan Restaurant POS\" ");
            args.Append("--disable-pinch ");
            args.Append("--overscroll-history-navigation=0 ");
            args.Append("--disable-features=Translate,OptimizationHints ");
            args.Append("--no-first-run --no-default-browser-check ");

            if (kioskPrinting)
            {
                args.Append("--kiosk-printing ");
            }

            if (startMaximized)
            {
                args.Append("--start-maximized ");
            }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = browser;
                psi.Arguments = args.ToString();
                psi.UseShellExecute = false;
                Process.Start(psi);
                return true;
            }
            catch (Exception ex)
            {
                error = "Failed to launch app window: " + ex.Message;
                return false;
            }
        }

        public static bool IsAutoStartEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false))
                {
                    if (key != null)
                    {
                        object val = key.GetValue("SultanRestaurant");
                        return val != null;
                    }
                }
            }
            catch {}
            return false;
        }

        public static void SetAutoStart(bool enable)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                {
                    if (key != null)
                    {
                        if (enable)
                        {
                            key.SetValue("SultanRestaurant", "\"" + Application.ExecutablePath + "\"");
                        }
                        else
                        {
                            key.DeleteValue("SultanRestaurant", false);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("AutoStart error: " + ex.Message, "Sultan POS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        public static void CreateDesktopShortcut()
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string vbsScript = Path.Combine(Path.GetTempPath(), "sultan_create_shortcut.vbs");
                string lnkPath = Path.Combine(desktop, "Sultan Restaurant POS.lnk");

                StringBuilder sb = new StringBuilder();
                sb.AppendLine("Set oWS = WScript.CreateObject(\"WScript.Shell\")");
                sb.AppendLine("sLinkFile = \"" + lnkPath.Replace("\\", "\\\\") + "\"");
                sb.AppendLine("Set oLink = oWS.CreateShortcut(sLinkFile)");
                sb.AppendLine("oLink.TargetPath = \"" + Application.ExecutablePath.Replace("\\", "\\\\") + "\"");
                sb.AppendLine("oLink.WorkingDirectory = \"" + AppDomain.CurrentDomain.BaseDirectory.Replace("\\", "\\\\") + "\"");
                sb.AppendLine("oLink.Description = \"Sultan Restaurant Central POS Application\"");
                sb.AppendLine("oLink.IconLocation = \"" + Application.ExecutablePath.Replace("\\", "\\\\") + ",0\"");
                sb.AppendLine("oLink.Save");

                File.WriteAllText(vbsScript, sb.ToString());

                Process p = Process.Start("wscript.exe", "\"" + vbsScript + "\"");
                p.WaitForExit();
                try { File.Delete(vbsScript); } catch {}

                MessageBox.Show("Desktop shortcut created successfully:\n" + lnkPath, "Sultan POS", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not create shortcut: " + ex.Message, "Sultan POS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    public class MainForm : Form
    {
        private SultanConfig config;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;

        private Label lblHeaderTitle;
        private Label lblHeaderSubtitle;
        private Panel pnlHeader;
        private Panel pnlStatus;
        private Label lblHubStatus;
        private Label lblHubIndicator;
        private Button btnRefreshHub;

        private TextBox txtServerUrl;
        private Button btnTestPing;
        private CheckBox chkAutoStartHub;
        private CheckBox chkKioskPrinting;
        private CheckBox chkAutoBoot;
        private CheckBox chkAutoLaunchApp;

        private System.Windows.Forms.Timer statusTimer;

        public MainForm(SultanConfig cfg, bool showGuiInitially)
        {
            this.config = cfg;
            InitializeComponent();
            SetupTray();
            UpdateHubStatusUI();

            statusTimer = new System.Windows.Forms.Timer();
            statusTimer.Interval = 4000;
            statusTimer.Tick += (s, e) => { UpdateHubStatusUI(); };
            statusTimer.Start();

            if (!showGuiInitially)
            {
                this.WindowState = FormWindowState.Minimized;
                this.ShowInTaskbar = false;
            }
        }

        private void InitializeComponent()
        {
            this.Text = "Sultan Restaurant - Desktop Control & POS Hub";
            this.Size = new Size(680, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(24, 16, 20);
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9.5F, FontStyle.Regular);

            try
            {
                string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "assets", "sultan.ico");
                if (File.Exists(icoPath))
                {
                    this.Icon = new Icon(icoPath);
                }
                else
                {
                    this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                }
            }
            catch {}

            // Header Panel
            pnlHeader = new Panel();
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Height = 90;
            pnlHeader.BackColor = Color.FromArgb(36, 18, 26);
            pnlHeader.Paint += (s, e) => {
                using (Pen pen = new Pen(Color.FromArgb(212, 175, 55), 1.5F))
                {
                    e.Graphics.DrawLine(pen, 0, pnlHeader.Height - 1, pnlHeader.Width, pnlHeader.Height - 1);
                }
            };

            // Logo PictureBox
            PictureBox picLogo = new PictureBox();
            picLogo.Location = new Point(18, 13);
            picLogo.Size = new Size(64, 64);
            picLogo.SizeMode = PictureBoxSizeMode.Zoom;
            picLogo.BackColor = Color.Transparent;

            try
            {
                string logoImgPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "assets", "images", "sultan-logo.png");
                if (!File.Exists(logoImgPath))
                {
                    string parentLogo = Path.Combine(Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory).FullName, "assets", "images", "sultan-logo.png");
                    if (File.Exists(parentLogo)) logoImgPath = parentLogo;
                }

                if (File.Exists(logoImgPath))
                {
                    picLogo.Image = Image.FromFile(logoImgPath);
                }
                else if (this.Icon != null)
                {
                    picLogo.Image = this.Icon.ToBitmap();
                }
            }
            catch {}
            pnlHeader.Controls.Add(picLogo);

            lblHeaderTitle = new Label();
            lblHeaderTitle.Text = "SULTAN RESTAURANT & CAFE";
            lblHeaderTitle.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
            lblHeaderTitle.ForeColor = Color.FromArgb(234, 179, 8);
            lblHeaderTitle.Location = new Point(90, 16);
            lblHeaderTitle.AutoSize = true;

            lblHeaderSubtitle = new Label();
            lblHeaderSubtitle.Text = "Official Desktop Application  •  Central POS Hub & Station Launcher";
            lblHeaderSubtitle.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            lblHeaderSubtitle.ForeColor = Color.FromArgb(209, 213, 219);
            lblHeaderSubtitle.Location = new Point(92, 50);
            lblHeaderSubtitle.AutoSize = true;

            pnlHeader.Controls.Add(lblHeaderTitle);
            pnlHeader.Controls.Add(lblHeaderSubtitle);
            this.Controls.Add(pnlHeader);

            // Hub Status Banner
            pnlStatus = new Panel();
            pnlStatus.Location = new Point(20, 96);
            pnlStatus.Size = new Size(624, 44);
            pnlStatus.BackColor = Color.FromArgb(42, 24, 32);
            pnlStatus.Paint += (s, e) => {
                using (Pen pen = new Pen(Color.FromArgb(80, 50, 65), 1F))
                {
                    e.Graphics.DrawRectangle(pen, 0, 0, pnlStatus.Width - 1, pnlStatus.Height - 1);
                }
            };

            lblHubIndicator = new Label();
            lblHubIndicator.Text = "●";
            lblHubIndicator.Font = new Font("Segoe UI", 14F, FontStyle.Bold);
            lblHubIndicator.ForeColor = Color.FromArgb(34, 197, 94);
            lblHubIndicator.Location = new Point(14, 8);
            lblHubIndicator.AutoSize = true;

            lblHubStatus = new Label();
            lblHubStatus.Text = "Central Hub Status: Checking...";
            lblHubStatus.Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold);
            lblHubStatus.ForeColor = Color.White;
            lblHubStatus.Location = new Point(38, 11);
            lblHubStatus.AutoSize = true;

            btnRefreshHub = CreateStyledButton("🔄 Restart Hub", 500, 7, 110, 30, Color.FromArgb(60, 30, 45), Color.FromArgb(234, 179, 8));
            btnRefreshHub.Click += (s, e) => { RestartHubAction(); };

            pnlStatus.Controls.Add(lblHubIndicator);
            pnlStatus.Controls.Add(lblHubStatus);
            pnlStatus.Controls.Add(btnRefreshHub);
            this.Controls.Add(pnlStatus);

            // Section 1: Stations Launcher
            Label lblStations = new Label();
            lblStations.Text = "QUICK STATION LAUNCH (DIRECT APP MODE)";
            lblStations.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblStations.ForeColor = Color.FromArgb(212, 175, 55);
            lblStations.Location = new Point(20, 154);
            lblStations.AutoSize = true;
            this.Controls.Add(lblStations);

            int btnY = 180;
            Button btnPos = CreateStationButton("🛒 POS Billing & Orders", "/pos", 20, btnY, 198, 54, Color.FromArgb(153, 27, 27));
            Button btnKds = CreateStationButton("🍳 Kitchen Display (KDS)", "/kitchen/kds", 233, btnY, 198, 54, Color.FromArgb(30, 58, 138));
            Button btnAdmin = CreateStationButton("👑 Admin Dashboard", "/admin/dashboard", 446, btnY, 198, 54, Color.FromArgb(133, 77, 14));
            this.Controls.Add(btnPos);
            this.Controls.Add(btnKds);
            this.Controls.Add(btnAdmin);

            int btnY2 = 244;
            Button btnTables = CreateStationButton("🍽️ Tables & Floor Service", "/tables", 20, btnY2, 198, 54, Color.FromArgb(49, 46, 129));
            Button btnPlayland = CreateStationButton("🎡 Playland Rides & Cashier", "/playland", 233, btnY2, 198, 54, Color.FromArgb(112, 26, 117));
            Button btnJuice = CreateStationButton("🧃 Juice Bar & Beverages", "/pos", 446, btnY2, 198, 54, Color.FromArgb(20, 83, 45));
            this.Controls.Add(btnTables);
            this.Controls.Add(btnPlayland);
            this.Controls.Add(btnJuice);

            // Section 2: Settings Panel
            Panel pnlSettings = new Panel();
            pnlSettings.Location = new Point(20, 318);
            pnlSettings.Size = new Size(624, 230);
            pnlSettings.BackColor = Color.FromArgb(32, 20, 26);
            pnlSettings.Paint += (s, e) => {
                using (Pen pen = new Pen(Color.FromArgb(80, 50, 65), 1F))
                {
                    e.Graphics.DrawRectangle(pen, 0, 0, pnlSettings.Width - 1, pnlSettings.Height - 1);
                }
            };

            Label lblSettingsTitle = new Label();
            lblSettingsTitle.Text = "SYSTEM CONFIGURATION & MASTER SERVER IP";
            lblSettingsTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblSettingsTitle.ForeColor = Color.FromArgb(212, 175, 55);
            lblSettingsTitle.Location = new Point(16, 12);
            lblSettingsTitle.AutoSize = true;
            pnlSettings.Controls.Add(lblSettingsTitle);

            Label lblMasterServerInfo = new Label();
            lblMasterServerInfo.Text = "👑 Master Server LAN: http://192.168.1.10:5050";
            lblMasterServerInfo.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
            lblMasterServerInfo.ForeColor = Color.FromArgb(74, 222, 128);
            lblMasterServerInfo.Location = new Point(280, 12);
            lblMasterServerInfo.AutoSize = true;
            pnlSettings.Controls.Add(lblMasterServerInfo);

            Label lblServer = new Label();
            lblServer.Text = "Hub Server Address:";
            lblServer.Location = new Point(16, 42);
            lblServer.AutoSize = true;
            pnlSettings.Controls.Add(lblServer);

            txtServerUrl = new TextBox();
            txtServerUrl.Text = config.serverUrl;
            txtServerUrl.Location = new Point(160, 39);
            txtServerUrl.Size = new Size(240, 28);
            txtServerUrl.BackColor = Color.FromArgb(20, 12, 16);
            txtServerUrl.ForeColor = Color.White;
            txtServerUrl.Font = new Font("Consolas", 10F);
            pnlSettings.Controls.Add(txtServerUrl);

            btnTestPing = CreateStyledButton("Ping Test", 408, 38, 95, 29, Color.FromArgb(60, 40, 50), Color.White);
            btnTestPing.Click += (s, e) => { TestConnectionAction(); };
            pnlSettings.Controls.Add(btnTestPing);

            Button btnCopyIp = CreateStyledButton("📋 Copy IP", 510, 38, 98, 29, Color.FromArgb(40, 60, 50), Color.FromArgb(234, 179, 8));
            btnCopyIp.Click += (s, e) => {
                try {
                    Clipboard.SetText("http://192.168.1.10:5050");
                    MessageBox.Show("Server Address copied to clipboard:\nhttp://192.168.1.10:5050\n\nEnter this on Juice Bar, Kitchen KDS and Waiter devices.", "Sultan Server", MessageBoxButtons.OK, MessageBoxIcon.Information);
                } catch {}
            };
            pnlSettings.Controls.Add(btnCopyIp);

            chkAutoStartHub = new CheckBox();
            chkAutoStartHub.Text = "Auto-start Central Hub on this machine (keep checked on Main Server PC)";
            chkAutoStartHub.Checked = config.autoStartHub;
            chkAutoStartHub.Location = new Point(20, 80);
            chkAutoStartHub.Size = new Size(580, 26);
            pnlSettings.Controls.Add(chkAutoStartHub);

            chkKioskPrinting = new CheckBox();
            chkKioskPrinting.Text = "Direct Silent Thermal Printing (--kiosk-printing: No preview popup)";
            chkKioskPrinting.Checked = config.kioskPrinting;
            chkKioskPrinting.Location = new Point(20, 112);
            chkKioskPrinting.Size = new Size(580, 26);
            pnlSettings.Controls.Add(chkKioskPrinting);

            chkAutoBoot = new CheckBox();
            chkAutoBoot.Text = "Start Sultan Restaurant automatically on Windows Boot (Morning auto-launch)";
            chkAutoBoot.Checked = ProcessHelper.IsAutoStartEnabled();
            chkAutoBoot.Location = new Point(20, 144);
            chkAutoBoot.Size = new Size(580, 26);
            chkAutoBoot.CheckedChanged += (s, e) => {
                ProcessHelper.SetAutoStart(chkAutoBoot.Checked);
                config.autoStartOnBoot = chkAutoBoot.Checked;
                config.Save();
            };
            pnlSettings.Controls.Add(chkAutoBoot);

            chkAutoLaunchApp = new CheckBox();
            chkAutoLaunchApp.Text = "Direct App Mode on double-click (Skip this control panel on startup)";
            chkAutoLaunchApp.Checked = config.autoLaunchApp;
            chkAutoLaunchApp.Location = new Point(20, 176);
            chkAutoLaunchApp.Size = new Size(580, 26);
            pnlSettings.Controls.Add(chkAutoLaunchApp);

            this.Controls.Add(pnlSettings);

            // Bottom Action Buttons
            Button btnSave = CreateStyledButton("💾 Save Configuration", 20, 564, 180, 42, Color.FromArgb(20, 83, 45), Color.White);
            btnSave.Click += (s, e) => { SaveSettings(); MessageBox.Show("Settings saved successfully!", "Sultan POS", MessageBoxButtons.OK, MessageBoxIcon.Information); };
            this.Controls.Add(btnSave);

            Button btnShortcut = CreateStyledButton("📌 Desktop Shortcut", 212, 564, 180, 42, Color.FromArgb(60, 40, 50), Color.FromArgb(234, 179, 8));
            btnShortcut.Click += (s, e) => { ProcessHelper.CreateDesktopShortcut(); };
            this.Controls.Add(btnShortcut);

            Button btnLaunchDefault = CreateStyledButton("🚀 Launch Default (" + config.defaultStation.ToUpper() + ")", 404, 564, 240, 42, Color.FromArgb(180, 83, 9), Color.White);
            btnLaunchDefault.Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold);
            btnLaunchDefault.Click += (s, e) => { LaunchStation(config.defaultStation); };
            this.Controls.Add(btnLaunchDefault);

            this.FormClosing += (s, e) => {
                if (e.CloseReason == CloseReason.UserClosing)
                {
                    e.Cancel = true;
                    this.Hide();
                    if (trayIcon != null)
                    {
                        trayIcon.ShowBalloonTip(2000, "Sultan Restaurant", "App is running quietly in your Windows system tray.", ToolTipIcon.Info);
                    }
                }
            };
        }

        private Button CreateStyledButton(string text, int x, int y, int w, int h, Color bg, Color fg)
        {
            Button btn = new Button();
            btn.Text = text;
            btn.Location = new Point(x, y);
            btn.Size = new Size(w, h);
            btn.BackColor = bg;
            btn.ForeColor = fg;
            btn.FlatStyle = FlatStyle.Flat;
            btn.FlatAppearance.BorderColor = Color.FromArgb(120, 80, 50);
            btn.Cursor = Cursors.Hand;
            return btn;
        }

        private Button CreateStationButton(string title, string route, int x, int y, int w, int h, Color accentColor)
        {
            Button btn = new Button();
            btn.Text = title;
            btn.Location = new Point(x, y);
            btn.Size = new Size(w, h);
            btn.BackColor = Color.FromArgb(36, 22, 28);
            btn.ForeColor = Color.White;
            btn.FlatStyle = FlatStyle.Flat;
            btn.FlatAppearance.BorderColor = accentColor;
            btn.FlatAppearance.BorderSize = 2;
            btn.Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold);
            btn.Cursor = Cursors.Hand;
            btn.Click += (s, e) => {
                string r = route;
                if (title.Contains("POS")) r = "/pos";
                else if (title.Contains("KDS")) r = "/kitchen/kds";
                else if (title.Contains("Admin")) r = "/admin/dashboard";
                else if (title.Contains("Tables")) r = "/tables";
                else if (title.Contains("Playland")) r = "/playland";
                else if (title.Contains("Juice")) r = "/pos";
                LaunchStationByRoute(r);
            };
            return btn;
        }

        private void SetupTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.BackColor = Color.FromArgb(24, 16, 20);
            trayMenu.ForeColor = Color.White;
            trayMenu.Font = new Font("Segoe UI", 9F);

            trayMenu.Items.Add("🛒 Open POS Billing", null, (s, e) => LaunchStationByRoute("/pos"));
            trayMenu.Items.Add("🍳 Open Kitchen KDS", null, (s, e) => LaunchStationByRoute("/kitchen/kds"));
            trayMenu.Items.Add("👑 Open Admin Dashboard", null, (s, e) => LaunchStationByRoute("/admin/dashboard"));
            trayMenu.Items.Add("🍽️ Open Floor Tables", null, (s, e) => LaunchStationByRoute("/tables"));
            trayMenu.Items.Add("🎡 Open Playland", null, (s, e) => LaunchStationByRoute("/playland"));
            trayMenu.Items.Add(new ToolStripSeparator());
            trayMenu.Items.Add("👑 Master Server: 192.168.1.10:5050", null, (s, e) => {
                try {
                    Clipboard.SetText("http://192.168.1.10:5050");
                    MessageBox.Show("Master Server address copied:\nhttp://192.168.1.10:5050", "Sultan Master Server", MessageBoxButtons.OK, MessageBoxIcon.Information);
                } catch {}
            });
            trayMenu.Items.Add("⚙️ Sultan Control Center", null, (s, e) => ShowControlCenter());
            trayMenu.Items.Add("🔄 Restart Central Hub", null, (s, e) => RestartHubAction());
            trayMenu.Items.Add(new ToolStripSeparator());
            trayMenu.Items.Add("❌ Exit Sultan Restaurant", null, (s, e) => ExitFullApplication());

            trayIcon = new NotifyIcon();
            trayIcon.Text = "Sultan Restaurant POS";
            trayIcon.Icon = this.Icon;
            trayIcon.ContextMenuStrip = trayMenu;
            trayIcon.Visible = true;
            trayIcon.DoubleClick += (s, e) => ShowControlCenter();
        }

        public void ShowControlCenter()
        {
            this.Show();
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
            this.Activate();
        }

        private void SaveSettings()
        {
            config.serverUrl = txtServerUrl.Text.Trim().TrimEnd('/');
            config.autoStartHub = chkAutoStartHub.Checked;
            config.kioskPrinting = chkKioskPrinting.Checked;
            config.autoLaunchApp = chkAutoLaunchApp.Checked;
            config.Save();
        }

        public void LaunchStation(string stationName)
        {
            string route = "/";
            string s = (stationName ?? "").ToLower();
            if (s == "pos" || s == "billing") route = "/pos";
            else if (s == "login" || s == "home" || s == "welcome") route = "/";
            else if (s == "kds" || s == "kitchen") route = "/kitchen/kds";
            else if (s == "admin" || s == "dashboard") route = "/admin/dashboard";
            else if (s == "tables" || s == "floor") route = "/tables";
            else if (s == "playland") route = "/playland";
            else if (s == "juice") route = "/pos";
            LaunchStationByRoute(route);
        }

        private static bool IsLocalOrOwnedIp(string url)
        {
            try
            {
                if (url.Contains("localhost") || url.Contains("127.0.0.1")) return true;
                Uri u = new Uri(url);
                string host = u.Host;
                IPAddress[] localIps = Dns.GetHostAddresses(Dns.GetHostName());
                foreach (IPAddress ip in localIps)
                {
                    if (ip.ToString() == host) return true;
                }
            }
            catch {}
            return false;
        }

        public void LaunchStationByRoute(string route)
        {
            SaveSettings();

            // Ensure server is up if this machine is the server
            string baseServer = config.serverUrl;
            if (string.IsNullOrEmpty(baseServer)) baseServer = "http://192.168.1.10:5050";

            if (IsLocalOrOwnedIp(baseServer))
            {
                if (config.autoStartHub && !ProcessHelper.IsPortListening("127.0.0.1", 5050, 400))
                {
                    string err;
                    ProcessHelper.StartHub(out err);
                }
            }

            string fullUrl = baseServer + (route.StartsWith("/") ? route : ("/" + route));
            string launchErr;
            bool ok = ProcessHelper.LaunchAppMode(fullUrl, config.kioskPrinting, true, out launchErr);
            if (!ok)
            {
                MessageBox.Show("Failed to launch app window:\n" + launchErr, "Sultan POS", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void TestConnectionAction()
        {
            string url = txtServerUrl.Text.Trim();
            try
            {
                Uri u = new Uri(url);
                bool ok = ProcessHelper.IsPortListening(u.Host, u.Port > 0 ? u.Port : 80, 1500);
                if (ok)
                {
                    MessageBox.Show("🟢 SUCCESS: Connected to Sultan Hub at " + url, "Network Test", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    MessageBox.Show("🔴 OFFLINE: Could not reach " + url + " on port " + u.Port + ".\nPlease ensure the Server Hub is running on that machine.", "Network Test", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Invalid URL: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void RestartHubAction()
        {
            ProcessHelper.StopHub();
            string err;
            bool ok = ProcessHelper.StartHub(out err);
            UpdateHubStatusUI();
            if (ok)
            {
                MessageBox.Show("🟢 Central Hub restarted successfully on Port 5050!", "Sultan Hub", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show("Hub restart message:\n" + err, "Sultan Hub", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void UpdateHubStatusUI()
        {
            bool online = ProcessHelper.IsPortListening("127.0.0.1", 5050, 300);
            if (online)
            {
                lblHubIndicator.ForeColor = Color.FromArgb(34, 197, 94);
                lblHubStatus.Text = "Central Hub Status: 🟢 ACTIVE (Port 5050 Ready)";
            }
            else
            {
                lblHubIndicator.ForeColor = Color.FromArgb(239, 68, 68);
                lblHubStatus.Text = "Central Hub Status: 🔴 NOT RUNNING LOCALLY (Use 'Restart Hub' or connect to LAN Server)";
            }
        }

        public void CleanupTray()
        {
            if (trayIcon != null)
            {
                try
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                }
                catch {}
                trayIcon = null;
            }
        }

        private void ExitFullApplication()
        {
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            ProcessHelper.StopHub();
            Application.ExitThread();
            Environment.Exit(0);
        }
    }

    public static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            SultanConfig config = SultanConfig.Load();

            bool forceSetup = false;
            foreach (string a in args)
            {
                if (a.ToLower() == "--setup" || a.ToLower() == "--config" || a.ToLower() == "-s")
                {
                    forceSetup = true;
                }
            }

            // Check if Shift key held during launch
            if ((Control.ModifierKeys & Keys.Shift) == Keys.Shift)
            {
                forceSetup = true;
            }

            if (!forceSetup && config.autoLaunchApp)
            {
                // Instant Direct App Mode Launch — open POS window and exit launcher cleanly
                // so closing the POS window and reopening it NEVER says "already running"!
                MainForm launcherForm = new MainForm(config, false);
                launcherForm.LaunchStation(config.defaultStation);
                launcherForm.CleanupTray();
                return;
            }

            // Control Center mode (--setup or Shift held)
            MainForm mainForm = new MainForm(config, true);
            mainForm.ShowControlCenter();
            Application.Run(mainForm);
        }
    }
}
