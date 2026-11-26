$ErrorActionPreference = 'Stop'

Write-Host "=== Step 1: Exporting Web Bundle (v35) ==="
npx expo export -p web
if ($LASTEXITCODE -ne 0) { throw "expo export web failed" }

if (Test-Path "public\_redirects") {
  Copy-Item -Path "public\_redirects" -Destination "dist\_redirects" -Force
}
if (Test-Path "public\site") {
  if (!(Test-Path "dist\site")) { New-Item -ItemType Directory -Path "dist\site" -Force | Out-Null }
  Copy-Item -Path "public\site\*" -Destination "dist\site" -Recurse -Force
}

$webTargets = @(
  "C:\SultanRestaurant\dist",
  "SultanRestaurant-App\dist",
  "C:\Users\Nizaam Digital Sol\Desktop\SultanRestaurant-App\dist"
)
foreach ($wt in $webTargets) {
  if (Test-Path $wt) {
    Remove-Item -Path "$wt\*" -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    New-Item -ItemType Directory -Path $wt -Force | Out-Null
  }
  Copy-Item -Path "dist\*" -Destination $wt -Recurse -Force
  Write-Host "Synced web dist -> $wt"
}

Write-Host "=== Step 2: Sync server.js, printerHelper.js & Build Windows Desktop Executable ==="
$appRoots = @(
  "SultanRestaurant-App",
  "C:\SultanRestaurant",
  "C:\Users\Nizaam Digital Sol\Desktop\SultanRestaurant-App"
)
foreach ($root in $appRoots) {
  if (Test-Path $root) {
    Copy-Item "server.js" -Destination "$root\server.js" -Force
    if (Test-Path "printerHelper.js") {
      Copy-Item "printerHelper.js" -Destination "$root\printerHelper.js" -Force
    }
    if (Test-Path "JuiceBar-Printer-Agent") {
      $agentDest = "$root\JuiceBar-Printer-Agent"
      if (!(Test-Path $agentDest)) { New-Item -ItemType Directory -Path $agentDest -Force | Out-Null }
      Copy-Item "JuiceBar-Printer-Agent\*" -Destination $agentDest -Recurse -Force
    }
    Write-Host "Synced server.js & printerHelper.js -> $root"
  }
}

& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /target:winexe /out:SultanRestaurant.exe /win32icon:assets\sultan.ico /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll desktop_src\SultanRestaurant.cs
if ($LASTEXITCODE -ne 0) { throw "csc SultanRestaurant.exe failed" }

$exeTargets = @(
  "Updates\SultanRestaurant.exe",
  "dist\SultanRestaurant.exe",
  "SultanRestaurant-App\SultanRestaurant.exe",
  "SultanRestaurant-App\Updates\SultanRestaurant.exe",
  "SultanRestaurant-App\dist\SultanRestaurant.exe",
  "C:\SultanRestaurant\SultanRestaurant.exe",
  "C:\SultanRestaurant\Updates\SultanRestaurant.exe",
  "C:\SultanRestaurant\dist\SultanRestaurant.exe",
  "C:\Users\Nizaam Digital Sol\Desktop\SultanRestaurant-App\SultanRestaurant.exe",
  "C:\Users\Nizaam Digital Sol\Desktop\SultanRestaurant-App\Updates\SultanRestaurant.exe",
  "C:\Users\Nizaam Digital Sol\Desktop\SultanRestaurant-App\dist\SultanRestaurant.exe"
)
foreach ($et in $exeTargets) {
  $dir = Split-Path -Parent $et
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Copy-Item SultanRestaurant.exe -Destination $et -Force -ErrorAction SilentlyContinue
  Write-Host "Copied EXE -> $et"
}

$java = "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot\bin\java.exe"
$bt = "$env:TEMP\android-build-tools\android-14"
$baseApk = if (Test-Path "$env:TEMP\sultan_aligned_v14.apk") { "$env:TEMP\sultan_aligned_v14.apk" } elseif (Test-Path "Sultan-POS-Tablet.apk") { "Sultan-POS-Tablet.apk" } else { "" }

if ((Test-Path $java) -and (Test-Path "$bt\zipalign.exe") -and (Test-Path "$env:TEMP\sultan-release-key.jks") -and ($baseApk -ne "")) {
  Write-Host "=== Step 3: Exporting Android Bundle & Patching APK to v36 ==="
  npx expo export -p android --output-dir dist-android
  if ($LASTEXITCODE -ne 0) { throw "expo export android failed" }

  $hbc = (Get-ChildItem -Path "dist-android\_expo\static\js\android\*.hbc" | Select-Object -First 1).FullName
  $unalignedApk = "$env:TEMP\sultan_unaligned_v36.apk"
  $alignedApk = "$env:TEMP\sultan_aligned_v36.apk"
  $signedApk = "$env:TEMP\Sultan-POS-Tablet-v36.apk"
  Remove-Item $unalignedApk, $alignedApk, $signedApk -Force -ErrorAction SilentlyContinue

  $fromVer = if ($baseApk -like "*v14*") { 14 } else { 35 }
  & $java scripts\PatchApk.java $baseApk $unalignedApk $hbc $fromVer 36
  if ($LASTEXITCODE -ne 0) { throw "PatchApk failed" }

  & "$bt\zipalign.exe" -p -f 4 $unalignedApk $alignedApk
  if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

  & $java -jar "$bt\lib\apksigner.jar" sign --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --ks "$env:TEMP\sultan-release-key.jks" --ks-key-alias sultanpos --ks-pass pass:sultan123 --key-pass pass:sultan123 --out $signedApk $alignedApk
  if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed" }

  $apkTargets = @(
    "Sultan-POS-Tablet.apk",
    "Updates\Sultan-POS-Tablet.apk",
    "SultanRestaurant-App\Sultan-POS-Tablet.apk",
    "SultanRestaurant-App\Updates\Sultan-POS-Tablet.apk",
    "C:\SultanRestaurant\Sultan-POS-Tablet.apk",
    "C:\SultanRestaurant\Updates\Sultan-POS-Tablet.apk",
    "C:\Users\Nizaam Digital Sol\Desktop\SultanRestaurant-App\Sultan-POS-Tablet.apk",
    "C:\Users\Nizaam Digital Sol\Desktop\SultanRestaurant-App\Updates\Sultan-POS-Tablet.apk"
  )
  foreach ($t in $apkTargets) {
    $dir = Split-Path -Parent $t
    if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -Path $signedApk -Destination $t -Force
    Write-Host "Copied APK -> $t"
  }
}

Write-Host "=== Build v29 Completed Successfully! ==="
