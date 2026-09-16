import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { runZhihuPublish } from '../zhihu.ts'
import {
  MEDIA_ID_FILE, RESULT_FILE, accountScriptsDir, assertWechatCreds, brandDir,
  brandImagePath, contentImagesPerArticle, findImage, readUploadCache, renderJson, runPipeline, writeTextFile,
  runtimeResourceDir, writeUploadCache,
} from './shared.ts'

interface PublishResult {
  dry_run: boolean
  media_id?: string
  article_count?: number
  titles?: string[]
  cache: Record<string, string>
  verify?: { checked: boolean; article_count?: number }
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
  dry_run: boolean
  media_id?: string
  drafts?: ZhihuDraftInfo[]
  article_count: number
  titles: string[]
  verify: { checked: boolean; article_count?: number }
  result_file: string
}

interface PublishArgs {
  titles: string[]
  digests: string[]
  article_files?: string[]
  article_type?: 'news' | 'newspic'
  account_id?: string
}

function stampNow(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export function publishTool(cfg: Config) {
  return defineTool<PublishArgs, PublishOk>({
    name: 'gzh_publish_draft',
    description:
      '组合发布：公众号账号走 上传素材（缓存断点续跑）→ 替换占位符 → 机器校验 → draft/add 合并为草稿' +
      '（长文为多图文，小绿书为图片消息草稿，不直接群发），可选 draft/get 核验；知乎账号走 浏览器自动化（登录态发布，N 篇 = N 个独立草稿，' +
      '默认只存知乎草稿箱）。发布前请先对全部文章跑 gzh_validate_html。演练模式（设置中 dry_run）只校验不联网。',
    parameters: {
      titles: {
        type: 'array',
        required: true,
        description: '每篇标题（公众号长文 ≤64 字，小绿书 ≤32 字，知乎 ≤100 字），数量须等于设置的每日文章数',
        items: { type: 'string' },
      },
      digests: {
        type: 'array',
        required: true,
        description: '每篇摘要（≤120 字）；知乎/小绿书无摘要字段但数量仍须一致（保持调用契约统一）',
        items: { type: 'string' },
      },
      article_files: {
        type: 'array',
        description: '可选：自定义文章文件名（scripts 目录内）；缺省公众号长文用 article_v2_1..N.html，小绿书用 article_v2_1..N_pic.json，知乎用 article_v2_1..N.md',
        items: { type: 'string' },
      },
      article_type: {
        type: 'string',
        description: '可选：指定发布的文章形态（news=长图文草稿，newspic=小绿书图片消息草稿）；缺省按账号设置',
        enum: ['news', 'newspic'],
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省使用默认账号',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      const content = account.profile.content
      const platform = account.profile.platform === 'zhihu' ? 'zhihu' : 'gzh'
      const n = content.articles_per_day
      if (!Array.isArray(args.titles) || args.titles.length !== n) {
        throw new Error('titles 必须是 ' + n + ' 个')
      }
      if (!Array.isArray(args.digests) || args.digests.length !== n) {
        throw new Error('digests 必须是 ' + n + ' 个')
      }
      const maxTitle = platform === 'zhihu' ? 100 : 64
      for (const t of args.titles) {
        if (typeof t !== 'string' || t.length > maxTitle) throw new Error('标题超 ' + maxTitle + ' 字: ' + String(t).slice(0, 40))
      }
      for (const d of args.digests) {
        if (typeof d !== 'string' || d.length > 120) throw new Error('摘要超 120 字: ' + String(d).slice(0, 40))
      }
      const sdir = accountScriptsDir(cfg, account.id)
      if (platform === 'zhihu') {
        return publishZhihu(cfg, account.id, sdir, args, n)
      }
      return publishGzh(cfg, account.id, sdir, args, n)
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
  const contentImgs = contentImagesPerArticle(cfg)
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
  const resultPath = writeTextFile(sdir, RESULT_FILE, JSON.stringify({
    status: 'success',
    account_id: accountId,
    platform: 'zhihu',
    article_count: n,
    author: cfg.accounts[accountId]?.author_name ?? '',
    timestamp: stampNow(),
    articles: args.titles,
    drafts: result.drafts,
  }, null, 2) + '\n')
  writeTextFile(sdir, 'draft_urls.txt', result.drafts.map((d) => d.url).join('\n') + '\n')
  return {
    account_id: accountId, platform: 'zhihu', dry_run: false,
    drafts: result.drafts, article_count: result.drafts.length, titles: args.titles,
    verify: { checked: false }, result_file: resultPath,
  }
}

/** 公众号分支：与既有链路逐字节等价（上传缓存 → 占位符替换 → 校验 → draft/add → 可选核验） */
async function publishGzh(
  cfg: Config, accountId: string, sdir: string, args: PublishArgs, n: number,
): Promise<PublishOk> {
  const account = resolveAccount(cfg, accountId)
  const isNewspic = (args.article_type === 'newspic') ||
    (!args.article_type && account.profile.content.article_type === 'newspic') ||
    (args.article_files && args.article_files.some((f) => f.endsWith('_pic.json') || f.endsWith('.json')))
  const contentImgs = contentImagesPerArticle(cfg)
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
    min_words: isNewspic ? Math.min(account.profile.content.min_words, 100) : account.profile.content.min_words,
    forbidden: account.profile.content.forbidden_words,
    verify: cfg.runtime.verify_after_publish,
  }
  const result = await runPipeline<PublishResult>(
    cfg,
    'publish_pipeline.py',
    ['--job-json', JSON.stringify(job), '--scripts-dir', sdir, '--brand-dir', bdir,
      '--resource-dir', runtimeResourceDir()],
    Math.max(600000, n * 120000),
  )

  // 结果落盘：上传缓存续跑 + 发布记录（与项目既有文件兼容）
  writeUploadCache(cfg, accountId, result.cache ?? {})
  if (result.dry_run) {
    return {
      account_id: accountId, platform: 'gzh', dry_run: true, article_count: n,
      titles: args.titles, verify: { checked: false }, result_file: '',
    }
  }
  if (!result.media_id) throw new Error('发布成功但未返回 media_id')
  writeTextFile(sdir, MEDIA_ID_FILE, result.media_id + '\n')
  const resultPath = writeTextFile(sdir, RESULT_FILE, JSON.stringify({
    status: 'success',
    account_id: accountId,
    platform: 'gzh',
    draft_media_id: result.media_id,
    article_count: n,
    author: account.profile.author_name,
    timestamp: stampNow(),
    articles: args.titles,
  }, null, 2) + '\n')
  return {
    account_id: accountId, platform: 'gzh', dry_run: false,
    media_id: result.media_id,
    article_count: result.article_count ?? n,
    titles: args.titles,
    verify: result.verify ?? { checked: false },
    result_file: resultPath,
  }
}
