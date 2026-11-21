using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace SultanRestaurantSetup
{
    public class SetupForm : Form
    {
        private TextBox txtInstallDir;
        private Button btnBrowse;
        private CheckBox chkDesktopShortcuts;
        private CheckBox chkStartOnBoot;
        private CheckBox chkFirewall;
        private CheckBox chkLaunchPos;
        private CheckBox chkLaunchServer;
        private ProgressBar progressBar;
        private Label lblStatus;
        private Button btnInstall;
        private BackgroundWorker worker;
        private bool isFinished = false;
        private System.Windows.Forms.Timer autoCloseTimer;
        private int autoCloseCountdown = 3;

        public SetupForm()
        {
            this.Text = "Sultan Restaurant - POS & Server Setup";
            this.Size = new Size(580, 560);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(27, 3, 7); // Royal Burgundy
            this.ForeColor = Color.White;

            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { }

            BuildUI();
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);

            // Auto-start installation automatically after a brief delay so user sees the installer start on its own!
            System.Windows.Forms.Timer autoStart = new System.Windows.Forms.Timer();
            autoStart.Interval = 400;
            autoStart.Tick += (s, ev) =>
            {
                autoStart.Stop();
                autoStart.Dispose();
                if (!worker.IsBusy && !isFinished)
                {
                    StartInstallation();
                }
            };
            autoStart.Start();
        }

        private void BuildUI()
        {
            // --- Header Panel ---
            Panel pnlHeader = new Panel();
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Height = 110;
            pnlHeader.BackColor = Color.FromArgb(40, 5, 11);
            pnlHeader.Paint += (s, e) =>
            {
                using (Pen goldPen = new Pen(Color.FromArgb(212, 175, 55), 2))
                {
                    e.Graphics.DrawLine(goldPen, 0, pnlHeader.Height - 1, pnlHeader.Width, pnlHeader.Height - 1);
                }
            };

            Label lblUrdu = new Label();
            lblUrdu.Text = "سلطان ریسٹورنٹ";
            lblUrdu.Font = new Font("Arial", 16F, FontStyle.Bold);
            lblUrdu.ForeColor = Color.FromArgb(212, 175, 55);
            lblUrdu.Location = new Point(20, 14);
            lblUrdu.AutoSize = true;
            pnlHeader.Controls.Add(lblUrdu);

            Label lblTitle = new Label();
            lblTitle.Text = "SULTAN RESTAURANT POS & SERVER HUB";
            lblTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(20, 48);
            lblTitle.AutoSize = true;
            pnlHeader.Controls.Add(lblTitle);

            Label lblSubtitle = new Label();
            lblSubtitle.Text = "Automatic Full System Installer  •  Desktop Shortcuts & 24/7 Server Hub";
            lblSubtitle.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(200, 190, 170);
            lblSubtitle.Location = new Point(21, 75);
            lblSubtitle.AutoSize = true;
            pnlHeader.Controls.Add(lblSubtitle);

            this.Controls.Add(pnlHeader);

            // --- Body Controls ---
            int curY = 125;

            // Install Location Label
            Label lblDir = new Label();
            lblDir.Text = "Installation Folder (Permanent Location):";
            lblDir.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblDir.ForeColor = Color.FromArgb(212, 175, 55);
            lblDir.Location = new Point(25, curY);
            lblDir.AutoSize = true;
            this.Controls.Add(lblDir);
            curY += 24;

            string defaultPath = @"C:\SultanRestaurant";

            txtInstallDir = new TextBox();
            txtInstallDir.Text = defaultPath;
            txtInstallDir.Font = new Font("Segoe UI", 10F);
            txtInstallDir.Location = new Point(25, curY);
            txtInstallDir.Size = new Size(420, 26);
            this.Controls.Add(txtInstallDir);

            btnBrowse = new Button();
            btnBrowse.Text = "Browse...";
            btnBrowse.Font = new Font("Segoe UI", 9F);
            btnBrowse.Location = new Point(455, curY - 1);
            btnBrowse.Size = new Size(90, 28);
            btnBrowse.FlatStyle = FlatStyle.Flat;
            btnBrowse.BackColor = Color.FromArgb(60, 15, 20);
            btnBrowse.ForeColor = Color.White;
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.Description = "Select Installation Folder for Sultan Restaurant";
                    fbd.SelectedPath = txtInstallDir.Text;
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtInstallDir.Text = fbd.SelectedPath;
                    }
                }
            };
            this.Controls.Add(btnBrowse);
            curY += 42;

            // --- Options Section ---
            Label lblOptions = new Label();
            lblOptions.Text = "Automatic Setup Options:";
            lblOptions.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            lblOptions.ForeColor = Color.FromArgb(212, 175, 55);
            lblOptions.Location = new Point(25, curY);
            lblOptions.AutoSize = true;
            this.Controls.Add(lblOptions);
            curY += 24;

            chkDesktopShortcuts = CreateOptionCheck("Create Desktop Shortcuts (POS Billing & Master Server)", true, 25, curY);
            this.Controls.Add(chkDesktopShortcuts);
            curY += 26;

            chkStartOnBoot = CreateOptionCheck("Start 24/7 Master Server Hub automatically on Windows Boot", true, 25, curY);
            this.Controls.Add(chkStartOnBoot);
            curY += 26;

            chkFirewall = CreateOptionCheck("Configure Windows Firewall for LAN Access (Ports 5050, 5000, 8081, 80)", true, 25, curY);
            this.Controls.Add(chkFirewall);
            curY += 26;

            chkLaunchServer = CreateOptionCheck("Launch Master Server Hub now (Runs in System Tray)", true, 25, curY);
            this.Controls.Add(chkLaunchServer);
            curY += 26;

            chkLaunchPos = CreateOptionCheck("Launch Sultan Restaurant POS after installation", true, 25, curY);
            this.Controls.Add(chkLaunchPos);
            curY += 36;

            // --- Progress Section ---
            lblStatus = new Label();
            lblStatus.Text = "Starting automatic installation...";
            lblStatus.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(220, 220, 220);
            lblStatus.Location = new Point(25, curY);
            lblStatus.Size = new Size(520, 20);
            this.Controls.Add(lblStatus);
            curY += 24;

            progressBar = new ProgressBar();
            progressBar.Location = new Point(25, curY);
            progressBar.Size = new Size(520, 20);
            progressBar.Style = ProgressBarStyle.Continuous;
            this.Controls.Add(progressBar);
            curY += 36;

            // --- Install / Launch Button ---
            btnInstall = new Button();
            btnInstall.Text = "⏳ Installing Sultan Restaurant POS...";
            btnInstall.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            btnInstall.BackColor = Color.FromArgb(212, 175, 55);
            btnInstall.ForeColor = Color.FromArgb(30, 5, 8);
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Location = new Point(25, curY);
            btnInstall.Size = new Size(520, 44);
            btnInstall.Cursor = Cursors.Hand;
            btnInstall.Click += BtnInstall_Click;
            this.Controls.Add(btnInstall);

            // --- Background Worker ---
            worker = new BackgroundWorker();
            worker.WorkerReportsProgress = true;
            worker.DoWork += Worker_DoWork;
            worker.ProgressChanged += Worker_ProgressChanged;
            worker.RunWorkerCompleted += Worker_RunWorkerCompleted;
        }

        private CheckBox CreateOptionCheck(string text, bool isChecked, int x, int y)
        {
            CheckBox chk = new CheckBox();
            chk.Text = text;
            chk.Checked = isChecked;
            chk.Font = new Font("Segoe UI", 9F);
            chk.ForeColor = Color.FromArgb(235, 235, 235);
            chk.Location = new Point(x, y);
            chk.Size = new Size(520, 22);
            chk.AutoSize = true;
            return chk;
        }

        private void StartInstallation()
        {
            if (worker.IsBusy || isFinished) return;

            btnInstall.Enabled = false;
            btnBrowse.Enabled = false;
            txtInstallDir.Enabled = false;
            chkDesktopShortcuts.Enabled = false;
            chkStartOnBoot.Enabled = false;
            chkFirewall.Enabled = false;
            chkLaunchPos.Enabled = false;
            chkLaunchServer.Enabled = false;

            worker.RunWorkerAsync(txtInstallDir.Text.Trim());
        }

        private void BtnInstall_Click(object sender, EventArgs e)
        {
            if (isFinished)
            {
                FinishAndLaunch();
                return;
            }

            StartInstallation();
        }

        private void FinishAndLaunch()
        {
            if (autoCloseTimer != null)
            {
                autoCloseTimer.Stop();
                autoCloseTimer.Dispose();
            }

            string targetDir = txtInstallDir.Text.Trim();
            string serverExe = Path.Combine(targetDir, "SultanServer.exe");
            string posExe = Path.Combine(targetDir, "SultanRestaurant.exe");

            if (chkLaunchServer.Checked && File.Exists(serverExe))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo(serverExe, "--minimized");
                    psi.WorkingDirectory = targetDir;
                    Process.Start(psi);
                }
                catch { }
            }

            if (chkLaunchPos.Checked && File.Exists(posExe))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo(posExe);
                    psi.WorkingDirectory = targetDir;
                    Process.Start(psi);
                }
                catch { }
            }

            this.Close();
        }

        private void Worker_DoWork(object sender, DoWorkEventArgs e)
        {
            string installDir = (string)e.Argument;
            bool isClientOnly = false;
#if CLIENT_ONLY
            isClientOnly = true;
#endif

            // Step 1: Kill running instances and background nodes so file locks are released
            worker.ReportProgress(5, "Closing any running instances to prepare clean install...");
            KillProcessesByName("SultanRestaurant");
            if (!isClientOnly)
            {
                KillProcessesByName("SultanServer");
                KillProcessesByName("node");
            }
            Thread.Sleep(500);

            // Step 2: Create directory
            worker.ReportProgress(12, "Creating directory: " + installDir);
            try
            {
                Directory.CreateDirectory(installDir);
                string testFile = Path.Combine(installDir, "_write_test.tmp");
                File.WriteAllText(testFile, "ok");
                File.Delete(testFile);
            }
            catch
            {
                // Fallback to LocalAppData if root C: is restricted
                string fallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SultanRestaurant");
                Directory.CreateDirectory(fallback);
                installDir = fallback;
            }

            // Step 3: Extract Embedded Resource Zip
            worker.ReportProgress(20, "Extracting Sultan application files...");
            using (Stream resStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("SultanPayload.zip"))
            {
                if (resStream == null)
                {
                    throw new Exception("Installation payload 'SultanPayload.zip' not found in executable!");
                }

                string tempZip = Path.Combine(Path.GetTempPath(), "sultan_installer_tmp_" + Guid.NewGuid().ToString("N") + ".zip");
                try
                {
                    using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write))
                    {
                        resStream.CopyTo(fs);
                    }

                    using (ZipArchive archive = ZipFile.OpenRead(tempZip))
                    {
                        int total = archive.Entries.Count;
                        int count = 0;
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            count++;
                            string destPath = Path.Combine(installDir, entry.FullName);
                            if (string.IsNullOrEmpty(entry.Name))
                            {
                                Directory.CreateDirectory(destPath);
                                continue;
                            }

                            string destDir = Path.GetDirectoryName(destPath);
                            if (!Directory.Exists(destDir)) Directory.CreateDirectory(destDir);

                            // Extract with retry in case of momentary lock
                            bool extracted = false;
                            for (int retry = 0; retry < 3 && !extracted; retry++)
                            {
                                try
                                {
                                    entry.ExtractToFile(destPath, true);
                                    extracted = true;
                                }
                                catch (IOException)
                                {
                                    Thread.Sleep(200);
                                }
                                catch
                                {
                                    break;
                                }
                            }

                            int pct = 20 + (int)((count / (float)total) * 50); // 20% to 70%
                            worker.ReportProgress(pct, "Extracting: " + entry.Name);
                        }
                    }
                }
                finally
                {
                    try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch { }
                }
            }

            // Ensure client config points to Master Server 192.168.1.10:5050 if Client Only
            if (isClientOnly)
            {
                string cfgPath = Path.Combine(installDir, "sultan-pos-config.json");
                string clientCfg = "{\r\n  \"serverUrl\": \"http://192.168.1.10:5050\",\r\n  \"defaultStation\": \"login\",\r\n  \"autoStartHub\": false,\r\n  \"kioskPrinting\": true,\r\n  \"autoLaunchApp\": true,\r\n  \"autoStartOnBoot\": false\r\n}";
                try { File.WriteAllText(cfgPath, clientCfg); } catch { }
            }

            // Step 4: Desktop Shortcuts
            if (chkDesktopShortcuts.Checked)
            {
                worker.ReportProgress(75, "Creating Desktop Shortcut with Sultan Logo...");
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string serverExe = Path.Combine(installDir, "SultanServer.exe");
                string posExe = Path.Combine(installDir, "SultanRestaurant.exe");
                string iconPath = Path.Combine(installDir, "assets", "sultan.ico");
                if (!File.Exists(iconPath)) iconPath = posExe;

                CreateShortcut(
                    Path.Combine(desktop, "Sultan Restaurant POS.lnk"),
                    posExe,
                    installDir,
                    iconPath + ",0",
                    "Sultan Restaurant POS - Billing & Station Launcher"
                );

                if (!isClientOnly && File.Exists(serverExe))
                {
                    CreateShortcut(
                        Path.Combine(desktop, "Sultan Central Server (24-7 Hub).lnk"),
                        serverExe,
                        installDir,
                        iconPath + ",0",
                        "Sultan Restaurant - 24/7 Master Server Hub"
                    );
                }

                // Start Menu Program folder
                try
                {
                    string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Sultan Restaurant");
                    Directory.CreateDirectory(startMenu);
                    CreateShortcut(Path.Combine(startMenu, "Sultan Restaurant POS.lnk"), posExe, installDir, iconPath + ",0", "Sultan Restaurant POS");
                    if (!isClientOnly && File.Exists(serverExe))
                    {
                        CreateShortcut(Path.Combine(startMenu, "Sultan Central Server Hub.lnk"), serverExe, installDir, iconPath + ",0", "Sultan Central Server Hub");
                    }
                }
                catch { }
            }

            // Step 5: Windows Startup Registration (Server Only)
            if (!isClientOnly && chkStartOnBoot.Checked)
            {
                worker.ReportProgress(85, "Registering 24/7 Server Hub for Windows startup...");
                try
                {
                    string serverExe = Path.Combine(installDir, "SultanServer.exe");
                    if (File.Exists(serverExe))
                    {
                        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                        {
                            if (key != null)
                            {
                                key.SetValue("SultanCentralServerHub", "\"" + serverExe + "\" --minimized");
                            }
                        }
                    }
                }
                catch { }
            }

            // Step 6: Windows Firewall
            if (chkFirewall.Checked)
            {
                worker.ReportProgress(92, "Configuring Windows Firewall for LAN ports...");
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = "netsh.exe";
                    psi.Arguments = "advfirewall firewall add rule name=\"Sultan POS Server Hub\" dir=in action=allow protocol=TCP localport=5050,5000,8081,80";
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    Process p = Process.Start(psi);
                    p.WaitForExit(3000);
                }
                catch { }
            }

            // Step 7: Write installation complete marker so running this exe again won't reinstall
            try
            {
                File.WriteAllText(Path.Combine(installDir, ".sultan_installed_v4"), DateTime.Now.ToString("o"));
            }
            catch { }

            e.Result = installDir;
            worker.ReportProgress(100, "Installation completed successfully!");
        }

        private void Worker_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            progressBar.Value = Math.Min(100, Math.Max(0, e.ProgressPercentage));
            lblStatus.Text = (string)e.UserState;
        }

        private void Worker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            if (e.Error != null)
            {
                lblStatus.Text = "Error during setup: " + e.Error.Message;
                lblStatus.ForeColor = Color.FromArgb(231, 76, 60);
                btnInstall.Text = "❌ Installation Failed - Click to Retry";
                btnInstall.BackColor = Color.FromArgb(192, 57, 43);
                btnInstall.ForeColor = Color.White;
                btnInstall.Enabled = true;
                MessageBox.Show("An error occurred during installation:\n" + e.Error.Message, "Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            isFinished = true;
            lblStatus.Text = "✅ Sultan Restaurant installed! Desktop shortcuts ready.";
            lblStatus.ForeColor = Color.FromArgb(46, 204, 113);

            btnInstall.Text = string.Format("✨ Finish & Launch Sultan Restaurant ({0}s)", autoCloseCountdown);
            btnInstall.BackColor = Color.FromArgb(46, 204, 113);
            btnInstall.ForeColor = Color.FromArgb(10, 30, 15);
            btnInstall.Enabled = true;

            chkLaunchPos.Enabled = true;
            chkLaunchServer.Enabled = true;

            // Auto-launch timer (3 seconds)
            autoCloseTimer = new System.Windows.Forms.Timer();
            autoCloseTimer.Interval = 1000;
            autoCloseTimer.Tick += (s, ev) =>
            {
                autoCloseCountdown--;
                if (autoCloseCountdown <= 0)
                {
                    autoCloseTimer.Stop();
                    FinishAndLaunch();
                }
                else
                {
                    btnInstall.Text = string.Format("✨ Finish & Launch Sultan Restaurant ({0}s)", autoCloseCountdown);
                }
            };
            autoCloseTimer.Start();
        }

        private static void KillProcessesByName(string name)
        {
            try
            {
                foreach (Process p in Process.GetProcessesByName(name))
                {
                    try { p.Kill(); } catch { }
                }
            }
            catch { }
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconPath, string description)
        {
            // Primary: COM Reflection
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    object shell = Activator.CreateInstance(shellType);
                    object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                    Type shortcutType = shortcut.GetType();
                    shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                    shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
                    if (!string.IsNullOrEmpty(iconPath))
                    {
                        shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { iconPath });
                    }
                    shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
                    shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
                    return;
                }
            }
            catch { }

            // Secondary: PowerShell fallback
            try
            {
                string ps = string.Format(
                    "$s=(New-Object -COM WScript.Shell).CreateShortcut('{0}');$s.TargetPath='{1}';$s.WorkingDirectory='{2}';$s.IconLocation='{3}';$s.Description='{4}';$s.Save()",
                    shortcutPath.Replace("'", "''"),
                    targetPath.Replace("'", "''"),
                    workingDir.Replace("'", "''"),
                    iconPath.Replace("'", "''"),
                    description.Replace("'", "''")
                );
                ProcessStartInfo psi = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"" + ps + "\"");
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi).WaitForExit(3000);
            }
            catch { }
        }

        private static string FindExistingInstallDir()
        {
            string[] candidates = new string[]
            {
                @"C:\SultanRestaurant",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SultanRestaurant")
            };

            foreach (string dir in candidates)
            {
                string posExe = Path.Combine(dir, "SultanRestaurant.exe");
                string marker = Path.Combine(dir, ".sultan_installed_v4");
                if (File.Exists(posExe) && File.Exists(marker))
                {
                    return dir;
                }
            }
            return null;
        }

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool forceReinstall = false;
            if (args != null)
            {
                foreach (string a in args)
                {
                    if (a.ToLower() == "--reinstall" || a.ToLower() == "--force" || a.ToLower() == "-r")
                    {
                        forceReinstall = true;
                    }
                }
            }

            if (!forceReinstall)
            {
                string existingDir = FindExistingInstallDir();
                if (!string.IsNullOrEmpty(existingDir))
                {
                    // Already installed on this PC! Do NOT install again — ensure shortcut exists and launch POS directly!
                    string posExe = Path.Combine(existingDir, "SultanRestaurant.exe");
                    string iconPath = Path.Combine(existingDir, "assets", "sultan.ico");
                    if (!File.Exists(iconPath)) iconPath = posExe;
                    string desktopLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "Sultan Restaurant POS.lnk");
                    if (!File.Exists(desktopLnk))
                    {
                        CreateShortcut(desktopLnk, posExe, existingDir, iconPath + ",0", "Sultan Restaurant POS - Billing & Station Launcher");
                    }

                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo(posExe);
                        psi.WorkingDirectory = existingDir;
                        Process.Start(psi);
                    }
                    catch { }
                    return;
                }
            }

            Application.Run(new SetupForm());
        }
    }
}
