# launch-dsh.ps1 — 启动 / 重启 DeepSeek Harness 公众号工作台
#
# 每次双击都先关掉正在运行的 dsh web 实例（$port 上的监听者及其 npx/cmd 包装
# 进程），再拉起一个全新的实例并打开浏览器。所以重复启动 = 重启，永远不会出现
# “端口被旧实例占着，新实例起不来”或“开了一堆重复服务”的情况。

$ErrorActionPreference = 'Stop'

$root = 'D:\666\gzh\dsh-plugin'
$port = 3080
$stateDir = Join-Path $env:LOCALAPPDATA 'dsh-gzh-publisher'
$stateFile = Join-Path $stateDir 'web-url.txt'
$log = Join-Path $env:TEMP 'dsh-gzh-launch.log'
$waitForExitSeconds = 20

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

function Get-PortOwnerPid {
  @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ })
}

function Test-DshPort {
  (Get-PortOwnerPid).Count -gt 0
}

function Test-IsDshProcess {
  param($Process)
  if (-not $Process -or -not $Process.CommandLine) { return $false }
  if ($Process.CommandLine -match '@deepseek-ai[\\/]dsh') { return $true }
  return ($Process.Name -eq 'node.exe') -and ($Process.CommandLine -match '(?i)\bdsh\b')
}

function Get-DshWebTargets {
  # 正在运行的这套实例包含：占用 $port 的 dsh 服务端、其它 dsh web 的 node
  # 进程，以及拉起它们的 npx / cmd 包装链。非 dsh 的端口占用者一律不动。
  # 全表枚举 Win32_Process 在进程多的机器上要好几秒；dsh 目标只可能挂在
  # node / cmd / conhost 下，按名字过滤后 WMI 查询快一个数量级。
  $table = @{}
  $procQuery = "SELECT ProcessId, ParentProcessId, Name, CommandLine FROM Win32_Process WHERE Name='node.exe' OR Name='cmd.exe' OR Name='conhost.exe'"
  foreach ($proc in Get-CimInstance -Query $procQuery -ErrorAction SilentlyContinue) {
    $table[[int]$proc.ProcessId] = $proc
  }

  $ids = New-Object 'System.Collections.Generic.HashSet[int]'

  foreach ($procId in Get-PortOwnerPid) {
    $proc = $table[[int]$procId]
    if (Test-IsDshProcess $proc) { [void]$ids.Add([int]$procId) }
  }

  foreach ($proc in $table.Values) {
    if ($proc.Name -ne 'node.exe') { continue }
    if (-not (Test-IsDshProcess $proc)) { continue }
    if ($proc.CommandLine -notmatch '(?i)(^|[\s"])web([\s"]|$)') { continue }
    # 明确跑在别的端口上的 dsh web 不是这个工作台，不动它。
    $explicit = [regex]::Match($proc.CommandLine, '(?i)--port[=\s]+(\d+)')
    if ($explicit.Success -and [int]$explicit.Groups[1].Value -ne $port) { continue }
    [void]$ids.Add([int]$proc.ProcessId)
  }

  foreach ($procId in @($ids)) {
    $cursor = $table[$procId]
    for ($depth = 0; $depth -lt 4 -and $cursor; $depth++) {
      $parent = $table[[int]$cursor.ParentProcessId]
      if (-not $parent) { break }
      if (-not $parent.CommandLine) { break }
      if ($parent.Name -notin @('cmd.exe', 'node.exe', 'conhost.exe')) { break }
      if ($parent.CommandLine -notmatch '@deepseek-ai[\\/]dsh') { break }
      [void]$ids.Add([int]$parent.ProcessId)
      $cursor = $parent
    }
  }

  @($ids)
}

function Wait-DshPortFree {
  param([int]$Seconds)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-DshPort)) { return $true }
    Start-Sleep -Milliseconds 400
  }
  return (-not (Test-DshPort))
}

function Stop-DshWeb {
  # 返回 $true 表示确实关掉了一个旧实例。
  $targets = Get-DshWebTargets
  if ($targets.Count -eq 0) {
    if (Test-DshPort) {
      Write-Host "端口 $port 被非 dsh 进程占用，跳过关闭：$(Get-PortOwnerPid -join ', ')"
    }
    return $false
  }

  Write-Host "关闭正在运行的 dsh 实例（PID: $($targets -join ', ')）…"
  foreach ($procId in @($targets | Sort-Object -Descending)) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }

  if (-not (Wait-DshPortFree -Seconds $waitForExitSeconds)) {
    foreach ($procId in Get-PortOwnerPid) {
      Write-Host "端口 $port 仍被 PID $procId 占用，强制结束进程树…"
      & taskkill.exe /PID $procId /T /F 2>&1 | Out-Null
    }
    [void](Wait-DshPortFree -Seconds 5)
  }

  return $true
}

# ---------------------------------------------------------------- 关闭旧实例
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$restarted = Stop-DshWeb
Write-Host ("关闭旧实例耗时 {0:N1}s" -f $sw.Elapsed.TotalSeconds)

if (Test-DshPort) {
  Write-Host "端口 $port 仍被占用，无法启动新实例。"
  Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize | Out-String | Write-Host
  Read-Host '按 Enter 关闭'
  exit 1
}

# 旧 token 随旧进程失效，留着只会让浏览器打开一个 401 页面。
Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue

# ---------------------------------------------------------------- 启动新实例
Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
$command = "cd /d `"$root`" && npx --yes @deepseek-ai/dsh web --port $port --no-open > `"$log`" 2>&1"
$process = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', $command `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

$url = $null
$candidate = $null
for ($i = 0; $i -lt 90 -and -not $url; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path -LiteralPath $log) {
    $content = Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue
    if ($content) {
      # 日志行可能写了一半就被读到，截断的 token 会让浏览器拿到 401。
      # token 限 base64url 且至少 32 位，并要求两次轮询结果一致才采信。
      $match = [regex]::Match($content, 'http://127\.0\.0\.1:\d+/\?token=[A-Za-z0-9_-]{32,}')
      if ($match.Success) {
        $found = $match.Value.TrimEnd('.', ',', ')')
        if ($found -eq $candidate) {
          $url = $found
        } else {
          $candidate = $found
        }
      }
    }
  }
  if ($process.HasExited -and -not $url) {
    break
  }
}

if ($url) {
  $sw.Stop()
  Write-Host ("启动新实例耗时 {0:N1}s" -f $sw.Elapsed.TotalSeconds)
  Set-Content -LiteralPath $stateFile -Value $url -Encoding ascii
  if ($restarted) { Write-Host '已重启，正在打开浏览器…' } else { Write-Host '正在打开浏览器…' }
  Start-Process $url
  exit 0
}

Write-Host 'dsh 启动失败或未在预期时间内返回访问地址。'
if (Test-Path -LiteralPath $log) {
  Get-Content -LiteralPath $log -Tail 30
}
Read-Host '按 Enter 关闭'
exit 1
