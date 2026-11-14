/**
 * 社媒发布任务专属沙箱与物料清单管理器 (Task Sandbox & Material Manifest Manager)
 * 遵循 specs/social-publisher-task-isolation-and-dedup.md
 * 核心目标：物理沙箱隔离，彻底杜绝静态重名文件覆盖、跨任务串台以及旧图冒充新图等错版事故。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Config, CoverRatio } from '../config.ts'
import { workspaceDir } from '../sync.ts'
import type {
  PhysicalIntegrityResult,
  SandboxedArticleMeta,
  SandboxedTargetGroup,
  TaskMaterialManifest,
  TaskSandboxContext,
} from './taskSandboxTypes.ts'
import {
  activeTasksBaseDir,
  archiveTasksBaseDir,
  taskSandboxRootDir,
} from './taskSandboxPaths.ts'

export {
  activeTasksBaseDir,
  archiveTasksBaseDir,
  taskSandboxRootDir,
}

export {
  calculateContentHash,
  calculateFileHash,
  calculateManifestFingerprint,
  calculateArticleFingerprint,
  sealTaskSandbox,
  verifyPhysicalFilesIntegrity,
  verifyReviewSignature,
} from './taskSandboxSignature.ts'
import { calculateFileHash, calculateManifestFingerprint, calculateArticleFingerprint } from './taskSandboxSignature.ts'
export {
  assertBuildArticleOrder,
  assertGenerateImagesOrder,
  ensurePipelineTracker,
  recordArticleWritten,
  recordImagesGenerated,
  resolveEffectivePipelineMode,
} from './taskSandboxPipelineGuard.ts'

export type {
  PhysicalIntegrityResult,
  SandboxedArticleMeta,
  SandboxedTargetGroup,
  TaskMaterialManifest,
  TaskSandboxContext,
}

/** 安全字符校验，严防路径穿透 */
export function assertSafeIdentifier(id: string, name = '标识符'): string {
  const trimmed = id.trim()
  if (!trimmed || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(trimmed)) {
    throw new Error(`非法${name}: ${id}`)
  }
  return trimmed
}

/**
 * 生成唯一任务 ID
 * 【中文修复依据】：规范化沙箱目录格式，注入日期时间、平台与账号标识符，方便历史检索与归档
 * 格式示例：task_20261024_223000_xiaohongshu_acc1_a9b1c2 或 task_20261024_223000_a9b1c2
 */
export function generateTaskId(targetPlatform?: string, targetAccountId?: string, sessionId?: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const rand = crypto.randomBytes(3).toString('hex')
  const cleanSession = sessionId ? sessionId.replace(/[^a-zA-Z0-9]/g, '') : ''
  const sessionPart = cleanSession ? `_s_${cleanSession.slice(-10)}` : ''
  const platformPart = targetPlatform ? `_${assertSafeIdentifier(targetPlatform, 'platform')}` : ''
  const accountPart = targetAccountId ? `_${assertSafeIdentifier(targetAccountId, 'accountId')}` : ''
  return `task_${dateStr}${sessionPart}${platformPart}${accountPart}_${rand}`
}



/** 读取指定任务的 Manifest */
export function readTaskManifest(cfg: Partial<Config> | undefined, taskId: string, workspacePath?: string): TaskMaterialManifest | null {
  const root = taskSandboxRootDir(cfg, taskId, workspacePath)
  const manifestFile = path.join(root, 'manifest.json')
  if (!fs.existsSync(manifestFile)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as TaskMaterialManifest
  } catch {
    return null
  }
}

/** 原子写入并持久化 Manifest */
export function writeTaskManifest(cfg: Partial<Config> | undefined, manifest: TaskMaterialManifest, workspacePath?: string): void {
  const root = taskSandboxRootDir(cfg, manifest.taskId, manifest.workspacePath || workspacePath)
  fs.mkdirSync(root, { recursive: true })
  const manifestFile = path.join(root, 'manifest.json')
  manifest.updatedAt = new Date().toISOString()
  const tmpFile = manifestFile + `.tmp_${Date.now()}`
  fs.writeFileSync(tmpFile, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  fs.renameSync(tmpFile, manifestFile)
}

/**
 * 创建或定位任务沙箱上下文 (TaskSandboxContext)
 * 具备自愈与幂等性：同一次任务内的各步骤（选题、写作、生图、校验、发布）共享同一沙箱。
 */
export function resolveTaskSandbox(
  cfg: Partial<Config> | undefined,
  requestedTaskId?: string,
  targetPlatform?: string,
  targetAccountId?: string,
  articleType: 'news' | 'newspic' = 'news',
  sessionId?: string,
  workspacePath?: string,
): TaskSandboxContext {
  const effectiveTaskId = requestedTaskId ? assertSafeIdentifier(requestedTaskId, 'taskId') : generateTaskId(targetPlatform, targetAccountId, sessionId)
  const platform = (targetPlatform || 'gzh').trim() as SandboxedTargetGroup['platform']
  const accountId = assertSafeIdentifier(targetAccountId || 'default', 'accountId')
  const targetKey = `${platform}_${accountId}`

  const rootDir = taskSandboxRootDir(cfg, effectiveTaskId, workspacePath)
  const manifestPath = path.join(rootDir, 'manifest.json')

  let manifest = readTaskManifest(cfg, effectiveTaskId, workspacePath)
  const now = new Date().toISOString()

  if (!manifest) {
    manifest = {
      version: 2,
      taskId: effectiveTaskId,
      createdAt: now,
      updatedAt: now,
      stage: 'initialized',
      workspacePath,
      targets: {},
    }
  }

  const targetDir = path.join(rootDir, targetKey)
  const articlesDir = path.join(targetDir, 'articles')
  const imagesDir = path.join(targetDir, 'images')

  fs.mkdirSync(articlesDir, { recursive: true })
  fs.mkdirSync(imagesDir, { recursive: true })
  // 规范化元数据目录
  const metaDir = path.join(rootDir, 'meta')
  fs.mkdirSync(metaDir, { recursive: true })

  if (!manifest.targets[targetKey]) {
    manifest.targets[targetKey] = {
      platform,
      accountId,
      articleType,
      targetDir,
      articlesDir,
      imagesDir,
      articles: [],
    }
    writeTaskManifest(cfg, manifest)
  }

  const targetGroup = manifest.targets[targetKey]

  return {
    cfg,
    taskId: effectiveTaskId,
    rootDir,
    manifestPath,
    manifest,
    targetKey,
    targetGroup,
    scriptsDir: targetDir,
    workspacePath,
  }
}

/**
 * 在沙箱中登记并落盘一篇文章（文案）
 */


export function writeSandboxedArticle(
  ctx: TaskSandboxContext,
  index: number,
  title: string,
  digest: string,
  format: 'html' | 'markdown' | 'text',
  content: string,
  fileName?: string,
): { filePath: string; contentHash: string; articleFingerprint?: string } {
  if (ctx.manifest.sealed) {
    throw new Error(`【沙箱发布冻结拦截】：任务沙箱 [${ctx.taskId}] 已封签锁定进入发布流程，严禁在发布过程中反向修改正文物料！`)
  }
  const ext = format === 'html' ? '.html' : format === 'markdown' ? '.md' : '_xhs.txt'
  const resolvedFileName = fileName || `article_v2_${index}${ext}`
  const filePath = path.join(ctx.targetGroup.articlesDir, resolvedFileName)

  fs.writeFileSync(filePath, content, 'utf-8')
  const contentHash = calculateFileHash(filePath)

  let art = ctx.targetGroup.articles.find(
    a => a.fileName === resolvedFileName || (a.index === index && a.fileName.endsWith('_pic.json') === resolvedFileName.endsWith('_pic.json')),
  )
  if (!art) {
    art = {
      index,
      title,
      digest,
      format,
      filePath,
      fileName: resolvedFileName,
      contentHash,
      contentImages: [],
    }
    ctx.targetGroup.articles.push(art)
  } else {
    art.title = title
    art.digest = digest
    art.format = format
    art.filePath = filePath
    art.fileName = resolvedFileName
    art.contentHash = contentHash
  }

  art.articleFingerprint = calculateArticleFingerprint(art)

  // 保证按篇序号升序排列
  ctx.targetGroup.articles.sort((a, b) => a.index - b.index)
  ctx.manifest.stage = 'content_ready'
  writeTaskManifest(ctx.cfg, ctx.manifest)

  return { filePath, contentHash, articleFingerprint: art.articleFingerprint }
}

/**
 * 在沙箱中登记一张专属新鲜配图（拒绝非当前沙箱的脏图）
 */
export function registerSandboxedImage(
  ctx: TaskSandboxContext,
  kind: 'cover' | 'content' | 'pic',
  index: number,
  sub: number | undefined,
  sourceImagePath: string,
  ratio: CoverRatio = '1:1',
  keyPlaceholder?: string,
): { targetPath: string; hash: string } {
  if (!fs.existsSync(sourceImagePath)) {
    throw new Error(`待登记图片不存在: ${sourceImagePath}`)
  }

  const ext = path.extname(sourceImagePath) || '.png'
  const targetName =
    kind === 'cover'
      ? `cover_${index}${ext}`
      : kind === 'pic'
        ? `pic_${index}_${sub || 1}${ext}`
        : `content_${index}_${sub || 1}${ext}`

  const targetPath = path.join(ctx.targetGroup.imagesDir, targetName)

  // 若源文件不在目标沙箱 images 目录内，则安全拷贝一份并断言隔离
  if (path.resolve(sourceImagePath) !== path.resolve(targetPath)) {
    fs.copyFileSync(sourceImagePath, targetPath)
  }

  // 【中文修复依据】：双向自愈物料桥：正本权威保存在 images/，同时维护根目录镜像副本，彻底杜绝消费端因层级不同报缺失
  const rootMirror = path.join(ctx.targetGroup.targetDir, targetName)
  if (path.resolve(rootMirror) !== path.resolve(targetPath)) {
    try {
      fs.copyFileSync(targetPath, rootMirror)
    } catch {}
  }

  const hash = calculateFileHash(targetPath)

  let art = ctx.targetGroup.articles.find(a => a.index === index)
  if (!art) {
    art = {
      index,
      title: `待定篇目_${index}`,
      digest: '',
      format: ctx.targetGroup.platform === 'gzh' ? 'html' : ctx.targetGroup.platform === 'xiaohongshu' ? 'text' : 'markdown',
      filePath: '',
      fileName: '',
      contentHash: '',
      contentImages: [],
    }
    ctx.targetGroup.articles.push(art)
  }

  if (kind === 'cover') {
    art.coverImage = {
      path: targetPath,
      fileName: targetName,
      hash,
      ratio,
    }
  } else {
    const existingIdx = art.contentImages.findIndex(ci => ci.sub === (sub || 1))
    const item = {
      sub: sub || 1,
      path: targetPath,
      fileName: targetName,
      hash,
      key: keyPlaceholder || `IMG_A${index}_${sub || 1}`,
    }
    if (existingIdx >= 0) {
      art.contentImages[existingIdx] = item
    } else {
      art.contentImages.push(item)
    }
    art.contentImages.sort((a, b) => a.sub - b.sub)
  }

  ctx.manifest.stage = 'images_ready'
  writeTaskManifest(ctx.cfg, ctx.manifest)

  return { targetPath, hash }
}

/**
 * 原子更新沙箱文章物理物料并重算 SHA-256 与任务签名指纹（所见即所得核心闭环）
 * 【修复原因与依据】：用户在前端 Studio 画布中就地编辑文案/标题/摘要后，必须安全写回沙箱磁盘真实文件，
 * 并重新生成 manifest.json 与签名指纹，彻底解决前端修改后后端仍推旧文案的“所见非所得”与哈希冲突问题。
 */
export function updateArticleAndResign(
  ctx: TaskSandboxContext,
  updates: {
    articleIndex: number
    title?: string
    digest?: string
    content?: string
  },
): {
  ok: boolean
  manifestFingerprint: string
  contentHash?: string
  title?: string
  digest?: string
  filePath?: string
} {
  if (ctx.manifest.sealed) {
    throw new Error(`【沙箱发布冻结拦截】：任务沙箱 [${ctx.taskId}] 已封签锁定进入发布流程，严禁反向修改！`)
  }
  const index = updates.articleIndex
  const art = ctx.targetGroup.articles.find(a => a.index === index)
  if (!art) {
    throw new Error(`沙箱中未找到序号为 ${index} 的待更新文章产物`)
  }

  if (typeof updates.title === 'string' && updates.title.trim()) {
    art.title = updates.title.trim()
  }
  if (typeof updates.digest === 'string') {
    art.digest = updates.digest.trim()
  }

  if (typeof updates.content === 'string') {
    const ext = art.format === 'html' ? '.html' : art.format === 'markdown' ? '.md' : '_xhs.txt'
    const fileName = art.fileName || `article_v2_${index}${ext}`
    const filePath = art.filePath && fs.existsSync(art.filePath) ? art.filePath : path.join(ctx.targetGroup.articlesDir, fileName)

    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, updates.content, 'utf-8')
    const newContentHash = calculateFileHash(filePath)

    art.filePath = filePath
    art.fileName = fileName
    art.contentHash = newContentHash
  }

  ctx.manifest.updatedAt = new Date().toISOString()
  const manifestFingerprint = calculateManifestFingerprint(ctx.manifest)
  writeTaskManifest(ctx.cfg, ctx.manifest, ctx.manifest.workspacePath)

  return {
    ok: true,
    manifestFingerprint,
    contentHash: art.contentHash,
    title: art.title,
    digest: art.digest,
    filePath: art.filePath,
  }
}

export {
  archiveTaskSandbox,
  getSandboxedArticlePath,
  getSandboxedImagePath,
  listTaskSandboxes,
  cleanupOrphanActiveSandboxes,
} from './taskSandboxArchive.ts'
export type { TaskSandboxSummary } from './taskSandboxArchive.ts'
