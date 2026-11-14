import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '../tool-compat.ts'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { accountScriptsDir, renderJson, runPipeline, scriptsDir } from './shared.ts'

import type { SocialWorkflowEvent } from '../adapters/types.ts'

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
  cross_account_identical?: boolean // 与其他账号已发布标题完全一致（high，必须改写）
  cross_similar?: TopicMatch[] // 其他账号相似选题（选题支持跨账号重复，仅参考不计分）
  warning?: string
}

export interface TopicReport {
  account_id: string
  history_count: number
  items: TopicItem[]
  _social_event?: SocialWorkflowEvent
}


export function checkTopicsTool(cfg: Config) {
  return defineTool<{ topics: string[]; account_id?: string; platform?: string }, TopicReport>({
    name: 'gzh_check_topics',
    description:
      '选题查重：把候选选题/标题与该账号历史发布标题以及同批次候选选题做相似度比对，返回 high/medium/low 风险。' +
      '【历史排重唯一权威来源】：本工具是查询和比对账号历史已发布选题库的唯一权威途径，已自动关联磁盘持久化历史记录（publish_history.json）、微信后台已排期任务（wechat_scheduled_tasks.json）及存量草稿箱（wechat_drafts.json），无需且严禁在历史对话或聊天记忆中寻找历史已发布选题。' +
      '不同账号之间选题支持重复（相似选题不拦截，仅作 cross_similar 参考）；但候选标题与其他账号已发布标题完全一致判 high，' +
      '相同账号的历史文章与同批选题严禁完全重复。' +
      '【补充要求第一优先级】：若用户在任务补充要求中已明确指定了选题，以用户指定的选题为准，查重主要用于排查历史是否已发布过（避免完全重复建稿）；未指定具体选题时，必须围绕业务关键词关联拓展且 high 风险选题须更换。每账号一次提交全部候选选题（topics 数组批量），不要一项一调。',
    parameters: {
      topics: {
        type: 'array',
        required: true,
        description: '候选选题/标题列表（若用户有补充要求指定选题则传指定选题，未指定时围绕业务关键词拓展）',
        items: { type: 'string' },
      },
      platform: {
        type: 'string',
        description: '可选：指定社媒平台（gzh / zhihu / xiaohongshu / baijiahao / toutiao），缺省结合账号或默认账号确定',
        enum: ['gzh', 'zhihu', 'xiaohongshu', 'baijiahao', 'toutiao'],
      },
      account_id: {
        type: 'string',
        description:
          '账号 ID；缺省结合 platform 自动寻找启用账号，或回退至默认账号。不同账号独立查重，选题支持跨账号重复，但标题不得与其他账号已发布标题完全一致',
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
      if (!Array.isArray(args.topics) || args.topics.length === 0) {
        throw new Error('topics 不能为空')
      }
      // 账号独立查重：不同账号选题支持重复，仅严格比对当前账号自身历史与同批次候选。
      // 仅当默认账号且本账号目录暂无历史文件时，兼容读取旧共享 scripts 目录
      const curDir = accountScriptsDir(cfg, account.id)
      const historyDirs: string[] = []
      const hasAccountHistory = fs.existsSync(path.join(curDir, 'publish_history.json'))
        || fs.existsSync(path.join(curDir, 'publish_result.json'))
      if (!hasAccountHistory && account.id === cfg.default_account && fs.existsSync(scriptsDir(cfg))) {
        historyDirs.push(scriptsDir(cfg))
      }
      // 跨账号宽松规则：同平台其它启用账号的历史仅用于「标题完全一致」闸——
      // 选题支持跨账号重复，相似选题绝不拦截；发布侧 publish 工具还有同款硬闸兜底
      const crossDirs = Object.entries(cfg.accounts)
        .filter(([id, acc]) => id !== account.id && acc.enabled && acc.platform === account.profile.platform)
        .map(([id]) => accountScriptsDir(cfg, id))
      return runPipeline<Omit<TopicReport, 'account_id'>>(
        cfg,
        'check_topics.py',
        [
          '--topics', JSON.stringify(args.topics),
          '--scripts-dir', curDir,
          '--history-dirs', JSON.stringify(historyDirs),
          '--cross-dirs', JSON.stringify(crossDirs),
        ],
        60000,
      ).then((report) => {
        const topics = (report.items || []).map((it, idx) => ({
          index: idx + 1,
          title: it.topic,
          risk: it.risk,
          score: it.top_score,
          selected: idx === 0,
        }))
        const socialEvent: SocialWorkflowEvent = {
          v: 1,
          stage: 'topics',
          platform: account.profile.platform,
          accountId: account.id,
          accountName: account.profile.name,
          topics,
          step: {
            id: 'check_topics',
            label: '选题查重完成',
            status: 'completed',
          },
        }

        return {
          account_id: account.id,
          ...report,
          mandate: '【全自动智能定题】：候选选题查重已完成！无需等待用户确认，请自主选定星标与最佳评分的最优选题组合，严禁停顿，立即连续调用 gzh_build_article 与 gzh_generate_images 开始构建文章与配图。',
          _social_event: socialEvent,
        }
      })
    },
  })
}
