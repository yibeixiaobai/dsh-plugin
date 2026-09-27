import { defineTool } from '@deepseek-ai/dsh-tools'
import { THEME_NAMES, type Config, type ThemeKey } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import {
  accountScriptsDir, contentImagesPerArticle, expectedArticleImageCount, renderJson, resolveTheme, resolveTypography, runPipeline,
  runtimeResourceDir, writeTextFile,
} from './shared.ts'

interface BuiltArticle {
  index: number
  theme: string
  html?: string
  markdown?: string
  text?: string
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
      '知乎账号产出标准 Markdown（article_v2_{index}.md），小红书账号产出纯文本笔记（article_v2_{index}_xhs.txt）。' +
      '优先支持补充要求在 doc spec 中指定的 theme/min_words/content_img_count；' +
      '未指定时采用账号设置与轮换规则。自动断言字数/图片数/品牌引导语/禁词，随后跑平台对应的机器校验。',
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
      const platform = account.profile.platform === 'zhihu' ? 'zhihu' : account.profile.platform === 'xiaohongshu' ? 'xiaohongshu' : 'gzh'
      let doc: Record<string, unknown>
      try {
        doc = JSON.parse(args.doc_json) as Record<string, unknown>
      } catch {
        throw new Error('doc_json 不是合法 JSON：' + String(args.doc_json).slice(0, 120))
      }
      const isNewspic = platform === 'gzh' && (doc.article_type === 'newspic' || content.article_type === 'newspic')
      const idx = Number(doc.index)
      if (!Number.isInteger(idx) || idx < 1 || idx > 99) {
        throw new Error('index 必须是 1~99')
      }
      const sdir = accountScriptsDir(cfg, account.id)
      // 主题优先支持 doc.theme（用户补充要求指定时生效）；未指定或非法时回退到默认设置轮换 resolveTheme
      const docTheme = typeof doc.theme === 'string' && doc.theme in THEME_NAMES ? (doc.theme as ThemeKey) : undefined
      const theme = platform === 'zhihu' ? 'markdown' : platform === 'xiaohongshu' ? 'xhs' : isNewspic ? 'newspic' : (docTheme ?? resolveTheme(cfg, idx, account.profile))

      // 字数与正文配图数：支持 doc spec 中用户补充要求自定义，缺省采用账号配置
      const docMinWords = typeof doc.min_words === 'number' && doc.min_words > 0 ? doc.min_words : undefined
      const minWords = isNewspic
        ? (docMinWords ?? content.newspic_min_words ?? 100)
        : platform === 'xiaohongshu'
          ? (docMinWords ?? content.xhs_min_words ?? 200)
          : (docMinWords ?? content.min_words)
      const docImgCount = typeof doc.content_img_count === 'number' && doc.content_img_count >= 0
        ? Math.min(4, Math.max(0, doc.content_img_count))
        : undefined
      const contentImgCount = docImgCount ?? contentImagesPerArticle(cfg, account.profile)

      const built = await runPipeline<BuiltArticle>(
        cfg,
        'build_article.py',
        [
          '--doc-json', JSON.stringify({ ...doc, index: idx, theme: platform === 'zhihu' ? 'wenying' : theme }),
          '--scripts-dir', sdir,
          '--resource-dir', runtimeResourceDir(),
          '--min-words', String(minWords),
          '--forbidden', JSON.stringify(content.forbidden_words),
          '--platform', platform,
          '--article-type', isNewspic ? 'newspic' : 'news',
          ...(isNewspic
            ? [
              '--brand-name', account.profile.brand_name,
              ...(content.ending_guide_required ? ['--require-brand'] : []),
            ]
            : platform === 'zhihu'
              ? [
                '--content-img-count', String(contentImgCount),
                ...(content.ending_guide_required ? ['--require-brand'] : []),
                '--brand-name', account.profile.brand_name,
              ]
              : platform === 'xiaohongshu'
                ? [
                  '--brand-name', account.profile.brand_name,
                  ...(content.ending_guide_required ? ['--require-brand'] : []),
                ]
                : [
                  '--content-img-count', String(contentImgCount),
                  '--brand-name', account.profile.brand_name,
                  '--brand-images', JSON.stringify(account.profile.brand_images),
                  '--typography', JSON.stringify(resolveTypography(cfg, account.profile)),
                ]),
        ],
        180000,
      )

      // Python 纯构建返回产物，TS 侧落盘（文件名白名单 + 目录守卫）
      const ext = platform === 'zhihu' ? '.md' : platform === 'xiaohongshu' ? '_xhs.txt' : isNewspic ? '_pic.json' : '.html'
      const name = 'article_v2_' + idx + ext
      const payload = isNewspic
        ? JSON.stringify(built, null, 2) + '\n'
        : platform === 'zhihu'
          ? built.markdown
          : platform === 'xiaohongshu'
            ? (built as unknown as Record<string, unknown>).text as string
            : built.html
      if (payload === undefined) throw new Error('构建结果缺少' + (platform === 'zhihu' ? 'markdown' : platform === 'xiaohongshu' ? 'text' : 'html') + '字段')
      const file = writeTextFile(sdir, name, payload)

      // 完整发布级校验（占位符阶段）；gzh-design lint 仅对公众号 HTML 有意义
      const expectedImgs = isNewspic
        ? built.img_count
        : platform === 'zhihu'
          ? contentImagesPerArticle(cfg, account.profile)
          : platform === 'xiaohongshu'
            ? built.img_count
            : expectedArticleImageCount(cfg, account.profile)
      const check = await runPipeline<CheckReport>(
        cfg,
        'check_html.py',
        [
          '--files', JSON.stringify([name]),
          '--scripts-dir', sdir,
          '--resource-dir', runtimeResourceDir(),
          '--min-words', String(isNewspic ? (content.newspic_min_words ?? 100) : platform === 'xiaohongshu' ? (content.xhs_min_words ?? 200) : content.min_words),
          '--forbidden', JSON.stringify(content.forbidden_words),
          '--brand-name', account.profile.brand_name,
          '--img-count', String(expectedImgs),
          '--allow-placeholders',
          '--platform', platform,
          '--article-type', isNewspic ? 'newspic' : 'news',
          ...((platform === 'zhihu' || platform === 'xiaohongshu' || isNewspic) && content.ending_guide_required ? ['--require-brand'] : []),
          ...(platform === 'gzh' && !isNewspic ? ['--lint'] : []),
        ],
        180000,
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
