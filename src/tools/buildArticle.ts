import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config, ThemeKey } from '../config.ts'
import { THEME_KEYS } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import {
  expectedArticleImageCount, renderJson, runPipeline, scriptsDir, writeTextFile,
} from './shared.ts'

interface BuiltArticle {
  index: number
  theme: string
  html: string
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
      '把文章内容按 doc spec 构建为公众号合规的单行 HTML（gzh_components 融合版组件：引言卡/三列目录/' +
      '章节徽章/关键词下划线/卡片图/签名区），自动断言字数/图片数/品牌引导语/禁词，落盘 article_v2_{index}.html ' +
      '并跑 gzh-design 合规 lint。doc spec 格式先调 gzh_get_style_guide 获取。',
    parameters: {
      doc_json: {
        type: 'string',
        required: true,
        description: 'doc spec JSON 字符串（格式见 gzh_get_style_guide 返回的 doc_spec 字段）',
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
      const theme = (typeof doc.theme === 'string' && THEME_KEYS.includes(doc.theme as ThemeKey)
        ? doc.theme
        : cfg.typography.headline_theme) as ThemeKey

      const built = await runPipeline<BuiltArticle>(
        cfg,
        'build_article.py',
        [
          '--doc-json', JSON.stringify({ ...doc, index: idx, theme }),
          '--scripts-dir', scriptsDir(cfg),
          '--min-words', String(content.min_words),
          '--forbidden', JSON.stringify(content.forbidden_words),
          '--brand-name', account.profile.brand_name,
          '--brand-images', JSON.stringify(account.profile.brand_images),
          '--typography', JSON.stringify({
            font_size: cfg.typography.font_size,
            line_height: cfg.typography.line_height,
            paragraph_margin: cfg.typography.paragraph_margin,
            text_indent: cfg.typography.text_indent,
          }),
        ],
        120000,
      )

      // Python 纯构建返回 HTML，TS 侧落盘（文件名白名单 + 目录守卫）
      const name = 'article_v2_' + idx + '.html'
      const file = writeTextFile(scriptsDir(cfg), name, built.html)

      // 完整发布级校验 + gzh-design lint（占位符阶段）
      const check = await runPipeline<CheckReport>(
        cfg,
        'check_html.py',
        [
          '--files', JSON.stringify([name]),
          '--scripts-dir', scriptsDir(cfg),
          '--min-words', String(content.min_words),
          '--forbidden', JSON.stringify(content.forbidden_words),
          '--brand-name', account.profile.brand_name,
          '--img-count', String(expectedArticleImageCount(account.profile)),
          '--allow-placeholders',
          '--lint',
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
