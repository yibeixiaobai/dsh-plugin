$ErrorActionPreference = 'Stop'

$root = 'D:\666\gzh\dsh-plugin'
$port = 3080
$stateDir = Join-Path $env:LOCALAPPDATA 'dsh-gzh-publisher'
$stateFile = Join-Path $stateDir 'web-url.txt'
$log = Join-Path $env:TEMP 'dsh-gzh-launch.log'

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

function Test-DshPort {
  try {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop)
  } catch {
    return $false
  }
}

function Test-SavedUrl {
  if (-not (Test-Path -LiteralPath $stateFile)) {
    return $null
  }

  $url = (Get-Content -LiteralPath $stateFile -Raw -ErrorAction SilentlyContinue).Trim()
  if ($url -notmatch '^http://127\.0\.0\.1:\d+/\?token=.+') {
    return $null
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      return $url
    }
  } catch {
    return $null
  }

  return $null
}

if (Test-DshPort) {
  $existingUrl = Test-SavedUrl
  if ($existingUrl) {
    Start-Process $existingUrl
    exit 0
  }

  Start-Process "http://127.0.0.1:$port/"
  exit 0
}

Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
$command = "cd /d `"$root`" && npx --yes @deepseek-ai/dsh web --port $port --no-open > `"$log`" 2>&1"
$process = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', $command `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

$url = $null
for ($i = 0; $i -lt 90 -and -not $url; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path -LiteralPath $log) {
    $content = Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue
    if ($content) {
      $match = [regex]::Match($content, 'http://127\.0\.0\.1:\d+/\?token=[^\s]+')
      if ($match.Success) {
        $url = $match.Value.TrimEnd('.', ',', ')')
      }
    }
  }
  if ($process.HasExited -and -not $url) {
    break
  }
}

if ($url) {
  Set-Content -LiteralPath $stateFile -Value $url -Encoding ascii
  Start-Process $url
  exit 0
}

Write-Host 'dsh 启动失败或未在预期时间内返回访问地址。'
if (Test-Path -LiteralPath $log) {
  Get-Content -LiteralPath $log -Tail 30
}
Read-Host '按 Enter 关闭'
