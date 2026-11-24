$ErrorActionPreference = 'Stop'

Write-Host "=== Step 1: Exporting Android bundle with Expo ==="
npx expo export -p android --output-dir dist-android
if ($LASTEXITCODE -ne 0) { throw "expo export android failed" }

$java = "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot\bin\java.exe"
$bt = "$env:TEMP\android-build-tools\android-14"
$baseApk = "$env:TEMP\sultan_aligned_v14.apk"
$hbc = (Get-ChildItem -Path "dist-android\_expo\static\js\android\*.hbc" | Select-Object -First 1).FullName
$unalignedApk = "$env:TEMP\sultan_unaligned_v23.apk"
$alignedApk = "$env:TEMP\sultan_aligned_v23.apk"
$signedApk = "$env:TEMP\Sultan-POS-Tablet-v23.apk"

Remove-Item $unalignedApk, $alignedApk, $signedApk -Force -ErrorAction SilentlyContinue

Write-Host "=== Step 2: Patching APK to v23 ==="
& $java scripts\PatchApk.java $baseApk $unalignedApk $hbc 14 23
if ($LASTEXITCODE -ne 0) { throw "PatchApk failed" }

Write-Host "=== Step 3: zipalign -p -f 4 ==="
& "$bt\zipalign.exe" -p -f 4 $unalignedApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "=== Step 4: apksigner sign ==="
& $java -jar "$bt\lib\apksigner.jar" sign --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --ks "$env:TEMP\sultan-release-key.jks" --ks-key-alias sultanpos --ks-pass pass:sultan123 --key-pass pass:sultan123 --out $signedApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed" }

Write-Host "=== Step 5: Verify APK ==="
$badgingOut = & "$bt\aapt2.exe" dump badging $signedApk 2>&1
Write-Host "Header:" ($badgingOut | Select-Object -First 2 | Out-String).Trim()

$apkTargets = @(
  "Sultan-POS-Tablet.apk",
  "Updates\Sultan-POS-Tablet.apk",
  "C:\SultanRestaurant\Sultan-POS-Tablet.apk",
  "C:\SultanRestaurant\Updates\Sultan-POS-Tablet.apk",
  "SultanRestaurant-App\Sultan-POS-Tablet.apk",
  "SultanRestaurant-App\Updates\Sultan-POS-Tablet.apk"
)
foreach ($t in $apkTargets) {
  $dir = Split-Path -Parent $t
  if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Copy-Item -Path $signedApk -Destination $t -Force
  Write-Host "Copied APK -> $t"
}

Write-Host "=== Step 6: Export Web Bundle ==="
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

Write-Host "=== Step 7: Build Windows Desktop Executable ==="
& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /target:winexe /out:SultanRestaurant.exe /win32icon:assets\sultan.ico /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll desktop_src\SultanRestaurant.cs
if ($LASTEXITCODE -ne 0) { throw "csc SultanRestaurant.exe failed" }

Copy-Item SultanRestaurant.exe -Destination "C:\SultanRestaurant\SultanRestaurant.exe" -Force
Copy-Item SultanRestaurant.exe -Destination "SultanRestaurant-App\SultanRestaurant.exe" -Force
Copy-Item SultanRestaurant.exe -Destination "dist\SultanRestaurant.exe" -Force

Write-Host "=== Build Completed Successfully! ==="
