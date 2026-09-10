// 工具层公共设施：Python 调用、job 文件写入、路径守卫、输出渲染。
import fs from 'node:fs'
import path from 'node:path'
import type { ToolContentBlock } from '@deepseek-ai/dsh-tools'
import type { AccountProfile, Config } from '../config.ts'
import { pipelineDir, runPython } from '../py.ts'
import { assertImageCreds, assertWechatCreds, brandDir, scriptsDir } from '../sync.ts'

export { assertImageCreds, assertWechatCreds, brandDir, scriptsDir }

export const CACHE_FILE = 'uploaded_urls.json'
export const RESULT_FILE = 'publish_result.json'
export const MEDIA_ID_FILE = 'draft_media_id.txt'

export function pyBase(cfg: Config) {
  return { pythonPath: cfg.runtime.python_path || 'python', cwd: cfg.runtime.project_root }
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
    throw new Error(String(r.error ?? 'Python 未返回结果') + logs)
  }
  return r.data
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

export function readUploadCache(cfg: Config): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(scriptsDir(cfg), CACHE_FILE), 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

export function writeUploadCache(cfg: Config, cache: Record<string, string>): void {
  writeTextFile(scriptsDir(cfg), CACHE_FILE, JSON.stringify(cache, null, 2) + '\n')
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

export function expectedArticleImageCount(account: AccountProfile): number {
  return 2 + expectedBrandImageCount(account)
}

export const renderJson = (v: unknown): ToolContentBlock[] => [
  { type: 'text', text: JSON.stringify(v, null, 2) },
]
