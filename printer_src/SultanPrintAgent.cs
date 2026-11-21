using System;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

public class SultanPrintAgent
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

    public static bool SendRawBytesToPrinter(string printerName, byte[] rawBytes, out string errorMsg)
    {
        errorMsg = "";
        if (string.IsNullOrWhiteSpace(printerName))
        {
            errorMsg = "No printer name specified";
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

    // --- Local Printer Discovery ---
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
        // 1. Explicit job override (unless AUTO)
        if (!string.IsNullOrWhiteSpace(requestedName)
            && !requestedName.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
        {
            foreach (string p in installed)
            {
                if (p.Equals(requestedName, StringComparison.OrdinalIgnoreCase))
                    return p;
            }
        }

        // 2. Explicit local config (unless AUTO)
        if (!string.IsNullOrWhiteSpace(configuredName)
            && !configuredName.Equals("AUTO", StringComparison.OrdinalIgnoreCase))
        {
            foreach (string p in installed)
            {
                if (p.Equals(configuredName, StringComparison.OrdinalIgnoreCase))
                    return p;
            }
        }

        // 3. Auto-detect thermal printer
        foreach (string p in installed)
        {
            if (!IsVirtualPrinter(p) && LooksLikeThermalPrinter(p))
                return p;
        }

        // 4. Windows default printer if physical
        try
        {
            PrinterSettings ps = new PrinterSettings();
            if (!string.IsNullOrWhiteSpace(ps.PrinterName) && !IsVirtualPrinter(ps.PrinterName))
                return ps.PrinterName;
        }
        catch { }

        // 5. Any non-virtual printer
        foreach (string p in installed)
        {
            if (!IsVirtualPrinter(p))
                return p;
        }

        return installed.Count > 0 ? installed[0] : "";
    }

    // --- Minimal JSON Helpers (Zero external assembly deps) ---
    private static string ExtractJsonString(string json, string key)
    {
        if (string.IsNullOrEmpty(json)) return null;
        string pattern = "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"";
        Match m = Regex.Match(json, pattern);
        if (!m.Success) return null;
        string raw = m.Groups[1].Value;
        return Regex.Unescape(raw);
    }

    private static string EscapeJson(string s)
    {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
    }

    // --- HTTP Helpers ---
    private static string HttpGet(string url, int timeoutMs)
    {
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
        req.Method = "GET";
        req.Timeout = timeoutMs;
        req.ReadWriteTimeout = timeoutMs;
        req.KeepAlive = true;
        req.UserAgent = "SultanPrintAgent/1.0";

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
        req.UserAgent = "SultanPrintAgent/1.0";

        byte[] data = Encoding.UTF8.GetBytes(jsonBody);
        req.ContentLength = data.Length;
        using (Stream s = req.GetRequestStream())
        {
            s.Write(data, 0, data.Length);
        }
        using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
        {
            // Ack received
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

    private static byte[] BuildLocalTestSlip(string station, string pcName, string printerName)
    {
        List<byte> buf = new List<byte>();
        Action<string> add = s => buf.AddRange(Encoding.ASCII.GetBytes(s));
        add("\x1b@"); // Init
        add("\x1ba\x01"); // Center
        add("\x1b!\x30");
        add("SULTAN RESTAURANT\n");
        add("\x1b!\x10");
        add((station == "juice" ? "JUICE BAR PRINTER" : "KITCHEN PRINTER") + " OK\n");
        add("\x1b!\x00");
        add("------------------------------------------\n");
        add("\x1ba\x00"); // Left
        add("Station: " + station.ToUpperInvariant() + "\n");
        add("PC Name: " + pcName + "\n");
        add("Printer: " + printerName + "\n");
        add("Time:    " + DateTime.Now.ToString("dd MMM yyyy hh:mm:ss tt") + "\n");
        add("------------------------------------------\n");
        add("\x1ba\x01");
        add("Direct Thermal Print Agent Ready!\n");
        add("\n\n\n\n");
        add("\x1dV\x00"); // Full cut
        return buf.ToArray();
    }

    public static int Main(string[] args)
    {
        string serverUrl = "http://192.168.1.10:5050";
        string station = "juice";
        string configuredPrinter = "AUTO";
        bool runTestOnly = false;

        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        LoadConfigFile(Path.Combine(exeDir, "agent-config.txt"), ref serverUrl, ref station, ref configuredPrinter);

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
        }

        string pcName = Environment.MachineName;
        List<string> installed = GetInstalledPrinters();
        string activePrinter = ResolveTargetPrinter(null, configuredPrinter, installed);

        try
        {
            Console.Title = "Sultan Print Agent [" + station.ToUpperInvariant() + "] - " + (string.IsNullOrEmpty(activePrinter) ? "No Printer" : activePrinter);
        }
        catch { }

        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("=================================================================");
        Console.WriteLine("   SULTAN RESTAURANT - DEDICATED STATION THERMAL PRINT AGENT");
        Console.WriteLine("=================================================================");
        Console.ResetColor();
        Console.WriteLine(" Station       : " + station.ToUpperInvariant() + (station == "juice" ? " (Juice Bar Only)" : " (Main Kitchen Only)"));
        Console.WriteLine(" Central Hub   : " + serverUrl);
        Console.WriteLine(" This PC       : " + pcName);
        Console.WriteLine(" Active Printer: " + (string.IsNullOrEmpty(activePrinter) ? "[NONE FOUND - Check USB Cable!]" : activePrinter));
        Console.WriteLine(" All Printers  : " + (installed.Count > 0 ? string.Join(", ", installed.ToArray()) : "(none)"));
        Console.WriteLine("-----------------------------------------------------------------");

        if (runTestOnly)
        {
            if (string.IsNullOrEmpty(activePrinter))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERROR] No physical thermal printer found on this PC.");
                Console.ResetColor();
                return 2;
            }
            string testErr;
            byte[] testBytes = BuildLocalTestSlip(station, pcName, activePrinter);
            bool ok = SendRawBytesToPrinter(activePrinter, testBytes, out testErr);
            if (ok)
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("[OK] Test slip printed successfully to " + activePrinter);
                Console.ResetColor();
                return 0;
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[FAIL] " + testErr);
                Console.ResetColor();
                return 3;
            }
        }

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("Listening for incoming " + station.ToUpperInvariant() + " KOT slips (Zero Popups)...");
        Console.WriteLine("Keep this window minimized in the taskbar.");
        Console.ResetColor();
        Console.WriteLine("");

        bool wasConnected = false;

        while (true)
        {
            try
            {
                installed = GetInstalledPrinters();
                activePrinter = ResolveTargetPrinter(null, configuredPrinter, installed);

                string printersCsv = string.Join("||", installed.ToArray());
                string pollUrl = serverUrl
                    + "/api/print-agent/poll?station=" + Uri.EscapeDataString(station)
                    + "&pc=" + Uri.EscapeDataString(pcName)
                    + "&printer=" + Uri.EscapeDataString(activePrinter ?? "")
                    + "&printers=" + Uri.EscapeDataString(printersCsv);

                string resp = HttpGet(pollUrl, 25000);

                if (!wasConnected)
                {
                    wasConnected = true;
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] Connected to Sultan Hub (" + serverUrl + ") -> Ready on [" + activePrinter + "]");
                    Console.ResetColor();
                }

                // Check if server sent a preferred printer override for this station
                string serverConfiguredPrinter = ExtractJsonString(resp, "configuredPrinter");
                if (!string.IsNullOrWhiteSpace(serverConfiguredPrinter))
                {
                    configuredPrinter = serverConfiguredPrinter;
                }

                string jobId = ExtractJsonString(resp, "jobId");
                string rawBase64 = ExtractJsonString(resp, "rawBase64");

                if (!string.IsNullOrWhiteSpace(jobId) && !string.IsNullOrWhiteSpace(rawBase64))
                {
                    string ticketId = ExtractJsonString(resp, "ticketId") ?? "KOT";
                    string tableName = ExtractJsonString(resp, "tableName") ?? "";
                    string jobPrinter = ExtractJsonString(resp, "printerName");
                    string targetPrinter = ResolveTargetPrinter(jobPrinter, configuredPrinter, installed);

                    Console.ForegroundColor = ConsoleColor.Cyan;
                    Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] Printing " + station.ToUpperInvariant() + " KOT #" + ticketId + " (" + tableName + ") -> " + targetPrinter + " ...");
                    Console.ResetColor();

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
                        Console.ForegroundColor = ConsoleColor.Green;
                        Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] PRINTED OK #" + ticketId + " on " + targetPrinter);
                        Console.ResetColor();
                    }
                    else
                    {
                        Console.ForegroundColor = ConsoleColor.Red;
                        Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] PRINT FAILED #" + ticketId + ": " + printError);
                        Console.ResetColor();
                    }

                    // Send ACK back to central server
                    try
                    {
                        string ackJson = "{"
                            + "\"jobId\":\"" + EscapeJson(jobId) + "\","
                            + "\"ticketId\":\"" + EscapeJson(ticketId) + "\","
                            + "\"station\":\"" + EscapeJson(station) + "\","
                            + "\"success\":" + (printed ? "true" : "false") + ","
                            + "\"printerName\":\"" + EscapeJson(targetPrinter) + "\","
                            + "\"pcName\":\"" + EscapeJson(pcName) + "\","
                            + "\"error\":\"" + EscapeJson(printError) + "\""
                            + "}";
                        HttpPostJson(serverUrl + "/api/print-agent/ack", ackJson, 8000);
                    }
                    catch (Exception ackEx)
                    {
                        Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] ACK warning: " + ackEx.Message);
                    }

                    // Short pause before checking next job in queue
                    Thread.Sleep(150);
                }
            }
            catch (Exception ex)
            {
                if (wasConnected)
                {
                    wasConnected = false;
                    Console.ForegroundColor = ConsoleColor.DarkYellow;
                    Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] Connection paused (" + ex.Message + ") - retrying in 3s...");
                    Console.ResetColor();
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.DarkYellow;
                    Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] Waiting for Sultan Hub at " + serverUrl + " (" + ex.Message + ")");
                    Console.ResetColor();
                }
                Thread.Sleep(3000);
            }
        }
    }
}
