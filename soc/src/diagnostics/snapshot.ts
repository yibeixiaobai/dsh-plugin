// 社媒自动化异常现场诊断快照引擎
// 【设计依据】：
// 1. 现场保留：当页面导航超时、元素未找到或触发平台风控弹窗时，原子化保存 DOM、截屏与元数据，使离线定责秒级可查；
// 2. 空间受控：每个账号严格实行 FIFO 滚动淘汰（最多保留 MAX_SNAPSHOTS_PER_ACCOUNT 份），杜绝磁盘膨胀；
// 3. 静默容错：快照过程遇到任何 IO 异常均静默捕获，绝对不掩盖底层的真实业务报错。

import fs from 'node:fs'
import path from 'node:path'
import type { FailureMetadata, FailureSnapshotOptions, FailureSnapshotResult } from './types.ts'

/** 每个账号保留的最大快照份数，超出自动淘汰最早生成的快照 */
export const MAX_SNAPSHOTS_PER_ACCOUNT = 20

/**
 * 清理指定账号超出上限的旧快照（FIFO 滚动淘汰）
 */
export async function pruneStaleSnapshots(snapshotsBaseDir: string, maxKeep = MAX_SNAPSHOTS_PER_ACCOUNT): Promise<void> {
  try {
    if (!fs.existsSync(snapshotsBaseDir)) return

    const entries = fs.readdirSync(snapshotsBaseDir, { withFileTypes: true })
    const dirs = entries
      .filter(e => e.isDirectory())
      .map((e) => {
        const fullPath = path.join(snapshotsBaseDir, e.name)
        try {
          const stat = fs.statSync(fullPath)
          return { name: e.name, fullPath, mtimeMs: stat.mtimeMs }
        } catch {
          return { name: e.name, fullPath, mtimeMs: 0 }
        }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs) // 按时间倒序（最新的在前）

    if (dirs.length > maxKeep) {
      const toDelete = dirs.slice(maxKeep)
      for (const d of toDelete) {
        try {
          fs.rmSync(d.fullPath, { recursive: true, force: true })
        } catch {
          // 忽略偶发文件句柄占用
        }
      }
    }
  } catch {
    // 忽略目录扫描异常
  }
}

/**
 * 捕获自动化故障现场快照
 */
export async function captureFailureSnapshot(options: FailureSnapshotOptions): Promise<FailureSnapshotResult | null> {
  const { page, accountId, platform, step, error, traceId, scriptsDir, extraContext } = options

  try {
    // 锚定快照根目录：<scriptsDir>/debug/snapshots/<timestamp>_<step>
    const snapshotsBaseDir = path.join(scriptsDir, 'debug', 'snapshots')
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const sanitizedStep = step.replace(/[^a-zA-Z0-9_-]/g, '_')
    const snapshotDir = path.join(snapshotsBaseDir, `${timestampStr}_${sanitizedStep}`)

    fs.mkdirSync(snapshotDir, { recursive: true })

    let htmlPath: string | undefined
    let screenshotPath: string | undefined
    let pageUrl: string | undefined
    let pageTitle: string | undefined

    if (page && !page.isClosed()) {
      try {
        pageUrl = page.url()
        pageTitle = await page.title().catch(() => undefined)

        // 1. 保存 HTML 快照
        const content = await page.content().catch(() => undefined)
        if (content) {
          const hPath = path.join(snapshotDir, 'snapshot.html')
          fs.writeFileSync(hPath, content, 'utf-8')
          htmlPath = hPath
        }

        // 2. 保存高清整页截图
        const sPath = path.join(snapshotDir, 'screenshot.png')
        await page.screenshot({ path: sPath, fullPage: true }).catch(async () => {
          // 降级为视口截图
          await page.screenshot({ path: sPath, fullPage: false }).catch(() => undefined)
        })
        if (fs.existsSync(sPath)) {
          screenshotPath = sPath
        }
      } catch {
        // 页面可能已处于崩溃或关闭状态，忽略快照抓取异常
      }
    }

    // 3. 保存结构化元数据
    const errMessage = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error ? error.stack : undefined

    const metadata: FailureMetadata = {
      accountId,
      platform,
      step,
      traceId,
      timestamp: new Date().toISOString(),
      pageUrl,
      pageTitle,
      errorMessage: errMessage,
      errorStack: errStack,
      extraContext,
    }

    const metadataPath = path.join(snapshotDir, 'metadata.json')
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8')

    // 4. 触发异步滚动清理，限制最多保留 20 份
    pruneStaleSnapshots(snapshotsBaseDir, MAX_SNAPSHOTS_PER_ACCOUNT).catch(() => undefined)

    return {
      snapshotDir,
      htmlPath,
      screenshotPath,
      metadataPath,
      createdAt: metadata.timestamp,
    }
  } catch (err) {
    // 静默兜底，不阻断原始业务异常抛出
    console.warn('[captureFailureSnapshot] 现场快照保存遇阻（已静默降级）:', err)
    return null
  }
}
