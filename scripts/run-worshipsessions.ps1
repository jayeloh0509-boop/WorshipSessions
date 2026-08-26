$ErrorActionPreference = 'Continue'
$root = 'C:\Users\jayel\WorshipSessions'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$server = Join-Path $root 'server.js'
$frontend = Join-Path $root 'frontend'
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

while ($true) {
  $existing = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($server) }
  if ($existing) {
    Start-Sleep -Seconds 10
    continue
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $stdout = Join-Path $logDir "server-$stamp.out.log"
  $stderr = Join-Path $logDir "server-$stamp.err.log"

  # Rebuild the ignored production assets before every server launch so the
  # service cannot come back serving an old frontend bundle after a restart.
  & $npm --prefix $frontend run build *>> (Join-Path $logDir "build-$stamp.log")
  if ($LASTEXITCODE -ne 0) {
    Start-Sleep -Seconds 30
    continue
  }

  $child = Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  $child.WaitForExit()
  Start-Sleep -Seconds 5
}
