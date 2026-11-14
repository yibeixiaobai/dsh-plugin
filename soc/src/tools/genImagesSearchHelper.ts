export interface ArticleImageAllocation {
  mode: 'auto' | 'custom'
  aiCount: number
  searchCount: number
  totalContentImages: number
}

/** 解析正文与卡片配图分配：自适应混排或自定义精细分配 AI 与搜图数量 */
export function resolveArticleImageAllocation(
  cfg: Config,
  account?: AccountProfile,
): ArticleImageAllocation {
  const content = account?.content
  const isXhs = account?.platform === 'xiaohongshu'

  // 【中文修复依据】：针对小红书卡片支持独立的配比设置解析
  if (isXhs) {
    const xhsMode = (content?.xhs_image_count_mode || 'auto') as 'auto' | 'custom'
    if (xhsMode === 'custom') {
      const ai = Math.max(1, Math.min(18, Math.floor(Number(content?.xhs_ai_images_per_note ?? 3))))
      const search = Math.max(0, Math.min(18, Math.floor(Number(content?.xhs_search_images_per_note ?? 1))))
      return {
        mode: 'custom',
        aiCount: ai,
        searchCount: search,
        totalContentImages: ai + search,
      }
    }
    const xhsTotal = Math.max(1, Math.min(18, Math.floor(Number(content?.xhs_images_per_note ?? 4))))
    const search = Math.floor(xhsTotal / 2)
    const ai = xhsTotal - search
    return { mode: 'auto', aiCount: Math.max(1, ai), searchCount: search, totalContentImages: xhsTotal }
  }

  const mode = (content?.image_count_mode || 'auto') as 'auto' | 'custom'
  if (mode === 'custom') {
    const ai = Math.max(0, Math.min(4, Math.floor(Number(content?.ai_images_per_article ?? 1))))
    const search = Math.max(
      0,
      Math.min(4, Math.floor(Number(content?.search_images_per_article ?? 1))),
    )
    return {
      mode: 'custom',
      aiCount: ai,
      searchCount: search,
      totalContentImages: Math.min(4, ai + search),
    }
  }
  const total = contentImagesPerArticle(cfg, account)
  const search = Math.floor(total / 2)
  const ai = total - search
  return { mode: 'auto', aiCount: Math.max(1, ai), searchCount: search, totalContentImages: total }
}

import path from 'node:path'
import fs from 'node:fs'
import type { Config, AccountProfile } from '../config.ts'
import type { GenItem } from './genImagesTypes.ts'
import { searchAndDownloadWebImage } from './browserImageSearcher.ts'
import { contentImagesPerArticle } from './shared.ts'

export interface SearchPrepassResult {
  remainingItems: GenItem[]
  searchGenerated: Array<{ out: string; w?: number; h?: number; dry_run?: boolean; fallback?: boolean; source?: string }>
}

/**
 * 正文搜图预处理：
 * 针对标记为 search 或自适应判定属于网络搜图份额的插图，通过真实素材搜索引擎极速检索并落盘；
 * 若网络搜图失败，平滑放行至 remainingItems 走大模型 AI 绘制保底。
 */
export async function handleWebImageSearchPrepass(params: {
  cfg: Config
  account: { id: string; profile: AccountProfile }
  items: GenItem[]
  genDir: string
  dryRun: boolean
  titles?: string[]
}): Promise<SearchPrepassResult> {
  const { cfg, account, items, genDir, dryRun, titles } = params
  const usedUrls = new Set<string>()
  if (dryRun) {
    return { remainingItems: items, searchGenerated: [] }
  }

  const allocation = resolveArticleImageAllocation(cfg, account.profile)
  const remainingItems: GenItem[] = []
  const searchGenerated: Array<{ out: string; w?: number; h?: number; dry_run?: boolean; fallback?: boolean; source?: string }> = []
  const browserCacheDir = path.join(genDir, '.browser_cache')

  for (const it of items) {
    const isCandidate = it.kind === 'content' || (it.kind === 'pic' && (it.sub ?? 1) > 1)
    const isExplicitSearch = it.source === 'search' || Boolean(it.search_query)
    const isExplicitAi = it.source === 'ai'
    // 【动静结合核心准则】：封面强制走高质量 AI 生图；正文次图未指定 source: 'ai' 时默认优先网络素材搜图并去重
    const isSmartHybridSearch = it.kind === 'content' && !isExplicitAi
    const isAllocatedSearch = isCandidate && (it.sub ?? 1) > allocation.aiCount

    // [中文修复依据]：支持首图显式搜图；动静结合默认将正文插图纳入高速网络素材搜索池
    if (isExplicitSearch || (!isExplicitAi && (isSmartHybridSearch || isAllocatedSearch))) {
      const destPath = path.isAbsolute(it.out) ? it.out : path.join(genDir, it.out)
      // 【中文修复依据】：精简并过滤搜索关键词，避免冗余图注干扰搜索引擎
      // 【中文修复依据】：关键词优先选用显式 search_query，未传时绑定该篇真实文章标题，避免多篇回退到相同前缀
      const articleTitle = titles && titles[it.index - 1] ? titles[it.index - 1].trim() : ''
      const promptSnippet = it.prompt.split(/[；;，,]/)[0].trim()
      const rawQuery = it.search_query || (articleTitle ? `${articleTitle} 专业实务` : promptSnippet) || '前沿科技'
      const query = rawQuery.replace(/[#\s/\\<>:"|?*]/g, ' ').trim().slice(0, 30)
      try {
        // 【中文修复依据】：向搜图工具传递 userDataDir 以便在协议未命中时平滑启动无头浏览器保底
        const res = await searchAndDownloadWebImage(query, destPath, {
          cfg,
          timeoutMs: 15000,
          userDataDir: browserCacheDir,
          articleIndex: it.index,
          usedUrls,
        })
        if (res.success && fs.existsSync(destPath)) {
          searchGenerated.push({
            out: it.out,
            w: res.width || 1080,
            h: res.height || 720,
            dry_run: false,
            source: 'web_search',
          })
          continue
        }
      } catch {
        // 异常降级走 AI 生图
      }
    }

    remainingItems.push(it)
  }

  return { remainingItems, searchGenerated }
}

import type { CoverRatio } from '../types.ts'
import { registerSandboxedImage, type TaskSandboxContext } from '../sandbox/taskSandbox.ts'
import { resolveItemCoverRatio } from './genImagesProviderHelper.ts'

/**
 * 【中文修复依据】：统一对生成（或搜索下载）的物料执行沙箱登记与镜像副本同步，
 * 严格写入 sandbox.manifest.images，杜绝全搜图或混排时漏登导致草稿构建/发布硬阻断。
 */
export function registerGeneratedImagesToSandbox(
  generatedItems: Array<string | { out: string; [key: string]: any }>,
  allItems: GenItem[],
  sandbox: TaskSandboxContext,
  genDir: string,
  cfg: Config,
  account: { id: string; profile: AccountProfile },
): void {
  if (!Array.isArray(generatedItems)) return
  for (const gen of generatedItems) {
    const genPath = typeof gen === 'string' ? gen : (gen as any)?.out
    if (!genPath) continue
    const itemMatch = allItems.find(
      it => it.out && (genPath.endsWith(it.out) || it.out.endsWith(genPath)),
    )
    if (itemMatch) {
      try {
        const actualPath = path.isAbsolute(genPath) ? genPath : path.join(genDir, genPath)
        if (fs.existsSync(actualPath)) {
          const ratio =
            itemMatch.kind === 'content'
              ? (((itemMatch as any).ratio || account.profile.content?.content_image_ratio || '16:9') as CoverRatio)
              : itemMatch.kind === 'pic'
                ? ((account.profile.content?.newspic_image_ratio || '3:4') as CoverRatio)
                : resolveItemCoverRatio(cfg, account.profile, itemMatch.index)
          const reg = registerSandboxedImage(
            sandbox,
            itemMatch.kind,
            itemMatch.index,
            itemMatch.sub,
            actualPath,
            ratio,
            itemMatch.kind === 'content'
              ? `IMG_A${itemMatch.index}_${itemMatch.sub || 1}`
              : undefined,
          )
          if (typeof gen === 'object' && gen !== null) (gen as any).hash = reg.hash
        }
      } catch {
        /* 忽略单张登记异常 */
      }
    }
  }
}
