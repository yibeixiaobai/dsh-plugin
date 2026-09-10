import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import {
  assertWechatCreds, expectedArticleImageCount, renderJson, runPipeline, runtimeResourceDir, scriptsDir,
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
  account_id: string
  article_count: number
  expected: number
  articles: VerifyArticle[]
}

export function verifyTool(cfg: Config) {
  return defineTool<{ media_id: string; account_id?: string }, VerifyReport>({
    name: 'gzh_verify_draft',
    description:
      '草稿核验：draft/get（POST）逐篇核对标题长度/作者/摘要长度/图片数量/CDN 域名/品牌引导语/禁词。' +
      'media_id 来自 gzh_publish_draft 的返回。',
    parameters: {
      media_id: { type: 'string', required: true, description: '草稿 media_id' },
      account_id: {
        type: 'string',
        description: '公众号账号 ID；缺省使用默认账号',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      const content = account.profile.content
      if (!args.media_id || typeof args.media_id !== 'string') throw new Error('media_id 不能为空')
      if (!cfg.runtime.dry_run) assertWechatCreds(cfg, account.id)
      const report = await runPipeline<Omit<VerifyReport, 'account_id'>>(
        cfg,
        'verify_draft.py',
        [
          '--media-id', args.media_id,
          '--account-id', account.id,
          '--scripts-dir', scriptsDir(cfg),
          '--resource-dir', runtimeResourceDir(),
          '--expected-count', String(content.articles_per_day),
          '--author', account.profile.author_name,
          '--brand-name', account.profile.brand_name,
          '--expected-img-count', String(expectedArticleImageCount(account.profile)),
          '--min-words', String(content.min_words),
          '--forbidden', JSON.stringify(content.forbidden_words),
        ],
        120000,
      )
      return { account_id: account.id, ...report }
    },
  })
}
