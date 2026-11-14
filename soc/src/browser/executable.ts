import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import puppeteer, { type Browser } from 'puppeteer-core'
import {
  acquireBrowserSlot,
  acquireProfileDirMutex,
  acquireProfileLock,
  releaseProfileLock,
} from './concurrency.ts'
import { attachStealthScripts } from '../stealth/stealthEngine.ts'

const execFileAsync = promisify(execFile)

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
    : '',
  process.env.PROGRAMFILES
    ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe')
    : '',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    : '',
  process.env.PROGRAMFILES
    ? path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    : '',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
]

/**
 * 探测本地已安装的 Chrome / Edge 可执行文件路径
 */
export function findBrowserExecutable(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return customPath
  }
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }
  throw new Error('未找到本机可用的 Chrome 或 Edge 浏览器，请在配置中指定 chrome_path')
}

/**
 * 清除 Chrome/Chromium 残留的 SingletonLock 等锁文件
 */
export function cleanStaleChromeLocks(userDataDir: string): void {
  try {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']
    for (const file of lockFiles) {
      const lockPath = path.join(userDataDir, file)
      if (fs.existsSync(lockPath)) {
        try {
          fs.unlinkSync(lockPath)
        } catch {}
      }
    }
  } catch {}
}

/**
 * 终止占用该 profileDir 的孤儿浏览器进程
 */
export async function killStaleBrowserProcessesForDir(userDataDir: string): Promise<number> {
  let count = 0
  const normalized = path.resolve(userDataDir)
  if (process.platform === 'win32') {
    try {
      const escaped = normalized.replace(/\\/g, '\\\\')
      const cmd = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${escaped}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }`
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', cmd])
      const pids = stdout.trim().split(/\r?\n/).filter(Boolean)
      count = pids.length
    } catch {}
  }
  return count
}

export interface SafeLaunchOptions {
  executablePath?: string
  headless?: boolean
  userDataDir: string
  defaultViewport?: { width: number; height: number } | null
  protocolTimeout?: number
  args?: string[]
  platformDisplayName?: string
}

/**
 * 安全启动无头/有头浏览器实例，具备并发槽位控制与防锁死兜底
 */
export async function launchBrowserSafely(options: SafeLaunchOptions): Promise<Browser> {
  const {
    executablePath,
    headless = true,
    userDataDir,
    defaultViewport = { width: 1440, height: 900 },
    protocolTimeout = 240000,
    args = [],
    platformDisplayName = '浏览器',
  } = options

  const normalizedDir = path.resolve(userDataDir)
  fs.mkdirSync(normalizedDir, { recursive: true })

  // 申请执行槽位与互斥锁
  const releaseSlot = await acquireBrowserSlot({ platformDisplayName })
  const releaseDirMutex = await acquireProfileDirMutex(normalizedDir)
  const lockHandle = await acquireProfileLock(normalizedDir)

  cleanStaleChromeLocks(normalizedDir)

  const finalExecPath = executablePath || findBrowserExecutable()
  const mergedArgs = Array.from(
    new Set([
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
      ...(headless ? ['--window-size=1440,900'] : ['--start-maximized']),
      ...args,
    ])
  )

  try {
    const browser = await puppeteer.launch({
      executablePath: finalExecPath,
      headless,
      userDataDir: normalizedDir,
      defaultViewport: headless ? defaultViewport : null,
      protocolTimeout,
      args: mergedArgs,
    })

    // 监听初次创建页面，自动注入防反爬 Stealth 脚本
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        const page = await target.page()
        if (page) {
          await attachStealthScripts(page).catch(() => {})
        }
      }
    })

    // 释放锁清理
    const origClose = browser.close.bind(browser)
    browser.close = async () => {
      try {
        await origClose()
      } finally {
        await releaseProfileLock(lockHandle).catch(() => {})
        releaseDirMutex()
        releaseSlot()
      }
    }

    return browser
  } catch (err) {
    await releaseProfileLock(lockHandle).catch(() => {})
    releaseDirMutex()
    releaseSlot()
    throw err
  }
}
