import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import {
  assertWechatCreds, expectedArticleImageCount, renderJson, runPipeline, scriptsDir,
} from './shared.ts'

export interface VerifyArticle {
  index: number
  title: string
  author: string
  digest: string
  digest_len: number
  plain_chars: number
  img_count: number
  all_cdn: boolean
  problems: string[]
}

export interface VerifyReport {
  article_count: number
  expected: number
  articles: VerifyArticle[]
}

export function verifyTool(cfg: Config) {
  return defineTool<{ media_id: string }, VerifyReport>({
    name: 'gzh_verify_draft',
    description:
      '草稿核验：draft/get（POST）逐篇核对标题长度/作者/摘要长度/图片数量/CDN 域名/品牌引导语/禁词。' +
      'media_id 来自 gzh_publish_draft 的返回。',
    parameters: {
      media_id: { type: 'string', required: true, description: '草稿 media_id' },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      if (!args.media_id || typeof args.media_id !== 'string') throw new Error('media_id 不能为空')
      if (!cfg.runtime.dry_run) assertWechatCreds(cfg)
      return runPipeline<VerifyReport>(
        cfg,
        'verify_draft.py',
        [
          '--media-id', args.media_id,
          '--scripts-dir', scriptsDir(cfg),
          '--expected-count', String(cfg.content.articles_per_day),
          '--author', cfg.wechat.author_name,
          '--brand-name', cfg.wechat.brand_name,
          '--expected-img-count', String(expectedArticleImageCount(cfg)),
          '--min-words', String(cfg.content.min_words),
          '--forbidden', JSON.stringify(cfg.content.forbidden_words),
        ],
        120000,
      )
    },
  })
}
