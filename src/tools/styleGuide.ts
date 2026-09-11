import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { THEME_NAMES, type Config, type ThemeKey } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { contentImagesPerArticle, expectedArticleImageCount, renderJson, resolveTheme, runtimeResourceDir } from './shared.ts'

// 与 gzh_components.py THEMES 一致的色板
const THEME_PALETTES: Record<ThemeKey, Record<string, string>> = {
  wenying: { main: '#991B1B', light: '#FEF2F2', ul: '#E7C878', gold: '#B8860B', name: '文映学术（品牌专属）' },
  olive: { main: '#1e1f23', light: '#eeefe9', ul: '#ed7b2f', gold: '#ed7b2f', name: '橄榄手记' },
  graphite: { main: '#52525B', light: '#FAFAFA', ul: '#52525B', gold: '#F97316', name: '石墨极简' },
  moyu: { main: '#059669', light: '#ECFDF5', ul: '#A7F3D0', gold: '#059669', name: '摸鱼绿' },
  redwhite: { main: '#DC2626', light: '#FEF2F2', ul: '#FECACA', gold: '#DC2626', name: '红白色系' },
  zen: { main: '#4A5D52', light: '#F4F6F3', ul: '#B5C8BC', gold: '#4A5D52', name: '留白禅意' },
}

const THEME_FILE_HINTS: Record<ThemeKey, string[]> = {
  wenying: ['wenying', '文映'],
  olive: ['olive', '橄榄'],
  graphite: ['graphite', '石墨'],
  moyu: ['moyu', '摸鱼绿'],
  redwhite: ['redwhite', '红白'],
  zen: ['zen', '禅意'],
}

const DOC_SPEC_EXAMPLE = {
  index: 1,
  theme: 'wenying',
  intro: { pre: '金句前半句', hl: '高亮词', post: '金句后半句' },
  toc: ['本文看点一', '本文看点二', '本文看点三'],
  sections: [
    {
      h2: '01',
      text: '章节标题',
      blocks: [
        { p: ['普通文字', ['kw', '关键词下划线'], ['b', '主题色加粗'], ['hl', '浅底高亮']] },
        { card: '单条提示卡内容' },
        { card_ul: { title: '清单标题', items: ['要点一', '要点二'] } },
        { img: { src: 'IMG_A1_1', caption: '图注文字' } },
        { hr: true },
      ],
    },
  ],
  sign_off: '结尾引导语（必须自然包含品牌名，像编辑真心推荐而非广告）',
}

export interface StyleGuide {
  account_id: string
  account_name: string
  theme: ThemeKey
  palette: Record<string, string>
  typography_rules: Record<string, string>
  doc_spec: unknown
  parts_format: string[]
  hard_rules: string[]
  forbidden_words: string[]
  articles_per_day: number
  topics: string[]
  content_images_per_article: number
  theme_plan: Record<string, ThemeKey>
  references: string[]
}

export function styleGuideTool(cfg: Config) {
  return defineTool<{ theme?: string; account_id?: string }, StyleGuide>({
    name: 'gzh_get_style_guide',
    description:
      '获取写作与排版规范：主题色板、gzh_build_article 的 doc_spec 格式、13px 排版铁律、' +
      '禁词表、硬性规则（4图/2000字/品牌引导语/纯单行HTML）、参考文档与样例路径。每日写文前必读。',
    parameters: {
      theme: {
        type: 'string',
        description: '主题键（缺省用设置的头条主题）',
        enum: Object.keys(THEME_NAMES),
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
      const contentImgs = contentImagesPerArticle(cfg)
      const theme = (args.theme && args.theme in THEME_NAMES ? args.theme : resolveTheme(cfg, 1)) as ThemeKey
      const themePlan: Record<string, ThemeKey> = {}
      for (let i = 1; i <= n; i++) themePlan[String(i)] = resolveTheme(cfg, i)
      const refsDir = path.join(runtimeResourceDir(), 'references')
      const references: string[] = []
      // 主题文件：按 hints 模糊匹配 theme-*.md
      let themeDoc: string | null = null
      try {
        for (const f of fs.readdirSync(refsDir)) {
          if (!f.startsWith('theme-') || !f.endsWith('.md')) continue
          if (THEME_FILE_HINTS[theme].some((h) => f.toLowerCase().includes(h))) {
            themeDoc = path.join(refsDir, f)
            break
          }
        }
      } catch {
        /* 参考目录缺失时仅返回内置规范 */
      }
      for (const p of [themeDoc, path.join(refsDir, 'theme-index.md'), path.join(refsDir, 'common-components.md'), path.join(refsDir, 'format-normalize.md')].filter(Boolean) as string[]) {
        if (fs.existsSync(p)) references.push(p)
      }
      return {
        account_id: account.id,
        account_name: account.profile.name,
        theme,
        palette: THEME_PALETTES[theme],
        typography_rules: {
          font_size: cfg.typography.font_size,
          line_height: cfg.typography.line_height,
          paragraph_margin: cfg.typography.paragraph_margin,
          text_indent: cfg.typography.text_indent,
          no_blank_line: '纯单行 HTML，组件自动保证零换行符',
        },
        doc_spec: DOC_SPEC_EXAMPLE,
        parts_format: [
          '字符串 → 普通文字（自动 span leaf 包裹）',
          '["kw", 文字] → 主题色下划线关键词（每段 1-3 个）',
          '["b", 文字] → 主题色加粗',
          '["hl", 文字] → 浅底色高亮',
        ],
        hard_rules: [
          '作者名固定 ' + account.profile.author_name,
          '本次共 ' + n + ' 篇（index 1~' + n + '），组合为 1 个多图文草稿；每篇文章主题按 theme_plan 分配',
          '每篇正文 ' + expectedArticleImageCount(cfg, account.profile) + ' 张 img：' + contentImgs + ' 张正文配图（IMG_A{index}_1 ~ IMG_A{index}_' + contentImgs + ' 占位）' +
            (account.profile.brand_images.header.enabled ? ' + 头部品牌图' : '') +
            (account.profile.brand_images.footer.enabled ? ' + 尾部品牌图' : ''),
          '纯文字不少于 ' + content.min_words + ' 字（构建时断言）',
          '结尾自然引导关注「' + account.profile.brand_name + '」（构建时断言）',
          '封面：第 1 篇头条 ' + cfg.image_api.headline_cover_ratio + '，其余 ' + cfg.image_api.secondary_cover_ratio,
          '图片中所有文字必须全部中文，禁止英文残留、禁止二维码',
          content.ending_guide_required ? '结尾引导语为硬性要求' : '结尾引导语可选',
        ],
        forbidden_words: content.forbidden_words,
        articles_per_day: n,
        topics: [...content.topics],
        content_images_per_article: contentImgs,
        theme_plan: themePlan,
        references,
      }
    },
  })
}
