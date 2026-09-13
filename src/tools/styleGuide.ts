import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { THEME_NAMES, ZHIHU_COVER_RATIO, type Config, type ThemeKey } from '../config.ts'
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
  platform: string
  theme: ThemeKey | 'markdown'
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

// 知乎 doc spec：与公众号同一骨架（intro/toc/sections/blocks/sign_off），theme 字段被忽略
const ZHIHU_DOC_SPEC_EXAMPLE = {
  index: 1,
  intro: { pre: '开篇观点', hl: '核心词', post: '收束' },
  toc: ['本文看点一', '本文看点二', '本文看点三'],
  sections: [
    {
      h2: '01',
      text: '章节标题',
      blocks: [
        { p: ['普通文字', ['kw', '关键词'], ['b', '加粗'], ['hl', '强调']] },
        { card: '单条提示' },
        { card_ul: { title: '清单标题', items: ['要点一', '要点二'] } },
        { img: { src: 'IMG_A1_1', caption: '图注文字' } },
        { hr: true },
      ],
    },
  ],
  sign_off: '结尾引导语',
}

function zhihuStyleGuide(cfg: Config, accountId: string): StyleGuide {
  const account = resolveAccount(cfg, accountId)
  const content = account.profile.content
  const n = content.articles_per_day
  const contentImgs = contentImagesPerArticle(cfg)
  return {
    account_id: account.id,
    account_name: account.profile.name,
    platform: 'zhihu',
    theme: 'markdown',
    palette: {},
    typography_rules: {
      format: '标准 Markdown 多行文本（article_v2_{index}.md）',
      heading: '章节标题构建为 "## 序号 标题"，禁止自行使用一级标题',
      emphasis: 'kw/b/hl 标注一律渲染为 **加粗**（Markdown 无下划线/高亮语义）',
      no_html: '禁止输出任何 HTML 标签或内联样式',
    },
    doc_spec: ZHIHU_DOC_SPEC_EXAMPLE,
    parts_format: [
      '字符串 → 普通文字',
      '["kw", 文字] → **加粗关键词**（每段 1-3 个）',
      '["b", 文字] → **加粗**',
      '["hl", 文字] → **加粗强调**',
    ],
    hard_rules: [
      '平台：知乎专栏；产出为标准 Markdown，无主题色板/引言卡/三列目录/品牌头尾图等公众号组件',
      '作者名固定 ' + account.profile.author_name,
      '数量铁律：本次正好 ' + n + ' 篇（index 1~' + n + '）；知乎每篇是独立文章草稿（不是多图文组合）；每篇正好 ' + contentImgs + ' 张正文配图' + (contentImgs === 0 ? '（本次为 0：不要生成任何 IMG_A* 占位）' : '（占位符 IMG_A{index}_1 ~ IMG_A{index}_' + contentImgs + '）'),
      '选题铁律：选题只能取自下方 topics 列表；禁止自拟、扩展或混搭，除非用户在本次补充要求中明确给出',
      '每篇正文纯文字不少于 ' + content.min_words + ' 字（构建时断言）',
      '标题不超过 100 字，禁词表全文生效（构建与校验时断言）',
      content.ending_guide_required
        ? '结尾自然引导关注「' + account.profile.brand_name + '」（构建时断言）'
        : '结尾引导语可选；如使用需自然融入，不堆砌广告感',
      '封面比例统一 ' + ZHIHU_COVER_RATIO + '（知乎账号固定，按账号平台机器强制）',
      '图片中所有文字必须全部中文，禁止英文残留、禁止二维码',
    ],
    forbidden_words: content.forbidden_words,
    articles_per_day: n,
    topics: [...content.topics],
    content_images_per_article: contentImgs,
    theme_plan: {},
    references: [],
  }
}

export function styleGuideTool(cfg: Config) {
  return defineTool<{ theme?: string; account_id?: string }, StyleGuide>({
    name: 'gzh_get_style_guide',
    description:
      '获取写作与排版规范（按账号平台返回）：公众号=主题色板/doc_spec 格式/13px 排版铁律/禁词表/硬性规则/' +
      '主题计划 theme_plan；知乎=Markdown 形态的 doc_spec 与硬性规则。' +
      '返回值自包含，写文无需读参考文档、源码或历史文章（references 路径仅在构建/校验报错且提示需要时查阅）。' +
      '每日写文前必读一次；文章数、选题方向、配图数与主题分配必须严格按返回值执行，不得自行调整。',
    parameters: {
      theme: {
        type: 'string',
        description: '主题键（仅公众号账号生效，缺省用设置的头条主题）',
        enum: Object.keys(THEME_NAMES),
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省使用默认账号',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      if (account.profile.platform === 'zhihu') {
        return zhihuStyleGuide(cfg, account.id)
      }
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
        platform: 'gzh',
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
          '数量铁律：本次正好 ' + n + ' 篇（index 1~' + n + '），组合为 1 个多图文草稿；每篇正好 1 张封面；每篇正好 ' + contentImgs + ' 张正文配图，禁止增减' + (contentImgs === 0 ? '（本次为 0：不要生成任何 IMG_A* 正文图占位）' : '（占位符 IMG_A{index}_1 ~ IMG_A{index}_' + contentImgs + '）'),
          '选题铁律：选题只能取自下方 topics 列表；禁止自拟、扩展或混搭，除非用户在本次补充要求中明确给出',
          '主题铁律：每篇文章主题严格按 theme_plan 对应主题撰写；gzh_build_article 会按设置强制覆盖 doc 内的 theme 字段',
          '每篇正文共 ' + expectedArticleImageCount(cfg, account.profile) + ' 张 img' +
            (account.profile.brand_images.header.enabled ? '，含头部品牌图' : '') +
            (account.profile.brand_images.footer.enabled ? '，含尾部品牌图' : ''),
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
