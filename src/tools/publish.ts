import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import {
  MEDIA_ID_FILE, RESULT_FILE, assertWechatCreds, brandDir,
  brandImagePath, findImage, readUploadCache, renderJson, runPipeline, scriptsDir, writeTextFile,
  writeUploadCache,
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

export interface PublishOk {
  account_id: string
  dry_run: boolean
  media_id?: string
  article_count: number
  titles: string[]
  verify: { checked: boolean; article_count?: number }
  result_file: string
}

export function publishTool(cfg: Config) {
  return defineTool<{
    titles: string[]
    digests: string[]
    article_files?: string[]
    account_id?: string
  }, PublishOk>({
    name: 'gzh_publish_draft',
    description:
      '组合发布：上传品牌图/正文图/封面（缓存断点续跑）→ 替换占位符 → 机器校验 → draft/add 合并为 1 个多图文' +
      '草稿到草稿箱（不直接群发），可选 draft/get 核验。发布前请先对全部文章跑 gzh_validate_html。' +
      '演练模式（设置中 dry_run）只校验不联网。',
    parameters: {
      titles: {
        type: 'array',
        required: true,
        description: '每篇标题（≤64 字），数量须等于设置的每日文章数',
        items: { type: 'string' },
      },
      digests: {
        type: 'array',
        required: true,
        description: '每篇摘要（≤120 字），数量须等于设置的每日文章数',
        items: { type: 'string' },
      },
      article_files: {
        type: 'array',
        description: '可选：自定义文章 HTML 文件名（scripts 目录内）；缺省用 article_v2_1..N.html',
        items: { type: 'string' },
      },
      account_id: {
        type: 'string',
        description: '公众号账号 ID；缺省使用默认账号',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      const content = account.profile.content
      const n = content.articles_per_day
      if (!Array.isArray(args.titles) || args.titles.length !== n) {
        throw new Error('titles 必须是 ' + n + ' 个')
      }
      if (!Array.isArray(args.digests) || args.digests.length !== n) {
        throw new Error('digests 必须是 ' + n + ' 个')
      }
      for (const t of args.titles) {
        if (typeof t !== 'string' || t.length > 64) throw new Error('标题超 64 字: ' + String(t).slice(0, 40))
      }
      for (const d of args.digests) {
        if (typeof d !== 'string' || d.length > 120) throw new Error('摘要超 120 字: ' + String(d).slice(0, 40))
      }
      const sdir = scriptsDir(cfg)

      const articleFiles = args.article_files?.length
        ? args.article_files
        : Array.from({ length: n }, (_, i) => 'article_v2_' + (i + 1) + '.html')
      const articlePaths = articleFiles.map((f) => path.resolve(sdir, f))

      // 封面/正文图：演练模式不要求存在，正式发布缺失即报错
      const coverPaths: string[] = []
      const contentFiles: Record<string, string> = {}
      for (let i = 1; i <= n; i++) {
        if (cfg.runtime.dry_run) {
          coverPaths.push(path.resolve(sdir, 'cover_' + i + '.png'))
        } else {
          coverPaths.push(findImage(sdir, 'cover_' + i))
        }
        for (let j = 1; j <= cfg.image_api.content_images_per_article; j++) {
          const key = 'IMG_A' + i + '_' + j
          contentFiles[key] = cfg.runtime.dry_run
            ? path.resolve(sdir, 'content_' + i + '_' + j + '.png')
            : findImage(sdir, 'content_' + i + '_' + j)
        }
      }
      const bdir = brandDir(cfg)
      const brandTop = brandImagePath(cfg, account.profile.brand_images.header.file, 'brand_top.jpg')
      const brandBot = brandImagePath(cfg, account.profile.brand_images.footer.file, 'brand_bot.jpg')

      if (!cfg.runtime.dry_run) {
        assertWechatCreds(cfg, account.id)
        if (account.profile.brand_images.header.enabled && !fs.existsSync(brandTop)) {
          throw new Error('缺少头部品牌图: ' + brandTop)
        }
        if (account.profile.brand_images.footer.enabled && !fs.existsSync(brandBot)) {
          throw new Error('缺少尾部品牌图: ' + brandBot)
        }
      }

      const job = {
        account_id: account.id,
        titles: args.titles,
        digests: args.digests,
        article_files: articlePaths,
        cover_files: coverPaths,
        content_files: contentFiles,
        brand_top: brandTop,
        brand_bot: brandBot,
        brand_top_enabled: account.profile.brand_images.header.enabled,
        brand_bot_enabled: account.profile.brand_images.footer.enabled,
        cache: readUploadCache(cfg),
        use_cache: cfg.runtime.use_upload_cache,
        dry_run: cfg.runtime.dry_run,
        need_open_comment: cfg.runtime.need_open_comment ? 1 : 0,
        only_fans_can_comment: 0,
        author: account.profile.author_name,
        brand_name: account.profile.brand_name,
        min_words: content.min_words,
        forbidden: content.forbidden_words,
        verify: cfg.runtime.verify_after_publish,
      }
      const result = await runPipeline<PublishResult>(
        cfg,
        'publish_pipeline.py',
        ['--job-json', JSON.stringify(job), '--scripts-dir', sdir, '--brand-dir', bdir],
        Math.max(600000, n * 120000),
      )

      // 结果落盘：上传缓存续跑 + 发布记录（与项目既有文件兼容）
      writeUploadCache(cfg, result.cache ?? {})
      if (result.dry_run) {
        return {
          account_id: account.id,
          dry_run: true,
          article_count: n,
          titles: args.titles,
          verify: { checked: false },
          result_file: '',
        }
      }
      if (!result.media_id) throw new Error('发布成功但未返回 media_id')
      writeTextFile(sdir, MEDIA_ID_FILE, result.media_id + '\n')
      const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const resultPath = writeTextFile(sdir, RESULT_FILE, JSON.stringify({
        status: 'success',
        account_id: account.id,
        draft_media_id: result.media_id,
        article_count: n,
        author: account.profile.author_name,
        timestamp: stamp,
        articles: args.titles,
      }, null, 2) + '\n')
      return {
        account_id: account.id,
        dry_run: false,
        media_id: result.media_id,
        article_count: result.article_count ?? n,
        titles: args.titles,
        verify: result.verify ?? { checked: false },
        result_file: resultPath,
      }
    },
  })
}
