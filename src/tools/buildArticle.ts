import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import {
  accountScriptsDir, contentImagesPerArticle, expectedArticleImageCount, renderJson, resolveTheme, runPipeline,
  runtimeResourceDir, writeTextFile,
} from './shared.ts'

interface BuiltArticle {
  index: number
  theme: string
  html?: string
  markdown?: string
  platform?: string
  plain_chars: number
  img_count: number
  problems?: string[]
}

interface CheckReport {
  passed: boolean
  results: Array<{ file: string; plain_chars: number; img_count: number; problems: string[]; lint?: { exit: number; output: string } | null }>
}

export interface BuildOk {
  account_id: string
  file: string
  index: number
  theme: string
  plain_chars: number
  img_count: number
}

export function buildArticleTool(cfg: Config) {
  return defineTool<{ doc_json: string; account_id?: string }, BuildOk>({
    name: 'gzh_build_article',
    description:
      '把文章内容按 doc spec 构建为平台合规产物并落盘：公众号账号产出单行 HTML（gzh_components 融合版组件），' +
      '知乎账号产出标准 Markdown（article_v2_{index}.md）。自动断言字数/图片数/品牌引导语/禁词，' +
      '随后跑平台对应的机器校验。doc spec 格式先调 gzh_get_style_guide 获取（按账号平台返回）；' +
      '公众号主题按设置的头条/次条/rotate 规则按篇强制解析，doc 内 theme 字段被忽略。',
    parameters: {
      doc_json: {
        type: 'string',
        required: true,
        description: 'doc spec JSON 字符串（格式见 gzh_get_style_guide 返回的 doc_spec 字段）',
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
      let doc: Record<string, unknown>
      try {
        doc = JSON.parse(args.doc_json) as Record<string, unknown>
      } catch {
        throw new Error('doc_json 不是合法 JSON：' + String(args.doc_json).slice(0, 120))
      }
      const idx = Number(doc.index)
      if (!Number.isInteger(idx) || idx < 1 || idx > content.articles_per_day) {
        throw new Error('index 必须是 1~' + content.articles_per_day)
      }
      const sdir = accountScriptsDir(cfg, account.id)
      // 主题严格按设置解析（头条/次条/rotate 按篇轮换），doc 内自带 theme 一律忽略，防止自由发挥
      const theme = platform === 'zhihu' ? 'markdown' : resolveTheme(cfg, idx)

      const built = await runPipeline<BuiltArticle>(
        cfg,
        'build_article.py',
        [
          '--doc-json', JSON.stringify({ ...doc, index: idx, theme: platform === 'zhihu' ? 'wenying' : theme }),
          '--scripts-dir', sdir,
          '--resource-dir', runtimeResourceDir(),
          '--min-words', String(content.min_words),
          '--forbidden', JSON.stringify(content.forbidden_words),
          '--platform', platform,
          ...(platform === 'zhihu'
            ? [
              '--content-img-count', String(contentImagesPerArticle(cfg)),
              ...(content.ending_guide_required ? ['--require-brand'] : []),
              '--brand-name', account.profile.brand_name,
            ]
            : [
              '--content-img-count', String(contentImagesPerArticle(cfg)),
              '--brand-name', account.profile.brand_name,
              '--brand-images', JSON.stringify(account.profile.brand_images),
              '--typography', JSON.stringify({
                font_size: cfg.typography.font_size,
                line_height: cfg.typography.line_height,
                paragraph_margin: cfg.typography.paragraph_margin,
                text_indent: cfg.typography.text_indent,
              }),
            ]),
        ],
        120000,
      )

      // Python 纯构建返回产物，TS 侧落盘（文件名白名单 + 目录守卫）
      const ext = platform === 'zhihu' ? '.md' : '.html'
      const name = 'article_v2_' + idx + ext
      const payload = platform === 'zhihu' ? built.markdown : built.html
      if (payload === undefined) throw new Error('构建结果缺少' + (platform === 'zhihu' ? 'markdown' : 'html') + '字段')
      const file = writeTextFile(sdir, name, payload)

      // 完整发布级校验（占位符阶段）；gzh-design lint 仅对公众号 HTML 有意义
      const expectedImgs = platform === 'zhihu' ? contentImagesPerArticle(cfg) : expectedArticleImageCount(cfg, account.profile)
      const check = await runPipeline<CheckReport>(
        cfg,
        'check_html.py',
        [
          '--files', JSON.stringify([name]),
          '--scripts-dir', sdir,
          '--resource-dir', runtimeResourceDir(),
          '--min-words', String(content.min_words),
          '--forbidden', JSON.stringify(content.forbidden_words),
          '--brand-name', account.profile.brand_name,
          '--img-count', String(expectedImgs),
          '--allow-placeholders',
          '--platform', platform,
          ...(platform === 'zhihu' && content.ending_guide_required ? ['--require-brand'] : []),
          ...(platform === 'gzh' ? ['--lint'] : []),
        ],
        120000,
      )

      const problems = [...(built.problems ?? [])]
      for (const r of check.results) problems.push(...r.problems)
      if (problems.length > 0 || !check.passed) {
        const lintTail = check.results
          .map((r) => r.lint?.output ?? '')
          .filter(Boolean)
          .join('\n')
          .slice(-1500)
        throw new Error('文章已生成（' + file + '）但校验未通过：\n' + problems.join('\n') +
          (lintTail ? '\n--- lint ---\n' + lintTail : ''))
      }
      return {
        account_id: account.id,
        file, index: idx, theme, plain_chars: built.plain_chars, img_count: built.img_count,
      }
    },
  })
}
