import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import {
  appendPublishAttempt, appendPublishRecord, listPendingReconcile, readAccountPublishRecords,
  readPublishAttempts, updateAttemptOutcome, updateAttemptReconcile, type PublishBatchRecord,
} from '../publish-history.ts'
import { runZhihuPublish } from '../zhihu.ts'
import { runBaijiahaoPublish } from '../baijiahao.ts'
import { runXhsPublish, xhsConfirmPublished } from '../xiaohongshu.ts'
import {
  MEDIA_ID_FILE, RESULT_FILE, accountScriptsDir, assertWechatCreds, brandDir,
  brandImagePath, contentImagesPerArticle, findImage, readUploadCache, removeJobFile, renderJson, runPipeline,
  writeJobFile, writeTextFile, runtimeResourceDir, writeUploadCache,
} from './shared.ts'

import type { WechatOriginalResult, WechatBrowserPublishJob } from '../wechat-browser.ts'
import { enableWechatDraftOriginal, publishWechatDraftByBrowser } from '../wechat-browser.ts'

interface PublishResult {
  dry_run: boolean
  media_id?: string
  media_ids?: string[]
  article_count?: number
  titles?: string[]
  cache: Record<string, string>
  verify?: { checked: boolean; article_count?: number; results?: unknown[] }
  checks?: string[]
}

export interface ZhihuDraftInfo {
  draft_id: string
  title: string
  url: string
  published?: boolean
}

export interface PublishOk {
  account_id: string
  platform: string
  publish_mode?: 'api' | 'browser'
  dry_run: boolean
  media_id?: string
  media_ids?: string[]
  drafts?: ZhihuDraftInfo[]
  draft_url?: string
  article_count: number
  titles: string[]
  verify: { checked: boolean; article_count?: number; results?: unknown[] }
  result_file: string
  already_published?: boolean
  /** 防重闸门说明：为何本次未真正发布 */
  dedup_note?: string
  original_result?: WechatOriginalResult
}

interface PublishArgs {
  titles: string[]
  digests: string[]
  article_files?: string[]
  article_type?: 'news' | 'newspic'
  force?: boolean
  account_id?: string
  auto_enable_original?: boolean
  publish_mode?: 'api' | 'browser'
}

function stampNow(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export function publishTool(cfg: Config) {
  return defineTool<PublishArgs, PublishOk>({
    name: 'gzh_publish_draft',
    description:
      '发布草稿：公众号账号支持 官方 API 接口模式（需 AppID/Secret/IP 白名单）或 免 API 浏览器自动化模式（扫码登录，后台自动创建草稿）；' +
      '知乎/百家号账号走 浏览器自动化（登录态发布，N 篇 = N 个独立草稿，默认只存平台草稿箱）。' +
      '发布前请先对全部文章跑 gzh_validate_html。演练模式（设置中 dry_run）只校验不联网。',
    parameters: {
      titles: {
        type: 'array',
        required: true,
        description: '每篇标题（长文/百家号 ≤64 字，小绿书 ≤32 字，知乎 ≤100 字），数量须与 digests 一致（支持补充要求自定义篇数 1~20 篇）',
        items: { type: 'string' },
      },
      digests: {
        type: 'array',
        required: true,
        description: '每篇摘要（≤120 字）；数量必须与 titles 数量一致',
        items: { type: 'string' },
      },
      article_files: {
        type: 'array',
        description: '可选：自定义文章文件名（scripts 目录内）；缺省长文用 article_v2_1..N.html，小绿书用 article_v2_1..N_pic.json，知乎/百家号用 article_v2_1..N.md',
        items: { type: 'string' },
      },
      article_type: {
        type: 'string',
        description: '可选：指定发布的文章形态（news=长图文草稿，newspic=小绿书图片消息草稿）；缺省按账号设置',
        enum: ['news', 'newspic'],
      },
      publish_mode: {
        type: 'string',
        description: '可选：指定发布方案（api=官方 API 接口，browser=免 API 浏览器自动化）；缺省按账号配置 publish_mode（默认 api）',
        enum: ['api', 'browser'],
      },
      force: {
        type: 'boolean',
        description: '可选：强制发布，跳过防重复创建检查（默认 false 自动拦截相同标题或超出篇数配额的重复调用）',
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省使用默认账号',
      },
      auto_enable_original: {
        type: 'boolean',
        description: '可选：草稿发布成功后，是否自动通过浏览器模拟打开草稿箱批量开启文字原创并保存（缺省采用账号配置 auto_enable_original）',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      const content = account.profile.content
      const platform = account.profile.platform === 'zhihu' ? 'zhihu' : account.profile.platform === 'xiaohongshu' ? 'xiaohongshu' : account.profile.platform === 'baijiahao' ? 'baijiahao' : 'gzh'
      const publishMode = args.publish_mode || account.profile.publish_mode || 'api'
      const isNewspic = platform === 'gzh' && (
        (args.article_type === 'newspic') ||
        (!args.article_type && content.article_type === 'newspic') ||
        Boolean(args.article_files && args.article_files.some((f) => f.endsWith('_pic.json') || f.endsWith('.json')))
      )
      if (!Array.isArray(args.titles) || args.titles.length === 0 || args.titles.length > 20) {
        throw new Error('titles 必须包含 1~20 个标题')
      }
      if (!Array.isArray(args.digests) || args.digests.length !== args.titles.length) {
        throw new Error('digests 数量（' + (args.digests?.length ?? 0) + '）必须与 titles 数量（' + args.titles.length + '）一致')
      }
      if (args.article_files && args.article_files.length !== args.titles.length) {
        throw new Error('article_files 数量（' + args.article_files.length + '）必须与 titles 数量（' + args.titles.length + '）一致')
      }
      const n = args.titles.length
      const maxTitle = platform === 'zhihu' ? 100 : platform === 'xiaohongshu' ? 20 : platform === 'baijiahao' ? 64 : isNewspic ? 32 : 64
      for (const t of args.titles) {
        if (typeof t !== 'string' || t.length > maxTitle) throw new Error('标题超 ' + maxTitle + ' 字: ' + String(t).slice(0, 40))
      }
      for (const d of args.digests) {
        if (typeof d !== 'string' || d.length > 120) throw new Error('摘要超 120 字: ' + String(d).slice(0, 40))
      }
      if (platform === 'baijiahao') {
        // 百家号标题党机器断言（百度审核严打，与 style_guide 铁律对应）
        const clickbait = ['震惊', '惊呆', '吓死', '删前必看', '速看', '99%的人不知道', '不看后悔', '必看必转']
        for (const t of args.titles) {
          const hit = clickbait.find((w) => t.includes(w))
          if (hit) throw new Error('百家号标题含标题党词「' + hit + '」（百度机器审核将拒稿或扣分）: ' + t.slice(0, 40))
        }
      }
      const sdir = accountScriptsDir(cfg, account.id)

      // 防重复发布保护（幂等拦截机制，坚决杜绝小绿书或长文被重复发布多次）：
      if (!cfg.runtime.dry_run && !args.force && platform === 'gzh') {
        const recentRecords = readAccountPublishRecords(cfg, account.id)

        // 1. 完全相同标题与形态防重：如果当前传入的标题组合已在历史中发布过，直接复用已有的 media_id，绝不再次调用微信接口创建重复草稿！
        const exactMatch = recentRecords.find((r) => {
          const typeMatch = isNewspic ? r.article_type === 'newspic' : r.article_type !== 'newspic'
          if (!typeMatch) return false
          const recTitles = r.articles || []
          return recTitles.length === args.titles.length && recTitles.every((t, i) => t === args.titles[i])
        })
        if (exactMatch && exactMatch.draft_media_id) {
          const rawIds = exactMatch.draft_media_ids && exactMatch.draft_media_ids.length > 0
            ? exactMatch.draft_media_ids
            : [exactMatch.draft_media_id]
          const mediaIds = rawIds.filter((id): id is string => Boolean(id))
          return {
            account_id: account.id,
            platform: 'gzh',
            dry_run: false,
            already_published: true,
            media_id: exactMatch.draft_media_id,
            media_ids: mediaIds,
            article_count: exactMatch.article_count || n,
            titles: args.titles,
            verify: { checked: true, article_count: exactMatch.article_count || n },
            result_file: path.resolve(sdir, RESULT_FILE),
          }
        }

        // 2. 小绿书篇数限额保护：若为小绿书，且本周期（最近4小时内）已发布的小绿书篇数已达到设定上限 newspic_articles_per_day，
        // 自动复用最近一次成功的小绿书草稿结果，严禁由模型循环或重复调用导致在微信草稿箱生成多篇重复草稿！
        if (isNewspic) {
          const allowedNewspicCount = content.newspic_articles_per_day || 1
          const nowMs = Date.now()
          const recentNewspicBatches = recentRecords.filter((r) => {
            if (r.article_type !== 'newspic' || !r.draft_media_id) return false
            const recTime = new Date(r.timestamp).getTime()
            return !isNaN(recTime) && (nowMs - recTime < 4 * 3600 * 1000)
          })
          const publishedCount = recentNewspicBatches.reduce((acc, r) => acc + (r.article_count || 1), 0)
          if (publishedCount >= allowedNewspicCount && recentNewspicBatches.length > 0) {
            const lastBatch = recentNewspicBatches[0]
            const rawIds = lastBatch.draft_media_ids && lastBatch.draft_media_ids.length > 0
              ? lastBatch.draft_media_ids
              : [lastBatch.draft_media_id]
            const mediaIds = rawIds.filter((id): id is string => Boolean(id))
            return {
              account_id: account.id,
              platform: 'gzh',
              dry_run: false,
              already_published: true,
              media_id: lastBatch.draft_media_id,
              media_ids: mediaIds,
              article_count: lastBatch.article_count || 1,
              titles: lastBatch.articles,
              verify: { checked: true, article_count: lastBatch.article_count || 1 },
              result_file: path.resolve(sdir, RESULT_FILE),
            }
          }
        }
      }

      if (platform === 'xiaohongshu') {
        // 【自愈式核对】先自动把历史未确认的笔记补核对（补齐 note_id → 永久去重）。
        // 放在防重闸门之前：这样「上次未确认」的条目一旦核对成功，就直接被闸门复用，
        // 绝不会被再发一次；同时用户无需人工核对。
        if (!cfg.runtime.dry_run) {
          try {
            await xhsSelfReconcile(cfg, account.id)
          } catch {
            // 核对异常绝不影响发布主流程
          }
        }
        // 发布前防重：小红书此前没有这道闸门，重试会导致重复笔记（详见 xhsDedupGuard）
        if (!cfg.runtime.dry_run && !args.force) {
          const dup = xhsDedupGuard(cfg, account.id, args.titles)
          if (dup) return dup
        }
        return publishXiaohongshu(cfg, account.id, sdir, args, n)
      }
      if (platform === 'zhihu') {
        return publishZhihu(cfg, account.id, sdir, args, n)
      }
      if (platform === 'baijiahao') {
        return publishBaijiahao(cfg, account.id, sdir, args, n)
      }
      if (publishMode === 'browser') {
        return publishGzhBrowser(cfg, account.id, sdir, args, n, isNewspic)
      }
      return publishGzh(cfg, account.id, sdir, args, n, isNewspic)
    },
  })
}

function defaultArticleFiles(sdir: string, n: number, ext: string, custom?: string[]): string[] {
  const names = custom?.length ? custom : Array.from({ length: n }, (_, i) => 'article_v2_' + (i + 1) + ext)
  return names.map((f) => path.resolve(sdir, f))
}

/** 知乎分支：浏览器自动化发布，N 篇 = N 个独立草稿；结果落盘协议与公众号对齐（articles 字段供查重） */
async function publishZhihu(
  cfg: Config, accountId: string, sdir: string, args: PublishArgs, n: number,
): Promise<PublishOk> {
  const contentImgs = contentImagesPerArticle(cfg, resolveAccount(cfg, accountId).profile)
  const articlePaths = defaultArticleFiles(sdir, n, '.md', args.article_files)
  const contentFiles: Record<string, string> = {}
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= contentImgs; j++) {
      const key = 'IMG_A' + i + '_' + j
      contentFiles[key] = cfg.runtime.dry_run
        ? path.resolve(sdir, 'content_' + i + '_' + j + '.png')
        : findImage(sdir, 'content_' + i + '_' + j)
    }
  }

  const job = {
    account_id: accountId,
    titles: args.titles,
    article_files: articlePaths,
    content_files: contentFiles,
    content_img_count: contentImgs,
    publish_immediately: cfg.accounts[accountId]?.publish_immediately === true,
    dry_run: cfg.runtime.dry_run === true,
    min_words: cfg.accounts[accountId]?.content.min_words ?? 0,
    forbidden: cfg.accounts[accountId]?.content.forbidden_words ?? [],
  }
  const result = await runZhihuPublish(cfg, accountId, job)

  if (result.dry_run) {
    return {
      account_id: accountId, platform: 'zhihu', dry_run: true, article_count: n,
      titles: args.titles, verify: { checked: false }, result_file: '',
    }
  }
  const now = stampNow()
  const authorName = cfg.accounts[accountId]?.author_name ?? ''
  const resultPath = writeTextFile(sdir, RESULT_FILE, JSON.stringify({
    status: 'success',
    account_id: accountId,
    platform: 'zhihu',
    article_count: n,
    author: authorName,
    timestamp: now,
    articles: args.titles,
    drafts: result.drafts,
  }, null, 2) + '\n')
  try {
    appendPublishRecord(cfg, {
      id: `batch_${now.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
      account_id: accountId,
      platform: 'zhihu',
      article_count: n,
      author: authorName,
      timestamp: now,
      articles: args.titles,
      digests: args.digests,
      items: result.drafts.map((d, i) => ({
        index: i + 1,
        title: d.title,
        digest: args.digests[i] || '',
        draft_id: d.draft_id,
        url: d.url,
        published: d.published,
      })),
    })
  } catch {
    // best-effort history append
  }
  writeTextFile(sdir, 'draft_urls.txt', result.drafts.map((d) => d.url).join('\n') + '\n')
  return {
    account_id: accountId, platform: 'zhihu', dry_run: false,
    drafts: result.drafts, article_count: result.drafts.length, titles: args.titles,
    verify: { checked: false }, result_file: resultPath,
  }
}

/** 百家号分支：浏览器自动化发布，N 篇 = N 个独立草稿；默认只存百家号草稿箱（publish_immediately 可直发，需封面） */
async function publishBaijiahao(
  cfg: Config, accountId: string, sdir: string, args: PublishArgs, n: number,
): Promise<PublishOk> {
  const account = resolveAccount(cfg, accountId)
  const contentImgs = contentImagesPerArticle(cfg, account.profile)
  const articlePaths = defaultArticleFiles(sdir, n, '.md', args.article_files)
  const contentFiles: Record<string, string> = {}
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= contentImgs; j++) {
      const key = 'IMG_A' + i + '_' + j
      contentFiles[key] = cfg.runtime.dry_run
        ? path.resolve(sdir, 'content_' + i + '_' + j + '.png')
        : findImage(sdir, 'content_' + i + '_' + j)
    }
  }
  // 直发时每篇需要封面（百家号发文封面必选）：cover_{i}.png，dry_run 直接按约定名拼路径
  const coverFiles: Record<string, string> = {}
  if (account.profile.publish_immediately === true) {
    for (let i = 1; i <= n; i++) {
      coverFiles[String(i)] = cfg.runtime.dry_run
        ? path.resolve(sdir, 'cover_' + i + '.png')
        : findImage(sdir, 'cover_' + i)
    }
  }

  const brandImages = account.profile.brand_images
  const brandImageFiles: { header?: string; footer?: string } = {}
  if (brandImages?.header?.enabled) {
    const headerPath = brandImagePath(cfg, brandImages.header.file, 'brand_top.jpg')
    if (!cfg.runtime.dry_run && !fs.existsSync(headerPath)) {
      throw new Error('缺少百家号头部品牌图: ' + headerPath)
    }
    brandImageFiles.header = headerPath
  }
  if (brandImages?.footer?.enabled) {
    const footerPath = brandImagePath(cfg, brandImages.footer.file, 'brand_bot.jpg')
    if (!cfg.runtime.dry_run && !fs.existsSync(footerPath)) {
      throw new Error('缺少百家号尾部品牌图: ' + footerPath)
    }
    brandImageFiles.footer = footerPath
  }

  const job = {
    account_id: accountId,
    titles: args.titles,
    article_files: articlePaths,
    content_files: contentFiles,
    content_img_count: contentImgs,
    cover_files: coverFiles,
    publish_immediately: account.profile.publish_immediately === true,
    brand_image_files: brandImageFiles,
    dry_run: cfg.runtime.dry_run === true,
    min_words: account.profile.content.min_words ?? 0,
    forbidden: account.profile.content.forbidden_words ?? [],
  }
  const result = await runBaijiahaoPublish(cfg, accountId, job)

  if (result.dry_run) {
    return {
      account_id: accountId, platform: 'baijiahao', dry_run: true, article_count: n,
      titles: args.titles, verify: { checked: false }, result_file: '',
    }
  }
  const now = stampNow()
  const authorName = account.profile.author_name ?? ''
  const warnings = result.drafts.filter((d) => d.warning)
  const resultPath = writeTextFile(sdir, RESULT_FILE, JSON.stringify({
    status: 'success',
    account_id: accountId,
    platform: 'baijiahao',
    article_count: n,
    author: authorName,
    timestamp: now,
    articles: args.titles,
    drafts: result.drafts,
    ...(warnings.length > 0 ? { warnings: warnings.map((d) => d.warning) } : {}),
  }, null, 2) + '\n')
  try {
    appendPublishRecord(cfg, {
      id: `batch_${now.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
      account_id: accountId,
      platform: 'baijiahao',
      article_count: n,
      author: authorName,
      timestamp: now,
      articles: args.titles,
      digests: args.digests,
      items: result.drafts.map((d, i) => ({
        index: i + 1,
        title: d.title,
        digest: args.digests[i] || '',
        draft_id: d.draft_id,
        url: d.url,
        published: d.published,
      })),
    })
  } catch {
    // best-effort history append
  }
  writeTextFile(sdir, 'draft_urls.txt', result.drafts.map((d) => d.url).join('\n') + '\n')
  return {
    account_id: accountId, platform: 'baijiahao', dry_run: false,
    drafts: result.drafts, article_count: result.drafts.length, titles: args.titles,
    verify: { checked: false }, result_file: resultPath,
    ...(warnings.length > 0 ? { dedup_note: warnings.map((d) => d.title + ': ' + d.warning).join('；') } : {}),
  }
}

/**
 * 小红书发布前防重（幂等拦截）。
 *
 * 背景：小红书此前完全没有发布前防重 —— 一旦发布成功但「未能确认」（假阴性），
 * 模型重试就会把同一篇笔记再发一遍，产生重复笔记。核对机制修好后仍需要这道闸门，
 * 因为网络抖动、稿件管理读不到等情况下重试依然会发生。
 *
 * 判据（双源，第一道命中即拦截）：
 *  1. 【attempt 日志 · 主判据】publish_attempts.json 由发布动作**发起前**落盘，
 *     与最终成败无关。同标题组合：
 *       - 已确认 published → 永久拦截（复用既有结果）
 *       - 否则在 30 分钟窗口内 → 一律拦截（这就是修复重复发布的关键）
 *  2. 【history · 兜底】publish_history.json 只在成功路径写入，作为第二道；
 *     同标题组合：已确认的全部复用；近期批次无论是否确认都拦截。
 *
 * 【为什么必须是双源】
 * 旧实现只有第 2 道。而「已提交但未确认」既不发 history、也不出现在任何记录里，
 * 于是重试时闸门查不到 → 放行 → 把同一篇**真的再发一遍**。加入第 1 道后，
 * 「判为未确认」不再导致「重试重复发」。
 *
 * 命中返回已存在的结果（already_published: true），不触网、不建重复笔记。
 * 传 force: true 可跳过（供确需重发时使用）。
 */
/**
 * 【自愈式核对】发布前自动把历史「未确认」的小红书笔记补核对一遍。
 *
 * 为什么必须自动做：小红书发布后 URL 从不含 note_id，唯一权威来源是「稿件管理」
 * 列表；而该列表读取会因风控/接口变化/浏览器不可用而失败。历史上这一失败被
 * 直接抛给用户去人工核对——用户明确要求「核对你自行完成」。
 *
 * 因此：每次发布前，先扫一遍待核对清单，尽力把 note_ids 补齐。
 * 无论核对成功与否都不阻断发布（best-effort），但成功即永久去重、无需人工介入。
 */
async function xhsSelfReconcile(cfg: Config, accountId: string): Promise<{ checked: number; resolved: number }> {
  let pending: ReturnType<typeof listPendingReconcile> = []
  try {
    pending = listPendingReconcile(cfg, accountId)
  } catch {
    return { checked: 0, resolved: 0 }
  }
  if (pending.length === 0) return { checked: 0, resolved: 0 }

  // 合并成一次核对调用，减少对平台的访问次数（对同一账号只开一次浏览器）
  const expected: Array<{ title: string; publishedAtMs: number }> = []
  for (const a of pending) {
    a.titles.forEach((t, i) => {
      const already = (a.note_ids || [])[i]
      if (already) return
      // 匹配窗口以本次尝试时间为锚点（平台列表时间精确到分钟，matchManagedNote 自带 ±15 分钟容差）
      expected.push({ title: t, publishedAtMs: a.attemptedAtMs })
    })
  }
  if (expected.length === 0) return { checked: 0, resolved: 0 }

  let items: Awaited<ReturnType<typeof xhsConfirmPublished>>['items'] = []
  try {
    const res = await xhsConfirmPublished(cfg, accountId, expected)
    items = res.items
  } catch {
    // 核对失败不阻断发布：条目保持未确认，下次运行再试
    return { checked: 0, resolved: 0 }
  }

  // 把核对结果按 attempt 回填
  let resolved = 0
  let checked = 0
  for (const a of pending) {
    const ids: string[] = a.titles.map((_, i) => (a.note_ids || [])[i] || '')
    let touched = false
    a.titles.forEach((t, i) => {
      if (ids[i]) return
      const hit = items.find((it) => it.title === t && it.status === 'published')
      if (hit?.note_id) {
        ids[i] = hit.note_id
        touched = true
        resolved++
      } else {
        touched = true // 记录「已核对但未取到」，推进 reconcileAttempts
      }
    })
    if (!touched) continue
    checked++
    try {
      updateAttemptReconcile(cfg, accountId, a.attemptedAtMs, ids)
    } catch {
      // best-effort
    }
  }
  return { checked, resolved }
}

function xhsDedupGuard(
  cfg: Config,
  accountId: string,
  titles: string[],
  windowMs = 30 * 60 * 1000,
): PublishOk | null {
  const nowMs = Date.now()

  // 【第一道】发布尝试日志：发布动作发起前就落盘，与成败无关。
  // 这是防重的权威依据——「已提交但未确认」的笔记也能被挡住。
  //
  // 【为什么「未确认」必须永久拦截而不是窗口内拦截】
  // 曾经写成 30 分钟内拦截、超窗放行。但小红书发布后 URL 不含 note_id，
  // 一旦当次核对失败（风控/接口变化/浏览器不可用），该笔记必然停在 unconfirmed。
  // 若超窗即放行，同一篇会被再发一次——这正是「产生两篇一样的笔记」的成因。
  // 现在改为：只要还没拿到真实 note_id，就一律拦截重发；明确 failed 才放行。
  // 确需重发由 force: true 显式覆盖（人工确认后使用）。
  try {
    const attempts = readPublishAttempts(cfg, accountId)
    for (const a of attempts) {
      if (a.platform !== 'xiaohongshu') continue
      const at = a.titles || []
      if (at.length !== titles.length) continue
      if (!at.every((t, i) => t === titles[i])) continue

      const ids = a.note_ids || []
      const allConfirmed = ids.length === a.titles.length && ids.every((id) => Boolean(id))
      const confirmed = a.outcome === 'published' && allConfirmed
      const fresh = typeof a.attemptedAtMs === 'number' && nowMs - a.attemptedAtMs < windowMs
      // 明确失败且已过窗口 → 放行（允许修好后补发）
      const explicitFailure = a.outcome === 'failed' && !fresh
      if (explicitFailure) continue
      // 已确认发布 → 永久拦截；其余（含 unconfirmed / 无 outcome）→ 一律拦截
      const hpath = path.resolve(accountScriptsDir(cfg, accountId), RESULT_FILE)
      return {
        account_id: accountId,
        platform: 'xiaohongshu',
        dry_run: false,
        already_published: true,
        media_ids: ids.filter(Boolean),
        drafts: titles.map((t, i) => ({
          draft_id: ids[i] || '',
          title: t,
          url: ids[i] ? 'https://www.xiaohongshu.com/explore/' + ids[i] : '',
          published: Boolean(ids[i]),
        })),
        article_count: titles.length,
        titles,
        verify: { checked: confirmed, article_count: titles.length },
        result_file: hpath,
        dedup_note: confirmed
          ? '该标题此前已确认发布，直接复用，不再重复创建笔记'
          : '该标题此前已发起发布但尚未确认到笔记ID（未确认≠未发布，重发会产生重复笔记）。'
            + '已拦截重发；系统会在后续运行中自动核对并回填 ID。确需重发请先人工确认后传 force: true',
      } as PublishOk
    }
  } catch {
    // attempts 读不到不应阻断发布，继续走 history 判定
  }

  let records: PublishBatchRecord[] = []
  try {
    records = readAccountPublishRecords(cfg, accountId)
  } catch {
    return null
  }
  // 新到旧扫描，取第一条标题组合完全一致的批次
  for (const r of records) {
    if (r.platform !== 'xiaohongshu') continue
    const recTitles = r.articles || []
    if (recTitles.length !== titles.length) continue
    if (!recTitles.every((t, i) => t === titles[i])) continue

    const recTime = new Date(String(r.timestamp).replace(' ', 'T')).getTime()
    const fresh = !Number.isNaN(recTime) && nowMs - recTime < windowMs
    const items = r.items || []
    const confirmedIds = items
      .map((it) => it.draft_id)
      .filter((id): id is string => Boolean(id) && !/^pending_/i.test(String(id)))
    const fullyConfirmed = confirmedIds.length === titles.length && confirmedIds.length > 0

    // 1) 已确认发布过 → 复用既有结果
    // 2) 近期刚发过（哪怕未确认）→ 拦截，避免把「已发未确认」重发成重复笔记
    if (!fullyConfirmed && !fresh) continue

    return {
      account_id: accountId,
      platform: 'xiaohongshu',
      dry_run: false,
      already_published: true,
      media_ids: confirmedIds,
      drafts: items.map((it) => ({
        draft_id: it.draft_id || '',
        title: it.title,
        url: it.url || '',
        published: it.published,
      })),
      article_count: r.article_count || titles.length,
      titles,
      verify: { checked: fullyConfirmed, article_count: r.article_count || titles.length },
      result_file: path.resolve(accountScriptsDir(cfg, accountId), RESULT_FILE),
      dedup_note: fullyConfirmed
        ? '该标题组合此前已确认发布（publish_history），直接复用既有结果'
        : '该标题组合近期已在 publish_history 中登记，按防重合闸拦截；确需重发请传 force: true',
    }
  }
  return null
}

/** 小红书分支：浏览器自动化发布图文笔记，N 篇 = N 个独立笔记；结果落盘协议与知乎对齐 */
async function publishXiaohongshu(
  cfg: Config, accountId: string, sdir: string, args: PublishArgs, n: number,
): Promise<PublishOk> {
  const account = resolveAccount(cfg, accountId)
  const xhsImagesPerNote = account.profile.content.xhs_images_per_note || 4
  const articlePaths = defaultArticleFiles(sdir, n, '_xhs.txt', args.article_files)

  const imageFiles: Record<string, string[]> = {}
  const imageCounts: number[] = []
  for (let i = 1; i <= n; i++) {
    const key = 'IMG_A' + i + '_1'
    const paths: string[] = []
    for (let j = 1; j <= xhsImagesPerNote; j++) {
      const imgKey = 'IMG_A' + i + '_' + j
      paths.push(cfg.runtime.dry_run
        ? path.resolve(sdir, 'pic_' + i + '_' + j + '.png')
        : findImage(sdir, 'pic_' + i + '_' + j))
    }
    imageFiles[key] = paths
    imageCounts.push(xhsImagesPerNote)
  }

  const job = {
    account_id: accountId,
    titles: args.titles,
    article_files: articlePaths,
    image_files: imageFiles,
    image_counts: imageCounts,
    publish_immediately: cfg.accounts[accountId]?.publish_immediately === true,
    dry_run: cfg.runtime.dry_run === true,
    min_words: account.profile.content.xhs_min_words ?? 200,
    forbidden: account.profile.content.forbidden_words ?? [],
    tags: account.profile.content.xhs_tags ?? [],
  }
  // 【防重关键】在真正发起发布动作**之前**落盘一次尝试记录。
  // 这样即使后续「已提交但未能确认」，重试也会被 xhsDedupGuard 挡住，
  // 不会出现同一篇笔记被重复发出。这是修复「重复发布」死锁的核心。
  const attemptedAtMs = Date.now()
  try {
    appendPublishAttempt(cfg, {
      account_id: accountId,
      platform: 'xiaohongshu',
      titles: args.titles,
      attemptedAtMs,
    })
  } catch {
    // best-effort：attempts 落盘失败不阻断发布本身
  }
  const result = await runXhsPublish(cfg, accountId, job)

  if (result.dry_run) {
    return {
      account_id: accountId, platform: 'xiaohongshu', dry_run: true, article_count: n,
      titles: args.titles, verify: { checked: false }, result_file: '',
    }
  }
  const now = stampNow()
  const authorName = account.profile.author_name
  // 【三态判定】底层已改为「发布后进稿件管理核对」：
  //  - published   已在稿件管理查到，拿到真实 note_id → 成功
  //  - unconfirmed 已点发布但未能确认（列表读不到 / 尚未同步）→ 不算成功，但也不武断判失败
  //  - failed      明确失败（找不到发布按钮、风控等）
  // 历史坑：旧实现要求每篇都必须有 note_id，否则整体抛错；但小红书发布页 URL 从不
  // 含 note_id，导致「真发布成功」也被判失败（假阴性）。现按三态分别处置。
  const published = result.notes.filter((d) => d.status === 'published' && d.note_id)
  const unconfirmed = result.notes.filter((d) => d.status !== 'published' || !d.note_id)
  const failed = result.notes.filter((d) => d.status === 'failed')

  // 占位符残留仍视为硬失败（绝不允许再次产生 pending_N 假成功）
  const stillPlaceholder = result.notes.filter((d) => /^pending_/i.test(d.note_id || ''))

  if (failed.length > 0 || stillPlaceholder.length > 0) {
    const bad = [...failed, ...stillPlaceholder].map((d) => d.title).join('、')
    updateAttemptOutcome(cfg, accountId, attemptedAtMs, 'failed', result.notes.map((d) => d.note_id || ''))
    writeTextFile(sdir, RESULT_FILE, JSON.stringify({
      status: 'failed', account_id: accountId, platform: 'xiaohongshu', article_count: n,
      author: authorName, timestamp: now, articles: args.titles,
      error: '以下笔记发布明确失败: ' + bad, drafts: result.notes,
    }, null, 2) + '\n')
    throw new Error('小红书发布失败：' + bad + '。请检查登录态与创作者后台可达性后重试。')
  }

  const anyUnconfirmed = unconfirmed.length > 0
  // 逐篇落盘真实 note_id：下次运行的自愈式核对据此判断是否仍需补核对
  updateAttemptOutcome(
    cfg, accountId, attemptedAtMs,
    anyUnconfirmed ? 'unconfirmed' : 'published',
    result.notes.map((d) => d.note_id || ''),
  )
  const resultPath = writeTextFile(sdir, RESULT_FILE, JSON.stringify({
    status: anyUnconfirmed ? 'unconfirmed' : 'success',
    account_id: accountId,
    platform: 'xiaohongshu',
    article_count: n,
    author: authorName,
    timestamp: now,
    articles: args.titles,
    confirmed_count: published.length,
    ...(anyUnconfirmed
      ? {
          warning:
            '以下笔记已提交发布但本次未能在稿件管理中确认到笔记ID（读不到≠未发布）: ' +
            unconfirmed.map((d) => d.title).join('、') +
            '。系统会在下次运行前自动重新核对并回填 ID，无需人工核对；'
            + '在核对成功前，防重闸门会拦截同标题重发，避免产生重复笔记。',
        }
      : {}),
    drafts: result.notes,
  }, null, 2) + '\n')
  try {
    appendPublishRecord(cfg, {
      id: `batch_${now.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
      account_id: accountId,
      platform: 'xiaohongshu',
      article_count: n,
      author: authorName,
      timestamp: now,
      articles: args.titles,
      digests: args.digests,
      status: anyUnconfirmed ? 'unconfirmed' : 'success',
      items: result.notes.map((d, i) => ({
        index: i + 1,
        title: d.title,
        digest: args.digests[i] || '',
        draft_id: d.note_id,
        url: d.url,
        published: d.status === 'published',
        status: d.status,
      })),
    })
  } catch {
    // best-effort history append
  }
  writeTextFile(sdir, 'draft_urls.txt', result.notes.map((d) => d.url).join('\n') + '\n')
  return {
    account_id: accountId, platform: 'xiaohongshu', dry_run: false,
    drafts: result.notes.map((d) => ({ draft_id: d.note_id, title: d.title, url: d.url, published: d.published })),
    article_count: result.notes.length, titles: args.titles,
    verify: { checked: false }, result_file: resultPath,
  }
}

/** 公众号分支：与既有链路逐字节等价（上传缓存 → 占位符替换 → 校验 → draft/add → 可选核验） */
async function publishGzh(
  cfg: Config, accountId: string, sdir: string, args: PublishArgs, n: number, isNewspic: boolean,
): Promise<PublishOk> {
  const account = resolveAccount(cfg, accountId)
  const contentImgs = contentImagesPerArticle(cfg, account.profile)
  const ext = isNewspic ? '_pic.json' : '.html'
  const articlePaths = defaultArticleFiles(sdir, n, ext, args.article_files)

  // 封面/正文图：演练模式不要求存在，正式发布缺失即报错（小绿书不使用传统封面/正文图）
  const coverPaths: string[] = []
  const contentFiles: Record<string, string> = {}
  if (!isNewspic) {
    for (let i = 1; i <= n; i++) {
      if (cfg.runtime.dry_run) {
        coverPaths.push(path.resolve(sdir, 'cover_' + i + '.png'))
      } else {
        coverPaths.push(findImage(sdir, 'cover_' + i))
      }
      for (let j = 1; j <= contentImgs; j++) {
        const key = 'IMG_A' + i + '_' + j
        contentFiles[key] = cfg.runtime.dry_run
          ? path.resolve(sdir, 'content_' + i + '_' + j + '.png')
          : findImage(sdir, 'content_' + i + '_' + j)
      }
    }
  }
  const bdir = brandDir(cfg)
  const brandTop = brandImagePath(cfg, account.profile.brand_images.header.file, 'brand_top.jpg')
  const brandBot = brandImagePath(cfg, account.profile.brand_images.footer.file, 'brand_bot.jpg')

  if (!cfg.runtime.dry_run) {
    assertWechatCreds(cfg, accountId)
    if (!isNewspic) {
      if (account.profile.brand_images.header.enabled && !fs.existsSync(brandTop)) {
        throw new Error('缺少头部品牌图: ' + brandTop)
      }
      if (account.profile.brand_images.footer.enabled && !fs.existsSync(brandBot)) {
        throw new Error('缺少尾部品牌图: ' + brandBot)
      }
    }
  }

  const job = {
    account_id: accountId,
    article_type: isNewspic ? 'newspic' : 'news',
    titles: args.titles,
    digests: args.digests,
    article_files: articlePaths,
    cover_files: coverPaths,
    content_files: contentFiles,
    brand_top: brandTop,
    brand_bot: brandBot,
    brand_top_enabled: isNewspic ? false : account.profile.brand_images.header.enabled,
    brand_bot_enabled: isNewspic ? false : account.profile.brand_images.footer.enabled,
    cache: readUploadCache(cfg, accountId),
    use_cache: cfg.runtime.use_upload_cache,
    dry_run: cfg.runtime.dry_run,
    need_open_comment: cfg.runtime.need_open_comment ? 1 : 0,
    only_fans_can_comment: 0,
    author: account.profile.author_name,
    brand_name: account.profile.brand_name,
    ending_guide_required: account.profile.content.ending_guide_required,
    content_img_count: isNewspic ? (account.profile.content.newspic_images_per_article || 4) : contentImgs,
    min_words: isNewspic ? (account.profile.content.newspic_min_words ?? 100) : account.profile.content.min_words,
    forbidden: account.profile.content.forbidden_words,
    verify: cfg.runtime.verify_after_publish,
  }
  // job 落临时文件而非 --job-json 内联：job.cache 随发布次数增长，内联会触发 Windows argv 上限（spawn ENAMETOOLONG）
  const jobFile = writeJobFile(sdir, job, 'publish')
  let result: PublishResult
  try {
    result = await runPipeline<PublishResult>(
      cfg,
      'publish_pipeline.py',
      ['--job', jobFile.name, '--scripts-dir', sdir, '--brand-dir', bdir,
        '--resource-dir', runtimeResourceDir()],
      Math.max(600000, n * 120000),
    )
  } finally {
    removeJobFile(jobFile.dir, jobFile.name)
  }

  // 结果落盘：上传缓存续跑 + 发布记录（与项目既有文件兼容）
  writeUploadCache(cfg, accountId, result.cache ?? {})
  if (result.dry_run) {
    return {
      account_id: accountId, platform: 'gzh', dry_run: true, article_count: n,
      titles: args.titles, verify: { checked: false }, result_file: '',
    }
  }
  if (!result.media_id) throw new Error('发布成功但未返回 media_id')
  const mediaIds = result.media_ids && result.media_ids.length > 0 ? result.media_ids : [result.media_id]
  writeTextFile(sdir, MEDIA_ID_FILE, mediaIds.join('\n') + '\n')

  let originalResult: WechatOriginalResult | undefined
  const shouldAutoOriginal = Boolean(args.auto_enable_original ?? account.profile.auto_enable_original ?? cfg.wechat?.auto_enable_original ?? false)
  if (shouldAutoOriginal && !isNewspic) {
    try {
      console.log(`[social-publisher] 账号 ${accountId} 正在通过浏览器模拟进入草稿箱批量开启文字原创...`)
      originalResult = await enableWechatDraftOriginal(cfg, accountId, args.titles, account.profile.author_name)
      if (originalResult.success) {
        console.log(`[social-publisher] 账号 ${accountId} 批量开启原创成功（共 ${originalResult.article_count} 篇）：\n${originalResult.completed.join('\n')}`)
      } else {
        console.warn(`[social-publisher] 账号 ${accountId} 批量开启原创未成功：${originalResult.error}`)
      }
    } catch (e) {
      console.warn(`[social-publisher] 账号 ${accountId} 批量开启原创异常：`, e)
      originalResult = {
        success: false,
        article_count: 0,
        completed: [],
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  const now = stampNow()
  const resultPath = writeTextFile(sdir, RESULT_FILE, JSON.stringify({
    status: 'success',
    account_id: accountId,
    platform: 'gzh',
    article_type: isNewspic ? 'newspic' : 'news',
    draft_media_id: result.media_id,
    draft_media_ids: mediaIds,
    article_count: n,
    author: account.profile.author_name,
    timestamp: now,
    articles: args.titles,
    original_result: originalResult,
  }, null, 2) + '\n')
  try {
    appendPublishRecord(cfg, {
      id: `batch_${now.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
      account_id: accountId,
      platform: 'gzh',
      article_type: isNewspic ? 'newspic' : 'news',
      article_count: n,
      author: account.profile.author_name,
      timestamp: now,
      draft_media_id: result.media_id,
      draft_media_ids: mediaIds,
      articles: args.titles,
      digests: args.digests,
      items: args.titles.map((title, i) => ({
        index: i + 1,
        title,
        digest: args.digests[i] || '',
        draft_id: isNewspic ? (mediaIds[i] || result.media_id) : result.media_id,
      })),
    })
  } catch {
    // best-effort history append
  }
  return {
    account_id: accountId, platform: 'gzh', dry_run: false,
    media_id: result.media_id,
    media_ids: mediaIds,
    article_count: result.article_count ?? n,
    titles: args.titles,
    verify: result.verify ?? { checked: false },
    result_file: resultPath,
    // 仅在真正执行过「开启原创」时输出该字段：显式 undefined 不是无损 JSON，
    // 会被宿主工具输出校验拒绝，导致发布成功却报 "value is not lossless JSON"。
    ...(originalResult ? { original_result: originalResult } : {}),
  }
}

/** 公众号免 API 浏览器发布分支：通过本机无头/有头浏览器登录态直接在公众号后台创建草稿并保存 */
async function publishGzhBrowser(
  cfg: Config, accountId: string, sdir: string, args: PublishArgs, n: number, isNewspic: boolean,
): Promise<PublishOk> {
  const account = resolveAccount(cfg, accountId)
  const contentImgs = contentImagesPerArticle(cfg, account.profile)
  const ext = isNewspic ? '_pic.json' : '.html'
  const articlePaths = defaultArticleFiles(sdir, n, ext, args.article_files)

  const coverPaths: string[] = []
  const contentFiles: Record<string, string> = {}
  if (!isNewspic) {
    for (let i = 1; i <= n; i++) {
      if (cfg.runtime.dry_run) {
        coverPaths.push(path.resolve(sdir, 'cover_' + i + '.png'))
      } else {
        coverPaths.push(findImage(sdir, 'cover_' + i))
      }
      for (let j = 1; j <= contentImgs; j++) {
        const key = 'IMG_A' + i + '_' + j
        contentFiles[key] = cfg.runtime.dry_run
          ? path.resolve(sdir, 'content_' + i + '_' + j + '.png')
          : findImage(sdir, 'content_' + i + '_' + j)
      }
    }
  }

  const bdir = brandDir(cfg)
  const brandTop = brandImagePath(cfg, account.profile.brand_images.header.file, 'brand_top.jpg')
  const brandBot = brandImagePath(cfg, account.profile.brand_images.footer.file, 'brand_bot.jpg')

  const job: WechatBrowserPublishJob = {
    account_id: accountId,
    article_type: isNewspic ? 'newspic' : 'news',
    titles: args.titles,
    digests: args.digests,
    article_files: articlePaths,
    cover_files: coverPaths,
    content_files: contentFiles,
    brand_top: brandTop,
    brand_bot: brandBot,
    brand_top_enabled: isNewspic ? false : account.profile.brand_images.header.enabled,
    brand_bot_enabled: isNewspic ? false : account.profile.brand_images.footer.enabled,
    author: account.profile.author_name,
    brand_name: account.profile.brand_name,
    auto_enable_original: Boolean(args.auto_enable_original ?? account.profile.auto_enable_original ?? cfg.wechat?.auto_enable_original ?? false),
    dry_run: Boolean(cfg.runtime.dry_run),
    min_words: isNewspic ? (account.profile.content.newspic_min_words ?? 100) : account.profile.content.min_words,
    forbidden: account.profile.content.forbidden_words,
  }

  const result = await publishWechatDraftByBrowser(cfg, accountId, job)
  if (result.dry_run) {
    return {
      account_id: accountId,
      platform: 'gzh',
      publish_mode: 'browser',
      dry_run: true,
      article_count: n,
      titles: args.titles,
      verify: { checked: false },
      result_file: '',
    }
  }

  const now = stampNow()
  const authorName = account.profile.author_name || '文映学术win00.cn'
  const resultData = {
    status: 'success',
    account_id: accountId,
    platform: 'gzh',
    publish_mode: 'browser',
    article_count: n,
    author: authorName,
    timestamp: now,
    media_id: result.media_id,
    media_ids: result.media_ids,
    articles: args.titles,
    draft_url: result.draft_url,
    original_result: result.original_result,
  }
  const resultPath = writeTextFile(sdir, RESULT_FILE, JSON.stringify(resultData, null, 2) + '\n')
  writeTextFile(sdir, MEDIA_ID_FILE, result.media_ids.join('\n') + '\n')

  try {
    appendPublishRecord(cfg, {
      id: `batch_${now.replace(/[^0-9]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`,
      account_id: accountId,
      account_name: account.profile.name,
      platform: 'gzh',
      publish_mode: 'browser',
      article_type: isNewspic ? 'newspic' : 'news',
      article_count: n,
      author: authorName,
      timestamp: now,
      draft_media_id: result.media_id,
      draft_media_ids: result.media_ids,
      articles: args.titles,
      digests: args.digests,
      items: args.titles.map((t, i) => ({
        index: i + 1,
        title: t,
        digest: args.digests[i] || '',
        draft_id: result.media_ids[i] || result.media_id,
        url: result.draft_url,
      })),
    })
  } catch {
    // best-effort history append
  }

  return {
    account_id: accountId,
    platform: 'gzh',
    publish_mode: 'browser',
    dry_run: false,
    media_id: result.media_id,
    media_ids: result.media_ids,
    article_count: n,
    titles: args.titles,
    draft_url: result.draft_url,
    verify: result.verify || { checked: true, article_count: n },
    result_file: resultPath,
    ...(result.original_result ? { original_result: result.original_result } : {}),
  }
}
