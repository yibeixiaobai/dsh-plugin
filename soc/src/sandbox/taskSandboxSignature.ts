/**
 * 任务沙箱防篡改签名、完整性物理校验与发布封签 (Task Sandbox Signature & Integrity Verifier)
 * 遵循 specs/social-publisher-task-isolation-and-dedup.md
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Config } from '../config.ts'
import type {
  PhysicalIntegrityResult,
  SandboxedArticleMeta,
  TaskMaterialManifest,
} from './taskSandboxTypes.ts'
import { taskSandboxRootDir } from './taskSandboxPaths.ts'

/** 计算文件内容的 SHA-256 校验和 */
export function calculateFileHash(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`无法计算哈希，文件不存在: ${filePath}`)
  }
  const buffer = fs.readFileSync(filePath)
  return 'sha256:' + crypto.createHash('sha256').update(buffer).digest('hex')
}

/** 计算字符串内容的 SHA-256 校验和 */
export function calculateContentHash(content: string | Buffer): string {
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex')
}

/** 计算单篇文章的独立防篡改指纹 */
export function calculateArticleFingerprint(article: SandboxedArticleMeta): string {
  const payload = {
    index: article.index,
    title: article.title,
    contentHash: article.contentHash,
    coverHash: article.coverImage?.hash,
    contentImageHashes: (article.contentImages || []).map(ci => ci.hash),
  }
  return 'art_' + crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)
}

/** 计算 Manifest 的防篡改签名指纹，并同步回填各篇独立指纹 */
export function calculateManifestFingerprint(manifest: TaskMaterialManifest): string {
  const digestPayload = {
    taskId: manifest.taskId,
    targets: Object.entries(manifest.targets).map(([key, grp]) => ({
      key,
      platform: grp.platform,
      accountId: grp.accountId,
      articleType: grp.articleType,
      articles: (grp.articles || []).map((a) => {
        const artFp = calculateArticleFingerprint(a)
        a.articleFingerprint = artFp
        return {
          index: a.index,
          title: a.title,
          contentHash: a.contentHash,
          coverHash: a.coverImage?.hash,
          contentImageHashes: (a.contentImages || []).map(ci => ci.hash),
          articleFingerprint: artFp,
        }
      }),
    })),
  }
  return 'sig_' + crypto.createHash('sha256').update(JSON.stringify(digestPayload)).digest('hex').slice(0, 32)
}

/**
 * 物理封签锁定任务沙箱 (Publish Seal)
 * 【修复原因与依据】：用户确认发布后沙箱物料进入不可变只读状态，
 * 严禁任何工具在发布过程中反向修改文案或配图，确保发布版本绝对权威一致。
 * 同时对沙箱所有文案文件设置操作系统级别的只读权限（0o444），使外部通用 Edit/Write 工具抛出硬性权限拦截。
 */
export function sealTaskSandbox(
  cfg: Partial<Config> | undefined,
  manifest: TaskMaterialManifest,
  workspacePath?: string,
): void {
  manifest.sealed = true
  manifest.updatedAt = new Date().toISOString()

  const root = taskSandboxRootDir(cfg, manifest.taskId, manifest.workspacePath || workspacePath)
  fs.mkdirSync(root, { recursive: true })
  const manifestFile = path.join(root, 'manifest.json')
  const tmpFile = manifestFile + `.tmp_${Date.now()}`
  fs.writeFileSync(tmpFile, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  fs.renameSync(tmpFile, manifestFile)

  // 中文注释：在操作系统层面将文案物理文件设置为只读（0o444），使任何外部通用 Edit/Write 工具的修改操作被操作系统硬性拦截
  try {
    for (const group of Object.values(manifest.targets || {})) {
      if (group?.articlesDir && fs.existsSync(group.articlesDir)) {
        for (const file of fs.readdirSync(group.articlesDir)) {
          const filePath = path.join(group.articlesDir, file)
          try {
            fs.chmodSync(filePath, 0o444)
          } catch {}
        }
      }
    }
  } catch {}
}

/**
 * 校验沙箱内真实磁盘物理文件的完整性（防磁盘篡改与替换）
 * 遍历排版正文、封面图与正文插图的实际磁盘文件，实时重新计算 SHA-256 并与 Manifest 比对
 */
export function verifyPhysicalFilesIntegrity(
  manifest: TaskMaterialManifest,
  targetKey?: string,
  targetArticleIndices?: number[],
): PhysicalIntegrityResult {
  const targets = targetKey ? [manifest.targets[targetKey]].filter(Boolean) : Object.values(manifest.targets)
  const mismatchedFiles: PhysicalIntegrityResult['mismatchedFiles'] = []
  const missingFiles: string[] = []

  for (const group of targets) {
    const articles = targetArticleIndices && targetArticleIndices.length > 0
      ? (group.articles || []).filter(a => targetArticleIndices.includes(a.index))
      : (group.articles || [])
    for (const art of articles) {
      // 1. 校验正文排版文件
      if (art.filePath) {
        if (!fs.existsSync(art.filePath)) {
          missingFiles.push(art.filePath)
        } else {
          try {
            const actual = calculateFileHash(art.filePath)
            if (actual !== art.contentHash) {
              mismatchedFiles.push({
                filePath: art.filePath,
                expectedHash: art.contentHash,
                actualHash: actual,
                fileKind: 'article',
              })
            }
          } catch {
            missingFiles.push(art.filePath)
          }
        }
      }

      // 2. 校验封面图
      if (art.coverImage?.path) {
        if (!fs.existsSync(art.coverImage.path)) {
          missingFiles.push(art.coverImage.path)
        } else {
          try {
            const actual = calculateFileHash(art.coverImage.path)
            if (actual !== art.coverImage.hash) {
              mismatchedFiles.push({
                filePath: art.coverImage.path,
                expectedHash: art.coverImage.hash,
                actualHash: actual,
                fileKind: 'cover',
              })
            }
          } catch {
            missingFiles.push(art.coverImage.path)
          }
        }
      }

      // 3. 校验正文插图
      for (const ci of art.contentImages || []) {
        if (ci.path) {
          if (!fs.existsSync(ci.path)) {
            missingFiles.push(ci.path)
          } else {
            try {
              const actual = calculateFileHash(ci.path)
              if (actual !== ci.hash) {
                mismatchedFiles.push({
                  filePath: ci.path,
                  expectedHash: ci.hash,
                  actualHash: actual,
                  fileKind: 'content_image',
                })
              }
            } catch {
              missingFiles.push(ci.path)
            }
          }
        }
      }
    }
  }

  return {
    valid: mismatchedFiles.length === 0 && missingFiles.length === 0,
    mismatchedFiles,
    missingFiles,
  }
}

/**
 * 校验审校签名一致性与磁盘物理完整性（发布防错版硬闸门）
 * 支持整批 Manifest 签名比对与按篇细粒度（Article-Level）签名比对
 */
export function verifyReviewSignature(
  manifest: TaskMaterialManifest,
  expectedSignedHash?: string,
  options?: {
    isDryRun?: boolean
    targetKey?: string
    targetArticleIndices?: number[]
    signedArticleHashes?: Record<number, string>
  },
): { valid: boolean; currentFingerprint: string; reason?: string } {
  const currentFingerprint = calculateManifestFingerprint(manifest)
  const isDryRun = Boolean(options?.isDryRun)
  const targetIndices = options?.targetArticleIndices
  const articleHashes = options?.signedArticleHashes

  // 1. 若提供了单篇签名指纹且指定了局部篇目，优先按单篇细粒度校验
  if (targetIndices && targetIndices.length > 0 && articleHashes && Object.keys(articleHashes).length > 0) {
    const targetGroup = options?.targetKey ? manifest.targets[options.targetKey] : Object.values(manifest.targets)[0]
    if (targetGroup) {
      for (const idx of targetIndices) {
        const art = (targetGroup.articles || []).find(a => a.index === idx)
        if (!art) {
          return {
            valid: false,
            currentFingerprint,
            reason: `【单篇审校拦截】：沙箱中未找到待发布的第 ${idx} 篇文章元数据！`,
          }
        }
        const expectedArtHash = articleHashes[idx]
        const actualArtHash = calculateArticleFingerprint(art)
        if (!expectedArtHash || expectedArtHash !== actualArtHash) {
          return {
            valid: false,
            currentFingerprint,
            reason: `第 ${idx} 篇文章审校签名不匹配！预期 [${expectedArtHash || '无'}]，当前计算为 [${actualArtHash}]。该稿件在审校后可能被外界修改。`,
          }
        }
      }
    }
  } else {
    // 2. 传统全量批次指纹校验
    if (!isDryRun && !expectedSignedHash) {
      return {
        valid: false,
        currentFingerprint,
        reason: '【发布防错版拦截】：正式发布必须携带人机审校确认指纹 (signed_manifest_hash)。严禁未审校发布！',
      }
    }

    if (expectedSignedHash && currentFingerprint !== expectedSignedHash) {
      return {
        valid: false,
        currentFingerprint,
        reason: `物料清单指纹不匹配！用户审校签名指纹为 [${expectedSignedHash}]，但当前沙箱物料指纹为 [${currentFingerprint}]。稿件可能在审校后被外界修改或重写，已触发防错版拦截！`,
      }
    }
  }

  // 3. 真实物理文件 SHA-256 完整性强重验（防磁盘文件偷换）
  const physicalRes = verifyPhysicalFilesIntegrity(manifest, options?.targetKey, targetIndices)
  if (!physicalRes.valid) {
    const details = []
    if (physicalRes.missingFiles.length > 0) {
      details.push(`缺失物料文件: ${physicalRes.missingFiles.join(', ')}`)
    }
    if (physicalRes.mismatchedFiles.length > 0) {
      details.push(
        `被篡改物料文件: ${physicalRes.mismatchedFiles.map(m => `${m.filePath} (预期 ${m.expectedHash.slice(0, 16)}..., 实际 ${m.actualHash.slice(0, 16)}...)`).join('; ')}`,
      )
    }
    return {
      valid: false,
      currentFingerprint,
      reason: `【物理物料防篡改拦截】：检测到沙箱内真实磁盘物料文件与审校清单哈希不一致！${details.join(' | ')}。已阻止向平台发布！`,
    }
  }

  return { valid: true, currentFingerprint }
}
