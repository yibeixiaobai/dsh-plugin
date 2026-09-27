import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { accountScriptsDir, contentImagesPerArticle, expectedArticleImageCount, renderJson, runPipeline, runtimeResourceDir } from './shared.ts'

export interface ValidateReport {
  account_id: string
  passed: boolean
  results: Array<{
    file: string
    plain_chars: number
    img_count: number
    problems: string[]
    lint?: { exit: number; output: string } | null
  }>
}

export function validateHtmlTool(cfg: Config) {
  return defineTool<{
    files?: string[]
    allow_placeholders?: boolean
    article_type?: 'news' | 'newspic'
    account_id?: string
    min_words?: number
    img_count?: number
  }, ValidateReport>({
    name: 'gzh_validate_html',
    description:
      '发布前机器校验：公众号校验换行/unicode 转义/占位符/纯文字字数/禁词/品牌引导语/图片数量/CDN 域名，' +
      '可选叠加 gzh-design 合规 lint（ERROR 清零才能交付）；知乎账号校验 Markdown 文章的字数/禁词/图片占位符。' +
      '支持通过 min_words / img_count 自定义校验阈值（优先支持用户补充要求的特殊设置）。发布前对全部文章跑一遍。',
    parameters: {
      files: {
        type: 'array',
        description: '可选：文章文件名列表（scripts 目录内；公众号长文为 .html，小绿书为 _pic.json，知乎为 .md；缺省或留空自动校验该账号全部文章）',
        items: { type: 'string' },
      },
      article_type: {
        type: 'string',
        description: '可选：指定文章形态（news=长文，newspic=小绿书图片消息）；缺省按账号设置',
        enum: ['news', 'newspic'],
      },
      allow_placeholders: {
        type: 'boolean',
        description: '是否处于发布前阶段（允许 IMG_*/__BRAND_* 占位符）；发布前传 true，替换占位符后传 false',
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省使用默认账号',
      },
      min_words: {
        type: 'number',
        description: '可选：自定义纯文字下限（优先支持补充要求指定的字数）',
      },
      img_count: {
        type: 'number',
        description: '可选：自定义正文配图/卡片总数（优先支持补充要求指定的配图数）',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      const content = account.profile.content
      const platform = account.profile.platform === 'zhihu' ? 'zhihu' : account.profile.platform === 'xiaohongshu' ? 'xiaohongshu' : 'gzh'
      const isNewspic = platform === 'gzh' && (
        args.article_type === 'newspic' ||
        (!args.article_type && content.article_type === 'newspic') ||
        Boolean(args.files && args.files.some((f) => f.endsWith('_pic.json') || f.endsWith('.json')))
      )
      const count = isNewspic ? (content.newspic_articles_per_day || 1) : content.articles_per_day
      const requiredExt = platform === 'zhihu' ? '.md' : platform === 'xiaohongshu' ? '_xhs.txt' : isNewspic ? '_pic.json' : '.html'
      let files = Array.isArray(args.files) ? args.files.filter(Boolean).map(String) : []
      if (files.length === 0) {
        files = Array.from({ length: count }, (_, i) => `article_v2_${i + 1}${requiredExt}`)
      } else {
        files = files.map((f) => {
          const trimmed = f.trim()
          if (trimmed.endsWith('.md') || trimmed.endsWith('.html') || trimmed.endsWith('.json') || trimmed.endsWith('.txt')) return trimmed
          return trimmed + requiredExt
        })
      }
      const filesAreNewspic = isNewspic || files.some((f) => f.endsWith('_pic.json') || f.endsWith('.json'))
      for (const f of files) {
        if (/[\\/]/.test(f)) {
          throw new Error('files 不能包含路径分隔符: ' + String(f))
        }
      }
      const defaultExpectedImgs = filesAreNewspic
        ? (content.newspic_images_per_article || 4)
        : platform === 'zhihu'
          ? contentImagesPerArticle(cfg)
          : platform === 'xiaohongshu'
            ? (content.xhs_images_per_note || 4)
            : expectedArticleImageCount(cfg, account.profile)
      const expectedImgs = typeof args.img_count === 'number' && args.img_count >= 0
        ? args.img_count
        : defaultExpectedImgs

      const defaultMinWords = filesAreNewspic
        ? Math.min(content.min_words, 100)
        : platform === 'xiaohongshu'
          ? (content.xhs_min_words ?? 200)
          : content.min_words
      const minWords = typeof args.min_words === 'number' && args.min_words > 0
        ? args.min_words
        : defaultMinWords

      const cmd = [
        '--files', JSON.stringify(files),
        '--scripts-dir', accountScriptsDir(cfg, account.id),
        '--resource-dir', runtimeResourceDir(),
        '--min-words', String(minWords),
        '--forbidden', JSON.stringify(content.forbidden_words),
        '--brand-name', account.profile.brand_name,
        '--img-count', String(expectedImgs),
        '--platform', platform,
        '--article-type', filesAreNewspic ? 'newspic' : 'news',
      ]
      if ((platform === 'zhihu' || platform === 'xiaohongshu' || filesAreNewspic) && content.ending_guide_required) cmd.push('--require-brand')
      if (platform === 'gzh' && !filesAreNewspic) cmd.push('--lint')
      if (args.allow_placeholders !== false) cmd.push('--allow-placeholders')
      const report = await runPipeline<Omit<ValidateReport, 'account_id'>>(cfg, 'check_html.py', cmd, 120000)
      return { account_id: account.id, ...report }
    },
  })
}
