import { getGlobalPublisherConfigFiles, getGlobalAccountsDir } from '../wincodeHome.ts'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ToolContentBlock } from '../tool-compat.ts'
import type { AccountProfile, Config, ThemeKey } from '../config.ts'
import { THEME_KEYS } from '../config.ts'
import { pipelineDir, runPython, runtimeResourceDir } from '../py.ts'
import { tryExecuteNativePipeline } from '../engine/index.ts'
import {
  accountScriptsDir,
  assertImageCreds,
  assertWechatCreds,
  brandDir,
  configuredAccountIds,
  scriptsDir,
  workspaceDir,
} from '../sync.ts'

export {
  accountScriptsDir,
  assertImageCreds,
  assertWechatCreds,
  brandDir,
  configuredAccountIds,
  scriptsDir,
  workspaceDir,
}
export { runtimeResourceDir }
import {
  recordActiveWorkspace,
  getActiveWorkspace,
  isDryRunEnabledInSettings,
  resolveEffectiveImageApi,
} from './settingsEvaluator.ts'
export {
  recordActiveWorkspace,
  getActiveWorkspace,
  isDryRunEnabledInSettings,
  resolveEffectiveImageApi,
}

/**
 * 实时探测演练模式 (Dry Run)：
 * 1. 若调用参数中显式指定了 dry_run，以参数为准；
 * 2. 若传入的内存对象中已配置 dry_run: true，立即生效；
 * 3. 实时探测磁盘主配置文件（用户全局 ~/.wincode/... 与当前工作区 publisher_config.json、wx_config.json），
 *    防止前端设置刚刚修改但当前会话内存配置未热重载时误跑实盘扣费或真实外发。
 */
export function detectRealtimeDryRun(
  cfg: Partial<Config> | undefined,
  argDryRun?: boolean,
): boolean {
  // 严格遵守用户铁律：若设置中未显式开启演练模式，物理绝对阻断走入演练
  const inSettings = isDryRunEnabledInSettings(cfg)
  if (!inSettings) {
    return false
  }
  if (argDryRun !== undefined) {
    return Boolean(argDryRun)
  }
  return true
}

export const CACHE_FILE = 'uploaded_urls.json'
export const RESULT_FILE = 'publish_result.json'
export const HISTORY_FILE = 'publish_history.json'
export const MEDIA_ID_FILE = 'draft_media_id.txt'

export function pyBase(cfg: Config) {
  return { pythonPath: cfg.runtime.python_path || 'python', cwd: workspaceDir(cfg) }
}

/** 运行 pipeline/ 下的参数化入口；零外部依赖优先直通 Native TS 引擎 */
export async function runPipeline<T>(
  cfg: Config,
  script: string,
  args: string[],
  minTimeoutMs: number,
): Promise<T> {
  // 核心零外部依赖守护：优先由 Native TS 纯代码引擎执行，彻底避免依赖宿主系统 Python
  const nativeRes = await tryExecuteNativePipeline<T>(script, args)
  if (nativeRes.handled) {
    if (nativeRes.error) {
      throw new Error(nativeRes.error)
    }
    if (nativeRes.data !== undefined) {
      return nativeRes.data
    }
  }

  const r = await runPython<T>({
    ...pyBase(cfg),
    script: path.join(pipelineDir(), script),
    args,
    timeoutMs: Math.max(minTimeoutMs, (cfg.runtime?.request_timeout_ms || 30000) * 2),
  })
  if (!r.ok || r.data === undefined) {
    const logs = r.logs.length ? '\n--- Python 最近输出 ---\n' + r.logs.slice(-8).join('\n') : ''
    // Python 已返回结构化结果但 ok=false 时，把 data 一并带出，避免报成误导性的「未返回结果」
    const detail = r.data !== undefined ? '\n--- Python 结果 ---\n' + JSON.stringify(r.data) : ''
    throw new Error(String(r.error ?? 'Python 未返回结果') + logs + detail)
  }
  return r.data
}

/**
 * 把 job JSON 落到临时文件，返回可直接交给 Python 的 `--job` 参数。
 *
 * 为什么不再走 `--job-json` 内联：Windows 命令行总长上限 32767 字符，而发布 job 里带着
 * 整个上传缓存（uploaded_urls.json，随发布次数单调增长），长文分支还要加上全部封面/正文图
 * 绝对路径，越界后 spawn 直接抛 ENAMETOOLONG。落盘后 argv 只剩一个短路径，彻底消除上限。
 * Python 侧 `--job` 已有目录边界守卫（normpath + startswith），文件写在 baseDir 内。
 */
export function writeJobFile(
  baseDir: string,
  job: unknown,
  tag: string,
): { dir: string; name: string; file: string } {
  const dir = path.resolve(baseDir)
  fs.mkdirSync(dir, { recursive: true })
  const name = `.job_${tag}_${randomUUID()}.json`
  const file = path.join(dir, name)
  fs.writeFileSync(file, JSON.stringify(job), 'utf-8')
  return { dir, name, file }
}

/** 删除 writeJobFile 产生的临时 job 文件（best-effort，不影响主流程） */
export function removeJobFile(dir: string, name: string): void {
  try {
    fs.rmSync(path.join(dir, name), { force: true })
  } catch {
    /* 临时文件清理失败不阻断发布 */
  }
}

/** 在 baseDir 内写入白名单文件名的文本文件（目录边界守卫） */
export function writeTextFile(baseDir: string, name: string, content: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('非法文件名: ' + name)
  const base = path.resolve(baseDir)
  const p = path.resolve(base, name)
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error('路径越界: ' + name)
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(p, content, 'utf-8')
  return p
}

/** scripts 目录内的图片按 jpg/png/webp 后缀探测（支持同级及 images/ 子目录穿透查找） */
export function findImage(dir: string, base: string): string {
  const candidateDirs = [dir.endsWith('images') ? dir : path.join(dir, 'images'), dir]
  for (const cDir of candidateDirs) {
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
      const p = path.resolve(cDir, base + ext)
      if (fs.existsSync(p)) return p
    }
  }
  throw new Error(`缺少图片文件（请先运行 gzh_generate_images）: ${base} (检索目录: ${candidateDirs.join(', ')})`)
}

/** 文章正文文件按 html/json 后缀探测（优先 articles/ 权威目录） */
export function findArticleFile(dir: string, fileName: string): string {
  const candidateDirs = [dir.endsWith('articles') ? dir : path.join(dir, 'articles'), dir]
  for (const cDir of candidateDirs) {
    const p = path.resolve(cDir, fileName)
    if (fs.existsSync(p)) return p
  }
  return path.resolve(dir, fileName)
}

export function readUploadCache(cfg: Config, accountId: string): Record<string, string> {
  try {
    return JSON.parse(
      fs.readFileSync(path.resolve(accountScriptsDir(cfg, accountId), CACHE_FILE), 'utf-8'),
    ) as Record<string, string>
  } catch {
    return {}
  }
}

export function writeUploadCache(
  cfg: Config,
  accountId: string,
  cache: Record<string, string>,
): void {
  writeTextFile(
    accountScriptsDir(cfg, accountId),
    CACHE_FILE,
    JSON.stringify(cache, null, 2) + '\n',
  )
}

/** Resolve a configured brand image inside brand_assets; absolute paths outside are rejected. */
export function brandImagePath(
  cfg: Config,
  file: string,
  fallback: string,
  accountId?: string,
): string {
  const targetAccount = (accountId || cfg.default_account || Object.keys(cfg.accounts || {})[0] || 'default').trim()
  const fileName = path.basename((file || fallback).trim())
  if (!fileName) throw new Error('品牌图文件名不能为空')

  // 1. 若传入的是存在的绝对路径且符合图片格式
  if (file && path.isAbsolute(file) && fs.existsSync(file)) {
    return file
  }

  // 2. 严格优先探测当前账号专属目录
  const accCandidate = path.resolve(getGlobalAccountsDir(), targetAccount, 'brand_assets', fileName)
  if (fs.existsSync(accCandidate)) return accCandidate

  const localAccCandidate = path.resolve(
    workspaceDir(cfg),
    'accounts',
    targetAccount,
    'brand_assets',
    fileName,
  )
  if (fs.existsSync(localAccCandidate)) return localAccCandidate

  // 3. 历史相对路径兼容：若参数携带了 accounts/<acc>/brand_assets/
  if (file && (file.includes('/') || file.includes('\\'))) {
    const rawLocal = path.resolve(workspaceDir(cfg), file)
    if (fs.existsSync(rawLocal)) return rawLocal
  }

  // 4. [中文修复依据]：彻底取消全局可变公共目录回退，仅允许只读回落至插件出厂不可变底图模板
  const defaultFallbackName = fallback.includes('top') || fallback.includes('header') ? 'brand_top.jpg' : 'brand_bot.jpg'
  const inRepoDefault = path.resolve(
    process.cwd(),
    'apps/wincode-cli/packages/social-publisher-plugin/runtime/default-brand',
    defaultFallbackName,
  )
  if (fs.existsSync(inRepoDefault)) return inRepoDefault

  const runtimeDefault = path.resolve(
    runtimeResourceDir(),
    'default-brand',
    defaultFallbackName,
  )
  if (fs.existsSync(runtimeDefault)) return runtimeDefault

  return localAccCandidate
}

export function expectedBrandImageCount(account: AccountProfile): number {
  return (
    (account.brand_images.header.enabled ? 1 : 0) + (account.brand_images.footer.enabled ? 1 : 0)
  )
}

/** 每篇正文配图数：支持自适应与自定义分别设定 AI 和搜图数量，缺省取全局设置（0-4） */
export function contentImagesPerArticle(cfg: Config, account?: AccountProfile): number {
  const content = account?.content
  if (content?.image_count_mode === 'custom') {
    const ai = Number(content?.ai_images_per_article)
    const search = Number(content?.search_images_per_article)
    if (Number.isFinite(ai) || Number.isFinite(search)) {
      const sum =
        (Number.isFinite(ai) ? Math.max(0, ai) : 0) +
        (Number.isFinite(search) ? Math.max(0, search) : 0)
      return Math.max(0, Math.min(4, Math.floor(sum)))
    }
  }
  const accountVal = content?.content_images_per_article
  const raw = Number.isFinite(accountVal)
    ? Number(accountVal)
    : Number(cfg.image_api?.content_images_per_article)
  return Number.isFinite(raw) ? Math.max(0, Math.min(4, Math.floor(raw))) : 2
}



export function expectedArticleImageCount(cfg: Config, account: AccountProfile): number {
  return contentImagesPerArticle(cfg, account) + expectedBrandImageCount(account)
}

/** 按篇解析主题：优先读取账号专属排版规则（第 1 篇头条主题，次条指定主题或按篇轮换） */
export function resolveTheme(cfg: Config, index: number, account?: AccountProfile): ThemeKey {
  const headline = account?.content?.headline_theme || cfg.typography?.headline_theme
  if (index <= 1) {
    return THEME_KEYS.includes(headline as ThemeKey) ? (headline as ThemeKey) : 'wenying'
  }
  const secondary =
    account?.content?.secondary_theme || cfg.typography?.secondary_theme || 'rotate'
  if (secondary !== 'rotate' && THEME_KEYS.includes(secondary as ThemeKey)) {
    return secondary as ThemeKey
  }
  const pool = THEME_KEYS
  return pool[(((index - 1) % pool.length) + pool.length) % pool.length]
}

/** 解析封面比例：优先按账号专属配图规则，缺省取全局设置 */
export function resolveCoverRatio(
  cfg: Config,
  index: number,
  account?: AccountProfile,
): import('../config.ts').CoverRatio {
  if (index <= 1) {
    return (
      account?.content?.headline_cover_ratio || cfg.image_api?.headline_cover_ratio || '2.35:1'
    )
  }
  return account?.content?.secondary_cover_ratio || cfg.image_api?.secondary_cover_ratio || '1:1'
}

/** 解析正文排版样式：优先按账号专属配置，缺省取全局设置 */
export function resolveTypography(cfg: Config, account?: AccountProfile) {
  return {
    font_size: account?.content?.font_size || cfg.typography?.font_size || '13px',
    line_height: account?.content?.line_height || cfg.typography?.line_height || '20px',
    paragraph_margin:
      account?.content?.paragraph_margin || cfg.typography?.paragraph_margin || '25px',
    text_indent: account?.content?.text_indent || cfg.typography?.text_indent || '2em',
  }
}

// 宿主调用约定是 render(args, value)：第一参数是入参、第二参数才是工具结果。
// 使用紧凑 JSON 渲染，去除冗余缩进空格与换行符，显著节省上下文 Token。
export const renderJson = (_args: unknown, value: unknown): ToolContentBlock[] => [
  { type: 'text', text: JSON.stringify(value ?? null) },
]

/** 符合 DSH 标准工具注册规范的通用输出声明，保证 assertSupportedJsonSchema 严格通过且绝不掉线 */
export const STANDARD_TOOL_OUTPUT = {
  schema: {
    type: 'object' as const,
    additionalProperties: true,
  },
  render: renderJson,
}

export interface StrictImageQuota {
  platform: string
  articleType: 'news' | 'newspic'
  isNewspic: boolean
  coverRequired: boolean
  coverCount: number
  contentImageCount: number
  cardImageCount: number
  totalRequiredImages: number
}

/**
 * 获取平台与账号严格的内容规则配图要求
 * 【中文依据】：所有平台和账号的任务必须按照内容规则的配图数量限制生产，不允许多或者缺少
 */
export function getStrictImageQuota(
  cfg: Config,
  account: AccountProfile,
  articleType: 'news' | 'newspic' = 'news',
): StrictImageQuota {
  const platform = account.platform === 'xhs' ? 'xiaohongshu' : account.platform
  const isNewspic =
    articleType === 'newspic' ||
    (platform === 'gzh' && account.content?.article_type === 'newspic')

  if (platform === 'xiaohongshu') {
    const rawVal = account.content?.xhs_images_per_note
    const cardCount = Number.isFinite(rawVal)
      ? Math.max(1, Math.min(18, Math.floor(Number(rawVal))))
      : 4
    return {
      platform,
      articleType: 'newspic',
      isNewspic: true,
      coverRequired: false,
      coverCount: 0,
      contentImageCount: 0,
      cardImageCount: cardCount,
      totalRequiredImages: cardCount,
    }
  }

  if (isNewspic) {
    const rawVal = (account.content as any)?.newspic_card_count
    const cardCount = Number.isFinite(rawVal)
      ? Math.max(1, Math.min(20, Math.floor(Number(rawVal))))
      : 4
    return {
      platform,
      articleType: 'newspic',
      isNewspic: true,
      coverRequired: false,
      coverCount: 0,
      contentImageCount: 0,
      cardImageCount: cardCount,
      totalRequiredImages: cardCount,
    }
  }

  // 长文平台（微信公众号长文、知乎专栏、今日头条文章、百家号）
  const contentImgCount = contentImagesPerArticle(cfg, account)
  return {
    platform,
    articleType: 'news',
    isNewspic: false,
    coverRequired: true,
    coverCount: 1,
    contentImageCount: contentImgCount,
    cardImageCount: 0,
    totalRequiredImages: 1 + contentImgCount,
  }
}
