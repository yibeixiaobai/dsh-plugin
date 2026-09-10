import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { renderJson, runPipeline, scriptsDir } from './shared.ts'

export interface TopicMatch {
  title: string
  source: string
  score: number
  kind: string
}

export interface TopicItem {
  topic: string
  risk: 'high' | 'medium' | 'low'
  top_score: number
  matches: TopicMatch[]
}

export interface TopicReport {
  history_count: number
  items: TopicItem[]
}

export function checkTopicsTool(cfg: Config) {
  return defineTool<{ topics: string[] }, TopicReport>({
    name: 'gzh_check_topics',
    description:
      '选题查重：把候选选题与该公众号历史发布标题（110+ 次迭代的 gen_*/publish_* 脚本与 publish_result.json）' +
      '做相似度比对，返回 high/medium/low 风险与最接近的历史标题。每日写文选题前必调，high 风险选题应更换。',
    parameters: {
      topics: {
        type: 'array',
        required: true,
        description: '候选选题/标题列表',
        items: { type: 'string' },
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      if (!Array.isArray(args.topics) || args.topics.length === 0) {
        throw new Error('topics 不能为空')
      }
      return runPipeline<TopicReport>(
        cfg,
        'check_topics.py',
        ['--topics', JSON.stringify(args.topics), '--scripts-dir', scriptsDir(cfg)],
        60000,
      )
    },
  })
}
