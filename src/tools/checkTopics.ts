import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { accountScriptsDir, configuredAccountIds, renderJson, runPipeline, scriptsDir } from './shared.ts'

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
  account_id: string
  history_count: number
  items: TopicItem[]
}

export function checkTopicsTool(cfg: Config) {
  return defineTool<{ topics: string[]; account_id?: string }, TopicReport>({
    name: 'gzh_check_topics',
    description:
      '选题查重：把候选选题与该公众号历史发布标题（publish_result.json 与历史 gen_*/publish_* 脚本），' +
      '以及其它账号的历史标题做相似度比对，返回 high/medium/low 风险与最接近的历史标题。' +
      '每日写文选题前必调，high 风险选题应更换。每账号一次提交全部候选选题（topics 数组批量），不要一项一调。',
    parameters: {
      topics: {
        type: 'array',
        required: true,
        description: '候选选题/标题列表',
        items: { type: 'string' },
      },
      account_id: {
        type: 'string',
        description: '公众号账号 ID；缺省使用默认账号。跨账号查重自动聚合其它账号历史',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      if (!Array.isArray(args.topics) || args.topics.length === 0) {
        throw new Error('topics 不能为空')
      }
      // 跨账号查重：除本账号目录外，聚合其它账号目录与旧共享 scripts 目录的历史标题
      const historyDirs = [
        scriptsDir(cfg),
        ...configuredAccountIds(cfg).filter((id) => id !== account.id).map((id) => accountScriptsDir(cfg, id)),
      ]
      return runPipeline<Omit<TopicReport, 'account_id'>>(
        cfg,
        'check_topics.py',
        [
          '--topics', JSON.stringify(args.topics),
          '--scripts-dir', accountScriptsDir(cfg, account.id),
          '--history-dirs', JSON.stringify(historyDirs),
        ],
        60000,
      ).then((report) => ({ account_id: account.id, ...report }))
    },
  })
}
