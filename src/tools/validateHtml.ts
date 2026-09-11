import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { accountScriptsDir, expectedArticleImageCount, renderJson, runPipeline, runtimeResourceDir } from './shared.ts'

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
  return defineTool<{ files: string[]; allow_placeholders?: boolean; account_id?: string }, ValidateReport>({
    name: 'gzh_validate_html',
    description:
      '发布前机器校验：换行/unicode 转义/占位符/纯文字字数/禁词/品牌引导语/图片数量/CDN 域名，' +
      '可选叠加 gzh-design 合规 lint（ERROR 清零才能交付）。发布前对全部文章跑一遍。',
    parameters: {
      files: {
        type: 'array',
        required: true,
        description: '文章 HTML 文件名列表（scripts 目录内，如 article_v2_1.html）',
        items: { type: 'string' },
      },
      allow_placeholders: {
        type: 'boolean',
        description: '是否处于发布前阶段（允许 IMG_*/__BRAND_* 占位符）；发布前传 true，替换占位符后传 false',
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
      const files = args.files ?? []
      if (!Array.isArray(files) || files.length === 0) throw new Error('files 不能为空')
      for (const f of files) {
        if (typeof f !== 'string' || /[\\/]/.test(f) || !f.endsWith('.html')) {
          throw new Error('files 必须是 scripts 目录内的 HTML 文件名（不带路径）: ' + String(f))
        }
      }
      const cmd = [
        '--files', JSON.stringify(files),
        '--scripts-dir', accountScriptsDir(cfg, account.id),
        '--resource-dir', runtimeResourceDir(),
        '--min-words', String(content.min_words),
        '--forbidden', JSON.stringify(content.forbidden_words),
        '--brand-name', account.profile.brand_name,
        '--img-count', String(expectedArticleImageCount(cfg, account.profile)),
        '--lint',
      ]
      if (args.allow_placeholders !== false) cmd.push('--allow-placeholders')
      const report = await runPipeline<Omit<ValidateReport, 'account_id'>>(cfg, 'check_html.py', cmd, 120000)
      return { account_id: account.id, ...report }
    },
  })
}
