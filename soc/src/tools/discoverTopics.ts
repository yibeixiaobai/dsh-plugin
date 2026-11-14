import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '../tool-compat.ts'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { accountScriptsDir, renderJson, runPipeline } from './shared.ts'

export interface RecommendedTopic {
  title: string
  angle: 'policy' | 'trap' | 'guide' | 'myth' | 'tools' | 'advance' | string
  angle_name: string
  reason: string
  hot_score: number
  pain_score: number
  novelty_score: number
  composite_score: number
  target_audience: string
  platform_fit: string
  sources?: string[]
  cross_platform_count?: number
  evidence_preview?: string
}

export interface SeasonalFocus {
  month: number
  focus: string
  seasonal_keywords: string[]
}

export interface HotBoardCluster {
  title: string
  platforms: string[]
  platform_names: string[]
  cross_platform_count: number
}

export interface TrendingSignals {
  search_news_count: number
  top_news: string[]
  surging_queries: string[]
  hot_board_clusters?: HotBoardCluster[]
  hot_platform_coverage?: Record<string, number>
}

export interface TopicDiscoveryResult {
  account_id: string
  platform: string
  seasonal_focus: SeasonalFocus
  trending_signals: TrendingSignals
  recommended_topics: RecommendedTopic[]
}

export interface DiscoverTopicsArgs {
  platform?: string
  account_id?: string
  keywords?: string[]
  search_snippets?: Array<{ title: string; snippet?: string; source?: string } | string>
  angle?: 'all' | 'policy' | 'trap' | 'guide' | 'myth' | 'tools' | 'advance'
  count?: number
}

export function discoverTopicsTool(cfg: Config) {
  return defineTool<DiscoverTopicsArgs, TopicDiscoveryResult>({
    name: 'gzh_discover_topics',
    description:
      '动态热点选题雷达与搜索聚合：结合多平台实时搜索引擎（Bing/知乎/百度/360）、行业时令日历与5大爆款切角矩阵，智能探测当前最新热点并生成高点击率候选选题。' +
      '【执行纪律与协同原则】：当用户未在指令中明确指定选题时，在调用 gzh_check_topics 查重前，必须优先调用本工具嗅探当前领域热点，选取高评分选题；' +
      '若宿主环境具备通用网络搜索工具（如 search_web），可先围绕业务方向检索最新资讯，将搜索到的标题与摘要传入 search_snippets，由本工具进行爆款切角转化；' +
      '本工具内置了高可用实时搜索与行业时令日历，即使未传 search_snippets 亦能自动全网嗅探或本地保底，100% 确保产出。',
    parameters: {
      platform: {
        type: 'string',
        description: '可选：指定社媒平台（gzh / zhihu / xiaohongshu / baijiahao / toutiao），缺省结合账号或默认账号确定',
        enum: ['gzh', 'zhihu', 'xiaohongshu', 'baijiahao', 'toutiao'],
      },
      account_id: {
        type: 'string',
        description: '公众号/知乎/小红书账号 ID；缺省结合 platform 自动寻找启用账号，或回退至默认账号',
      },
      keywords: {
        type: 'array',
        description: '可选：指定或补充的核心业务关键词列表；缺省读取账号配置的 topics',
        items: { type: 'string' },
      },
      search_snippets: {
        type: 'array',
        description: '可选：由 Agent 宿主搜索工具（如 search_web）检索到的最新热点资讯列表（对象数组或字符串数组），注入后作为最高优先级热点事实',
      },
      angle: {
        type: 'string',
        description: '可选：偏好的爆款切角类型（all=全切角优选，policy=政策解读，trap=痛点避坑，guide=保姆清单，myth=认知反转，tools=实用神器）',
        enum: ['all', 'policy', 'trap', 'guide', 'myth', 'tools', 'advance'],
      },
      count: {
        type: 'number',
        description: '需要生成的推荐选题数量（默认 6）',
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
      const scriptsDir = accountScriptsDir(cfg, account.id)
      const kw = (Array.isArray(args.keywords) && args.keywords.length > 0)
        ? args.keywords
        : (account.profile.content?.topics || [])

      const count = typeof args.count === 'number' && args.count > 0 ? args.count : (account.profile.content?.articles_per_day || 6)
      const platform = account.profile.platform || 'gzh'
      const brandName = account.profile.brand_name || '学术知识分享'
      const forbidden = account.profile.content?.forbidden_words || []
      const snippets = Array.isArray(args.search_snippets) ? args.search_snippets : []

      const pipelineArgs: string[] = [
        '--keywords', JSON.stringify(kw),
        '--scripts-dir', scriptsDir,
        '--search-snippets', JSON.stringify(snippets),
        '--angle', args.angle || 'all',
        '--count', String(count),
        '--platform', platform,
        '--brand-name', brandName,
        '--forbidden', JSON.stringify(forbidden),
      ]

      const rawRes = await runPipeline<Omit<TopicDiscoveryResult, 'account_id'>>(
        cfg,
        'discover_topics.py',
        pipelineArgs,
        30000,
      )

      // 结合发布后数据表现回流，为命中历史高分切角的选题自动给予 +15% 爆款加权
      const metricsFile = path.join(cfg.runtime?.project_root || '', 'tasks', 'analytics', 'article_metrics.json')
      let highAngles: string[] = []
      if (fs.existsSync(metricsFile)) {
        try {
          const rawM = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'))
          if (Array.isArray(rawM)) {
            highAngles = rawM
              .filter((m: any) => (m.viralScore || 0) >= 75)
              .map((m: any) => m.hookAngle)
              .filter(Boolean)
          }
        } catch {}
      }

      const boostedTopics = (rawRes.recommended_topics || []).map((topic) => {
        let boost = 0
        if (highAngles.some(a => a && (topic.angle_name?.includes(a) || topic.reason?.includes(a)))) {
          boost = Math.round(topic.composite_score * 0.15)
        }
        return {
          ...topic,
          composite_score: Math.min(100, topic.composite_score + boost),
        }
      }).sort((a, b) => b.composite_score - a.composite_score)

      return {
        account_id: account.id,
        ...rawRes,
        recommended_topics: boostedTopics,
      }
    },
  })
}
