import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { accountScriptsDir, renderJson, runPipeline, scriptsDir } from './shared.ts'

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
  batch_duplicate?: boolean
  prefix_violation?: boolean
  warning?: string
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
      '选题查重：把围绕核心业务关键词深度检索关联拟定出的候选选题/标题，与该账号历史发布标题（publish_history.json / publish_result.json 与历史发布脚本）' +
      '以及同批次候选选题做相似度比对，返回 high/medium/low 风险。' +
      '不同账号之间选题支持重复，但相同账号的历史文章与同批配置的选题严禁重复。' +
      '选题必须围绕业务关键词关联拓展，严禁直接将关键词作为标题开头词语。每日写文选题前必调，high 风险选题应更换。每账号一次提交全部候选选题（topics 数组批量），不要一项一调。',
    parameters: {
      topics: {
        type: 'array',
        required: true,
        description: '围绕核心业务关键词检索关联拟定出的候选选题/标题列表（严禁将关键词直接作为开头词语或前缀）',
        items: { type: 'string' },
      },
      account_id: {
        type: 'string',
        description: '公众号账号 ID；缺省使用默认账号。不同账号独立查重，支持跨账号相同选题',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      if (!Array.isArray(args.topics) || args.topics.length === 0) {
        throw new Error('topics 不能为空')
      }
      // 账号独立查重：不同账号选题支持重复，仅比对当前账号自身历史与同批次候选。
      // 仅当默认账号且本账号目录暂无历史文件时，兼容读取旧共享 scripts 目录
      const curDir = accountScriptsDir(cfg, account.id)
      const historyDirs: string[] = []
      const hasAccountHistory = fs.existsSync(path.join(curDir, 'publish_history.json'))
        || fs.existsSync(path.join(curDir, 'publish_result.json'))
      if (!hasAccountHistory && account.id === cfg.default_account && fs.existsSync(scriptsDir(cfg))) {
        historyDirs.push(scriptsDir(cfg))
      }
      return runPipeline<Omit<TopicReport, 'account_id'>>(
        cfg,
        'check_topics.py',
        [
          '--topics', JSON.stringify(args.topics),
          '--scripts-dir', curDir,
          '--history-dirs', JSON.stringify(historyDirs),
        ],
        60000,
      ).then((report) => ({ account_id: account.id, ...report }))
    },
  })
}
