// 工具层公共设施：Python 调用、job 文件写入、路径守卫、输出渲染。
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { ToolContentBlock } from '@deepseek-ai/dsh-tools'
import type { AccountProfile, Config, ThemeKey } from '../config.ts'
import { THEME_KEYS } from '../config.ts'
import { pipelineDir, runPython, runtimeResourceDir } from '../py.ts'
import {
  accountScriptsDir, assertImageCreds, assertWechatCreds, brandDir, configuredAccountIds, scriptsDir, workspaceDir,
} from '../sync.ts'

export { accountScriptsDir, assertImageCreds, assertWechatCreds, brandDir, configuredAccountIds, scriptsDir, workspaceDir }
export { runtimeResourceDir }

export const CACHE_FILE = 'uploaded_urls.json'
export const RESULT_FILE = 'publish_result.json'
export const HISTORY_FILE = 'publish_history.json'
export const MEDIA_ID_FILE = 'draft_media_id.txt'

export function pyBase(cfg: Config) {
  return { pythonPath: cfg.runtime.python_path || 'python', cwd: workspaceDir(cfg) }
}

/** 运行 pipeline/ 下的参数化入口；失败时把 Python 错误与最近日志合并进异常消息 */
export async function runPipeline<T>(
  cfg: Config,
  script: string,
  args: string[],
  minTimeoutMs: number,
): Promise<T> {
  const r = await runPython<T>({
    ...pyBase(cfg),
    script: path.join(pipelineDir(), script),
    args,
    timeoutMs: Math.max(minTimeoutMs, cfg.runtime.request_timeout_ms * 2),
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
export function writeJobFile(baseDir: string, job: unknown, tag: string): { dir: string; name: string; file: string } {
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

/** scripts 目录内的图片按 jpg/png 后缀探测 */
export function findImage(dir: string, base: string): string {
  for (const ext of ['.jpg', '.png']) {
    const p = path.resolve(dir, base + ext)
    if (fs.existsSync(p)) return p
  }
  throw new Error('缺少图片文件（请先运行 gzh_generate_images）: ' + base + '.jpg|.png')
}

export function readUploadCache(cfg: Config, accountId: string): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(accountScriptsDir(cfg, accountId), CACHE_FILE), 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

export function writeUploadCache(cfg: Config, accountId: string, cache: Record<string, string>): void {
  writeTextFile(accountScriptsDir(cfg, accountId), CACHE_FILE, JSON.stringify(cache, null, 2) + '\n')
}

/** Resolve a configured brand image inside brand_assets; absolute paths outside are rejected. */
export function brandImagePath(cfg: Config, file: string, fallback: string): string {
  const base = path.resolve(brandDir(cfg))
  const requested = (file || fallback).trim()
  if (!requested) throw new Error('品牌图文件名不能为空')
  const resolved = path.resolve(base, requested)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('品牌图必须位于 brand_assets 目录内: ' + requested)
  }
  if (!/\.(jpe?g|png|webp)$/i.test(resolved)) {
    throw new Error('品牌图仅支持 .jpg / .jpeg / .png / .webp: ' + requested)
  }
  return resolved
}

export function expectedBrandImageCount(account: AccountProfile): number {
  return (account.brand_images.header.enabled ? 1 : 0) + (account.brand_images.footer.enabled ? 1 : 0)
}

/** 每篇正文配图数：优先按账号专属配置，缺省取全局设置（0-4） */
export function contentImagesPerArticle(cfg: Config, account?: AccountProfile): number {
  const accountVal = account?.content?.content_images_per_article
  const raw = Number.isFinite(accountVal) ? Number(accountVal) : Number(cfg.image_api?.content_images_per_article)
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
  const secondary = account?.content?.secondary_theme || cfg.typography?.secondary_theme || 'rotate'
  if (secondary !== 'rotate' && THEME_KEYS.includes(secondary as ThemeKey)) {
    return secondary as ThemeKey
  }
  const pool = THEME_KEYS
  return pool[(((index - 1) % pool.length) + pool.length) % pool.length]
}

/** 解析封面比例：优先按账号专属配图规则，缺省取全局设置 */
export function resolveCoverRatio(cfg: Config, index: number, account?: AccountProfile): import('../config.ts').CoverRatio {
  if (index <= 1) {
    return account?.content?.headline_cover_ratio || cfg.image_api?.headline_cover_ratio || '2.35:1'
  }
  return account?.content?.secondary_cover_ratio || cfg.image_api?.secondary_cover_ratio || '1:1'
}

/** 解析正文排版样式：优先按账号专属配置，缺省取全局设置 */
export function resolveTypography(cfg: Config, account?: AccountProfile) {
  return {
    font_size: account?.content?.font_size || cfg.typography?.font_size || '13px',
    line_height: account?.content?.line_height || cfg.typography?.line_height || '20px',
    paragraph_margin: account?.content?.paragraph_margin || cfg.typography?.paragraph_margin || '25px',
    text_indent: account?.content?.text_indent || cfg.typography?.text_indent || '2em',
  }
}

// 宿主调用约定是 render(args, value)：第一参数是入参、第二参数才是工具结果。
// 使用紧凑 JSON 渲染，去除冗余缩进空格与换行符，显著节省上下文 Token。
export const renderJson = (_args: unknown, value: unknown): ToolContentBlock[] => [
  { type: 'text', text: JSON.stringify(value ?? null) },
]
