$ErrorActionPreference = 'Stop'

Write-Host "=== Step 1: Exporting Web Bundle ==="
npx expo export -p web
if ($LASTEXITCODE -ne 0) { throw "expo export web failed" }

$webTargets = @("C:\SultanRestaurant\dist", "SultanRestaurant-App\dist")
foreach ($wt in $webTargets) {
  if (Test-Path $wt) {
    Remove-Item -Path "$wt\*" -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    New-Item -ItemType Directory -Path $wt -Force | Out-Null
  }
  Copy-Item -Path "dist\*" -Destination $wt -Recurse -Force
  Write-Host "Synced web dist -> $wt"
}

Write-Host "=== Step 2: Build Windows Desktop Executable ==="
& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /target:winexe /out:SultanRestaurant.exe /win32icon:assets\sultan.ico /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll desktop_src\SultanRestaurant.cs
if ($LASTEXITCODE -ne 0) { throw "csc SultanRestaurant.exe failed" }

Copy-Item SultanRestaurant.exe -Destination "SultanRestaurant-App\SultanRestaurant.exe" -Force
Copy-Item SultanRestaurant.exe -Destination "SultanRestaurant-App\dist\SultanRestaurant.exe" -Force -ErrorAction SilentlyContinue
Copy-Item SultanRestaurant.exe -Destination "dist\SultanRestaurant.exe" -Force
if (Test-Path "C:\SultanRestaurant") {
  Copy-Item SultanRestaurant.exe -Destination "C:\SultanRestaurant\SultanRestaurant.exe" -Force
}

$java = "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot\bin\java.exe"
$bt = "$env:TEMP\android-build-tools\android-14"
$baseApk = if (Test-Path "$env:TEMP\sultan_aligned_v14.apk") { "$env:TEMP\sultan_aligned_v14.apk" } elseif (Test-Path "Sultan-POS-Tablet.apk") { "Sultan-POS-Tablet.apk" } else { "" }

if ((Test-Path $java) -and (Test-Path "$bt\zipalign.exe") -and (Test-Path "$env:TEMP\sultan-release-key.jks") -and ($baseApk -ne "")) {
  Write-Host "=== Step 3: Exporting Android Bundle & Patching APK to v26 ==="
  npx expo export -p android --output-dir dist-android
  if ($LASTEXITCODE -ne 0) { throw "expo export android failed" }

  $hbc = (Get-ChildItem -Path "dist-android\_expo\static\js\android\*.hbc" | Select-Object -First 1).FullName
  $unalignedApk = "$env:TEMP\sultan_unaligned_v26.apk"
  $alignedApk = "$env:TEMP\sultan_aligned_v26.apk"
  $signedApk = "$env:TEMP\Sultan-POS-Tablet-v26.apk"
  Remove-Item $unalignedApk, $alignedApk, $signedApk -Force -ErrorAction SilentlyContinue

  $fromVer = if ($baseApk -like "*v14*") { 14 } else { 25 }
  & $java scripts\PatchApk.java $baseApk $unalignedApk $hbc $fromVer 26
  if ($LASTEXITCODE -ne 0) { throw "PatchApk failed" }

  & "$bt\zipalign.exe" -p -f 4 $unalignedApk $alignedApk
  if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

  & $java -jar "$bt\lib\apksigner.jar" sign --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --ks "$env:TEMP\sultan-release-key.jks" --ks-key-alias sultanpos --ks-pass pass:sultan123 --key-pass pass:sultan123 --out $signedApk $alignedApk
  if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed" }

  $apkTargets = @(
    "Sultan-POS-Tablet.apk",
    "Updates\Sultan-POS-Tablet.apk",
    "SultanRestaurant-App\Sultan-POS-Tablet.apk",
    "SultanRestaurant-App\Updates\Sultan-POS-Tablet.apk"
  )
  if (Test-Path "C:\SultanRestaurant") {
    $apkTargets += "C:\SultanRestaurant\Sultan-POS-Tablet.apk"
    $apkTargets += "C:\SultanRestaurant\Updates\Sultan-POS-Tablet.apk"
  }
  foreach ($t in $apkTargets) {
    $dir = Split-Path -Parent $t
    if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -Path $signedApk -Destination $t -Force
    Write-Host "Copied APK -> $t"
  }
} else {
  Write-Host "Skipping APK patch (Android build tools temp dir not present); Web & EXE updated."
}

Write-Host "=== Build v26 Completed Successfully! ==="
