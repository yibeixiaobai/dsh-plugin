import type { AccountProfile, Config } from '../config.ts'
import { contentImagesPerArticle } from './shared.ts'

export interface StructuredAccountRules {
  configured_article_type: string
  configured_articles_per_day: number
  min_words: number
  core_keywords: string[]
  preferred_topic_angles: string[]
  forbidden_words: string[]
  image_allocation: {
    mode: 'auto' | 'custom'
    ai_images: number
    search_images: number
    total: number
  }
}

/**
 * 结构化提取账号在设置页保存的核心规则配置
 * 【中文修复依据】：为大模型与前端提供统一单一事实源，防止各工具与执行链路各行其是自由发挥
 */
export function extractStructuredAccountRules(cfg: Config, profile: AccountProfile): StructuredAccountRules {
  const content = profile.content
  const platform = profile.platform
  const isXhs = platform === 'xiaohongshu'
  const isZhihu = platform === 'zhihu'
  const isBaijiahao = platform === 'baijiahao'
  const isToutiao = platform === 'toutiao'

  // 发文形态
  let typeLabel = '长文'
  if (content.article_type === 'newspic' || isXhs) {
    typeLabel = isXhs ? '小红书图文笔记' : '微信小绿书图文卡片'
  } else if (content.article_type === 'both' || content.sync_newspic) {
    typeLabel = '长文 + 小红书/小绿书同步双发'
  }

  // 篇数配额
  let articlesCount = content.articles_per_day || 1
  if (isZhihu || isBaijiahao || isToutiao) {
    articlesCount = content.articles_per_day || 1
  }

  // 最低字数
  let minWords = content.min_words || 2000
  if (isXhs) {
    minWords = content.xhs_min_words ?? 200
  } else if (content.article_type === 'newspic') {
    minWords = content.newspic_min_words ?? 150
  }

  // 配图分配模式与数量
  const imgMode = content.image_count_mode === 'auto' ? 'auto' : 'custom'
  const aiImgs = content.ai_images_per_article ?? (isXhs ? 4 : 2)
  const searchImgs = content.search_images_per_article ?? 0
  const totalImgs = imgMode === 'auto'
    ? 0
    : (content.content_images_per_article ?? contentImagesPerArticle(cfg, profile))

  return {
    configured_article_type: typeLabel,
    configured_articles_per_day: articlesCount,
    min_words: minWords,
    core_keywords: [...(content.topics || [])],
    preferred_topic_angles: [...(content.preferred_topic_angles || ['痛点剖析', '方法论拆解', '实操避坑', '行业透视'])],
    forbidden_words: [...(content.forbidden_words || [])],
    image_allocation: {
      mode: imgMode,
      ai_images: aiImgs,
      search_images: searchImgs,
      total: totalImgs,
    },
  }
}

/**
 * 组装注入到 hard_rules 顶层的刚性铁律文本
 * 【中文修复依据】：以绝对权威的红线指令，彻底杜绝大模型在任务执行中的任何自由发挥、偷工减料或偏离垂直领域
 */
export function buildStrictConfigHardRule(cfg: Config, profile: AccountProfile): string {
  const rules = extractStructuredAccountRules(cfg, profile)
  const keywordsStr = rules.core_keywords.length > 0 ? rules.core_keywords.join('、') : '默认技术与学术领域'
  const anglesStr = rules.preferred_topic_angles.length > 0 ? rules.preferred_topic_angles.join('、') : '痛点场景切入、实操指南、规避误区'
  const forbiddenStr = rules.forbidden_words.length > 0 ? rules.forbidden_words.join('、') : '无'

  const imgAllocationDesc = rules.image_allocation.mode === 'auto'
    ? '【AI 根据内容智能设计配图数量】（需围绕文章核心逻辑节点与重点数据智能布局，多图文注意视觉节奏）'
    : `【自定义固定配图】：正文配图总数严格为【${rules.image_allocation.total}】张（AI生图 ${rules.image_allocation.ai_images} 张 + 搜图 ${rules.image_allocation.search_images} 张）`

  return `【账号设置信息严格遵从铁律（系统最高红线·严禁自由发挥）】：
1. 篇数与形态严格锁定：本账号在设置页配置发文形态为「${rules.configured_article_type}」，计划发文篇数严格为【${rules.configured_articles_per_day}】篇。Agent 必须严格按照该篇数和形态执行，严禁擅自增减篇数（严禁知乎/百家号/头条擅自脑补多篇，公众号严格按配额执行）！
2. 正文最低字数硬性底线：每篇文章纯汉字正文字数严格不得低于配置的【${rules.min_words}】字！大模型撰写时必须按 4~6 个长章节充分展开，每章节包含 2~4 个详实段落与清单/卡片，严禁偷工减料短文草草收尾！
3. 核心业务关键词与偏好切角锁定：
   - 核心业务关键词：${keywordsStr}（用于检索趋势与确定选题，严禁脱离账号领域自嗨；严禁将业务词直接作为标题开头前缀，如禁止出现“${rules.core_keywords[0] || '核心词'}：...”等生硬标题）；
   - 偏好切入角度：${anglesStr}（必须从这几个切角选定深度切入）；
   - 选题红线过滤库：${forbiddenStr}（任何候选选题出现以上禁用词必须立即丢弃，严禁使用！）；
4. 配图严格对齐规范：${imgAllocationDesc}。生成的配图占位符与提示词数量必须精准对齐，严禁私自瞎配图！
5. 唯一例外：仅当用户在当前指令中明确发出覆盖参数（如“本次写2篇”或“本次不要插图”）时，才允许覆盖该单个参数，其余未被明确覆盖的设置项依然必须 100% 严格遵从本账号设置！`
}
