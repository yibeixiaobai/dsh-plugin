import { defineTool } from '../tool-compat.ts'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { accountScriptsDir, renderJson, runPipeline } from './shared.ts'

export interface ResearchEvidenceItem {
  source: string
  source_name: string
  title: string
  snippet: string
  url: string
  engagement?: {
    views?: number
    likes?: number
    favorites?: number
    comments?: number
    reads?: number
  }
  why_relevant: string
}

export interface TopicResearchResult {
  account_id: string
  topic: string
  days: number
  total_evidence_count: number
  platform_coverage: Record<string, number>
  compact_points: string[]
  evidence_items: ResearchEvidenceItem[]
  researched_at: string
  html_report_path?: string
}

export interface ResearchTopicArgs {
  topic: string
  days?: number
  depth?: 'quick' | 'default' | 'deep'
  account_id?: string
  platform?: string
}

export function researchTopicTool(cfg: Config) {
  return defineTool<ResearchTopicArgs, TopicResearchResult>({
    name: 'gzh_research_topic',
    description:
      '主题 30 天深度研究引擎：自动跨知乎、B站、头条、百度等主流平台检索过去 30 天的真实讨论，' +
      '收集高互动量视频/文章、高频争议焦点与舆情论据，生成有据可查的证据链包（Research Evidence）与离线 HTML 报告。' +
      '【执行建议】：在确定最终选题后、调用 gzh_build_article 前运行本工具，可获取丰富的数据论据直接注入正文创作，' +
      '有效杜绝内容空洞套路与人机感，大幅提升社媒读者信任度。',
    parameters: {
      topic: {
        type: 'string',
        description: '需要深度研究的核心选题或关键词',
      },
      days: {
        type: 'number',
        description: '可选：检索时间窗口跨度（天数，默认 30）',
      },
      depth: {
        type: 'string',
        description: '可选：检索深度（quick=快速精简 / default=标准 / deep=深度多页）',
        enum: ['quick', 'default', 'deep'],
      },
      account_id: {
        type: 'string',
        description: '可选：账号 ID，用于定位报告落盘目录',
      },
      platform: {
        type: 'string',
        description: '可选：发布目标平台',
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
      const topic = args.topic?.trim() || '热点研究'
      const days = typeof args.days === 'number' && args.days > 0 ? args.days : 30
      const depth = args.depth || 'default'

      const pipelineArgs: string[] = [
        '--topic', topic,
        '--days', String(days),
        '--depth', depth,
        '--scripts-dir', scriptsDir,
      ]

      return runPipeline<Omit<TopicResearchResult, 'account_id'>>(
        cfg,
        'research_topic.py',
        pipelineArgs,
        45000,
      ).then(res => ({
        account_id: account.id,
        ...res,
      }))
    },
  })
}
