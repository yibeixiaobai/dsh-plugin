import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { appendPublishRecord, readAccountPublishRecords } from '../publish-history.ts'
import { runZhihuPublish } from '../zhihu.ts'
import { runXhsPublish } from '../xiaohongshu.ts'
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
      '知乎账号走 浏览器自动化（登录态发布，N 篇 = N 个独立草稿，默认只存知乎草稿箱）。' +
      '发布前请先对全部文章跑 gzh_validate_html。演练模式（设置中 dry_run）只校验不联网。',
    parameters: {
      titles: {
        type: 'array',
        required: true,
        description: '每篇标题（长文 ≤64 字，小绿书 ≤32 字，知乎 ≤100 字），数量须与 digests 一致（支持补充要求自定义篇数 1~20 篇）',
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
        description: '可选：自定义文章文件名（scripts 目录内）；缺省长文用 article_v2_1..N.html，小绿书用 article_v2_1..N_pic.json，知乎用 article_v2_1..N.md',
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
      const platform = account.profile.platform === 'zhihu' ? 'zhihu' : account.profile.platform === 'xiaohongshu' ? 'xiaohongshu' : 'gzh'
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
      const maxTitle = platform === 'zhihu' ? 100 : platform === 'xiaohongshu' ? 20 : isNewspic ? 32 : 64
      for (const t of args.titles) {
        if (typeof t !== 'string' || t.length > maxTitle) throw new Error('标题超 ' + maxTitle + ' 字: ' + String(t).slice(0, 40))
      }
      for (const d of args.digests) {
        if (typeof d !== 'string' || d.length > 120) throw new Error('摘要超 120 字: ' + String(d).slice(0, 40))
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
        return publishXiaohongshu(cfg, account.id, sdir, args, n)
      }
      if (platform === 'zhihu') {
        return publishZhihu(cfg, account.id, sdir, args, n)
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
  const result = await runXhsPublish(cfg, accountId, job)

  if (result.dry_run) {
    return {
      account_id: accountId, platform: 'xiaohongshu', dry_run: true, article_count: n,
      titles: args.titles, verify: { checked: false }, result_file: '',
    }
  }
  const now = stampNow()
  const authorName = account.profile.author_name
  // 防呆：真正的成功必须每一篇都拿到真实 note id。
  // 历史坑：底层曾用过于宽松的文本正则判定成功，导致返回 "pending_N" 占位符时
  // 这里仍硬编码 status:'success'，形成「假成功」。此处做最后一道拦截。
  const placeholder = result.notes.filter((d) => !d.note_id || /^pending_/i.test(d.note_id))
  if (placeholder.length > 0) {
    const bad = placeholder.map((d) => d.title).join('、')
    writeTextFile(sdir, RESULT_FILE, JSON.stringify({
      status: 'failed',
      account_id: accountId,
      platform: 'xiaohongshu',
      article_count: n,
      author: authorName,
      timestamp: now,
      articles: args.titles,
      error: '以下笔记未取得真实笔记ID（发布未生效，疑似未登录或编辑器未渲染）: ' + bad,
      drafts: result.notes,
    }, null, 2) + '\n')
    throw new Error(
      '小红书发布未真正成功：' + bad +
      ' 未返回真实笔记ID（返回占位符）。请检查登录态与创作者后台可达性后重试。',
    )
  }
  const resultPath = writeTextFile(sdir, RESULT_FILE, JSON.stringify({
    status: 'success',
    account_id: accountId,
    platform: 'xiaohongshu',
    article_count: n,
    author: authorName,
    timestamp: now,
    articles: args.titles,
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
      items: result.notes.map((d, i) => ({
        index: i + 1,
        title: d.title,
        digest: args.digests[i] || '',
        draft_id: d.note_id,
        url: d.url,
        published: d.published,
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
