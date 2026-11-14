// 社媒发布防脱壳与工单明文落盘看门狗 (Anti-Dump & Recipe Protection Watchdog)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { CloudflareWorkerClient } from '../cf-worker/client.ts'

const RECIPE_LEAK_FILENAME_PATTERNS = [
  /decrypted_recipe/i,
  /recipe_ticket/i,
  /recipe_action/i,
  /cf_recipe/i,
]

const RECIPE_LEAK_CONTENT_KEYWORDS = [
  '"actions":',
  'PASTE_HTML',
  'WAIT_SELECTOR',
  'recipeId',
]

/**
 * 物理粉碎敏感文件（Zero-fill Shredding）
 * 先多次用伪随机字节/全0覆写，再截断并从文件系统彻底物理删除
 */
export function shredSensitiveFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) return false

    const size = Math.max(stat.size, 1024)
    const fd = fs.openSync(filePath, 'r+')

    // 第 1 遍：全 0 覆写
    fs.writeSync(fd, Buffer.alloc(size, 0), 0, size, 0)
    fs.fsyncSync(fd)

    // 第 2 遍：高熵随机数据覆写
    fs.writeSync(fd, crypto.randomBytes(size), 0, size, 0)
    fs.fsyncSync(fd)

    // 第 3 遍：再次全 0 覆写并截断为 0 字节
    fs.writeSync(fd, Buffer.alloc(size, 0), 0, size, 0)
    fs.ftruncateSync(fd, 0)
    fs.fsyncSync(fd)
    fs.closeSync(fd)

    // 从磁盘安全删除
    fs.unlinkSync(filePath)
    return true
  } catch (err) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {}
    return false
  }
}

/**
 * 检查文件名或内容是否命中工单明文泄露特征
 */
export function isRecipeDumpDetected(filename: string, content?: string): boolean {
  for (const pattern of RECIPE_LEAK_FILENAME_PATTERNS) {
    if (pattern.test(filename)) return true
  }
  if (content && typeof content === 'string') {
    let matchedKeywords = 0
    for (const kw of RECIPE_LEAK_CONTENT_KEYWORDS) {
      if (content.includes(kw)) matchedKeywords++
    }
    if (matchedKeywords >= 3) return true
  }
  return false
}

/**
 * 工作区看门狗：主动巡检并粉碎任何残留的明文工单文件，同时向云端上报违规
 */
export async function enforceAntiDumpScan(
  workspaceDir: string,
  cfClient?: CloudflareWorkerClient,
): Promise<{ shreddedCount: number; violations: string[] }> {
  const violations: string[] = []
  if (!workspaceDir || !fs.existsSync(workspaceDir)) {
    return { shreddedCount: 0, violations }
  }

  try {
    const files = fs.readdirSync(workspaceDir)
    for (const f of files) {
      if (!f.endsWith('.json') && !f.endsWith('.txt')) continue
      if (isRecipeDumpDetected(f)) {
        const fullPath = path.join(workspaceDir, f)
        const shredded = shredSensitiveFile(fullPath)
        if (shredded) {
          violations.push(f)
          console.warn(
            `🚨 [Anti-Dump Watchdog] 【严重安全策略阻断】：捕获到明文工单落盘文件「${f}」，已执行物理覆写粉碎！`,
          )
        }
      }
    }
  } catch {}

  // 异步向云端 Workers 上报脱壳审计事件
  if (violations.length > 0 && cfClient && typeof cfClient.reportVerifyResult === 'function') {
    try {
      await cfClient.reportVerifyResult({
        platform: 'all',
        status: 'security_violation',
        securityReason: `Workplace dump violation detected: shredded files [${violations.join(', ')}]`,
        timestamp: Date.now(),
      })
    } catch {}
  }

  return { shreddedCount: violations.length, violations }
}
