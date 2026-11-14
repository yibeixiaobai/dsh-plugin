import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '../tool-compat.ts'
import { THEME_NAMES, XHS_COVER_RATIO, XHS_CONTENT_MAX, XHS_IMAGES_MAX, XHS_TITLE_MAX, ZHIHU_COVER_RATIO, BAIJIAHAO_COVER_RATIO, BAIJIAHAO_TITLE_MAX, TOUTIAO_COVER_RATIO, TOUTIAO_TITLE_MAX, DEFAULT_SCHEDULE_TIMES_ARTICLE, DEFAULT_SCHEDULE_TIMES_NEWSPIC, type Config, type ThemeKey } from '../config.ts'
import { listAccountSummaries, resolveAccount, type AccountSummary } from '../config-runtime.ts'
import { buildStrictConfigHardRule, extractStructuredAccountRules } from './styleGuideStrictRules.ts'
import {
  accountScriptsDir, contentImagesPerArticle, expectedArticleImageCount, renderJson, resolveCoverRatio, resolveTheme, resolveTypography, runtimeResourceDir,
} from './shared.ts'

// 与 gzh_components.py THEMES 一致的色板
const THEME_PALETTES: Record<ThemeKey, Record<string, string>> = {
  wenying: { main: '#991B1B', light: '#FEF2F2', ul: '#E7C878', gold: '#B8860B', name: '典雅深红（酒红+金）' },
  olive: { main: '#1e1f23', light: '#eeefe9', ul: '#ed7b2f', gold: '#ed7b2f', name: '橄榄手记' },
  graphite: { main: '#52525B', light: '#FAFAFA', ul: '#52525B', gold: '#F97316', name: '石墨极简' },
  moyu: { main: '#059669', light: '#ECFDF5', ul: '#A7F3D0', gold: '#059669', name: '摸鱼绿' },
  redwhite: { main: '#DC2626', light: '#FEF2F2', ul: '#FECACA', gold: '#DC2626', name: '红白色系' },
  zen: { main: '#4A5D52', light: '#F4F6F3', ul: '#B5C8BC', gold: '#4A5D52', name: '留白禅意' },
}

const THEME_FILE_HINTS: Record<ThemeKey, string[]> = {
  wenying: ['wenying', '深红'],
  olive: ['olive', '橄榄'],
  graphite: ['graphite', '石墨'],
  moyu: ['moyu', '摸鱼绿'],
  redwhite: ['redwhite', '红白'],
  zen: ['zen', '禅意'],
}

export const GZH_ARCHETYPES = [
  {
    type: 'action_guide',
    name: '保姆级实操指南型',
    structure: '痛点场景切入 → 步骤逐步拆解 → 自查 Checklist → 实操避坑',
    highlight_components: '自查清单（checklist）+ 避坑卡（warning）+ 步骤标题（style: pill）',
    example_intro: '很多开发者在部署端侧大模型环境时，常在依赖冲突与算子兼容上踩坑。这份清单帮你理清实操细节。',
  },
  {
    type: 'trend_analysis',
    name: '行业深度透视与前沿解读型',
    structure: '新架构/技术数据引入 → 核心数据高光卡 → 逻辑机理剖析 → 演进趋势',
    highlight_components: '核心数据卡（stat）+ 金句观点卡（quote）+ 导言强调段（lead）',
    example_intro: '新一代前沿大模型与端侧推理架构演进，全栈软硬件协同迎来关键突破。从三个维度看透变化背后的技术信号。',
  },
  {
    type: 'case_pitfall',
    name: '架构避坑与复盘型',
    structure: '真实性能瓶颈切入 → 误区 vs 规范正解对比卡 → 优化实操心法',
    highlight_components: '正反对比卡（versus: ❌ 常见误区 vs ✅ 规范正解）+ 重点提示卡（card）',
    example_intro: '“明明单机压测表现优异，上线高并发却频发超时卡顿...”通过这个真实高负载案例复盘架构调优的关键误区。',
  },
  {
    type: 'qa_toolkit',
    name: '高频痛点问答与工具盘点型',
    structure: '高频痛点连问 → Q&A 对话交互卡 → 实用资源自查清单',
    highlight_components: '快问快答（qa）+ 清单列表（checklist/card_ul）+ 胶囊导读（toc_style: pills）',
    example_intro: '针对近期关于大模型量化微调与工程落地的几个核心疑问，逐一做个开门见山的详尽解答。',
  },
]

/**
 * 动态根据当前账号独立配置的每篇正文配图数生成公众号长文 doc_spec 示例
 * 【中文依据】：各账号配图数单独存储与生效，示例中 IMG_ 占位符必须不多不少精准契合当前账号设置
 */
export function getDynamicGzhDocSpec(contentImgs: number) {
  const safeImgCount = Math.max(0, Math.min(4, Math.floor(contentImgs)))
  const sections: any[] = [
    {
      h2: '01',
      text: '痛点溯源与行业背景深度解析',
      style: 'badge',
      blocks: [
        { lead: '重点强调段落：开门见山点出痛点或架构核心结论（无缩进+浅底点缀）' },
        { p: ['普通文字段落...', ['kw', '关键词下划线'], ['b', '主题色加粗'], ['hl', '浅底高亮']] },
        { versus: { title: '误区辨析与规范做法', wrong: '盲目引入复杂重型架构，导致构建缓慢与冷启动劣化', right: '采用轻量原子化解耦方案，保持极简依赖与渐进式演进' } },
        ...(safeImgCount >= 1 ? [{ img: { src: 'IMG_A1_1', caption: '技术架构演进示意图' } }] : []),
        { hr: true },
      ],
    },
    {
      h2: '02',
      text: '关键架构实操细节与指标权衡',
      style: 'badge',
      blocks: [
        { p: ['详细剖析关键步骤与具体参数指标，短句顿挫，逻辑层层递进...'] },
        { checklist: { title: '生产上线前自查必备清单', items: ['要点1：模型量化精度与困惑度验证无损', '要点2：服务熔断与长连接限流校验通过'] } },
        ...(safeImgCount >= 2 ? [{ img: { src: 'IMG_A1_2', caption: '核心流程时序示意图' } }] : []),
        { warning: { title: '避坑特别提醒', text: '底层驱动与计算库版本需严格锁版本，切勿直接依赖未锁定的动态版本！' } },
      ],
    },
  ]

  if (safeImgCount >= 3) {
    sections.push({
      h2: '03',
      text: '性能深度基准压测与数据对照',
      style: 'badge',
      blocks: [
        { stat: { metric: '99.9%', label: '高可用达标率', desc: '全链路自动化监控与降级熔断下的综合可用性' } },
        { img: { src: 'IMG_A1_3', caption: '性能吞吐压测对比图' } },
        { card: '单条重点技术提示卡内容' },
      ],
    })
  }

  if (safeImgCount >= 4) {
    sections.push({
      h2: '04',
      text: '工程落地全景 Checklist 与复盘心法',
      style: 'badge',
      blocks: [
        { qa: { q: '端侧推理优先推荐哪种量化格式？', a: '对于主流桌面与移动端环境，建议优先评估 4-bit AWQ 或 GGUF 格式...' } },
        { img: { src: 'IMG_A1_4', caption: '工程化落地全景架构图' } },
        { quote: { text: '优秀的系统架构不是一蹴而就的，而是持续重构与权衡的艺术。', author: '架构思考' } },
      ],
    })
  }

  return {
    title: '示例文章标题：聚焦核心痛点与行业实务深度解析',
    digest: '开门见山梳理核心事实、背景脉络与关键操作要领，帮助读者快速把握要义。',
    index: 1,
    theme: 'graphite',
    archetype: 'action_guide',
    intro: { pre: '金句前半句', hl: '核心技术点', post: '金句后半句' },
    toc: ['要点1：技术背景与演进', '要点2：关键架构实操细节', '要点3：性能调优与避坑建议'],
    toc_style: 'grid',
    sections,
    sign_off: '关注前沿科技视界，第一时间获取技术深度解析与前沿科技趋势。',
    engagement: true,
  }
}

const DOC_SPEC_EXAMPLE = getDynamicGzhDocSpec(2)

export interface StyleGuide {
  account_id: string
  account_name: string
  platform: string
  available_accounts?: AccountSummary[]
  platform_accounts?: AccountSummary[]
  multi_account_dispatch_required?: boolean
  multi_account_hint?: string
  theme: ThemeKey | 'markdown'
  palette: Record<string, string>
  typography_rules: Record<string, string>
  doc_spec: unknown
  parts_format: string[]
  hard_rules: string[]
  forbidden_words: string[]
  articles_per_day: number
  newspic_articles_per_day?: number
  topics: string[]
  enable_hot_tracking?: boolean
  seasonal_context?: { month: number; focus: string; seasonal_keywords: string[] }
  content_images_per_article: number
  theme_plan: Record<string, ThemeKey>
  archetype_plan?: Record<string, string>
  archetypes?: typeof GZH_ARCHETYPES
  references: string[]
  sync_newspic?: boolean
  newspic_spec?: unknown
  recent_titles?: string[]
  min_words?: number
  core_keywords?: string[]
  preferred_topic_angles?: string[]
  image_allocation?: {
    mode: 'auto' | 'custom'
    ai_images: number
    search_images: number
    total: number
  }
  configured_article_type?: string
  publish_action_default?: 'draft' | 'publish_now' | 'schedule'
  schedule_default_time?: string
  schedule_times_article?: string[]
  schedule_times_newspic?: string[]
  publish_action_hint?: string
}

export function getSeasonalContext(): { month: number; focus: string; seasonal_keywords: string[] } {
  const month = new Date().getMonth() + 1
  const map: Record<number, { focus: string; keywords: string[] }> = {
    1: { focus: '全球消费电子展(CES)、年度科技趋势前瞻、开源技术新春规划', keywords: ['CES前瞻', '年度科技盘点', '大模型进展', '硬件创新'] },
    2: { focus: '新春技术复盘、前沿开源项目集中更新、架构设计深度调研', keywords: ['开源项目', '架构重构', '工具链更新', '代码规范'] },
    3: { focus: '春季AI开发者大会、全球前沿模型春季迭代、端侧芯片算力发布', keywords: ['AI大会', '端侧算力', '大模型微调', '开发者生态'] },
    4: { focus: '云原生与分布式计算峰会、现代前端工程生态演进、基础设施调优', keywords: ['云原生', '前端工程', '性能监控', '微服务治理'] },
    5: { focus: '全球开发者大会(I/O & Build)、操作系统新版本发布、自动化智能体探索', keywords: ['开发者大会', '系统更新', '智能体Agent', '自动化工具'] },
    6: { focus: '年中技术盘点、开源社区重大版本发布、大模型能效比评测', keywords: ['技术盘点', '开源大版本', '基准评测', '算力成本'] },
    7: { focus: '软硬件协同架构峰会、轻量化端侧部署落地、系统级性能攻坚', keywords: ['端侧部署', '模型量化', '系统级调优', '低延迟推理'] },
    8: { focus: '秋季技术大会前瞻、编译器与底层软件创新、前沿技术论文落地', keywords: ['编译器技术', '底层架构', '开源生态', '工程落地'] },
    9: { focus: '秋季科技新品密集发布、大模型落地应用生态、全栈架构升级', keywords: ['新品发布', '应用生态', '架构升级', '全栈开发'] },
    10: { focus: '全球开源技术峰会、分布式数据湖仓演进、AI Infra工程化实践', keywords: ['开源峰会', 'AI Infra', '数据湖仓', '高可用架构'] },
    11: { focus: '双十一与高并发稳定性保障、系统压测心法、年度前沿技术盘点', keywords: ['高并发保障', '系统压测', '容量规划', '性能调优'] },
    12: { focus: '年度开源榜单揭晓、年终技术回顾与架构趋势前瞻、全球AI生态复盘', keywords: ['开源年终榜', '架构前瞻', '技术趋势', '生态盘点'] },
  }
  const curr = map[month] || { focus: '前沿技术探索与工程实践落地', keywords: ['人工智能', '开源生态'] }
  return { month, focus: curr.focus, seasonal_keywords: curr.keywords }
}

function getRecentTitles(cfg: Config, accountId: string, limit = 20): string[] {
  const dir = accountScriptsDir(cfg, accountId)
  const titles: string[] = []
  const historyPath = path.join(dir, 'publish_history.json')
  if (fs.existsSync(historyPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
      if (Array.isArray(data)) {
        for (const item of data) {
          const t = item?.title || item?.topic
          if (typeof t === 'string' && t.trim()) titles.push(t.trim())
        }
      }
    } catch {}
  }
  const resultPath = path.join(dir, 'publish_result.json')
  if (fs.existsSync(resultPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(resultPath, 'utf-8'))
      const articles = data?.articles || data?.items || []
      if (Array.isArray(articles)) {
        for (const a of articles) {
          const t = a?.title
          if (typeof t === 'string' && t.trim()) titles.push(t.trim())
        }
      }
    } catch {}
  }
  return Array.from(new Set(titles)).slice(-limit)
}

/**
 * 动态根据当前账号独立配置的每篇正文配图数生成知乎/百家号/头条 Markdown doc_spec 示例
 */
export function getDynamicZhihuDocSpec(accountTopics: string[], contentImgs: number = 2) {
  const selectedTopics = accountTopics && accountTopics.length > 0
    ? accountTopics.slice(0, 3)
    : ['科技前沿', '架构设计', '开源实战']
  const safeImgCount = Math.max(0, Math.min(4, Math.floor(contentImgs)))
  const sections: any[] = [
    {
      h2: '01',
      text: '痛点溯源与行业技术演进背景',
      blocks: [
        { p: ['普通文字段落，单段保持短小精炼（1~3句），具有良好阅读呼吸感...', ['kw', '关键词'], ['b', '加粗'], ['hl', '强调']] },
        { card: '单条重点架构提示' },
        ...(safeImgCount >= 1 ? [{ img: { src: 'IMG_A1_1', caption: '技术架构演进示意图' } }] : []),
      ],
    },
    {
      h2: '02',
      text: '核心实操细节与规避误区指南',
      blocks: [
        { p: ['关键步骤详尽剖析，拒绝假大空套话，聚焦可落地的具体操作心法...'] },
        { card_ul: { title: '核心清单', items: ['要点1', '要点2'] } },
        ...(safeImgCount >= 2 ? [{ img: { src: 'IMG_A1_2', caption: '核心流程示意图' } }] : []),
      ],
    },
  ]

  if (safeImgCount >= 3) {
    sections.push({
      h2: '03',
      text: '基准数据对比与全景实测结果',
      blocks: [
        { p: ['通过量化数据衡量优化成效，呈现清晰的指标对比与结论分析...'] },
        { img: { src: 'IMG_A1_3', caption: '性能对照图表' } },
      ],
    })
  }

  if (safeImgCount >= 4) {
    sections.push({
      h2: '04',
      text: '总结复盘与工程落地实施心法',
      blocks: [
        { p: ['系统总结工程实施关键节点，帮助读者理清全貌，避免重复踩坑...'] },
        { img: { src: 'IMG_A1_4', caption: '落地架构全景图' } },
      ],
    })
  }

  return {
    index: 1,
    intro: { pre: '开篇技术观点', hl: '核心技术词', post: '收束总结' },
    toc: ['章节1核心趋势', '章节2实操要点', '章节3高频避坑'],
    topics: selectedTopics,
    sections,
    sign_off: '关注前沿科技视界，第一时间获取技术深度解析。',
  }
}

const ZHIHU_DOC_SPEC_EXAMPLE = getDynamicZhihuDocSpec([], 2)

/**
 * 动态根据当前账号独立配置的卡片数生成小绿书 doc_spec 示例
 */
export function getDynamicNewspicDocSpec(cardCount: number = 4) {
  const safeCount = Math.max(1, Math.min(20, Math.floor(cardCount || 4)))
  const cards: Array<{ sub: number; role: string; prompt: string }> = [
    { sub: 1, role: 'cover', prompt: '封面海报：大标题视觉冲击，3:4竖版，科技扁平现代设计，科技蓝与高饱和配色，画面中心必须以醒目大字艺术排版印刷主标题，禁止英文乱码，禁止留白无字' },
  ]
  for (let j = 2; j <= safeCount; j++) {
    const isLast = j === safeCount
    const role = isLast && safeCount >= 3 ? 'cta' : 'content'
    const prompt = isLast && safeCount >= 3
      ? '总结引导卡片：核心技术结论提炼+关注引导，品牌色点缀，简约大气，底部留白，全中文'
      : `干货详解卡片 ${j}：重点流程图解或架构分支，模块化布局，配色统一，干净科技感背景，全中文标注`
    cards.push({ sub: j, role, prompt })
  }

  return {
    index: 1,
    article_type: 'newspic',
    title: '大模型端侧部署自查清单，上线前先核四项（严格≤20字）',
    content: '📌 核心速览：\n端侧大语言模型轻量化落地正在加速，上线前严格把关性能指标是保障体验的关键。这份自查清单助你扫除常见瓶颈。\n\n✅ 要点一｜算子量化与精度损失\n优先评估4-bit AWQ与GGUF量化方案，相比单纯FP16显存占用减半且困惑度几乎无损。\n\n✅ 要点二｜KV Cache动态压缩\n长上下文下注意力显存是主要开销，合理配置PagedAttention分块换入换出。\n\n💡 避坑提醒：\n多线程并发批处理时注意调度开销，避免批次锁导致长尾延迟。\n\n关注前沿科技视界获取更多实战干货！\n#AI工程化 #大模型部署 #架构实践',
    cards,
  }
}

const NEWSPIC_DOC_SPEC_EXAMPLE = getDynamicNewspicDocSpec(4)

// 小红书 5 大原生爆款叙事体裁骨架示例（去模板化、去套路化体系）
// 小红书 5 大原生爆款叙事体裁骨架示例（去模板化、去套路化体系）
const XHS_ARCHETYPES = [
  {
    type: 'story_trap',
    name: '避坑经历型',
    title: '本地跑大模型千万别这么配！踩坑复盘',
    structure: '个人挫折切入（真实痛点） → 核心症结复盘 → 3条避坑指南 → 交流互动',
    example: '🚨 真实踩坑自白：\n刚开始本地折腾大模型量化部署，自以为显存够大就随便跑，结果不是CUDA OOM就是推理慢如蜗牛...今天掏心窝子跟大家分享3个千万不能踩的坑：\n\n❌ 误区一：盲目追求大参数，忽视长上下文KV Cache的显存开销\n❌ 误区二：量化选型错误，直接用朴素Round量化导致输出乱码\n❌ 误区三：单批次多线程并发无限制，引发严重的显存锁争用\n\n💡 翻盘复盘：\n后来切到 AWQ 4-bit 量化配合 vLLM PagedAttention，吞吐直接翻了4倍！本地部署关键不在于堆显存，而在于算子调度优化。',
    visual_aesthetic: '现代科技信息图风（暗色/浅色极简底纹、架构流程贴纸、代码高亮卡片）',
  },
  {
    type: 'step_checklist',
    name: '保姆级实操清单型',
    title: '保姆级端侧AI部署法！照着做不踩坑',
    structure: '目标与准备 → 阶段一环境准备 → 阶段二模型量化 → 阶段三推理加速 → 行动清单',
    example: '📋 拯救拖延的本地部署清单：\n模型部署总报错？告别网上零散陈旧的教程，照着这份标准化清单逐项打勾执行：\n\n阶段一：10分钟基础环境准备\n◽ 检查 NVIDIA 驱动与 CUDA Toolkit 版本严格对齐\n◽ 使用 uv 快速搭建隔离的 Python 纯净虚拟环境\n\n阶段二：20分钟模型量化验证\n◽ 选用官方对齐的 GGUF 或 AWQ 权重\n◽ 运行困惑度基准脚本确认精度无损\n\n阶段三：5分钟服务暴露与监控\n◽ 配置 OpenAI 兼容协议服务与本地延迟打点',
    visual_aesthetic: '现代数据图解/脑图风（模块化卡片布局、清晰的清单勾选符号与逻辑流程箭头）',
  },
  {
    type: 'comparison_matrix',
    name: '横向对比测评型',
    title: '这3款开源大模型谁更好用？一图看懂',
    structure: '选型困扰痛点 → 维度横向打分（性能/门槛/生态） → 适用人群对照 → 最终选型建议',
    example: '⚖️ 纠结开源大模型选型看这篇就够了：\n很多开发者在 Llama、Qwen 和 DeepSeek 之间纠结，结合多场景工程落地实测，做个纯主观横向对比：\n\n1️⃣ Qwen 系列（推荐指数 ⭐⭐⭐⭐⭐）\n◽ 优势：中文理解与推理极强、长文本能力扎实、工具调用原生支持好\n◽ 痛点：超大参数版本对本地硬件要求苛刻\n◽ 适合：绝大多数中文企业级智能体与本地开发\n\n2️⃣ DeepSeek 系列（推荐指数 ⭐⭐⭐⭐⭐）\n◽ 优势：代码与数学逻辑顶尖、极致性价比架构创新\n◽ 痛点：部分极小端侧尺寸生态仍处快速演进中\n◽ 适合：严肃代码生成、逻辑推理与学术探索\n\n3️⃣ Llama 系列（推荐指数 ⭐⭐⭐⭐）\n◽ 优势：全球开源生态与配套库最完善\n◽ 痛点：中文语料原生训练占比相对有限',
    visual_aesthetic: '极简科技杂志风（米白/冷灰高级底色、呼吸感留白、精致字体排版、高对比配色）',
  },
  {
    type: 'myth_buster',
    name: '认知反转破局型',
    title: '微前端不是越细越好！90%团队搞错了',
    structure: '抛出反直觉真相 → 传统误区错在哪 → 认知升级逻辑 → 高效破局解法',
    example: '💡 颠覆认知的前端工程真相：\n你们团队是不是也在盲目推行微前端，每个小业务都拆独立仓库？盲目过度设计往往是工程内耗的根源：\n\n❌ 假解耦：仓库拆得细碎，一次联调跨五个项目提PR\n❌ 伪性能：引入过多运行时中间层反而拖慢了冷启动响应\n\n🔑 认知破局：\n真正高效的工程架构是“奥卡姆剃刀”——按需演进。单体 Monorepo 加模块级边界治理，在绝大多数场景下远胜盲目分布式微前端！',
    visual_aesthetic: '极简画报风（强烈视觉焦点、反差色彩对比、大号标题字排版）',
  },
  {
    type: 'toolkit_resources',
    name: '实用工具库盘点型',
    title: '自用私藏！5个效率翻倍的技术神器',
    structure: '核心场景痛点 → 工具1亮点 → 工具2亮点 → 工具3亮点 → 组合提效秘籍',
    example: '🧰 开发者私藏效率工具库：\n工欲善其事必先利其器！整理了5个每天都在用的高赞开源与开发工具，建议直接码住：\n\n1. uv：比传统 pip 快 10~100 倍的现代化 Python 包管理器\n2. Turborepo：极速 Monorepo 构建缓存与任务编排神器\n3. Biome：毫秒级极速格式化与 Lint 工具，开箱即用\n4. HTTPie：现代化直观的命令行 API 测试利器\n5. lazydocker：终端里的 Docker 容器全功能 TUI 仪表板',
    visual_aesthetic: '现代模块图解风（网格式卡片、工具专属图标位、清晰功能标注）',
  },
]

/**
 * 动态根据当前账号独立配置的配图数生成小红书 doc_spec 示例
 */
export function getDynamicXhsDocSpec(accountTopics: string[], imgCount: number = 4) {
  const selectedTags = accountTopics && accountTopics.length > 0
    ? accountTopics.slice(0, 3)
    : ['科技前沿', '实操指南', '开源探索']
  const safeCount = Math.max(1, Math.min(18, Math.floor(imgCount || 4)))
  const images: Array<{ sub: number; role: string; prompt: string }> = [
    { sub: 1, role: 'cover', prompt: '3:4竖版封面海报：现代科技图解风，浅色网格底纹，架构卡片贴纸点缀，画面中心必须以粗体大字艺术排版印刷中文主标题，全中文，严禁无字留白' },
  ]
  for (let j = 2; j <= safeCount; j++) {
    const isLast = j === safeCount
    const role = isLast && safeCount >= 3 ? 'cta' : 'content'
    const prompt = isLast && safeCount >= 3
      ? '3:4总结引导卡片：全篇核心要点提炼+博主真诚交流互动引导，品牌色点缀，全中文排版'
      : `3:4干货内容卡片 ${j}：模块化卡片布局，清晰递进步骤箭头与视觉锚点，科技感卡片质感，全中文标注`
    images.push({ sub: j, role, prompt })
  }

  return {
    index: 1,
    archetype: 'story_trap',
    title: '本地跑大模型千万别这么配！踩坑复盘',
    content: '🚨 真实踩坑自白：\n刚开始本地折腾大模型量化部署，自以为显存够大就随便跑，结果不是CUDA OOM就是推理慢如蜗牛...今天掏心窝子跟大家分享3个千万不能踩的坑：\n\n❌ 误区一：盲目追求大参数，忽视长上下文KV Cache的显存开销\n❌ 误区二：量化选型错误，直接用朴素Round量化导致输出乱码\n❌ 误区三：单批次多线程并发无限制，引发严重的显存锁争用\n\n💡 翻盘复盘：\n后来切到 AWQ 4-bit 量化配合 vLLM PagedAttention，吞吐直接翻了4倍！本地部署关键不在于堆显存，而在于算子调度优化。\n\n' + selectedTags.map(t => '#' + t).join(' '),
    images,
    tags: selectedTags,
  }
}

const XHS_DOC_SPEC_EXAMPLE = getDynamicXhsDocSpec([], 4)

function cleanXhsBrand(brand: string): string {
  return brand.replace(/(https?:\/\/\S+|[a-zA-Z0-9-]+\.(?:cn|com|net|org|top|xyz)\b)/gi, '').trim()
}

function xhsStyleGuide(cfg: Config, accountId: string): StyleGuide {
  const account = resolveAccount(cfg, accountId)
  const content = account.profile.content
  const strictRule = buildStrictConfigHardRule(cfg, account.profile)
  const structRules = extractStructuredAccountRules(cfg, account.profile)
  const n = content.articles_per_day
  const imgPerNote = content.xhs_images_per_note || 4
  const minWords = content.xhs_min_words ?? 200
  const tags = content.xhs_tags ?? []
  const recentTitles = getRecentTitles(cfg, account.id)
  const cleanBrandName = cleanXhsBrand(account.profile.brand_name) || '科技知识分享'
  const cleanAuthorName = cleanXhsBrand(account.profile.author_name) || cleanBrandName

  // 去模板化：按篇序号为同批次笔记分配互不雷同的叙事体裁与画风
  const archetypePlan: Record<string, string> = {}
  for (let i = 1; i <= n; i++) {
    const arch = XHS_ARCHETYPES[(i - 1) % XHS_ARCHETYPES.length]
    archetypePlan['note_' + i] = arch.name + '（' + arch.type + '，画风：' + arch.visual_aesthetic + '）'
  }

  return {
    account_id: account.id,
    account_name: account.profile.name,
    platform: 'xiaohongshu',
    theme: 'graphite',
    palette: {},
    typography_rules: {
      format: '纯文本笔记（article_v2_{index}_xhs.txt），支持 emoji 与换行分段',
      title_limit: '标题必须严格 ≤ ' + XHS_TITLE_MAX + ' 字（小红书平台硬性限制）',
      content_limit: '正文（含话题标签）必须 ≤ ' + XHS_CONTENT_MAX + ' 字',
      image_format: '每篇配 ' + imgPerNote + ' 张图，统一 3:4 竖版（1080×1440px），最多 ' + XHS_IMAGES_MAX + ' 张',
      compliance_standard: '必须严格遵守《小红书社区规范》（协议编号：ZXXY20221213003），严禁导流，真实分享',
      anti_formulaic: '杜绝模板化套路化！同批次多篇笔记必须使用不同叙事体裁与不同视觉画风',
      paragraph_pacing: '每段严格控制在 1~3 行（不超过 60~80 字），段落之间必须使用双换行(\\n\\n)保留空行呼吸感，严禁文字大块拥挤堆砌',
    },
    doc_spec: getDynamicXhsDocSpec(content.topics, imgPerNote),
    parts_format: [
      'archetype → 叙事体裁标识（story_trap / step_checklist / comparison_matrix / myth_buster / toolkit_resources）',
      'title → 爆款短标题（严格≤' + XHS_TITLE_MAX + '字，痛点+数字+解决方案，拒绝极限词与单一模板）',
      'content → 纯文案正文（' + minWords + '~' + XHS_CONTENT_MAX + '字，第一人称真诚分享口吻，分段精炼+双换行空行呼吸感+emoji导读+文末合规互动，拒绝AI八股套话）',
      'images → 生图提示词列表（每张 sub 从 1 到 ' + imgPerNote + '）',
      '  图片角色分工：sub1=cover（封面海报，中心必须艺术排版印刷笔记主标题醒目大字，严禁空白无字）→ sub2~' + (imgPerNote - 1) + '=content（干货要点图解）→ sub' + imgPerNote + '=cta（总结引导交流）',
      '  生图提示词铁律：必须围绕【本篇标题的具体主题关键词】展开，融合该篇推荐的美学画风（杂志风/手账风/图解风/实景风），全中文排版，严禁英文乱码，严禁二维码、水印与商标侵权',
      'tags → 动态精选话题标签列表（如 ["' + (content.topics[0] || '科技数码') + '", "' + (content.topics[1] || 'AI探索') + '"]），必须严格紧密契合当前账号 topics 与本篇核心切角，不要写死无关话题，建议 3~5 个精准中文标签',
    ],
    hard_rules: [
      strictRule,
      '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、字数、配图、风格等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则继续严格生效。',
      `【小红书配图数量严格对齐铁律】：当前账号在设置中已单独配置每篇笔记配图数为【${imgPerNote}】张！在生成 doc_spec 时，images 列表必须不多不少正好包含【${imgPerNote}】张 3:4 竖版卡片提示词（sub 编号从 1 到 ${imgPerNote}），严禁多写，也严禁少写！`,
      '【去模板化铁律：5大体裁轮换】：同批次批量产出多篇笔记时，严禁全部采用“速览+原则+避坑”三板斧！必须根据 archetype_plan 分配的体裁写作（如第1篇踩坑自白、第2篇实操清单、第3篇对比测评等），行文逻辑、分段结构必须截然不同！',
      '【AI去油去八股铁律】：严禁使用假大空机械套话（如“不可否认”、“毋庸置疑”、“显而易见”、“随着时代发展”、“洞悉规律”等）！必须使用第一人称博主真实在场口吻（“我亲测”、“真的建议大家”、“踩过的坑”）。',
      '【小红书分段呼吸感与排版铁律】：正文严禁大段密密麻麻抱团堆砌！每段限 1~3 句话（不超过 80 字），段落与要点之间【必须使用双换行(\\n\\n)留出空行】。每隔 2~3 个短段使用 📌💡✅🔍🎯 等 emoji 作为视觉锚点，保持手机屏幕阅读的轻盈通透感。',
      '【小红书话题动态绑定铁律】：严禁机械照抄模板中的死标签（如无关的“开题报告/考研”等）！必须根据当前笔记的具体内容主题，紧密结合当前账号配置的垂直 topics（当前账号 topics：' + content.topics.join('、') + '），在 tags 字段中精选 3~5 个最契合的官方热门话题标签。正文末尾附带的话题由系统交互式激活为官方话题胶囊。',
      '【小红书社区规范红线一：严禁任何导流行为（规范 3.2）】：严禁发布微信号、微信、加V、VX、QQ、手机号、邮箱、二维码、暗号、外部网址域名（.cn/.com/http/https等）、外站平台（淘宝/京东/公众号/知乎等）或“私信领资料”。一律合规于社区内自然互动。',
      '【小红书社区规范红线二：严禁违规交易与虚假承诺（规范 2.3 & 3.1）】：严禁出现“保过”、“包过”、“黑客攻击”、“破解盗版”、“刷单”等任何违规交易或虚假承诺词汇。',
      '【小红书社区规范红线三：真实体验与杜绝虚假夸大（规范 4.1.3 & 4.1.4）】：提倡第一人称“真诚分享”与利他干货，结构清晰，emoji 导读；标题严格 ≤ ' + XHS_TITLE_MAX + ' 字；严禁标题党与广告极限词（如“全网第一”、“绝密”、“100%包过”等）。',
      '【小红书社区规范红线四：知识产权与肖像保护（规范 5.1 & 5.2）】：生图提示词严禁使用知名真实人物肖像，严禁侵犯商业商标/企业Logo，画面现代美观，全中文，严禁低俗恐怖。',
      '平台形态：小红书图文笔记（纯文本文案 + 3:4 竖版多图卡片）',
      '正文（含话题标签）字数区间：' + minWords + ' ~ ' + XHS_CONTENT_MAX + ' 字纯文本，严格保持短段落与双换行空行',
      '正文禁占位符铁律：content 必须是不含任何 IMG_A{i}_{j} 占位符的纯文案——小红书图片由上传区单独提交，正文严禁残留占位符标记',
      '作者/博主名：' + cleanAuthorName + '（已自动脱敏过滤外部域名网址）',
      content.ending_guide_required
        ? '正文结尾自然融入博主IP专栏名「' + cleanBrandName + '」，并配合合规社区互动（如“欢迎在评论区交流探讨~”、“持续分享干货，点击关注不迷路”）'
        : '正文结尾引导语可选，须为纯净社区互动语',
      '配图规格：每篇 ' + imgPerNote + ' 张，尺寸统一 1080×1440px（3:4 竖版），第 1 张为封面海报，画面中心必须以醒目大字艺术排版印刷笔记中文主标题（严禁留白无字背景框）',
      '禁词表全文生效：严禁出现任何违规禁词与敏感导流词',
      '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
      '选题避让铁律：recent_titles 列出了本账号最近已发布的文章标题，新选题必须在主题角度、核心论点、实操方法上与之显著区分',
    ],
    forbidden_words: content.forbidden_words,
    articles_per_day: n,
    topics: [...content.topics],
    enable_hot_tracking: content.enable_hot_tracking !== false,
    seasonal_context: getSeasonalContext(),
    content_images_per_article: imgPerNote,
    theme_plan: archetypePlan as any,
    references: [],
    recent_titles: recentTitles,
    ...structRules,
  }
}

function newspicStyleGuide(cfg: Config, accountId: string): StyleGuide {
  const account = resolveAccount(cfg, accountId)
  const content = account.profile.content
  const strictRule = buildStrictConfigHardRule(cfg, account.profile)
  const structRules = extractStructuredAccountRules(cfg, account.profile)
  const n = content.newspic_articles_per_day || 1
  const cardCount = content.newspic_images_per_article || 4
  const minWords = content.newspic_min_words ?? Math.min(content.min_words, 100)
  return {
    account_id: account.id,
    account_name: account.profile.name,
    platform: 'gzh',
    theme: 'graphite',
    palette: THEME_PALETTES.graphite,
    typography_rules: {
      format: '小绿书图片消息（article_v2_{index}_pic.json），多图轮播+纯文本说明',
      title_limit: '标题必须严格 ≤ 20 字（微信公众平台原生图片消息硬性限制 ≤ 20 字，超出将被截断或报错）',
      content_format: '纯文本内容，段落与要点之间必须使用双换行（\\n\\n）保持空行呼吸感，搭配 emoji 与文末精准 #话题 标签，严禁任何 HTML 标签',
      image_format: '每篇配 ' + cardCount + ' 张卡片图，第 1 张自动作为封面，统一尺寸比例 3:4 竖版',
    },
    doc_spec: getDynamicNewspicDocSpec(cardCount),
    parts_format: [
      'title → 爆款短标题（严格≤20字，数字+痛点+解决方案结构，如「3步搞定xxx」「xxx自查清单」，严禁超过20字）',
      'content → 纯文案正文（150~500字，排版必须留有呼吸感：双换行\\n\\n空行分段 + emoji导读 + 独立要点小标题 + 文末引导 + 动态精选垂直话题标签 #xxx）',
      'cards → 多图生图提示词列表（每张 sub 从 1 到 ' + cardCount + '）',
      '  卡片角色分工：sub1=cover（封面吸睛）→ sub2=overview（核心速览）→ sub3~' + (cardCount - 1) + '=key_points（干货要点/流程图解）→ sub' + cardCount + '=cta（总结引导关注）',
      '  每张卡片 prompt 须明确：① 卡片类型/角色 ② 内容要点 ③ 视觉风格 ④ 全中文约束',
    ],
    hard_rules: [
      strictRule,
      '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、文章形态、字数、配图、主题色板等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则（如单行HTML零换行、禁词表、防重复发布、生图尺寸比例等）继续严格生效。',
      '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
      '平台形态：微信公众号小绿书（图片消息 newspic）',
      '【小绿书标题严格 ≤ 20 字】：微信公众号原生图片消息标题限制严格为 20 字（如编辑器右侧显示「19/20」），绝不能超 20 字！标题须含数字或痛点词，避免纯陈述句',
      '作者名固定 ' + account.profile.author_name,
      `【小绿书卡片数量严格对齐铁律】：当前账号在设置中已单独配置每篇小绿书卡片数为【${cardCount}】张！在 doc_spec 中 cards 列表必须不多不少正好包含【${cardCount}】张 3:4 竖版卡片提示词（sub 编号从 1 到 ${cardCount}），严禁多写，也严禁少写！`,
      '数量铁律：默认本次正好 ' + n + ' 篇小绿书（每篇包含 ' + cardCount + ' 张卡片图片 sub 1~' + cardCount + '）；若用户在补充要求中指定了篇数，以补充要求为准',
      '发布铁律：内容生成完毕后必须先停下等待用户审校确认！用户确认后统一调用 1 次 social_publisher(action: "publish", article_type: "newspic", user_confirmed: true)，严禁直接调用底层 gzh_publish_draft，严禁未获用户确认擅自发布！',
      '卡片尺寸：1080×1440px（3:4 竖版），第 1 张卡片自动作为封面，无需额外封面图',
      '卡片逻辑递进：封面（视觉冲击+标题意象）→ 速览（核心要点概览）→ 详解（干货/流程/对比）→ 收尾（结论+关注引导），禁止卡片内容重复或无序堆砌',
      '封面卡片（sub1）：画面正中心必须以醒目大字艺术排版印刷标题文字，严禁留白无字背景框',
      '内容卡片（sub2~' + cardCount + '）：每张聚焦一个子主题，信息密度均匀，禁止空白过多或文字堆叠',
      '【小绿书排版与分段呼吸感铁律】：正文严禁全文密密麻麻挤在一段！每个要点之间、小节之间【必须保留空行（\\n\\n）】。标准排版结构：① 📌 核心速览（1-2句痛点总结）；② ✅ 要点拆解（每个要点使用独立小标题如「✅ 要点一｜xxx」，要点之间双换行分隔）；③ 💡 避坑提醒/行动要领；④ 品牌关注引导；⑤ 动态精准话题标签',
      '【小绿书话题动态选择铁律】：严禁机械照抄模板示例里的固定标签！必须根据当前文章的具体核心切角与业务内容，紧密结合账号领域配置（当前账号 topics：' + content.topics.join('、') + '），在文末精选 2~4 个最具垂直度与搜索量的话题标签（如职称文章选 #职称评审 #答辩攻略，投稿文章选 #期刊发表 #论文指导），标签间以空格隔开',
      '【微信小绿书话题动态绑定铁律】：正文文末的 #话题 标签在发布时由系统在小绿书编辑器内经「话题联想 → 点选同名条目」交互式激活为微信官方话题实体；联想未命中时会保留纯文本降级并在发布结果 topic_note 中如实留痕（N 个已激活 / M 个未激活 + 截图）。因此标签名必须使用与平台话题广场一致的通用词，不要自造生僻组合词，否则无法命中官方话题。',
      '正文字数：不低于 ' + minWords + ' 字纯文本，建议 150~500 字，分段清晰，每段以 emoji 导读（如 📌✅💡🔑🎯）',
      '禁词表全文生效：严禁出现任何禁词',
      content.ending_guide_required
        ? '正文结尾必须自然包含品牌名「' + account.profile.brand_name + '」'
        : '正文结尾引导语可选',
      '图片中所有文字必须全部中文，禁止英文残留、禁止二维码',
    ],
    forbidden_words: content.forbidden_words,
    articles_per_day: n,
    topics: [...content.topics],
    enable_hot_tracking: content.enable_hot_tracking !== false,
    seasonal_context: getSeasonalContext(),
    content_images_per_article: cardCount,
    theme_plan: {},
    references: [],
    ...structRules,
  }
}

// zhihu doc spec 统一在上方 getDynamicZhihuDocSpec 动态构建

function zhihuStyleGuide(cfg: Config, accountId: string): StyleGuide {
  const account = resolveAccount(cfg, accountId)
  const content = account.profile.content
  const strictRule = buildStrictConfigHardRule(cfg, account.profile)
  const structRules = extractStructuredAccountRules(cfg, account.profile)
  const n = content.articles_per_day
  const contentImgs = contentImagesPerArticle(cfg, account.profile)
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
      paragraph_pacing: '每个段落保持 2~4 行（约 60~100 字），段落之间空行分隔，避免密闭长文本造成阅读疲劳',
    },
    doc_spec: getDynamicZhihuDocSpec(content.topics, contentImgs),
    parts_format: [
      '字符串 → 普通文字',
      '["kw", 文字] → **加粗关键词**（每段 1-3 个）',
      '["b", 文字] → **加粗**',
      '["hl", 文字] → **加粗强调**',
    ],
    hard_rules: [
      strictRule,
      '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、文章形态、字数、配图、主题色板等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则（如标准 Markdown、禁词表、防重复发布、生图尺寸比例等）继续严格生效。',
      '平台：知乎专栏；产出为标准 Markdown（若账号配置了品牌头尾图，构建流水线将自动注入头部与尾部品牌图）',
      '作者名固定 ' + account.profile.author_name,
      `【正文配图占位严格对齐铁律】：当前账号在内容规则中已单独配置每篇长文正文配图数为【${contentImgs}】张！在组织正文各章节 blocks 时，正文插图占位符 IMG_A{index}_{j} 数量必须不多不少刚好为【${contentImgs}】个${contentImgs === 0 ? '（本次严格为0：正文中严禁插入任何 img 占位符或图片标记！）' : `（必须严格在 sections 中分布从 IMG_A{index}_1 到 IMG_A{index}_${contentImgs} 共 ${contentImgs} 个占位符，严禁少填导致插图缺失，也严禁多填导致构建与生图拦截！）`}`,
      '数量铁律：默认本次正好 ' + n + ' 篇（index 1~' + n + '）；若用户在补充要求中指定了篇数，以补充要求为准；知乎每篇是独立文章草稿（不是多图文组合）；每篇正好 ' + contentImgs + ' 张正文配图' + (contentImgs === 0 ? '（本次为 0：不要生成任何 IMG_A* 占位）' : '（必须在 sections 中分布占位符 IMG_A{index}_1 ~ IMG_A{index}_' + contentImgs + '，系统构建会自动自愈补齐）'),
      '选题铁律（全账号统一）：若用户在本次任务补充要求中明确给出了特定主题/选题或业务方向，以补充要求为最高第一优先级执行；仅在未指定特定选题时，才必须围绕下方 topics 业务关键词深度检索并拓展强相关联的优质选题（如直击读者痛点、实操避坑、政策解读、流程指南等）；严禁机械式将关键词直接作为标题开头词语或前缀（❌ 严禁出现“北大核心：...”、“【SCI】...”等冒号或括号前缀；✅ 必须是自然陈述句或疑问句，如“投稿前先看准这四项刊物信息，避开盲投陷阱”）；标题应自然吸睛；跨账号选题规则：不同账号选题支持重复，但本账号标题严禁与其他账号已发布标题完全一致（gzh_check_topics 与发布闸双重机器断言，命中必须换句式/换切角/换重点改写）',
      '【知乎排版与段落呼吸感铁律】：严禁连续数百字不换行的大密度文本块！每个自然段控制在 2~4 行以内，段与段之间必须有空行；长章节中善用无序列表（- 要点）与重点加粗（**关键词**），呈现逻辑层级与呼吸感。',
      '【知乎话题动态推荐铁律】：写作时围绕账号领域关键词（当前账号 topics：' + content.topics.join('、') + '），发布系统在直发（publish_immediately）时于发布弹层内键入话题名并从联想列表精确点选官方话题（确保进入对应垂直知乎话题广场与分发流）；联想未命中会跳过并留痕，绝不乱选。注意：存草稿模式（不直发）没有发布弹层，话题不绑定——需要话题分发的账号请开直发。话题名使用知乎话题广场通用的通用词，不要自造生僻组合词。',
      '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
      '字数铁律：每篇设定下限不少于 ' + content.min_words + ' 字（构建时严格去除标记与空白统计）。因大模型 token 估算普遍偏少，撰写时请务必按 ' + Math.max(content.min_words + 400, Math.ceil(content.min_words * 1.2)) + ' 字以上标准充分展开！规划 4~6 个长章节，每章节 3~5 个长段落，搭配 card/清单深度展开，确保纯汉字充实达标，杜绝断言失败重写浪费 token（构建工具设有容差底线）',
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
    enable_hot_tracking: content.enable_hot_tracking !== false,
    seasonal_context: getSeasonalContext(),
    content_images_per_article: contentImgs,
    theme_plan: {},
    references: [],
  }
}

function baijiahaoStyleGuide(cfg: Config, accountId: string): StyleGuide {
  const account = resolveAccount(cfg, accountId)
  const content = account.profile.content
  const strictRule = buildStrictConfigHardRule(cfg, account.profile)
  const structRules = extractStructuredAccountRules(cfg, account.profile)
  const n = content.articles_per_day
  const contentImgs = contentImagesPerArticle(cfg, account.profile)
  return {
    account_id: account.id,
    account_name: account.profile.name,
    platform: 'baijiahao',
    theme: 'markdown',
    palette: {},
    typography_rules: {
      format: '标准 Markdown 多行文本（article_v2_{index}.md）',
      heading: '章节标题构建为 "## 序号 标题"，禁止自行使用一级标题',
      emphasis: 'kw/b/hl 标注一律渲染为 **加粗**（Markdown 无下划线/高亮语义）',
      no_html: '禁止输出任何 HTML 标签或内联样式',
      paragraph_pacing: '每个段落保持 2~4 行（约 60~100 字），段落之间空行分隔，排版舒展呼吸',
    },
    doc_spec: getDynamicZhihuDocSpec(content.topics, contentImgs),
    parts_format: [
      '字符串 → 普通文字',
      '["kw", 文字] → **加粗关键词**（每段 1-3 个）',
      '["b", 文字] → **加粗**',
      '["hl", 文字] → **加粗强调**',
    ],
    hard_rules: [
      strictRule,
      '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、文章形态、字数、配图、主题色板等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则（如标准 Markdown、禁词表、防重复发布、生图尺寸比例等）继续严格生效。',
      '平台：百家号（百度内容平台，机器审核制）；产出为标准 Markdown（若账号配置了品牌头尾图，构建流水线将自动注入头部与尾部品牌图）',
      '作者名固定 ' + account.profile.author_name,
      `【正文配图占位严格对齐铁律】：当前账号在内容规则中已单独配置每篇长文正文配图数为【${contentImgs}】张！在组织正文各章节 blocks 时，正文插图占位符 IMG_A{index}_{j} 数量必须不多不少刚好为【${contentImgs}】个${contentImgs === 0 ? '（本次严格为0：正文中严禁插入任何 img 占位符或图片标记！）' : `（必须严格在 sections 中分布从 IMG_A{index}_1 到 IMG_A{index}_${contentImgs} 共 ${contentImgs} 个占位符，严禁少填导致插图缺失，也严禁多填导致构建与生图拦截！）`}`,
      '数量铁律：默认本次正好 ' + n + ' 篇（index 1~' + n + '）；若用户在补充要求中指定了篇数，以补充要求为准；百家号每篇是独立文章草稿（不是多图文组合）；每篇正好 ' + contentImgs + ' 张正文配图' + (contentImgs === 0 ? '（本次为 0：不要生成任何 IMG_A* 占位）' : '（必须在 sections 中分布占位符 IMG_A{index}_1 ~ IMG_A{index}_' + contentImgs + '，系统构建会自动自愈补齐）'),
      '选题铁律（全账号统一）：若用户在本次任务补充要求中明确给出了特定主题/选题或业务方向，以补充要求为最高第一优先级执行；仅在未指定特定选题时，才必须围绕下方 topics 业务关键词深度检索并拓展强相关联的优质选题（如直击读者痛点、实操避坑、政策解读、流程指南等）；严禁机械式将关键词直接作为标题开头词语或前缀（❌ 严禁出现“北大核心：...”、“【SCI】...”等冒号或括号前缀；✅ 必须是自然陈述句或疑问句，如“投稿前先看准这四项刊物信息，避开盲投陷阱”）；标题应自然吸睛；跨账号选题规则：不同账号选题支持重复，但本账号标题严禁与其他账号已发布标题完全一致（gzh_check_topics 与发布闸双重机器断言，命中必须换句式/换切角/换重点改写）',
      '【百家号排版与段落呼吸感铁律】：百度系用户多为移动端碎片化阅读，严禁大块冗长文本！段落短小（2~4行），段间以空行彻底分开；善用加粗与要点列表，保持层次明晰。',
      '【百家号文章标签动态提取】：内容须紧扣账号核心 topics（当前账号 topics：' + content.topics.join('、') + '），发布系统在发布面板中键入标签名并从联想列表精确点选 2~4 个最契合的官方关键词标签（强化百度搜索与信息流召回）；联想未命中会跳过并留痕，绝不盲按 Enter。标签名使用百度系常见的通用词，不要自造生僻组合词。',
      '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
      '字数铁律：每篇设定下限不少于 ' + content.min_words + ' 字（构建时严格去除标记与空白统计）。因大模型 token 估算普遍偏少，撰写时请务必按 ' + Math.max(content.min_words + 400, Math.ceil(content.min_words * 1.2)) + ' 字以上标准充分展开！规划 4~6 个长章节，每章节 3~5 个长段落，搭配 card/清单深度展开，确保纯汉字充实达标，杜绝断言失败重写浪费 token（构建工具设有容差底线）',
      '标题 ' + BAIJIAHAO_TITLE_MAX + ' 字硬上限（建议 8~30 字），禁词表全文生效（构建与校验时断言）',
      '【百家号标题党红线】：百度机器审核严打标题党——严禁"震惊/惊呆/吓死/99%的人不知道/速看/删前必看"等夸大恐吓体；严禁标题与正文不符的误导性表述；严禁绝对化断言（"一定/肯定/100%"）与医疗疗效承诺；违规将被拒稿或扣分限流',
      '【百家号导流红线】：正文严禁出现任何外部链接、二维码、微信号/QQ/手机号等联系方式（构建与校验时断言），品牌引导语仅可提及品牌名',
      '医疗/财经/时政等敏感领域表述谨慎，不提供诊断/投资建议类断言',
      content.ending_guide_required
        ? '结尾自然引导关注「' + account.profile.brand_name + '」（构建时断言）'
        : '结尾引导语可选；如使用需自然融入，不堆砌广告感',
      '封面比例统一 ' + BAIJIAHAO_COVER_RATIO + '（百家号单图封面固定，按账号平台机器强制）',
      '图片中所有文字必须全部中文，禁止英文残留、禁止二维码',
    ],
    forbidden_words: content.forbidden_words,
    articles_per_day: n,
    topics: [...content.topics],
    enable_hot_tracking: content.enable_hot_tracking !== false,
    seasonal_context: getSeasonalContext(),
    content_images_per_article: contentImgs,
    theme_plan: {},
    references: [],
  }
}

function toutiaoStyleGuide(cfg: Config, accountId: string): StyleGuide {
  const account = resolveAccount(cfg, accountId)
  const content = account.profile.content
  const strictRule = buildStrictConfigHardRule(cfg, account.profile)
  const structRules = extractStructuredAccountRules(cfg, account.profile)
  const n = content.articles_per_day
  const contentImgs = contentImagesPerArticle(cfg, account.profile)
  return {
    account_id: account.id,
    account_name: account.profile.name,
    platform: 'toutiao',
    theme: 'markdown',
    palette: {},
    typography_rules: {
      format: '标准 Markdown 多行文本（article_v2_{index}.md）',
      heading: '章节标题构建为 "## 序号 标题"，禁止自行使用一级标题',
      emphasis: 'kw/b/hl 标注一律渲染为 **加粗**（Markdown 无下划线/高亮语义）',
      no_html: '禁止输出任何 HTML 标签或内联样式',
      paragraph_pacing: '每个段落保持 2~4 行（约 60~100 字），段落之间空行分隔，排版舒展呼吸',
    },
    doc_spec: getDynamicZhihuDocSpec(content.topics, contentImgs),
    parts_format: [
      '字符串 → 普通文字',
      '["kw", 文字] → **加粗关键词**（每段 1-3 个）',
      '["b", 文字] → **加粗**',
      '["hl", 文字] → **加粗强调**',
    ],
    hard_rules: [
      strictRule,
      '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、文章形态、字数、配图、主题色板等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则（如标准 Markdown、禁词表、防重复发布、生图尺寸比例等）继续严格生效。',
      '平台：头条号（今日头条创作者平台，机器审核制+信息流推荐分发）；产出为标准 Markdown（若账号配置了品牌头尾图，构建流水线将自动注入头部与尾部品牌图）',
      '作者名固定 ' + account.profile.author_name,
      `【正文配图占位严格对齐铁律】：当前账号在内容规则中已单独配置每篇长文正文配图数为【${contentImgs}】张！在组织正文各章节 blocks 时，正文插图占位符 IMG_A{index}_{j} 数量必须不多不少刚好为【${contentImgs}】个${contentImgs === 0 ? '（本次严格为0：正文中严禁插入任何 img 占位符或图片标记！）' : `（必须严格在 sections 中分布从 IMG_A{index}_1 到 IMG_A{index}_${contentImgs} 共 ${contentImgs} 个占位符，严禁少填导致插图缺失，也严禁多填导致构建与生图拦截！）`}`,
      '数量铁律：默认本次正好 ' + n + ' 篇（index 1~' + n + '）；若用户在补充要求中指定了篇数，以补充要求为准；头条号每篇是独立文章草稿（不是多图文组合）；每篇正好 ' + contentImgs + ' 张正文配图' + (contentImgs === 0 ? '（本次为 0：不要生成任何 IMG_A* 占位）' : '（必须在 sections 中分布占位符 IMG_A{index}_1 ~ IMG_A{index}_' + contentImgs + '，系统构建会自动自愈补齐）'),
      '选题铁律（全账号统一）：若用户在本次任务补充要求中明确给出了特定主题/选题或业务方向，以补充要求为最高第一优先级执行；仅在未指定特定选题时，才必须围绕下方 topics 业务关键词深度检索并拓展强相关联的优质选题（如直击读者痛点、实操避坑、政策解读、流程指南等）；严禁机械式将关键词直接作为标题开头词语或前缀（❌ 严禁出现“北大核心：...”、“【SCI】...”等冒号或括号前缀；✅ 必须是自然陈述句或疑问句，如“投稿前先看准这四项刊物信息，避开盲投陷阱”）；标题应自然吸睛；跨账号选题规则：不同账号选题支持重复，但本账号标题严禁与其他账号已发布标题完全一致（gzh_check_topics 与发布闸双重机器断言，命中必须换句式/换切角/换重点改写）',
      '【头条号排版与段落呼吸感铁律】：头条信息流读者以移动端碎片化阅读为主，严禁大块冗长文本！段落短小（2~4行），段间以空行彻底分开；善用加粗与要点列表，保持层次明晰。',
      '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
      '字数铁律：每篇设定下限不少于 ' + content.min_words + ' 字（构建时严格去除标记与空白统计）。因大模型 token 估算普遍偏少，撰写时请务必按 ' + Math.max(content.min_words + 400, Math.ceil(content.min_words * 1.2)) + ' 字以上标准充分展开！规划 4~6 个长章节，每章节 3~5 个长段落，搭配 card/清单深度展开，确保纯汉字充实达标，杜绝断言失败重写浪费 token（构建工具设有容差底线）',
      '标题 ' + TOUTIAO_TITLE_MAX + ' 字硬上限（含标点，建议 22~30 字充分利用信息量），禁词表全文生效（构建与校验时断言）',
      '【头条号标题党红线】：头条机器审核严打标题党——严禁"震惊/惊呆/吓死/99%的人不知道/速看/删前必看"等夸大恐吓体；严禁标题与正文不符的误导性表述；严禁绝对化断言（"一定/肯定/100%"）与医疗疗效承诺；违规将被拒稿或扣分限流',
      '【头条号导流红线】：正文严禁出现任何外部链接、二维码、微信号/QQ/手机号等联系方式（构建与校验时断言），品牌引导语仅可提及品牌名',
      '医疗/财经/时政等敏感领域表述谨慎，不提供诊断/投资建议类断言',
      content.ending_guide_required
        ? '结尾自然引导关注「' + account.profile.brand_name + '」（构建时断言）'
        : '结尾引导语可选；如使用需自然融入，不堆砌广告感',
      '封面比例统一 ' + TOUTIAO_COVER_RATIO + '（头条号单图封面固定，按账号平台机器强制）',
      '图片中所有文字必须全部中文，禁止英文残留、禁止二维码',
    ],
    forbidden_words: content.forbidden_words,
    articles_per_day: n,
    topics: [...content.topics],
    enable_hot_tracking: content.enable_hot_tracking !== false,
    seasonal_context: getSeasonalContext(),
    content_images_per_article: contentImgs,
    theme_plan: {},
    references: [],
  }
}

export function styleGuideTool(cfg: Config) {
  return defineTool<{ platform?: string; theme?: string; account_id?: string; article_type?: 'news' | 'newspic' }, StyleGuide>({
    name: 'gzh_get_style_guide',
    description:
      '获取写作与排版规范（按账号平台返回）：公众号=主题色板/doc_spec 格式/13px 排版铁律/禁词表/硬性规则/' +
      '主题计划 theme_plan；小绿书=图片消息 doc_spec 与硬性规则；知乎/百家号/头条号=Markdown 形态的 doc_spec 与硬性规则；' +
      '小红书=3:4竖版多图卡片与纯文本笔记 doc_spec 格式。' +
      '支持指定 platform（gzh / zhihu / xiaohongshu / baijiahao / toutiao），未传 account_id 时自动匹配该平台启用账号并自省返回可用账号。' +
      '返回值自包含，写文无需读参考文档、源码或在终端搜寻配置。每日写文前必读一次获取基础排版规范与默认参数。' +
      '注意：若本次任务包含用户补充要求（如指定选题、篇数、形态、字数、配图或主题等），补充要求为第一最高优先级，优先遵循补充要求执行；未被补充要求覆盖的基础合规与格式铁律按返回值严格执行。',
    parameters: {
      platform: {
        type: 'string',
        description: '可选：指定社媒平台（gzh / zhihu / xiaohongshu / baijiahao / toutiao），缺省结合账号或默认账号确定',
        enum: ['gzh', 'zhihu', 'xiaohongshu', 'baijiahao', 'toutiao'],
      },
      theme: {
        type: 'string',
        description: '主题键（仅公众号长文生效，缺省用设置的头条主题）',
        enum: Object.keys(THEME_NAMES),
      },
      article_type: {
        type: 'string',
        description: '可选：指定文章形态（news=长图文，newspic=小绿书图片消息）；缺省按账号设置',
        enum: ['news', 'newspic'],
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省结合 platform 自动寻找启用账号，或回退至默认账号',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: renderJson,
    },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id, args.platform)
      const allSummaries = listAccountSummaries(cfg)
      const targetPlatform = account.profile.platform
      const platformAccounts = allSummaries.filter(
        s => s.enabled && s.platform === targetPlatform,
      )
      const isMultiAccountTarget = !args.account_id && platformAccounts.length > 1
      const multiAccountHint = isMultiAccountTarget
        ? `【多账号调度警示】当前平台「${targetPlatform}」共检测到 ${platformAccounts.length} 个已启用账号：${platformAccounts.map(a => `${a.name}(${a.id})`).join('、')}。本次调用仅返回首个账号「${account.profile.name}」的排版规范；若用户未明确指定单一账号，系统默认要求遍历执行该平台下全部启用账号！你必须按顺序分别为每一个账号调用 gzh_get_style_guide(account_id: acc.id) 获取其独立规范，并跑通【查重 → 撰写 → 生图 → 校验 → 发布】全套闭环，严禁仅执行第 1 个账号就早退结束！`
        : undefined
      const sharedContext = {
        available_accounts: allSummaries,
        platform_accounts: platformAccounts,
        multi_account_dispatch_required: isMultiAccountTarget,
        ...(multiAccountHint ? { multi_account_hint: multiAccountHint } : {}),
      }
      const articleType = args.article_type || account.profile.content.article_type || 'news'
      if (articleType === 'newspic' && account.profile.platform !== 'zhihu') {
        const guide = newspicStyleGuide(cfg, account.id)
        return {
          ...guide,
          ...sharedContext,
          hard_rules: multiAccountHint ? [multiAccountHint, ...guide.hard_rules] : guide.hard_rules,
        }
      }
      if (account.profile.platform === 'xiaohongshu') {
        const guide = xhsStyleGuide(cfg, account.id)
        return {
          ...guide,
          ...sharedContext,
          hard_rules: multiAccountHint ? [multiAccountHint, ...guide.hard_rules] : guide.hard_rules,
        }
      }
      if (account.profile.platform === 'zhihu') {
        const guide = zhihuStyleGuide(cfg, account.id)
        return {
          ...guide,
          ...sharedContext,
          hard_rules: multiAccountHint ? [multiAccountHint, ...guide.hard_rules] : guide.hard_rules,
        }
      }
      if (account.profile.platform === 'baijiahao') {
        const guide = baijiahaoStyleGuide(cfg, account.id)
        return {
          ...guide,
          ...sharedContext,
          hard_rules: multiAccountHint ? [multiAccountHint, ...guide.hard_rules] : guide.hard_rules,
        }
      }
      if (account.profile.platform === 'toutiao') {
        const guide = toutiaoStyleGuide(cfg, account.id)
        return {
          ...guide,
          ...sharedContext,
          hard_rules: multiAccountHint ? [multiAccountHint, ...guide.hard_rules] : guide.hard_rules,
        }
      }
      const content = account.profile.content
      const isBoth = content.article_type === 'both' || content.sync_newspic === true
      const n = content.articles_per_day
      const contentImgs = contentImagesPerArticle(cfg, account.profile)
      const theme = (args.theme && args.theme in THEME_NAMES ? args.theme : resolveTheme(cfg, 1, account.profile)) as ThemeKey
      const themePlan: Record<string, ThemeKey> = {}
      for (let i = 1; i <= n; i++) themePlan[String(i)] = resolveTheme(cfg, i, account.profile)
      const refsDir = path.join(runtimeResourceDir(), 'references')
      const references: string[] = []
      // 主题文件：按 hints 模糊匹配 theme-*.md
      let themeDoc: string | null = null
      try {
        for (const f of fs.readdirSync(refsDir)) {
          if (!f.startsWith('theme-') || !f.endsWith('.md')) continue
          if (THEME_FILE_HINTS[theme].some(h => f.toLowerCase().includes(h))) {
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
      const typo = resolveTypography(cfg, account.profile)
      const headlineRatio = resolveCoverRatio(cfg, 1, account.profile)
      const secondaryRatio = resolveCoverRatio(cfg, 2, account.profile)

      // 4大公众号原生爆款叙事体裁规划（去模板化、去套路化体系）
      const archetypePlan: Record<string, string> = {}
      for (let i = 1; i <= n; i++) {
        const arch = GZH_ARCHETYPES[(i - 1) % GZH_ARCHETYPES.length]
        archetypePlan['article_' + i] = `${arch.name}（${arch.type}，推荐核心组件：${arch.highlight_components}）`
      }

      const strictRule = buildStrictConfigHardRule(cfg, account.profile)
      const structRules = extractStructuredAccountRules(cfg, account.profile)
      return {
        account_id: account.id,
        account_name: account.profile.name,
        platform: 'gzh',
        ...sharedContext,
        ...structRules,
        theme,
        palette: THEME_PALETTES[theme],
        typography_rules: {
          font_size: typo.font_size,
          line_height: typo.line_height,
          paragraph_margin: typo.paragraph_margin,
          text_indent: typo.text_indent,
          no_blank_line: '纯单行 HTML，组件自动保证零换行符',
        },
        doc_spec: getDynamicGzhDocSpec(contentImgs),
        parts_format: [
          'intro → 可选开头（大引号卡片 {pre, hl, post}、观点卡 {quote, author}、导言强调段 {lead} 或直接省略为自然行文）',
          'toc → 可选导读目录（2~4个看点字符串数组，支持 toc_style: "grid" 自适应网格 或 "pills" 胶囊流，案例文可省略）',
          'sections → 章节列表，支持 style: "badge"（默认方块标）/ "pill"（圆角胶囊）/ "bar"（加粗左竖条）/ "underline"（下划线）',
          'blocks 内可用多样化组件（丰富排版，杜绝单一）：',
          '  • p: 普通正文段落，支持 parts 标记（["kw", 关键词下划线], ["b", 主题色加粗], ["hl", 浅底高亮]）',
          '  • lead: 无缩进强调段落（适合节选核心痛点或关键结论，浅底左边框衬托）',
          '  • versus: 正反对比卡 {title, wrong, right}（❌ 常见误区 vs ✅ 规范正解，强烈推荐用于干货避坑）',
          '  • checklist: 实操自查清单 {title, items: [...]}（☑️ 逐项打勾卡片，强烈推荐用于实操指南）',
          '  • warning: 避坑警示卡 {title, text}（⚠️ 暖橙警戒色，突出重要提醒）',
          '  • qa: 快问快答卡 {q, a}（Q&A 对话胶囊，打破长篇说理压迫感）',
          '  • stat: 核心数据卡 {metric, label, desc}（大字号数据高光，适合政策/指标解读）',
          '  • quote: 金句观点卡 {text, author}（优雅引用，支持自定义署名）',
          '  • card / card_ul: 经典提示卡与清单',
          '  • img: 正文配图占位符 IMG_A{index}_{j}',
          '  • hr: 渐变分割线',
        ],
        hard_rules: [
          '【系统底层安全红线与禁止自写脚本铁律】：社媒发布任务面向端到端内容生产与发布，严禁自行编写脚本/代码文件（严禁 Write/Edit 创建 .py/.js/.sh 脚本，严禁调用 Bash 运行截图或临时程序）。任务执行遇到任何缺失或失败时，必须直接输出遇到的问题与用户修复指引，交还控制权等待用户修复，严禁自行修复！',
          strictRule,
          ...(multiAccountHint ? [multiAccountHint] : []),
          `【账号发布动作规范】：当前账号预设发布动作为【${account.profile.publish_action_default || 'draft'}】。稿件将在用户审校确认后，统一同步至平台草稿箱。`,
          '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、文章形态、字数、配图、主题色板等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则（如单行HTML零换行、禁词表、防重复发布、生图尺寸比例等）继续严格生效。',
          '【微信后台原生定时与长文/小绿书独立排期铁律】：公众号定时发布由微信公众平台后台原生托管（无本地定时进程）。' +
          '1. 长文（news）与小绿书（newspic）为完全独立的两种内容形态，各自拥有正交独立的规则时段池（长文 schedule_times_article，小绿书 schedule_times_newspic），排期互不干涉、互不避让！长文排期只看长文时段，绝对不受小绿书影响（即使当天 10:00 已排小绿书，09:00 长文空闲依然优先排在 09:00）！' +
          '2. 严禁 Agent 编造所谓的「同日双发错开」、「防轰炸保护」、「间隔 4 小时」等虚假避让逻辑！微信平台完全支持同日多时段并存发表！' +
          '3. 若用户在任务提示/备注中有明确要求具体发表时间（如“要求今天下午16点发布”、“明天上午9点发布”等），以备注要求为最高优先级，将其提取并填入 gzh_publish_draft 的 schedule_time；若用户仅提出“定时发布/排期发表”而未指定具体时刻，严禁 Agent 随意编造或推算时间！必须保持 schedule_time 为空或 "auto"，系统将自动按照账号设定时间规则并排查微信后台已同步排期，优先选择离当前时间最近且无任务的空闲时间段！',
          '【去模板化排版铁律：4大体裁与排版节奏轮换】：同批次产出多篇长文时，严禁使用相同模具！根据 archetype_plan 分配的体裁（实操指南/深度透视/案例文避坑/问答盘点），排版组件截然不同！例如第1篇用对比卡+避坑卡，第2篇用数据卡+导语段，第3篇用问答卡+Checklist，绝不千篇一律！',
          '【去 AI 味铁律一：彻底杜绝 AI 假大空机械套话】：严禁出现“在当今快节奏的社会中”、“随着时代的发展”、“不可否认的是”、“毋庸置疑的是”、“显而易见的是”、“综上所述”、“总而言之”、“深入把握底层逻辑”、“赋能/闭环/坚实基石”等空洞套话！系统内置 AI 八股密度拦截，违规将直接打回重审！',
          '【去 AI 味铁律二：真实在场感与具体场景痛点切入】：开篇拒绝教科书定义，必须使用真实的读者痛点、第一人称场景或真实案例带入（如“很多老师在准备职称材料时，经常在聘任年限这一项栽跟头...”而不是“职称申报是高校教师发展的重要环节...”）。',
          '【去 AI 味铁律三：句式长短错落，短句顿挫有呼吸感】：拒绝连续40字的大段复杂复合句；多用设问、点拨与短句断句，穿插对比与图表引导，使长文具备真人写作的呼吸律动。',
          '【去 AI 味铁律四：具体数字与具体规定，拒绝空洞说理】：给出具体政策年份、文件条款、审核周期天数、真实流程节点，提供真正可落地的干货。',
          '【去 AI 味铁律五：杜绝机械升华与喊口号式结尾】：结尾引导语必须自然、有温度，结合具体实操建议或与读者的真诚互动（如“你在今年申报中遇到了什么难点？欢迎在评论区交流...”），严禁喊空洞口号。',
          '【长文排版结构分层铁律：严禁扁平 sections 充当段落】：sections 必须是清晰的分层章节（通常 3~5 个大章节），每个 section 包含 h2（章节序号如 "01"、"02"）、text（章节小标题）和 blocks（段落与组件数组）。严禁将整篇文章的所有自然段当成扁平的 sections 数组输出（如 sections: [{ type: "p", text: "..." }]）！所有普通自然段必须写在对应章节的 blocks: [ { p: [...] } ] 内；根据内容语义灵活选配 versus、checklist、warning、qa、card，其余阐述内容保持自由纯粹的自然段落 p，杜绝全文单一组件！',
          '【排版组件丰富度铁律】：善用 versus 对比卡（❌ vs ✅）、checklist 自查打勾清单、warning 避坑警示卡、qa 快问快答卡、stat 数据高光卡，每篇长文至少使用 2 种以上特色组件，打破清一色普通段落的沉闷感！',
          '【弹性开头与导读】：案例文、问答文可以直接以情境导语切入（intro: { lead: "..." } 或不带大引号引言卡），目录根据内容实际提炼 2~4 项，无需生硬凑满 3 项。',
          '作者名固定 ' + account.profile.author_name,
          `【正文配图占位严格对齐铁律】：当前账号在内容规则中已单独配置每篇长文正文配图数为【${contentImgs}】张！你在组织正文各章节 blocks 时，正文插图占位符 IMG_A{index}_{j} 数量必须不多不少刚好为【${contentImgs}】个${contentImgs === 0 ? '（本次严格为0：正文中严禁插入任何 img 占位符或图片标记！）' : `（必须严格在 sections 中分布从 IMG_A{index}_1 到 IMG_A{index}_${contentImgs} 共 ${contentImgs} 个占位符，严禁少填导致插图缺失，也严禁多填导致构建与生图拦截！）`}`,
          '数量铁律：默认本次正好 ' + n + ' 篇（index 1~' + n + '），组合为 1 个多图文草稿；若用户在补充要求中指定了篇数，以补充要求为准；每篇正好 1 张封面；每篇正好 ' + contentImgs + ' 张正文配图，禁止增减' + (contentImgs === 0 ? '（本次为 0：不要生成任何 IMG_A* 正文图占位）' : '（必须在 sections 中分布占位符 IMG_A{index}_1 ~ IMG_A{index}_' + contentImgs + '，系统构建会自动校验并自愈补位）'),
          ...(isBoth
            ? ['小绿书同步更新铁律：当前账号已配置「长文 + 小绿书」同步更新（article_type: both 或 sync_newspic: true）。在生成长文 article_v2_{index}.html（共 ' + n + ' 篇合并为1个草稿）的同时，必须从长文提炼核心干货并同步生成 ' + (content.newspic_articles_per_day || 1) + ' 篇小绿书卡片图文 article_v2_{index}_pic.json（规范参考 newspic_spec），生成 3:4 竖版卡片图（kind: "pic"）。发布时，小绿书严格只需调用 1 次 gzh_publish_draft(article_type: "newspic") 单次提交（底层会自动逐篇创建草稿并完成官方核验），严禁由 Agent 循环或多次重复发布！']
            : []),
          '选题铁律（全账号统一）：若用户在本次任务补充要求中明确给出了特定主题/选题或业务方向，以补充要求为最高第一优先级执行；仅在未指定特定选题时，才必须围绕下方 topics 业务关键词深度检索并拓展强相关联的优质选题（如直击读者痛点、实操避坑、政策解读、流程指南等）；严禁机械式将关键词直接作为标题开头词语或前缀（❌ 严禁出现“北大核心：...”、“【SCI】...”等冒号或括号前缀；✅ 必须是自然陈述句或疑问句，如“投稿前先看准这四项刊物信息，避开盲投陷阱”）；标题应自然吸睛；跨账号选题规则：不同账号选题支持重复，但本账号标题严禁与其他账号已发布标题完全一致（gzh_check_topics 与发布闸双重机器断言，命中必须换句式/换切角/换重点改写）',
          '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
          '主题铁律：默认按 theme_plan 对应主题撰写；若用户在补充要求或 doc spec 中指定了有效主题（如 "moyu"、"olive" 等），以指定主题为准',
          '每篇正文共 ' + expectedArticleImageCount(cfg, account.profile) + ' 张 img' +
            (account.profile.brand_images.header.enabled ? '，含头部品牌图' : '') +
            (account.profile.brand_images.footer.enabled ? '，含尾部品牌图' : ''),
          '字数铁律：每篇设定下限不少于 ' + content.min_words + ' 字（纯单行 HTML 去标签及空格后统计）。因大模型 token 估算普遍偏少，撰写时请务必按 ' + Math.max(content.min_words + 400, Math.ceil(content.min_words * 1.2)) + ' 字以上标准充分展开！规划 4~6 个长章节，每章节 3~5 个长段落，搭配多样化排版组件，确保纯汉字充实达标，杜绝断言失败重写浪费 token（构建工具设有容差底线）',
          '封面：第 1 篇头条 ' + headlineRatio + '，其余 ' + secondaryRatio + '；封面图提示词必须紧扣本篇标题核心关键词，将标题主题视觉化呈现（如标题讲"端侧大模型部署"则画面需体现大模型与硬件计算相关意象），禁止泛化抽象或与选题无关的通用素材；画面中心区域需预留标题文字排版空间，适配不同设备裁剪',
          '正文配图：提示词应强调现代科技信息图表、对比看板或学术概念意象，结构分明，严谨工整，极简科技学术美学',
          '视觉蓝图铁律：每篇稿件必须在 doc spec 中输出完整 visual_blueprint 数组，为所有槽位制定精准的 intent_description、generation_prompt 与 search_keywords；小绿书/小红书后续卡片强制为干货知识清单图文，长文插图紧扣图注，绝对严禁生成外卖骑手、路人街拍、休闲咖啡馆等随意发散画面',
          '【AI生图按文章顺序逐篇生产铁律】：严禁一次性并发生成全任务所有文章的全部配图（严禁一次性请求 22 张配图并设置 600 秒超时导致崩溃与无进度等待）！必须按照文章篇目顺序逐篇生产配图：先为第 1 篇生成配图（1 张封面 + 对应插图），再为第 2 篇生成配图...逐篇完成。画面中文字必须全部是中文，禁止出现英文字母、二维码与水印。',
          content.ending_guide_required ? '结尾引导语为硬性要求' : '结尾引导语可选',
        ],
        forbidden_words: content.forbidden_words,
        articles_per_day: n,
        newspic_articles_per_day: isBoth ? (content.newspic_articles_per_day || 1) : undefined,
        topics: [...content.topics],
        enable_hot_tracking: content.enable_hot_tracking !== false,
        seasonal_context: getSeasonalContext(),
        content_images_per_article: contentImgs,
        theme_plan: themePlan,
        archetype_plan: archetypePlan,
        archetypes: GZH_ARCHETYPES,
        references,
        sync_newspic: isBoth,
        ...(isBoth ? { newspic_spec: NEWSPIC_DOC_SPEC_EXAMPLE } : {}),
        publish_action_default: account.profile.publish_action_default || (account.profile.publish_immediately ? 'publish_now' : 'draft'),
        schedule_default_time: account.profile.schedule_default_time || 'auto',
        schedule_times_article: account.profile.schedule_times_article || DEFAULT_SCHEDULE_TIMES_ARTICLE,
        schedule_times_newspic: account.profile.schedule_times_newspic || DEFAULT_SCHEDULE_TIMES_NEWSPIC,
        publish_action_hint: `当前账号预设发布动作为【${account.profile.publish_action_default || 'draft'}】，待用户审校确认后将同步存入平台草稿箱。`,
      }
    },
  })
}
