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

namespace SultanRestaurantServer
{
    public class ServerForm : Form
    {
        private Process serverProcess = null;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private System.Windows.Forms.Timer healthTimer;
        private bool isExiting = false;
        private bool autoRestart = true;

        // UI Controls
        private Panel pnlHeader;
        private PictureBox picLogo;
        private Label lblHeaderTitle;
        private Label lblHeaderSubtitle;

        private Panel pnlStatusCard;
        private Label lblStatusDot;
        private Label lblStatusText;
        private Label lblServerIp;
        private Button btnCopyIp;

        private Panel pnlStats;
        private Label lblMenuCount;
        private Label lblTableCount;
        private Label lblDbSize;
        private Label lblBackupCount;

        private Button btnStartServer;
        private Button btnStopServer;
        private Button btnRestartServer;
        private Button btnOpenDashboard;
        private Button btnOpenPOS;
        private Button btnFirewall;

        private CheckBox chkAutoBoot;
        private TextBox txtLog;
        private Label lblLogTitle;

        public ServerForm()
        {
            InitializeComponent();
            SetupTray();

            healthTimer = new System.Windows.Forms.Timer();
            healthTimer.Interval = 2500;
            healthTimer.Tick += (s, e) => CheckServerHealth();
            healthTimer.Start();

            // Auto-start server if not already running
            this.Load += (s, e) => {
                CheckServerHealth();
                if (!IsPortListening("127.0.0.1", 5050, 400))
                {
                    StartNodeServer();
                }
                else
                {
                    LogMessage("Central Hub is already active on Port 5050.");
                    UpdateStatsFromApi();
                }
            };
        }

        private void InitializeComponent()
        {
            this.Text = "Sultan Restaurant - 24/7 Master Server Hub";
            this.Size = new Size(740, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(20, 14, 18);
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
            pnlHeader.Height = 88;
            pnlHeader.BackColor = Color.FromArgb(34, 18, 26);
            pnlHeader.Paint += (s, e) => {
                using (Pen pen = new Pen(Color.FromArgb(212, 175, 55), 1.5F))
                {
                    e.Graphics.DrawLine(pen, 0, pnlHeader.Height - 1, pnlHeader.Width, pnlHeader.Height - 1);
                }
            };

            picLogo = new PictureBox();
            picLogo.Location = new Point(16, 12);
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
            lblHeaderTitle.Text = "SULTAN RESTAURANT - MASTER SERVER HUB";
            lblHeaderTitle.Font = new Font("Segoe UI", 14F, FontStyle.Bold);
            lblHeaderTitle.ForeColor = Color.FromArgb(234, 179, 8);
            lblHeaderTitle.Location = new Point(88, 16);
            lblHeaderTitle.AutoSize = true;

            lblHeaderSubtitle = new Label();
            lblHeaderSubtitle.Text = "24/7 Central Database Engine  •  Real-Time POS & Station Synchronizer";
            lblHeaderSubtitle.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            lblHeaderSubtitle.ForeColor = Color.FromArgb(209, 213, 219);
            lblHeaderSubtitle.Location = new Point(90, 48);
            lblHeaderSubtitle.AutoSize = true;

            pnlHeader.Controls.Add(lblHeaderTitle);
            pnlHeader.Controls.Add(lblHeaderSubtitle);
            this.Controls.Add(pnlHeader);

            // Server Status Card
            pnlStatusCard = new Panel();
            pnlStatusCard.Location = new Point(18, 98);
            pnlStatusCard.Size = new Size(690, 80);
            pnlStatusCard.BackColor = Color.FromArgb(30, 20, 26);
            pnlStatusCard.Paint += (s, e) => {
                using (Pen pen = new Pen(Color.FromArgb(90, 50, 70), 1F))
                {
                    e.Graphics.DrawRectangle(pen, 0, 0, pnlStatusCard.Width - 1, pnlStatusCard.Height - 1);
                }
            };

            lblStatusDot = new Label();
            lblStatusDot.Text = "●";
            lblStatusDot.Font = new Font("Segoe UI", 18F, FontStyle.Bold);
            lblStatusDot.ForeColor = Color.FromArgb(34, 197, 94);
            lblStatusDot.Location = new Point(16, 12);
            lblStatusDot.AutoSize = true;

            lblStatusText = new Label();
            lblStatusText.Text = "CENTRAL HUB: ONLINE";
            lblStatusText.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblStatusText.ForeColor = Color.FromArgb(74, 222, 128);
            lblStatusText.Location = new Point(48, 14);
            lblStatusText.AutoSize = true;

            lblServerIp = new Label();
            lblServerIp.Text = "LAN IP: http://192.168.1.10:5050   (Connect all stations here)";
            lblServerIp.Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold);
            lblServerIp.ForeColor = Color.FromArgb(254, 240, 138);
            lblServerIp.Location = new Point(48, 44);
            lblServerIp.AutoSize = true;

            btnCopyIp = CreateStyledButton("📋 Copy IP", 570, 22, 105, 36, Color.FromArgb(40, 60, 50), Color.FromArgb(234, 179, 8));
            btnCopyIp.Click += (s, e) => {
                try {
                    Clipboard.SetText("http://192.168.1.10:5050");
                    MessageBox.Show("Server address copied to clipboard:\nhttp://192.168.1.10:5050\n\nPaste this in Juice Bar, KDS and Waiter devices.", "Sultan Server", MessageBoxButtons.OK, MessageBoxIcon.Information);
                } catch {}
            };

            pnlStatusCard.Controls.Add(lblStatusDot);
            pnlStatusCard.Controls.Add(lblStatusText);
            pnlStatusCard.Controls.Add(lblServerIp);
            pnlStatusCard.Controls.Add(btnCopyIp);
            this.Controls.Add(pnlStatusCard);

            // Stats Ribbon
            pnlStats = new Panel();
            pnlStats.Location = new Point(18, 186);
            pnlStats.Size = new Size(690, 48);
            pnlStats.BackColor = Color.FromArgb(24, 16, 22);
            pnlStats.Paint += (s, e) => {
                using (Pen pen = new Pen(Color.FromArgb(70, 45, 60), 1F))
                {
                    e.Graphics.DrawRectangle(pen, 0, 0, pnlStats.Width - 1, pnlStats.Height - 1);
                }
            };

            lblMenuCount = CreateStatLabel("Menu Items: 143", 20, 14);
            lblTableCount = CreateStatLabel("Tables: 56", 180, 14);
            lblDbSize = CreateStatLabel("Database: Ready", 310, 14);
            lblBackupCount = CreateStatLabel("Daily Backups: Active", 490, 14);

            pnlStats.Controls.Add(lblMenuCount);
            pnlStats.Controls.Add(lblTableCount);
            pnlStats.Controls.Add(lblDbSize);
            pnlStats.Controls.Add(lblBackupCount);
            this.Controls.Add(pnlStats);

            // Action Buttons Bar
            int actionY = 244;
            btnStartServer = CreateStyledButton("▶️ Start Server", 18, actionY, 130, 40, Color.FromArgb(22, 101, 52), Color.White);
            btnStartServer.Click += (s, e) => StartNodeServer();

            btnStopServer = CreateStyledButton("⏹️ Stop Server", 154, actionY, 130, 40, Color.FromArgb(127, 29, 29), Color.White);
            btnStopServer.Click += (s, e) => StopNodeServer();

            btnRestartServer = CreateStyledButton("🔄 Restart Server", 290, actionY, 135, 40, Color.FromArgb(45, 30, 55), Color.FromArgb(234, 179, 8));
            btnRestartServer.Click += (s, e) => RestartNodeServer();

            btnOpenDashboard = CreateStyledButton("👑 Admin Dashboard", 432, actionY, 148, 40, Color.FromArgb(133, 77, 14), Color.White);
            btnOpenDashboard.Click += (s, e) => Process.Start("http://localhost:5050/admin/dashboard");

            btnOpenPOS = CreateStyledButton("🛒 POS Billing", 586, actionY, 122, 40, Color.FromArgb(153, 27, 27), Color.White);
            btnOpenPOS.Click += (s, e) => Process.Start("http://localhost:5050/pos");

            this.Controls.Add(btnStartServer);
            this.Controls.Add(btnStopServer);
            this.Controls.Add(btnRestartServer);
            this.Controls.Add(btnOpenDashboard);
            this.Controls.Add(btnOpenPOS);

            // Options Bar
            int optY = 294;
            chkAutoBoot = new CheckBox();
            chkAutoBoot.Text = "Auto-Start Central Server on Windows Boot (24/7 Standalone Engine)";
            chkAutoBoot.Checked = IsAutoStartEnabled();
            chkAutoBoot.Location = new Point(22, optY);
            chkAutoBoot.Size = new Size(500, 24);
            chkAutoBoot.CheckedChanged += (s, e) => SetAutoStart(chkAutoBoot.Checked);
            this.Controls.Add(chkAutoBoot);

            btnFirewall = CreateStyledButton("🛡️ Open Firewall", 570, optY - 4, 138, 28, Color.FromArgb(50, 40, 60), Color.FromArgb(234, 179, 8));
            btnFirewall.Click += (s, e) => RunFirewallConfig();
            this.Controls.Add(btnFirewall);

            // Log Console
            lblLogTitle = new Label();
            lblLogTitle.Text = "SERVER LIVE CONSOLE & STATION ACTIVITY LOG:";
            lblLogTitle.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
            lblLogTitle.ForeColor = Color.FromArgb(212, 175, 55);
            lblLogTitle.Location = new Point(20, 328);
            lblLogTitle.AutoSize = true;
            this.Controls.Add(lblLogTitle);

            txtLog = new TextBox();
            txtLog.Multiline = true;
            txtLog.ReadOnly = true;
            txtLog.ScrollBars = ScrollBars.Vertical;
            txtLog.Location = new Point(18, 350);
            txtLog.Size = new Size(690, 274);
            txtLog.BackColor = Color.FromArgb(12, 8, 10);
            txtLog.ForeColor = Color.FromArgb(229, 231, 235);
            txtLog.Font = new Font("Consolas", 9F);
            this.Controls.Add(txtLog);

            this.FormClosing += (s, e) => {
                if (!isExiting && e.CloseReason == CloseReason.UserClosing)
                {
                    e.Cancel = true;
                    this.WindowState = FormWindowState.Minimized;
                    this.ShowInTaskbar = false;
                    if (trayIcon != null)
                    {
                        trayIcon.ShowBalloonTip(2000, "Sultan Server Hub", "Server continues running 24/7 in system tray.", ToolTipIcon.Info);
                    }
                }
            };
        }

        private Label CreateStatLabel(string text, int x, int y)
        {
            Label lbl = new Label();
            lbl.Text = text;
            lbl.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
            lbl.ForeColor = Color.FromArgb(229, 231, 235);
            lbl.Location = new Point(x, y);
            lbl.AutoSize = true;
            return lbl;
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

        private void SetupTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.BackColor = Color.FromArgb(24, 16, 20);
            trayMenu.ForeColor = Color.White;
            trayMenu.Font = new Font("Segoe UI", 9F);

            trayMenu.Items.Add("👑 Sultan Server: 192.168.1.10:5050", null, (s, e) => {
                try { Clipboard.SetText("http://192.168.1.10:5050"); } catch {}
            });
            trayMenu.Items.Add(new ToolStripSeparator());
            trayMenu.Items.Add("🖥️ Open Server Dashboard", null, (s, e) => ShowServerWindow());
            trayMenu.Items.Add("🛒 Open POS Billing", null, (s, e) => Process.Start("http://localhost:5050/pos"));
            trayMenu.Items.Add("🍳 Open Kitchen KDS", null, (s, e) => Process.Start("http://localhost:5050/kitchen/kds"));
            trayMenu.Items.Add("👑 Open Admin Dashboard", null, (s, e) => Process.Start("http://localhost:5050/admin/dashboard"));
            trayMenu.Items.Add(new ToolStripSeparator());
            trayMenu.Items.Add("🔄 Restart Server", null, (s, e) => RestartNodeServer());
            trayMenu.Items.Add("❌ Shutdown Server Completely", null, (s, e) => ExitFullApplication());

            trayIcon = new NotifyIcon();
            trayIcon.Text = "Sultan Server (24/7 Hub)";
            trayIcon.Icon = this.Icon;
            trayIcon.ContextMenuStrip = trayMenu;
            trayIcon.Visible = true;
            trayIcon.DoubleClick += (s, e) => ShowServerWindow();
        }

        public void ShowServerWindow()
        {
            this.Opacity = 1;
            this.ShowInTaskbar = true;
            this.Show();
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
            this.Activate();
        }

        public void LogMessage(string msg)
        {
            try
            {
                if (!this.IsHandleCreated || this.IsDisposed || txtLog == null || txtLog.IsDisposed) return;
                if (txtLog.InvokeRequired)
                {
                    txtLog.BeginInvoke(new Action<string>(LogMessage), msg);
                    return;
                }

                string line = "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg + Environment.NewLine;
                txtLog.AppendText(line);
                if (txtLog.TextLength > 50000)
                {
                    txtLog.Text = txtLog.Text.Substring(10000);
                }
            }
            catch {}
        }

        private void CheckServerHealth()
        {
            bool online = IsPortListening("127.0.0.1", 5050, 1500);
            if (online)
            {
                lblStatusDot.ForeColor = Color.FromArgb(34, 197, 94);
                lblStatusText.Text = "CENTRAL HUB: ONLINE (Port 5050)";
                lblStatusText.ForeColor = Color.FromArgb(74, 222, 128);
                btnStartServer.Enabled = false;
                btnStopServer.Enabled = true;
            }
            else
            {
                lblStatusDot.ForeColor = Color.FromArgb(239, 68, 68);
                lblStatusText.Text = "CENTRAL HUB: OFFLINE";
                lblStatusText.ForeColor = Color.FromArgb(239, 68, 68);
                btnStartServer.Enabled = true;
                btnStopServer.Enabled = false;

                if (autoRestart && !isExiting)
                {
                    LogMessage("Server not answering on Port 5050. Auto-restarting...");
                    StartNodeServer();
                }
            }
        }

        private void UpdateStatsFromApi()
        {
            ThreadPool.QueueUserWorkItem((state) => {
                try
                {
                    string json = new WebClient().DownloadString("http://127.0.0.1:5050/api/sync");
                    int menuCount = Regex.Matches(json, "\"price\"\\s*:").Count;
                    int tableCount = Regex.Matches(json, "\"tableNumber\"\\s*:").Count;

                    if (this.IsHandleCreated && !this.IsDisposed)
                    {
                        this.BeginInvoke(new Action(() => {
                            try {
                                if (menuCount > 0) lblMenuCount.Text = "Menu Items: " + menuCount;
                                if (tableCount > 0) lblTableCount.Text = "Tables: " + tableCount;

                                string dbPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server-data.json");
                                if (!File.Exists(dbPath))
                                {
                                    dbPath = Path.Combine(Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory).FullName, "server-data.json");
                                }
                                if (File.Exists(dbPath))
                                {
                                    long sz = new FileInfo(dbPath).Length;
                                    lblDbSize.Text = "DB Size: " + (sz / 1024) + " KB";
                                }
                            } catch {}
                        }));
                    }
                }
                catch {}
            });
        }

        public void StartNodeServer()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                return;
            }
            if (IsPortListening("127.0.0.1", 5050, 1500))
            {
                LogMessage("Server is already running on Port 5050.");
                return;
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverJsPath = Path.Combine(baseDir, "server.js");
            if (!File.Exists(serverJsPath))
            {
                string parentJs = Path.Combine(Directory.GetParent(baseDir).FullName, "server.js");
                if (File.Exists(parentJs))
                {
                    baseDir = Directory.GetParent(baseDir).FullName;
                    serverJsPath = parentJs;
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
                        LogMessage("ERROR: server.js not found in " + baseDir);
                        return;
                    }
                }
            }

            string nodeExe = FindNodeExe();
            LogMessage("Starting Central Hub via " + nodeExe + " from " + baseDir + "...");

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                psi.Arguments = "\"" + serverJsPath + "\"";
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;

                serverProcess = new Process();
                serverProcess.StartInfo = psi;
                serverProcess.EnableRaisingEvents = true;

                serverProcess.OutputDataReceived += (s, args) => {
                    if (!string.IsNullOrEmpty(args.Data)) LogMessage(args.Data);
                };
                serverProcess.ErrorDataReceived += (s, args) => {
                    if (!string.IsNullOrEmpty(args.Data)) LogMessage("[ERROR] " + args.Data);
                };

                serverProcess.Exited += (s, args) => {
                    LogMessage("Server process exited.");
                    CheckServerHealth();
                };

                serverProcess.Start();
                serverProcess.BeginOutputReadLine();
                serverProcess.BeginErrorReadLine();

                LogMessage("Central Hub process spawned (PID: " + serverProcess.Id + ").");
            }
            catch (Exception ex)
            {
                LogMessage("Failed to start node server: " + ex.Message);
            }
        }

        public void StopNodeServer()
        {
            autoRestart = false;
            LogMessage("Stopping Central Hub...");

            if (serverProcess != null)
            {
                try
                {
                    if (!serverProcess.HasExited) serverProcess.Kill();
                }
                catch {}
                serverProcess = null;
            }

            // Also check and kill any background node.exe running server.js
            try
            {
                Process p = Process.Start("taskkill.exe", "/F /IM node.exe");
                p.WaitForExit(1000);
            }
            catch {}

            Thread.Sleep(800);
            CheckServerHealth();
            LogMessage("Server stopped.");
        }

        public void RestartNodeServer()
        {
            StopNodeServer();
            autoRestart = true;
            Thread.Sleep(1000);
            StartNodeServer();
        }

        private string FindNodeExe()
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

        private bool IsPortListening(string host, int port, int timeoutMs = 600)
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

        private bool IsAutoStartEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false))
                {
                    if (key != null)
                    {
                        object val = key.GetValue("SultanServerHub");
                        return val != null;
                    }
                }
            }
            catch {}
            return false;
        }

        private void SetAutoStart(bool enable)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                {
                    if (key != null)
                    {
                        if (enable)
                        {
                            key.SetValue("SultanServerHub", "\"" + Application.ExecutablePath + "\"");
                            LogMessage("Auto-start registered in Windows Startup.");
                        }
                        else
                        {
                            key.DeleteValue("SultanServerHub", false);
                            LogMessage("Auto-start removed from Windows Startup.");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("AutoStart error: " + ex.Message);
            }
        }

        private void RunFirewallConfig()
        {
            try
            {
                string batPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Configure-Server-Firewall.bat");
                if (!File.Exists(batPath))
                {
                    batPath = Path.Combine(Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory).FullName, "Configure-Server-Firewall.bat");
                }
                if (File.Exists(batPath))
                {
                    Process.Start(batPath);
                }
                else
                {
                    Process.Start("cmd.exe", "/c netsh advfirewall firewall add rule name=\"Sultan POS Server Hub\" dir=in action=allow protocol=TCP localport=5050,5000,8081,80");
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Firewall launch: " + ex.Message);
            }
        }

        private void ExitFullApplication()
        {
            isExiting = true;
            autoRestart = false;
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            StopNodeServer();
            Application.ExitThread();
            Environment.Exit(0);
        }
    }

    public static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            bool startMinimized = false;
            foreach (string a in args)
            {
                if (a.ToLower() == "--minimized" || a.ToLower() == "-m" || a.ToLower() == "--silent")
                {
                    startMinimized = true;
                }
            }

            bool createdNew;
            using (Mutex mutex = new Mutex(true, "SultanServer_MasterHub_SingleInstance", out createdNew))
            {
                if (!createdNew)
                {
                    if (startMinimized)
                    {
                        return;
                    }
                    // Kill older tray UI wrapper (leaving node.exe running) so the Server window opens cleanly on screen
                    try
                    {
                        int currentId = Process.GetCurrentProcess().Id;
                        foreach (Process p in Process.GetProcessesByName("SultanServer"))
                        {
                            if (p.Id != currentId)
                            {
                                try { p.Kill(); p.WaitForExit(1000); } catch {}
                            }
                        }
                    }
                    catch {}
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                AppDomain.CurrentDomain.UnhandledException += (s, e) => {
                    try { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server_crash.log"), e.ExceptionObject.ToString()); } catch {}
                };
                Application.ThreadException += (s, e) => {
                    try { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server_crash.log"), e.Exception.ToString()); } catch {}
                };

                ServerForm form = new ServerForm();
                if (startMinimized)
                {
                    form.WindowState = FormWindowState.Minimized;
                    form.ShowInTaskbar = false;
                    form.Opacity = 0;
                }

                Application.Run(form);
            }
        }
    }
}
