# ==============================================================================
# SULTAN RESTAURANT - DEDICATED STATION THERMAL PRINT AGENT (v3.0 Pure PS GUI)
# 100% Pure Microsoft-signed Windows PowerShell WinForms Desktop App:
# - Zero unsigned .exe files (Windows 11 Smart App Control safe)
# - Zero mandatory Add-Type C# compilation (automatic GDI PrintDocument fallback
#   if Windows Application Control blocks temp C# DLLs or if driver rejects RAW)
# - 3-source Port-Aware Windows Printer Auto-Pickup (Get-Printer + WMI + .NET)
# - Live auto-refresh of newly plugged USB printers every 15 seconds
# - Built-in -Test and -Diagnose modes + full agent-debug.log diagnostics
# ==============================================================================
param(
    [switch]$Test,
    [switch]$Diagnose,
    [switch]$Minimized,
    [switch]$ForceGdi,
    [string]$Server = "",
    [string]$Station = "",
    [string]$Printer = ""
)

$ErrorActionPreference = "Stop"

$script:BaseDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$script:DebugLogPath = Join-Path $script:BaseDir "agent-debug.log"

function Write-DebugLog {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $Message"
    try {
        if ((Test-Path $script:DebugLogPath) -and ((Get-Item $script:DebugLogPath).Length -gt 524288)) {
            $oldPath = Join-Path $script:BaseDir "agent-debug.old.log"
            Move-Item -Path $script:DebugLogPath -Destination $oldPath -Force -ErrorAction SilentlyContinue
        }
        Add-Content -Path $script:DebugLogPath -Value $line -Encoding ASCII -ErrorAction SilentlyContinue
    } catch {}
}

Write-DebugLog "=== Starting Sultan Print Agent v3.0 (PS $($PSVersionTable.PSVersion) | PC: $env:COMPUTERNAME | Args: Test=$Test Diagnose=$Diagnose Minimized=$Minimized ForceGdi=$ForceGdi) ==="

# Load Microsoft-signed .NET Framework assemblies ONLY (never blocked by Smart App Control)
try {
    Add-Type -AssemblyName System.Drawing
    Add-Type -AssemblyName System.Windows.Forms
    [System.Net.ServicePointManager]::Expect100Continue = $false
    [System.Net.ServicePointManager]::DefaultConnectionLimit = 10
} catch {
    Write-DebugLog "FATAL: Failed loading System.Windows.Forms/System.Drawing: $($_.Exception.Message)"
    throw
}

# Optional Raw ESC/POS WinSpool helper (compiled ONLY if OS policy allows; safe automatic GDI fallback if blocked!)
$script:RawSpoolAvailable = $false
$script:RawSpoolInitNote = "Disabled by -ForceGdi"

if (-not $ForceGdi) {
    if ("SultanRawSpoolerV3" -as [type]) {
        $script:RawSpoolAvailable = $true
        $script:RawSpoolInitNote = "RAW ESC/POS ready (cached)"
    } else {
        $rawCSharp = @'
using System;
using System.Runtime.InteropServices;

public static class SultanRawSpoolerV3
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static string SendRawBytes(string printerName, byte[] rawBytes)
    {
        if (string.IsNullOrWhiteSpace(printerName)) return "No printer selected";
        if (rawBytes == null || rawBytes.Length == 0) return "Empty print buffer";

        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Sultan Station KOT";
        di.pDataType = "RAW";

        try
        {
            if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero))
                return "OpenPrinter failed for '" + printerName + "' (Win32 error " + Marshal.GetLastWin32Error() + ")";

            if (!StartDocPrinter(hPrinter, 1, di))
            {
                ClosePrinter(hPrinter);
                return "StartDocPrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")";
            }

            if (!StartPagePrinter(hPrinter))
            {
                EndDocPrinter(hPrinter);
                ClosePrinter(hPrinter);
                return "StartPagePrinter failed (Win32 error " + Marshal.GetLastWin32Error() + ")";
            }

            IntPtr pUnmanaged = Marshal.AllocCoTaskMem(rawBytes.Length);
            bool ok = false;
            int winErr = 0;
            try
            {
                Marshal.Copy(rawBytes, 0, pUnmanaged, rawBytes.Length);
                int written = 0;
                ok = WritePrinter(hPrinter, pUnmanaged, rawBytes.Length, out written);
                if (!ok) winErr = Marshal.GetLastWin32Error();
            }
            finally
            {
                Marshal.FreeCoTaskMem(pUnmanaged);
                EndPagePrinter(hPrinter);
                EndDocPrinter(hPrinter);
                ClosePrinter(hPrinter);
            }
            return ok ? "" : ("WritePrinter failed (Win32 error " + winErr + ")");
        }
        catch (Exception ex)
        {
            if (hPrinter != IntPtr.Zero) { try { ClosePrinter(hPrinter); } catch { } }
            return ex.Message;
        }
    }
}
'@
        try {
            Add-Type -TypeDefinition $rawCSharp -ErrorAction Stop
            $script:RawSpoolAvailable = $true
            $script:RawSpoolInitNote = "RAW ESC/POS + GDI Fallback Ready"
            Write-DebugLog "Optional SultanRawSpoolerV3 loaded OK (RAW ESC/POS + GDI fallback available)."
        } catch {
            $script:RawSpoolAvailable = $false
            $script:RawSpoolInitNote = "GDI Driver Safe Mode (OS blocked temp C# DLL)"
            Write-DebugLog "Optional RAW spooler skipped ($($_.Exception.Message)) -> Using 100% Microsoft-signed GDI PrintDocument engine."
        }
    }
}

# ==============================================================================
# 3-SOURCE PORT-AWARE WINDOWS PRINTER DISCOVERY
# ==============================================================================
function Test-IsVirtualPrinter {
    param([string]$Name, [string]$PortName = "")
    if ([string]::IsNullOrWhiteSpace($Name)) { return $true }
    $n = $Name.ToLowerInvariant()
    $p = if ($PortName) { $PortName.ToLowerInvariant() } else { "" }

    $virtualNames = @(
        "print to pdf", "xps document", "onenote", "fax", "adobe pdf", "foxit",
        "nitro", "cutepdf", "pdfcreator", "anydesk", "teamviewer", "snagit",
        "webex", "root print queue", "document writer", "pdf24", "bullzip",
        "dopdf", "primopdf", "microsoft software printer"
    )
    foreach ($vn in $virtualNames) {
        if ($n.Contains($vn)) { return $true }
    }

    $virtualPorts = @("portprompt:", "shrfax:", "file:", "nul:", "microsoft.office.onenote", "anydesk", "pdf")
    foreach ($vp in $virtualPorts) {
        if ($p.Contains($vp)) { return $true }
    }

    return $false
}

function Test-IsPhysicalPrinterPort {
    param([string]$PortName = "")
    if ([string]::IsNullOrWhiteSpace($PortName)) { return $false }
    return ($PortName -match '^(USB\d*|TMUSB|POS\d*|ESDPRT|DOT4|COM\d+|LPT\d+|IP_|TCP|WSD-|192\.168\.|10\.|172\.|\\\\)')
}

function Test-LooksLikeThermalPrinter {
    param([string]$Name = "", [string]$DriverName = "")
    $combined = ("$Name $DriverName").ToLowerInvariant()
    return ($combined -match '(pos|80mm|58mm|\b80\b|\b58\b|pos-?80|pos-?58|thermal|receipt|xprinter|xp-|blackcopper|bc-|epson|tm-|rongta|rp80|rp58|bixolon|star tsp|gp-|hprt|sewoo|citizen|sunmi|munbyn|zywell|gprinter|generic\s*/\s*text|generic text|usb receipt|t80|t58|k80|juice|kitchen)')
}

function Get-InstalledPrinterObjects {
    $map = @{}

    # Source 1: Modern Windows PrintManagement (Get-Printer)
    try {
        $gpList = @(Get-Printer -ErrorAction Stop)
        foreach ($gp in $gpList) {
            if (-not $gp -or [string]::IsNullOrWhiteSpace($gp.Name)) { continue }
            $key = $gp.Name.Trim().ToLowerInvariant()
            $map[$key] = [ordered]@{
                Name        = $gp.Name.Trim()
                PortName    = [string]$gp.PortName
                DriverName  = [string]$gp.DriverName
                Status      = [string]$gp.PrinterStatus
                IsDefault   = $false
                WorkOffline = ([string]$gp.PrinterStatus -match 'Offline')
            }
        }
    } catch {
        Write-DebugLog "Get-Printer unavailable ($($_.Exception.Message)), falling back to WMI/CIM."
    }

    # Source 2: CIM / WMI Win32_Printer (adds Default flag + works on Home/older Windows)
    $wmiList = @()
    try {
        $wmiList = @(Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop)
    } catch {
        try {
            $wmiList = @(Get-WmiObject -Class Win32_Printer -ErrorAction Stop)
        } catch {}
    }

    foreach ($wp in $wmiList) {
        if (-not $wp -or [string]::IsNullOrWhiteSpace($wp.Name)) { continue }
        $key = $wp.Name.Trim().ToLowerInvariant()
        if ($map.ContainsKey($key)) {
            if ([string]::IsNullOrWhiteSpace($map[$key].PortName) -and $wp.PortName) { $map[$key].PortName = [string]$wp.PortName }
            if ([string]::IsNullOrWhiteSpace($map[$key].DriverName) -and $wp.DriverName) { $map[$key].DriverName = [string]$wp.DriverName }
            if ($wp.Default) { $map[$key].IsDefault = $true }
            if ($wp.WorkOffline) { $map[$key].WorkOffline = $true }
        } else {
            $map[$key] = [ordered]@{
                Name        = $wp.Name.Trim()
                PortName    = [string]$wp.PortName
                DriverName  = [string]$wp.DriverName
                Status      = if ($wp.WorkOffline) { "Offline" } else { "Ready" }
                IsDefault   = [bool]$wp.Default
                WorkOffline = [bool]$wp.WorkOffline
            }
        }
    }

    # Source 3: .NET PrinterSettings.InstalledPrinters (user-session & legacy printers)
    $defaultDotNetName = ""
    try {
        $psDef = New-Object System.Drawing.Printing.PrinterSettings
        $defaultDotNetName = [string]$psDef.PrinterName
    } catch {}

    try {
        foreach ($dotNetName in [System.Drawing.Printing.PrinterSettings]::InstalledPrinters) {
            if ([string]::IsNullOrWhiteSpace($dotNetName)) { continue }
            $key = $dotNetName.Trim().ToLowerInvariant()
            if (-not $map.ContainsKey($key)) {
                $map[$key] = [ordered]@{
                    Name        = $dotNetName.Trim()
                    PortName    = ""
                    DriverName  = ""
                    Status      = "Installed"
                    IsDefault   = ($dotNetName.Trim() -eq $defaultDotNetName)
                    WorkOffline = $false
                }
            } elseif ($dotNetName.Trim() -eq $defaultDotNetName) {
                $map[$key].IsDefault = $true
            }
        }
    } catch {}

    $results = @()
    foreach ($entry in $map.Values) {
        $isVirt = Test-IsVirtualPrinter -Name $entry.Name -PortName $entry.PortName
        $isPhysPort = Test-IsPhysicalPrinterPort -PortName $entry.PortName
        $isTherm = Test-LooksLikeThermalPrinter -Name $entry.Name -DriverName $entry.DriverName

        $score = 0
        if ($isVirt) {
            $score = -100
        } else {
            $score = 10
            if ($isPhysPort -and $isTherm) { $score += 100 }
            elseif ($isPhysPort) { $score += 80 }
            elseif ($isTherm) { $score += 65 }
            if ($entry.IsDefault) { $score += 15 }
            if (-not $entry.WorkOffline) { $score += 10 }
        }

        $results += [PSCustomObject]@{
            Name        = $entry.Name
            PortName    = $entry.PortName
            DriverName  = $entry.DriverName
            Status      = $entry.Status
            IsDefault   = $entry.IsDefault
            WorkOffline = $entry.WorkOffline
            IsVirtual   = $isVirt
            IsPhysical  = $isPhysPort
            IsThermal   = $isTherm
            Score       = $score
        }
    }

    return @($results | Sort-Object -Property @{ Expression = "Score"; Descending = $true }, @{ Expression = "Name"; Descending = $false })
}

function Resolve-TargetPrinter {
    param(
        [string]$RequestedName = "",
        [string]$ConfiguredName = "AUTO",
        [array]$PrinterObjects = @()
    )

    if (-not $PrinterObjects -or $PrinterObjects.Count -eq 0) { return "" }

    # 1. Explicit per-job printer name (if present on THIS PC)
    if (-not [string]::IsNullOrWhiteSpace($RequestedName) -and $RequestedName -ine "AUTO") {
        foreach ($p in $PrinterObjects) {
            if ($p.Name -ieq $RequestedName.Trim()) { return $p.Name }
        }
    }

    # 2. Explicitly configured local printer (if still installed)
    if (-not [string]::IsNullOrWhiteSpace($ConfiguredName) -and $ConfiguredName -ine "AUTO") {
        foreach ($p in $PrinterObjects) {
            if ($p.Name -ieq $ConfiguredName.Trim()) { return $p.Name }
        }
    }

    # 3. Highest-scored NON-VIRTUAL physical printer (USB thermal > any USB > thermal LAN > any physical)
    foreach ($p in $PrinterObjects) {
        if (-not $p.IsVirtual) { return $p.Name }
    }

    # Never silently pick "Microsoft Print to PDF" or "Fax" in AUTO mode!
    return ""
}

# ==============================================================================
# ESC/POS & WINDOWS GDI PRINTDOCUMENT DUAL ENGINE
# ==============================================================================
function Build-LocalTestSlipBytes {
    param([string]$Station, [string]$PcName, [string]$PrinterName, [string]$EngineLabel)
    $esc = [char]27
    $gs = [char]29
    $title = if ($Station -eq "juice") { "JUICE BAR PRINTER OK" } else { "KITCHEN PRINTER OK" }
    $text = ""
    $text += "${esc}@${esc}a$([char]1)${esc}!$([char]48)"
    $text += "SULTAN RESTAURANT`n"
    $text += "${esc}!$([char]16)"
    $text += "$title`n"
    $text += "${esc}!$([char]0)"
    $text += "------------------------------------------`n"
    $text += "${esc}a$([char]0)"
    $text += "Station: $($Station.ToUpperInvariant())`n"
    $text += "PC Name: $PcName`n"
    $text += "Printer: $PrinterName`n"
    $text += "Engine:  $EngineLabel`n"
    $text += "Time:    $(Get-Date -Format 'dd MMM yyyy hh:mm:ss tt')`n"
    $text += "------------------------------------------`n"
    $text += "${esc}a$([char]1)"
    $text += "Direct Thermal Print Agent v3.0 Ready!`n"
    $text += "`n`n`n`n${gs}V$([char]0)"
    return [System.Text.Encoding]::ASCII.GetBytes($text)
}

function Build-LocalTestSlipPlainText {
    param([string]$Station, [string]$PcName, [string]$PrinterName, [string]$EngineLabel)
    $title = if ($Station -eq "juice") { "JUICE BAR PRINTER OK" } else { "KITCHEN PRINTER OK" }
    return @(
        "SULTAN RESTAURANT"
        $title
        "----------------------------------------"
        "[ TEST PRINT OK ]"
        "----------------------------------------"
        "Station: $($Station.ToUpperInvariant())"
        "PC Name: $PcName"
        "Printer: $PrinterName"
        "Engine:  $EngineLabel"
        "Time:    $(Get-Date -Format 'dd MMM yyyy hh:mm:ss tt')"
        "========================================"
        "1x    Mint Margarita (Test)"
        "1x    Cold Coffee (Test)"
        "========================================"
        "TOTAL ITEMS: 2"
        "SULTAN PRINT AGENT v3.0 READY!"
    ) -join "`n"
}

function Convert-RawEscPosToPlainText {
    param([byte[]]$RawBytes)
    if (-not $RawBytes -or $RawBytes.Length -eq 0) { return "" }
    $sb = New-Object System.Text.StringBuilder
    $i = 0
    while ($i -lt $RawBytes.Length) {
        $b = $RawBytes[$i]
        if ($b -eq 27 -or $b -eq 29) {
            # Skip ESC/GS 2-byte or 3-byte command sequences
            if (($i + 1) -lt $RawBytes.Length) {
                $cmd = $RawBytes[$i + 1]
                if ($cmd -eq 64) { $i += 2; continue } # ESC @
                $i += 3; continue
            }
            $i++; continue
        }
        if ($b -eq 10) {
            [void]$sb.Append("`n")
        } elseif ($b -ge 32 -and $b -le 126) {
            [void]$sb.Append([char]$b)
        }
        $i++
    }
    return $sb.ToString().Trim()
}

$script:GdiPrintLines = @()
$script:GdiPrintIndex = 0

function Send-PlainTextViaGdiDriver {
    param(
        [string]$PrinterName,
        [string]$PlainText
    )
    if ([string]::IsNullOrWhiteSpace($PrinterName)) {
        return @{ Success = $false; Error = "No printer selected" }
    }
    if ([string]::IsNullOrWhiteSpace($PlainText)) {
        return @{ Success = $false; Error = "Empty print text" }
    }

    $doc = $null
    try {
        $script:GdiPrintLines = @($PlainText -split "`r?`n")
        $script:GdiPrintIndex = 0

        $doc = New-Object System.Drawing.Printing.PrintDocument
        $doc.DocumentName = "Sultan Station KOT"
        $doc.PrinterSettings.PrinterName = $PrinterName
        if (-not $doc.PrinterSettings.IsValid) {
            return @{ Success = $false; Error = "Windows printer '$PrinterName' is not valid or not installed." }
        }
        $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController

        $doc.add_PrintPage({
            param($sender, $e)
            $fontTitle = $null
            $fontSub = $null
            $fontItem = $null
            $fontReg = $null
            $brush = $null
            try {
                $fontTitle = New-Object System.Drawing.Font("Consolas", 11.5, [System.Drawing.FontStyle]::Bold)
                $fontSub   = New-Object System.Drawing.Font("Consolas", 10.0, [System.Drawing.FontStyle]::Bold)
                $fontItem  = New-Object System.Drawing.Font("Consolas", 9.5, [System.Drawing.FontStyle]::Bold)
                $fontReg   = New-Object System.Drawing.Font("Consolas", 8.5, [System.Drawing.FontStyle]::Regular)
                $brush     = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)

                $pageW = [Math]::Max(240, [Math]::Min(310, $e.PageBounds.Width - 6))
                $maxY  = [Math]::Max(400, $e.PageBounds.Height - 20)
                $y = 4.0

                while ($script:GdiPrintIndex -lt $script:GdiPrintLines.Count) {
                    $line = [string]$script:GdiPrintLines[$script:GdiPrintIndex]
                    $useFont = $fontReg
                    $center = $false

                    if ($script:GdiPrintIndex -eq 0 -or $line -eq "SULTAN RESTAURANT") {
                        $useFont = $fontTitle
                        $center = $true
                    } elseif ($line -match '^(JUICE BAR|MAIN KITCHEN|KITCHEN|\[ .+\]|---|\*\*\*)') {
                        $useFont = $fontSub
                        $center = $true
                    } elseif ($line -match '^TOTAL ITEMS:' -or $line -match '^SULTAN .*KOT$' -or $line -match '^SULTAN PRINT AGENT') {
                        $useFont = $fontSub
                        $center = $true
                    } elseif ($line -match '^\d+x\s+') {
                        $useFont = $fontItem
                    }

                    $sz = $e.Graphics.MeasureString($line, $useFont, [int]$pageW)
                    $lineH = [Math]::Max($useFont.GetHeight($e.Graphics) + 2, $sz.Height + 1)

                    if (($y + $lineH) -gt $maxY -and $script:GdiPrintIndex -gt 0) {
                        $e.HasMorePages = $true
                        return
                    }

                    $rect = New-Object System.Drawing.RectangleF(2.0, $y, [float]$pageW, [float]($lineH + 4))
                    $sf = New-Object System.Drawing.StringFormat
                    if ($center) { $sf.Alignment = [System.Drawing.StringAlignment]::Center }
                    $e.Graphics.DrawString($line, $useFont, $brush, $rect, $sf)
                    $sf.Dispose()

                    $y += $lineH
                    $script:GdiPrintIndex++
                }
                $e.HasMorePages = $false
            } finally {
                if ($fontTitle) { $fontTitle.Dispose() }
                if ($fontSub) { $fontSub.Dispose() }
                if ($fontItem) { $fontItem.Dispose() }
                if ($fontReg) { $fontReg.Dispose() }
                if ($brush) { $brush.Dispose() }
            }
        })

        $doc.Print()
        return @{ Success = $true; Error = "" }
    } catch {
        return @{ Success = $false; Error = $_.Exception.Message }
    } finally {
        if ($doc) { try { $doc.Dispose() } catch {} }
    }
}

function Invoke-StationPrint {
    param(
        [string]$PrinterName,
        [byte[]]$RawBytes = $null,
        [string]$PlainText = "",
        [string]$PrintMode = "AUTO"
    )

    if ([string]::IsNullOrWhiteSpace($PrinterName)) {
        return @{ Success = $false; Engine = "NONE"; Error = "No physical printer selected or detected." }
    }

    $modeUp = if ($PrintMode) { $PrintMode.ToUpperInvariant() } else { "AUTO" }
    $rawErr = ""

    # 1. Try RAW ESC/POS first when AUTO or RAW and WinSpool helper is loaded
    if (($modeUp -eq "AUTO" -or $modeUp -eq "RAW") -and $script:RawSpoolAvailable -and $RawBytes -and $RawBytes.Length -gt 0) {
        try {
            $rawErr = [SultanRawSpoolerV3]::SendRawBytes($PrinterName, $RawBytes)
            if ([string]::IsNullOrEmpty($rawErr)) {
                return @{ Success = $true; Engine = "RAW-ESCPOS"; Error = "" }
            }
            Write-DebugLog "RAW ESC/POS failed on '$PrinterName': $rawErr"
            if ($modeUp -eq "RAW") {
                return @{ Success = $false; Engine = "RAW-ESCPOS"; Error = $rawErr }
            }
        } catch {
            $rawErr = $_.Exception.Message
            Write-DebugLog "RAW ESC/POS exception on '$PrinterName': $rawErr"
            if ($modeUp -eq "RAW") {
                return @{ Success = $false; Engine = "RAW-ESCPOS"; Error = $rawErr }
            }
        }
    } elseif ($modeUp -eq "RAW" -and -not $script:RawSpoolAvailable) {
        return @{ Success = $false; Engine = "RAW-ESCPOS"; Error = "RAW WinSpool blocked by Windows Application Control. Switch Print Mode to AUTO or GDI." }
    }

    # 2. Automatic Microsoft-signed Windows Driver (GDI PrintDocument) engine
    $textToPrint = $PlainText
    if ([string]::IsNullOrWhiteSpace($textToPrint) -and $RawBytes -and $RawBytes.Length -gt 0) {
        $textToPrint = Convert-RawEscPosToPlainText -RawBytes $RawBytes
    }
    if ([string]::IsNullOrWhiteSpace($textToPrint)) {
        return @{ Success = $false; Engine = "GDI-DRIVER"; Error = "Empty print slip content" }
    }

    $gdiRes = Send-PlainTextViaGdiDriver -PrinterName $PrinterName -PlainText $textToPrint
    if ($gdiRes.Success) {
        return @{ Success = $true; Engine = "GDI-DRIVER"; Error = "" }
    }

    $combinedErr = if ($rawErr) { "RAW: $rawErr | GDI: $($gdiRes.Error)" } else { $gdiRes.Error }
    return @{ Success = $false; Engine = "GDI-DRIVER"; Error = $combinedErr }
}

# ==============================================================================
# CONFIG LOADER & SAVER + SMART HUB URL CANDIDATES
# ==============================================================================
function Read-AgentConfig {
    param([string]$ConfigPath)
    $cfg = @{
        Server  = "http://192.168.1.10:5050"
        Station = "juice"
        Printer = "AUTO"
        Mode    = "AUTO"
    }
    if (Test-Path $ConfigPath) {
        try {
            foreach ($rawLine in (Get-Content -Path $ConfigPath -ErrorAction SilentlyContinue)) {
                $line = ([string]$rawLine).Trim()
                if ($line.Length -eq 0 -or $line.StartsWith("#") -or $line.StartsWith(";")) { continue }
                $eq = $line.IndexOf("=")
                if ($eq -le 0) { continue }
                $k = $line.Substring(0, $eq).Trim().ToUpperInvariant()
                $v = $line.Substring($eq + 1).Trim()
                if ([string]::IsNullOrWhiteSpace($v)) { continue }
                if ($k -eq "SERVER" -or $k -eq "SERVER_URL") { $cfg.Server = $v.TrimEnd("/") }
                elseif ($k -eq "STATION") { $cfg.Station = $v.ToLowerInvariant() }
                elseif ($k -eq "PRINTER" -or $k -eq "PRINTER_NAME") { $cfg.Printer = $v }
                elseif ($k -eq "MODE" -or $k -eq "PRINT_MODE") { $cfg.Mode = $v.ToUpperInvariant() }
            }
        } catch {}
    }
    return $cfg
}

function Save-AgentConfig {
    param([string]$ConfigPath, [string]$ServerUrl, [string]$Station, [string]$Printer, [string]$PrintMode)
    $lines = @(
        "# Sultan Restaurant Dedicated Station Thermal Print Agent Config (v3.0)"
        "SERVER=$($ServerUrl.TrimEnd('/'))"
        "STATION=$Station"
        "PRINTER=$Printer"
        "MODE=$PrintMode"
    )
    Set-Content -Path $ConfigPath -Value $lines -Encoding ASCII
}

function Get-ServerUrlCandidates {
    param([string]$PrimaryUrl)
    $clean = ([string]$PrimaryUrl).Trim().TrimEnd("/")
    if ([string]::IsNullOrWhiteSpace($clean)) { $clean = "http://192.168.1.10:5050" }
    if (-not ($clean -match '^https?://')) { $clean = "http://$clean" }

    $list = New-Object System.Collections.Generic.List[string]
    $list.Add($clean)

    try {
        $uri = [Uri]$clean
        $hostName = $uri.Host
        foreach ($cand in @("http://${hostName}:5050", "http://${hostName}", "http://${hostName}:5000", "http://${hostName}:8081")) {
            if (-not $list.Contains($cand)) { $list.Add($cand) }
        }
    } catch {}

    return @($list)
}

function Send-HttpPostJson {
    param([string]$Url, [string]$JsonBody, [int]$TimeoutMs = 8000)
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Method = "POST"
    $req.ContentType = "application/json"
    $req.Timeout = $TimeoutMs
    $req.ReadWriteTimeout = $TimeoutMs
    $req.KeepAlive = $false
    $req.Proxy = $null
    $req.UserAgent = "SultanPrintAgent/3.0"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    $resp = $req.GetResponse()
    try {} finally { $resp.Dispose() }
}

# ==============================================================================
# LOAD EFFECTIVE CONFIGURATION
# ==============================================================================
$configPath = Join-Path $script:BaseDir "agent-config.txt"
$loadedCfg = Read-AgentConfig -ConfigPath $configPath

$effServer  = if (-not [string]::IsNullOrWhiteSpace($Server))  { $Server.Trim().TrimEnd("/") } else { $loadedCfg.Server }
$effStation = if (-not [string]::IsNullOrWhiteSpace($Station)) { $Station.Trim().ToLowerInvariant() } else { $loadedCfg.Station }
$effPrinter = if (-not [string]::IsNullOrWhiteSpace($Printer)) { $Printer.Trim() } else { $loadedCfg.Printer }
$effMode    = if ($ForceGdi) { "GDI" } else { $loadedCfg.Mode }

if ($effStation -ne "main") { $effStation = "juice" }
if ($effMode -notin @("AUTO", "RAW", "GDI")) { $effMode = "AUTO" }

# ==============================================================================
# MODE 1: CONSOLE DIAGNOSTIC TOOL (-Diagnose)
# ==============================================================================
if ($Diagnose) {
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host "  SULTAN RESTAURANT - PRINTER & CONNECTION DIAGNOSTICS (v3.0)" -ForegroundColor Cyan
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host "PC Name:        $env:COMPUTERNAME"
    Write-Host "PowerShell:     $($PSVersionTable.PSVersion)"
    Write-Host "Folder:         $script:BaseDir"
    Write-Host "Config Server:  $effServer"
    Write-Host "Config Station: $effStation"
    Write-Host "Config Printer: $effPrinter"
    Write-Host "Print Engine:   $script:RawSpoolInitNote (Mode: $effMode)"
    Write-Host ""

    Write-Host "[1/3] SCANNING ALL WINDOWS PRINTERS (Get-Printer + WMI + .NET)..." -ForegroundColor Yellow
    $printers = @(Get-InstalledPrinterObjects)
    if ($printers.Count -eq 0) {
        Write-Host "  [!] NO PRINTERS FOUND IN WINDOWS!" -ForegroundColor Red
        Write-Host "      -> Check USB cable and Windows Settings > Bluetooth & devices > Printers & scanners."
    } else {
        $printers | Format-Table Name, PortName, DriverName, IsDefault, IsVirtual, Score -AutoSize | Out-String | Write-Host
    }

    $picked = Resolve-TargetPrinter -ConfiguredName $effPrinter -PrinterObjects $printers
    if ([string]::IsNullOrWhiteSpace($picked)) {
        Write-Host "  [!] AUTO-PICK RESULT: NONE (Only virtual printers found, or no printer installed)" -ForegroundColor Red
    } else {
        Write-Host "  [OK] AUTO-PICKED THERMAL PRINTER: $picked" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "[2/3] TESTING CONNECTION TO SULTAN CENTRAL HUB..." -ForegroundColor Yellow
    $candidates = @(Get-ServerUrlCandidates -PrimaryUrl $effServer)
    $workingUrl = ""
    foreach ($cand in $candidates) {
        try {
            $healthUrl = "$cand/api/print/status"
            $req = [System.Net.HttpWebRequest]::Create($healthUrl)
            $req.Method = "GET"
            $req.Timeout = 4000
            $req.Proxy = $null
            $resp = $req.GetResponse()
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $body = $sr.ReadToEnd()
            $sr.Dispose()
            $resp.Dispose()
            Write-Host "  [OK] REACHABLE: $cand (HTTP 200)" -ForegroundColor Green
            $workingUrl = $cand
            try {
                $st = $body | ConvertFrom-Json
                Write-Host "       Hub LAN URL: $($st.lanServerUrl)"
                Write-Host "       Juice Mode:  $($st.juice.config.mode) | Agent Online: $($st.juice.agent.online) | Pending Jobs: $($st.juice.pendingJobs)"
            } catch {}
            break
        } catch {
            Write-Host "  [X]  FAILED: $cand -> $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }
    if ([string]::IsNullOrWhiteSpace($workingUrl)) {
        Write-Host "  [!] CANNOT REACH SULTAN HUB! Check Wi-Fi/LAN cable or Server PC IP (192.168.1.10)." -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "[3/3] OPTIONAL TEST PRINT:" -ForegroundColor Yellow
    if (-not [string]::IsNullOrWhiteSpace($picked)) {
        $ans = Read-Host "Print a test slip right now to '$picked'? (Y/N)"
        if ($ans -match '^[Yy]') {
            $rawBytes = Build-LocalTestSlipBytes -Station $effStation -PcName $env:COMPUTERNAME -PrinterName $picked -EngineLabel $effMode
            $plainTxt = Build-LocalTestSlipPlainText -Station $effStation -PcName $env:COMPUTERNAME -PrinterName $picked -EngineLabel $effMode
            $res = Invoke-StationPrint -PrinterName $picked -RawBytes $rawBytes -PlainText $plainTxt -PrintMode $effMode
            if ($res.Success) {
                Write-Host "  [OK] TEST SLIP PRINTED via $($res.Engine) to '$picked'!" -ForegroundColor Green
            } else {
                Write-Host "  [FAIL] $($res.Error)" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "  Skipped test print because no physical printer was detected." -ForegroundColor Red
    }
    exit 0
}

# ==============================================================================
# MODE 2: INSTANT TEST PRINT (-Test)
# ==============================================================================
if ($Test) {
    $printers = @(Get-InstalledPrinterObjects)
    $target = Resolve-TargetPrinter -ConfiguredName $effPrinter -PrinterObjects $printers
    if ([string]::IsNullOrWhiteSpace($target)) {
        $names = if ($printers.Count -gt 0) { ($printers | ForEach-Object { "$($_.Name) [$($_.PortName)]" }) -join "`n" } else { "(None)" }
        [System.Windows.Forms.MessageBox]::Show(
            "No physical USB/Thermal printer was detected on this PC ($env:COMPUTERNAME)!`n`nDetected Windows printers:`n$names`n`nPlease check the USB cable and install the thermal printer driver, then try again.",
            "Sultan Printer Test - No Physical Printer",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        exit 1
    }

    $rawBytes = Build-LocalTestSlipBytes -Station $effStation -PcName $env:COMPUTERNAME -PrinterName $target -EngineLabel $effMode
    $plainTxt = Build-LocalTestSlipPlainText -Station $effStation -PcName $env:COMPUTERNAME -PrinterName $target -EngineLabel $effMode
    $res = Invoke-StationPrint -PrinterName $target -RawBytes $rawBytes -PlainText $plainTxt -PrintMode $effMode
    if ($res.Success) {
        [System.Windows.Forms.MessageBox]::Show(
            "Test slip printed successfully!`n`nPrinter: $target`nEngine: $($res.Engine)",
            "Sultan Printer Test - OK",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
        exit 0
    } else {
        [System.Windows.Forms.MessageBox]::Show(
            "Test print failed on '$target':`n`n$($res.Error)",
            "Sultan Printer Test - Failed",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
        exit 1
    }
}

# ==============================================================================
# MODE 3: PERMANENT DESKTOP WINFORMS GUI PRINT AGENT (100% PURE POWERSHELL)
# ==============================================================================
$createdNew = $false
$mutexName = "Global\SultanDesktopPrintAgent_$effStation"
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)

if (-not $createdNew) {
    $stationLabel = if ($effStation -eq "juice") { "Juice Bar" } else { "Main Kitchen" }
    [System.Windows.Forms.MessageBox]::Show(
        "Sultan $stationLabel Printer Agent is ALREADY running on this PC!`n`nCheck the bottom-right system tray (near the clock) and double-click the icon to open the window.",
        "Sultan Printer Agent Already Running",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    exit 0
}

try {
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $isJuice = ($effStation -eq "juice")
    $stationTitle = if ($isJuice) { "JUICE BAR" } else { "MAIN KITCHEN" }
    $windowTitle  = if ($isJuice) { "Sultan Restaurant - Juice Bar Printer Agent" } else { "Sultan Restaurant - Main Kitchen Printer Agent" }
    $accentColor  = if ($isJuice) { [System.Drawing.Color]::FromArgb(255, 149, 0) } else { [System.Drawing.Color]::FromArgb(213, 169, 67) }
    $bgDark       = [System.Drawing.Color]::FromArgb(20, 20, 24)
    $panelDark    = [System.Drawing.Color]::FromArgb(30, 30, 36)

    $script:App = @{
        ServerUrl            = $effServer
        UrlCandidates        = @(Get-ServerUrlCandidates -PrimaryUrl $effServer)
        UrlIndex             = 0
        ConsecutiveErrors    = 0
        Station              = $effStation
        ConfiguredPrinter    = $effPrinter
        PrintMode            = $effMode
        ConfigPath           = $configPath
        PcName               = $env:COMPUTERNAME
        PrintedCount         = 0
        WasConnected         = $false
        AllowRealExit        = $false
        Running              = $true
        SuppressUiEvents     = $false
        PrinterObjects       = @()
        DisplayToPrinterName = @{}
        LastPrinterKey       = ""
        LastPrinterRefreshAt = [DateTime]::MinValue
        PollReq              = $null
        PollAsync            = $null
        PollStartedAt        = [DateTime]::MinValue
        NextPollAt           = [DateTime]::UtcNow
        IntentionalAbort     = $false
    }

    # --- BUILD WINFORMS WINDOW ---
    $form = New-Object System.Windows.Forms.Form
    $form.Text = $windowTitle
    $form.Size = New-Object System.Drawing.Size(640, 585)
    $form.MinimumSize = New-Object System.Drawing.Size(580, 520)
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $form.BackColor = $bgDark
    $form.ForeColor = [System.Drawing.Color]::White
    $form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
    $form.Icon = [System.Drawing.SystemIcons]::Application

    # Top Status Banner
    $statusBanner = New-Object System.Windows.Forms.Panel
    $statusBanner.Dock = [System.Windows.Forms.DockStyle]::Top
    $statusBanner.Height = 78
    $statusBanner.BackColor = [System.Drawing.Color]::FromArgb(48, 35, 16)

    $lblStatusTitle = New-Object System.Windows.Forms.Label
    $lblStatusTitle.Text = "CONNECTING TO SULTAN HUB..."
    $lblStatusTitle.Font = New-Object System.Drawing.Font("Segoe UI", 12.5, [System.Drawing.FontStyle]::Bold)
    $lblStatusTitle.ForeColor = $accentColor
    $lblStatusTitle.AutoSize = $true
    $lblStatusTitle.Location = New-Object System.Drawing.Point(16, 12)

    $lblStatusSub = New-Object System.Windows.Forms.Label
    $lblStatusSub.Text = "Station: $stationTitle ONLY (Zero Conflict)  |  Engine: $script:RawSpoolInitNote"
    $lblStatusSub.Font = New-Object System.Drawing.Font("Segoe UI", 8.8)
    $lblStatusSub.ForeColor = [System.Drawing.Color]::FromArgb(220, 220, 225)
    $lblStatusSub.AutoSize = $true
    $lblStatusSub.Location = New-Object System.Drawing.Point(16, 44)

    $statusBanner.Controls.Add($lblStatusTitle)
    $statusBanner.Controls.Add($lblStatusSub)
    $form.Controls.Add($statusBanner)

    # Config Panel
    $cfgPanel = New-Object System.Windows.Forms.Panel
    $cfgPanel.Location = New-Object System.Drawing.Point(16, 92)
    $cfgPanel.Size = New-Object System.Drawing.Size(592, 152)
    $cfgPanel.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
    $cfgPanel.BackColor = $panelDark

    $lblHub = New-Object System.Windows.Forms.Label
    $lblHub.Text = "Central Hub URL:"
    $lblHub.ForeColor = [System.Drawing.Color]::FromArgb(190, 190, 200)
    $lblHub.Location = New-Object System.Drawing.Point(12, 16)
    $lblHub.AutoSize = $true
    $cfgPanel.Controls.Add($lblHub)

    $txtServerUrl = New-Object System.Windows.Forms.TextBox
    $txtServerUrl.Text = $script:App.ServerUrl
    $txtServerUrl.Location = New-Object System.Drawing.Point(140, 13)
    $txtServerUrl.Size = New-Object System.Drawing.Size(330, 25)
    $txtServerUrl.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
    $txtServerUrl.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 22)
    $txtServerUrl.ForeColor = [System.Drawing.Color]::White
    $txtServerUrl.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $cfgPanel.Controls.Add($txtServerUrl)

    $btnSave = New-Object System.Windows.Forms.Button
    $btnSave.Text = "Save & Apply"
    $btnSave.Location = New-Object System.Drawing.Point(478, 12)
    $btnSave.Size = New-Object System.Drawing.Size(102, 27)
    $btnSave.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
    $btnSave.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnSave.BackColor = $accentColor
    $btnSave.ForeColor = [System.Drawing.Color]::Black
    $btnSave.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
    $cfgPanel.Controls.Add($btnSave)

    $lblPrinter = New-Object System.Windows.Forms.Label
    $lblPrinter.Text = "Local USB Printer:"
    $lblPrinter.ForeColor = [System.Drawing.Color]::FromArgb(190, 190, 200)
    $lblPrinter.Location = New-Object System.Drawing.Point(12, 54)
    $lblPrinter.AutoSize = $true
    $cfgPanel.Controls.Add($lblPrinter)

    $cmbPrinter = New-Object System.Windows.Forms.ComboBox
    $cmbPrinter.Location = New-Object System.Drawing.Point(140, 51)
    $cmbPrinter.Size = New-Object System.Drawing.Size(330, 25)
    $cmbPrinter.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
    $cmbPrinter.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
    $cmbPrinter.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 22)
    $cmbPrinter.ForeColor = [System.Drawing.Color]::White
    $cfgPanel.Controls.Add($cmbPrinter)

    $btnRefresh = New-Object System.Windows.Forms.Button
    $btnRefresh.Text = "Refresh"
    $btnRefresh.Location = New-Object System.Drawing.Point(478, 50)
    $btnRefresh.Size = New-Object System.Drawing.Size(102, 27)
    $btnRefresh.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
    $btnRefresh.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnRefresh.BackColor = [System.Drawing.Color]::FromArgb(52, 52, 60)
    $btnRefresh.ForeColor = [System.Drawing.Color]::White
    $cfgPanel.Controls.Add($btnRefresh)

    $lblMode = New-Object System.Windows.Forms.Label
    $lblMode.Text = "Print Engine:"
    $lblMode.ForeColor = [System.Drawing.Color]::FromArgb(190, 190, 200)
    $lblMode.Location = New-Object System.Drawing.Point(12, 92)
    $lblMode.AutoSize = $true
    $cfgPanel.Controls.Add($lblMode)

    $cmbMode = New-Object System.Windows.Forms.ComboBox
    $cmbMode.Location = New-Object System.Drawing.Point(140, 89)
    $cmbMode.Size = New-Object System.Drawing.Size(330, 25)
    $cmbMode.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
    $cmbMode.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
    $cmbMode.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 22)
    $cmbMode.ForeColor = [System.Drawing.Color]::White
    [void]$cmbMode.Items.Add("AUTO (Raw ESC/POS -> Windows Driver Fallback)")
    [void]$cmbMode.Items.Add("GDI (Windows Printer Driver - Smart App Control Safe)")
    [void]$cmbMode.Items.Add("RAW (Direct ESC/POS Spooler + Auto-Cut)")
    $cmbMode.SelectedIndex = if ($script:App.PrintMode -eq "GDI") { 1 } elseif ($script:App.PrintMode -eq "RAW") { 2 } else { 0 }
    $cfgPanel.Controls.Add($cmbMode)

    $lblHint = New-Object System.Windows.Forms.Label
    $lblHint.Text = "Auto-detects USB printers every 15s. Keep open or minimized to tray for silent printing."
    $lblHint.ForeColor = [System.Drawing.Color]::FromArgb(145, 160, 175)
    $lblHint.Font = New-Object System.Drawing.Font("Segoe UI", 8.3)
    $lblHint.Location = New-Object System.Drawing.Point(12, 124)
    $lblHint.AutoSize = $true
    $cfgPanel.Controls.Add($lblHint)
    $form.Controls.Add($cfgPanel)

    # Activity Log Section
    $lblLogTitle = New-Object System.Windows.Forms.Label
    $lblLogTitle.Text = "LIVE PRINT ACTIVITY LOG:"
    $lblLogTitle.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 175)
    $lblLogTitle.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
    $lblLogTitle.Location = New-Object System.Drawing.Point(16, 254)
    $lblLogTitle.AutoSize = $true
    $form.Controls.Add($lblLogTitle)

    $txtLog = New-Object System.Windows.Forms.TextBox
    $txtLog.Location = New-Object System.Drawing.Point(16, 274)
    $txtLog.Size = New-Object System.Drawing.Size(592, 206)
    $txtLog.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
    $txtLog.Multiline = $true
    $txtLog.ReadOnly = $true
    $txtLog.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
    $txtLog.BackColor = [System.Drawing.Color]::FromArgb(12, 12, 15)
    $txtLog.ForeColor = [System.Drawing.Color]::FromArgb(110, 231, 183)
    $txtLog.Font = New-Object System.Drawing.Font("Consolas", 8.8)
    $txtLog.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $form.Controls.Add($txtLog)

    # Bottom Action Bar
    $btnBar = New-Object System.Windows.Forms.Panel
    $btnBar.Dock = [System.Windows.Forms.DockStyle]::Bottom
    $btnBar.Height = 56
    $btnBar.BackColor = $panelDark

    $btnTest = New-Object System.Windows.Forms.Button
    $btnTest.Text = "Print Test Slip"
    $btnTest.Location = New-Object System.Drawing.Point(16, 12)
    $btnTest.Size = New-Object System.Drawing.Size(132, 32)
    $btnTest.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnTest.BackColor = $accentColor
    $btnTest.ForeColor = [System.Drawing.Color]::Black
    $btnTest.Font = New-Object System.Drawing.Font("Segoe UI", 9.0, [System.Drawing.FontStyle]::Bold)
    $btnBar.Controls.Add($btnTest)

    $btnTray = New-Object System.Windows.Forms.Button
    $btnTray.Text = "Minimize to Tray"
    $btnTray.Location = New-Object System.Drawing.Point(158, 12)
    $btnTray.Size = New-Object System.Drawing.Size(132, 32)
    $btnTray.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnTray.BackColor = [System.Drawing.Color]::FromArgb(52, 52, 62)
    $btnTray.ForeColor = [System.Drawing.Color]::White
    $btnBar.Controls.Add($btnTray)

    $btnLogFile = New-Object System.Windows.Forms.Button
    $btnLogFile.Text = "Open Debug Log"
    $btnLogFile.Location = New-Object System.Drawing.Point(300, 12)
    $btnLogFile.Size = New-Object System.Drawing.Size(128, 32)
    $btnLogFile.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnLogFile.BackColor = [System.Drawing.Color]::FromArgb(42, 42, 52)
    $btnLogFile.ForeColor = [System.Drawing.Color]::White
    $btnBar.Controls.Add($btnLogFile)

    $btnExit = New-Object System.Windows.Forms.Button
    $btnExit.Text = "Stop & Exit"
    $btnExit.Location = New-Object System.Drawing.Point(500, 12)
    $btnExit.Size = New-Object System.Drawing.Size(108, 32)
    $btnExit.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
    $btnExit.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $btnExit.BackColor = [System.Drawing.Color]::FromArgb(153, 27, 27)
    $btnExit.ForeColor = [System.Drawing.Color]::White
    $btnExit.Font = New-Object System.Drawing.Font("Segoe UI", 9.0, [System.Drawing.FontStyle]::Bold)
    $btnBar.Controls.Add($btnExit)
    $form.Controls.Add($btnBar)

    # System Tray Icon
    $trayIcon = New-Object System.Windows.Forms.NotifyIcon
    $trayIcon.Icon = [System.Drawing.SystemIcons]::Application
    $trayIcon.Text = "Sultan $stationTitle Printer Agent"
    $trayIcon.Visible = $true

    $trayMenu = New-Object System.Windows.Forms.ContextMenu
    [void]$trayMenu.MenuItems.Add("Show Window", {
        $form.Show()
        $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
        $form.BringToFront()
        $form.Activate()
    })
    [void]$trayMenu.MenuItems.Add("Print Test Slip", { $btnTest.PerformClick() })
    [void]$trayMenu.MenuItems.Add("-")
    [void]$trayMenu.MenuItems.Add("Exit Printer Agent", {
        $script:App.AllowRealExit = $true
        $script:App.Running = $false
        $form.Close()
    })
    $trayIcon.ContextMenu = $trayMenu
    $trayIcon.add_DoubleClick({
        $form.Show()
        $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
        $form.BringToFront()
        $form.Activate()
    })

    # --- UI HELPER FUNCTIONS ---
    function Append-UiLog {
        param([string]$Message)
        Write-DebugLog $Message
        if ($form.IsDisposed -or $txtLog.IsDisposed) { return }
        $line = "[$(Get-Date -Format 'HH:mm:ss')] $Message`r`n"
        if ($txtLog.TextLength -gt 24000) { $txtLog.Clear() }
        $txtLog.AppendText($line)
    }

    function Set-StatusBanner {
        param([string]$State, [string]$TitleText, [string]$SubText)
        if ($form.IsDisposed) { return }
        if ($State -eq "ok") {
            $statusBanner.BackColor = [System.Drawing.Color]::FromArgb(14, 58, 42)
            $lblStatusTitle.ForeColor = [System.Drawing.Color]::FromArgb(52, 211, 153)
        } elseif ($State -eq "warn") {
            $statusBanner.BackColor = [System.Drawing.Color]::FromArgb(72, 42, 10)
            $lblStatusTitle.ForeColor = [System.Drawing.Color]::FromArgb(251, 191, 36)
        } else {
            $statusBanner.BackColor = [System.Drawing.Color]::FromArgb(75, 22, 22)
            $lblStatusTitle.ForeColor = [System.Drawing.Color]::FromArgb(248, 113, 113)
        }
        $lblStatusTitle.Text = $TitleText
        $lblStatusSub.Text = $SubText
    }

    function Request-ImmediateRepoll {
        if ($script:App.PollReq -ne $null) {
            $script:App.IntentionalAbort = $true
            try { $script:App.PollReq.Abort() } catch {}
        }
        $script:App.NextPollAt = [DateTime]::UtcNow
    }

    function Refresh-PrintersUi {
        param([switch]$VerboseLog)
        $objs = @(Get-InstalledPrinterObjects)
        $script:App.PrinterObjects = $objs
        $script:App.LastPrinterRefreshAt = [DateTime]::UtcNow

        $resolved = Resolve-TargetPrinter -ConfiguredName $script:App.ConfiguredPrinter -PrinterObjects $objs
        $printerKey = (($objs | ForEach-Object { "$($_.Name)|$($_.PortName)|$($_.WorkOffline)" }) -join ";") + "::" + $resolved + "::" + $script:App.ConfiguredPrinter

        if ($VerboseLog -or $printerKey -ne $script:App.LastPrinterKey) {
            $script:App.LastPrinterKey = $printerKey
            $script:App.SuppressUiEvents = $true
            try {
                $cmbPrinter.Items.Clear()
                $script:App.DisplayToPrinterName = @{}

                $autoLabel = if ([string]::IsNullOrWhiteSpace($resolved)) {
                    "AUTO (No Physical Printer Found - Select Manually Below)"
                } else {
                    "AUTO (Picked: $resolved)"
                }
                [void]$cmbPrinter.Items.Add($autoLabel)
                $script:App.DisplayToPrinterName[$autoLabel] = "AUTO"

                $selectedIdx = 0
                $idx = 1
                foreach ($p in $objs) {
                    $portTag = if (-not [string]::IsNullOrWhiteSpace($p.PortName)) { " [$($p.PortName)]" } else { "" }
                    $virtTag = if ($p.IsVirtual) { " (Virtual)" } else { "" }
                    $disp = "$($p.Name)$portTag$virtTag"
                    [void]$cmbPrinter.Items.Add($disp)
                    $script:App.DisplayToPrinterName[$disp] = $p.Name
                    if ($script:App.ConfiguredPrinter -ine "AUTO" -and $p.Name -ieq $script:App.ConfiguredPrinter) {
                        $selectedIdx = $idx
                    }
                    $idx++
                }
                $cmbPrinter.SelectedIndex = $selectedIdx
            } finally {
                $script:App.SuppressUiEvents = $false
            }

            if ($VerboseLog) {
                $summary = ($objs | ForEach-Object { "$($_.Name)[$($_.PortName)]" }) -join ", "
                Append-UiLog "Detected $($objs.Count) Windows printer(s): $summary"
                if ([string]::IsNullOrWhiteSpace($resolved)) {
                    Append-UiLog "WARNING: No physical USB thermal printer auto-detected. Plug in USB cable or pick your printer in the dropdown above."
                } else {
                    Append-UiLog "Active target printer: $resolved"
                }
            } elseif ($script:App.WasConnected) {
                Append-UiLog "Windows printer list changed -> Active target: $(if ($resolved) { $resolved } else { 'NONE' })"
                Request-ImmediateRepoll
            }
        }
        return $resolved
    }

    # --- BUTTON & DROPDOWN HANDLERS ---
    $cmbPrinter.add_SelectedIndexChanged({
        if ($script:App.SuppressUiEvents) { return }
        if ($cmbPrinter.SelectedItem -ne $null) {
            $disp = [string]$cmbPrinter.SelectedItem
            $mapped = $script:App.DisplayToPrinterName[$disp]
            if ($mapped) {
                $script:App.ConfiguredPrinter = $mapped
                try {
                    Save-AgentConfig -ConfigPath $script:App.ConfigPath -ServerUrl $script:App.ServerUrl -Station $script:App.Station -Printer $script:App.ConfiguredPrinter -PrintMode $script:App.PrintMode
                } catch {}
                Append-UiLog "Printer selected & saved: $mapped"
                Request-ImmediateRepoll
            }
        }
    })

    $cmbMode.add_SelectedIndexChanged({
        if ($script:App.SuppressUiEvents) { return }
        $newMode = switch ($cmbMode.SelectedIndex) {
            1 { "GDI" }
            2 { "RAW" }
            default { "AUTO" }
        }
        $script:App.PrintMode = $newMode
        try {
            Save-AgentConfig -ConfigPath $script:App.ConfigPath -ServerUrl $script:App.ServerUrl -Station $script:App.Station -Printer $script:App.ConfiguredPrinter -PrintMode $script:App.PrintMode
        } catch {}
        Append-UiLog "Print Engine mode switched to: $newMode"
        Request-ImmediateRepoll
    })

    $btnRefresh.add_Click({
        Refresh-PrintersUi -VerboseLog | Out-Null
        Request-ImmediateRepoll
    })

    $btnSave.add_Click({
        $url = ([string]$txtServerUrl.Text).Trim().TrimEnd("/")
        if ([string]::IsNullOrWhiteSpace($url)) {
            [System.Windows.Forms.MessageBox]::Show("Please enter Central Hub URL (e.g. http://192.168.1.10:5050).", "Invalid URL") | Out-Null
            return
        }
        if (-not ($url -match '^https?://')) { $url = "http://$url"; $txtServerUrl.Text = $url }
        $script:App.ServerUrl = $url
        $script:App.UrlCandidates = @(Get-ServerUrlCandidates -PrimaryUrl $url)
        $script:App.UrlIndex = 0
        $script:App.ConsecutiveErrors = 0
        try {
            Save-AgentConfig -ConfigPath $script:App.ConfigPath -ServerUrl $script:App.ServerUrl -Station $script:App.Station -Printer $script:App.ConfiguredPrinter -PrintMode $script:App.PrintMode
            Append-UiLog "Saved config -> Hub: $($script:App.ServerUrl) | Printer: $($script:App.ConfiguredPrinter) | Mode: $($script:App.PrintMode)"
        } catch {
            Append-UiLog "Config save warning: $($_.Exception.Message)"
        }
        Request-ImmediateRepoll
    })

    $btnTest.add_Click({
        $resolved = Refresh-PrintersUi
        $target = Resolve-TargetPrinter -ConfiguredName $script:App.ConfiguredPrinter -PrinterObjects $script:App.PrinterObjects
        if ([string]::IsNullOrWhiteSpace($target)) {
            [System.Windows.Forms.MessageBox]::Show(
                "No physical USB/Thermal printer detected!`n`nSelect your printer manually from the 'Local USB Printer' dropdown above (or check USB cable / driver), then click Print Test Slip again.",
                "No Printer Selected",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning
            ) | Out-Null
            return
        }
        Append-UiLog "Sending test slip to '$target' (Mode: $($script:App.PrintMode))..."
        $rawBytes = Build-LocalTestSlipBytes -Station $script:App.Station -PcName $script:App.PcName -PrinterName $target -EngineLabel $script:App.PrintMode
        $plainTxt = Build-LocalTestSlipPlainText -Station $script:App.Station -PcName $script:App.PcName -PrinterName $target -EngineLabel $script:App.PrintMode
        $res = Invoke-StationPrint -PrinterName $target -RawBytes $rawBytes -PlainText $plainTxt -PrintMode $script:App.PrintMode
        if ($res.Success) {
            Append-UiLog "[TEST OK] Printed test slip to '$target' via $($res.Engine)"
        } else {
            Append-UiLog "[TEST FAIL] '$target': $($res.Error)"
            [System.Windows.Forms.MessageBox]::Show(
                "Test print failed on '$target':`n`n$($res.Error)",
                "Print Error",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Error
            ) | Out-Null
        }
    })

    $btnTray.add_Click({
        $form.Hide()
        try {
            $trayIcon.ShowBalloonTip(2500, "Sultan Printer Agent Active", "Still printing $stationTitle slips automatically. Double-click icon to reopen.", [System.Windows.Forms.ToolTipIcon]::Info)
        } catch {}
    })

    $btnLogFile.add_Click({
        try {
            if (-not (Test-Path $script:DebugLogPath)) { Write-DebugLog "Log created." }
            Start-Process notepad.exe -ArgumentList "`"$script:DebugLogPath`""
        } catch {
            Append-UiLog "Could not open debug log: $($_.Exception.Message)"
        }
    })

    $btnExit.add_Click({
        $script:App.AllowRealExit = $true
        $script:App.Running = $false
        $form.Close()
    })

    $form.add_FormClosing({
        param($sender, $e)
        if (-not $script:App.AllowRealExit -and $e.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) {
            $e.Cancel = $true
            $form.Hide()
            try {
                $trayIcon.ShowBalloonTip(2500, "Sultan Printer Agent Active", "Running in background tray. Double-click icon to reopen.", [System.Windows.Forms.ToolTipIcon]::Info)
            } catch {}
            return
        }
        $script:App.Running = $false
        if ($script:App.PollReq -ne $null) {
            $script:App.IntentionalAbort = $true
            try { $script:App.PollReq.Abort() } catch {}
        }
        try { $pollTimer.Stop(); $pollTimer.Dispose() } catch {}
        try { $trayIcon.Visible = $false; $trayIcon.Dispose() } catch {}
    })

    # --- INITIAL PRINTER SCAN & LOG ---
    Append-UiLog "Started Sultan $stationTitle Printer Agent v3.0 (Pure PowerShell)"
    Append-UiLog "PC: $($script:App.PcName) | Hub: $($script:App.ServerUrl) | Engine: $script:RawSpoolInitNote"
    Refresh-PrintersUi -VerboseLog | Out-Null

    # --- NON-BLOCKING ASYNC LONG-POLL TIMER (250ms tick, zero UI freeze!) ---
    $pollTimer = New-Object System.Windows.Forms.Timer
    $pollTimer.Interval = 250
    $pollTimer.add_Tick({
        if (-not $script:App.Running) { return }

        # Auto-refresh Windows printers every 15s (picks up newly plugged/installed USB printers live!)
        if (([DateTime]::UtcNow - $script:App.LastPrinterRefreshAt).TotalSeconds -ge 15) {
            Refresh-PrintersUi | Out-Null
        }

        # Case A: An async poll request is currently in flight
        if ($script:App.PollAsync -ne $null) {
            if ($script:App.PollAsync.IsCompleted) {
                $req = $script:App.PollReq
                $ar  = $script:App.PollAsync
                $wasIntentionalAbort = $script:App.IntentionalAbort
                $script:App.PollReq = $null
                $script:App.PollAsync = $null
                $script:App.IntentionalAbort = $false

                try {
                    $resp = $req.EndGetResponse($ar)
                    $body = ""
                    try {
                        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
                        try { $body = $sr.ReadToEnd() } finally { $sr.Dispose() }
                    } finally {
                        $resp.Dispose()
                    }

                    $activeHubUrl = $script:App.UrlCandidates[$script:App.UrlIndex]
                    $script:App.ConsecutiveErrors = 0
                    $activePrinter = Resolve-TargetPrinter -ConfiguredName $script:App.ConfiguredPrinter -PrinterObjects $script:App.PrinterObjects

                    if (-not $script:App.WasConnected) {
                        $script:App.WasConnected = $true
                        Append-UiLog "CONNECTED to Sultan Hub ($activeHubUrl) -> Active Printer: $(if ($activePrinter) { $activePrinter } else { 'NONE' })"
                    }

                    if ([string]::IsNullOrWhiteSpace($activePrinter)) {
                        Set-StatusBanner -State "warn" `
                            -TitleText "HUB CONNECTED - SELECT YOUR PRINTER BELOW!" `
                            -SubText "Hub: $activeHubUrl  |  No physical USB printer auto-detected yet  |  Click Refresh or pick manually"
                    } else {
                        Set-StatusBanner -State "ok" `
                            -TitleText "ONLINE - $stationTitle PRINTER READY" `
                            -SubText "Hub: $activeHubUrl  |  Printer: $activePrinter  |  Printed: $($script:App.PrintedCount)"
                    }

                    if (-not [string]::IsNullOrWhiteSpace($body)) {
                        $json = $body | ConvertFrom-Json

                        # Only adopt server-configured printer if local agent is AUTO AND that printer actually exists on this PC
                        if ($json.configuredPrinter -and $script:App.ConfiguredPrinter -ieq "AUTO" -and $json.configuredPrinter -ine "AUTO") {
                            foreach ($pObj in $script:App.PrinterObjects) {
                                if ($pObj.Name -ieq [string]$json.configuredPrinter) {
                                    $script:App.ConfiguredPrinter = $pObj.Name
                                    Refresh-PrintersUi | Out-Null
                                    break
                                }
                            }
                        }

                        if ($json.jobId -and ($json.rawBase64 -or $json.plainText)) {
                            $jobId     = [string]$json.jobId
                            $ticketId  = if ($json.ticketId) { [string]$json.ticketId } else { "KOT" }
                            $tableName = if ($json.tableName) { [string]$json.tableName } else { "" }
                            $jobPrn    = if ($json.printerName) { [string]$json.printerName } else { "" }
                            $target    = Resolve-TargetPrinter -RequestedName $jobPrn -ConfiguredName $script:App.ConfiguredPrinter -PrinterObjects $script:App.PrinterObjects

                            Append-UiLog "Printing $stationTitle KOT #$ticketId ($tableName) -> $(if ($target) { $target } else { 'NO PRINTER' })..."

                            $rawBytes = $null
                            if ($json.rawBase64) {
                                try { $rawBytes = [Convert]::FromBase64String([string]$json.rawBase64) } catch {}
                            }
                            $plainText = if ($json.plainText) { [string]$json.plainText } else { "" }

                            $printRes = Invoke-StationPrint -PrinterName $target -RawBytes $rawBytes -PlainText $plainText -PrintMode $script:App.PrintMode
                            if ($printRes.Success) {
                                $script:App.PrintedCount++
                                Append-UiLog "PRINTED OK #$ticketId on '$target' via $($printRes.Engine) (Total: $($script:App.PrintedCount))"
                                Set-StatusBanner -State "ok" `
                                    -TitleText "ONLINE - $stationTitle PRINTER READY" `
                                    -SubText "Hub: $activeHubUrl  |  Printer: $target  |  Printed: $($script:App.PrintedCount)"
                            } else {
                                Append-UiLog "PRINT FAILED #${ticketId}: $($printRes.Error)"
                            }

                            # Send print ACK back to Central Hub
                            try {
                                $ackObj = @{
                                    jobId       = $jobId
                                    ticketId    = $ticketId
                                    station     = $script:App.Station
                                    success     = [bool]$printRes.Success
                                    printerName = $target
                                    pcName      = $script:App.PcName
                                    engine      = $printRes.Engine
                                    error       = $printRes.Error
                                }
                                $ackJson = $ackObj | ConvertTo-Json -Compress
                                Send-HttpPostJson -Url "$activeHubUrl/api/print-agent/ack" -JsonBody $ackJson -TimeoutMs 8000
                            } catch {
                                Append-UiLog "ACK warning: $($_.Exception.Message)"
                            }
                        }
                    }

                    $script:App.NextPollAt = [DateTime]::UtcNow.AddMilliseconds(120)
                } catch {
                    if ($wasIntentionalAbort) {
                        $script:App.NextPollAt = [DateTime]::UtcNow
                        return
                    }
                    $errMsg = $_.Exception.Message
                    if ($_.Exception.InnerException) { $errMsg = $_.Exception.InnerException.Message }

                    $currentCand = $script:App.UrlCandidates[$script:App.UrlIndex]
                    $script:App.ConsecutiveErrors++

                    if ($script:App.WasConnected) {
                        $script:App.WasConnected = $false
                        Append-UiLog "Connection paused ($currentCand): $errMsg (retrying...)"
                    } else {
                        Append-UiLog "Waiting for Sultan Hub at $currentCand ($errMsg)"
                    }

                    # Auto-try fallback ports (:5050, :80, :5000, :8081) after 2 failures
                    if ($script:App.ConsecutiveErrors -ge 2 -and $script:App.UrlCandidates.Count -gt 1) {
                        $script:App.ConsecutiveErrors = 0
                        $script:App.UrlIndex = ($script:App.UrlIndex + 1) % $script:App.UrlCandidates.Count
                        $nextCand = $script:App.UrlCandidates[$script:App.UrlIndex]
                        Append-UiLog "Trying fallback Hub port: $nextCand"
                    }

                    if ($currentCand -match 'localhost|127\.0\.0\.1') {
                        Set-StatusBanner -State "err" `
                            -TitleText "WRONG HUB URL (localhost) - UPDATE ABOVE!" `
                            -SubText "Change Central Hub URL to http://192.168.1.10:5050 and click Save & Apply"
                    } else {
                        Set-StatusBanner -State "warn" `
                            -TitleText "WAITING FOR SULTAN HUB..." `
                            -SubText "Retrying $currentCand - check LAN/Wi-Fi connection to Server PC"
                    }
                    $script:App.NextPollAt = [DateTime]::UtcNow.AddSeconds(3)
                }
                return
            }

            # Timeout guard (>22 seconds hung socket)
            if (([DateTime]::UtcNow - $script:App.PollStartedAt).TotalSeconds -ge 22) {
                try { $script:App.PollReq.Abort() } catch {}
                $script:App.PollReq = $null
                $script:App.PollAsync = $null
                $script:App.NextPollAt = [DateTime]::UtcNow.AddSeconds(1)
            }
            return
        }

        # Case B: Kick off next non-blocking async poll when due
        if ([DateTime]::UtcNow -ge $script:App.NextPollAt) {
            try {
                $baseHub = $script:App.UrlCandidates[$script:App.UrlIndex]
                $objs = $script:App.PrinterObjects
                $activePrinter = Resolve-TargetPrinter -ConfiguredName $script:App.ConfiguredPrinter -PrinterObjects $objs
                # Report physical printers first, then virtuals so KDS modal dropdown always shows real printers on top
                $printerNames = @($objs | ForEach-Object { $_.Name })
                $printersCsv = $printerNames -join "||"
                $engineTag = if ($script:App.PrintMode -eq "GDI" -or -not $script:RawSpoolAvailable) { "GDI-DRIVER" } else { "RAW+GDI" }

                $helloFlag = if (-not $script:App.WasConnected) { "&hello=1" } else { "" }
                $pollUrl = "$baseHub/api/print-agent/poll" +
                    "?station=" + [Uri]::EscapeDataString($script:App.Station) +
                    "&pc=" + [Uri]::EscapeDataString($script:App.PcName) +
                    "&printer=" + [Uri]::EscapeDataString($activePrinter) +
                    "&printers=" + [Uri]::EscapeDataString($printersCsv) +
                    "&engine=" + [Uri]::EscapeDataString($engineTag) +
                    $helloFlag

                $req = [System.Net.HttpWebRequest]::Create($pollUrl)
                $req.Method = "GET"
                $req.Timeout = 20000
                $req.ReadWriteTimeout = 20000
                $req.KeepAlive = $false
                $req.Proxy = $null
                $req.UserAgent = "SultanPrintAgent/3.0"

                $script:App.PollReq = $req
                $script:App.PollStartedAt = [DateTime]::UtcNow
                $script:App.IntentionalAbort = $false
                $script:App.PollAsync = $req.BeginGetResponse($null, $null)
            } catch {
                Append-UiLog "Poll start error: $($_.Exception.Message)"
                $script:App.PollReq = $null
                $script:App.PollAsync = $null
                $script:App.NextPollAt = [DateTime]::UtcNow.AddSeconds(3)
            }
        }
    })

    $pollTimer.Start()

    if ($Minimized) {
        $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
    }

    [System.Windows.Forms.Application]::Run($form)
} catch {
    Write-DebugLog "UNHANDLED ERROR: $($_.Exception.ToString())"
    try {
        [System.Windows.Forms.MessageBox]::Show(
            "Sultan Printer Agent encountered an error:`n`n$($_.Exception.Message)`n`nFull details saved to:`n$script:DebugLogPath",
            "Sultan Printer Agent Error",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
} finally {
    try { $mutex.ReleaseMutex() } catch {}
    try { $mutex.Dispose() } catch {}
}
