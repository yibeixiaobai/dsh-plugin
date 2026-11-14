import { defineTool } from '../tool-compat.ts'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import {
  scheduleExistingWechatDrafts,
  type ExistingDraftScheduleResult,
} from '../wechat-browser.ts'
import { renderJson } from './shared.ts'

interface ScheduleExistingArgs {
  scope?: 'all' | 'targeted'
  article_type?: 'news' | 'newspic' | 'both'
  appmsgids?: string[]
  titles?: string[]
  limit?: number
  account_id?: string
  auto_sync_schedule?: boolean
  auto_clean_duplicates?: boolean
}

export function scheduleExistingTool(cfg: Config) {
  return defineTool<ScheduleExistingArgs, ExistingDraftScheduleResult>({
    name: 'gzh_schedule_existing',
    description:
      '把微信公众号草稿箱中【已有的存量草稿】批量排入后台「定时发表」（微信官方后台原生托管，零本地定时进程）。' +
      '排期前自动同步云端微信后台最新定时任务列表，并自动扫描清理草稿箱内同名重复冗余草稿。' +
      '会逐个打开草稿编辑页 → 驱动发表弹窗的「定时发表」→ 提交，并逐篇回读校验。' +
      '排期时刻按账号规则时段（长文 schedule_times_article / 小绿书 schedule_times_newspic）并结合后台已同步排期自动避让，每排完一篇立即同步后台排期避免撞车。' +
      '长文（news）会开启群发通知并自动挑选有通知配额的日期；小绿书（newspic）不设群发通知。',
    parameters: {
      scope: {
        type: 'string',
        description: '可选处理范围：all=草稿箱全部草稿；targeted=仅处理 appmsgids/titles 命中的草稿（默认安全模式）',
        enum: ['all', 'targeted'],
      },
      article_type: {
        type: 'string',
        description: '可选草稿形态：news=仅文章草稿；newspic=仅贴图（小绿书）草稿；both=两者都处理（默认）',
        enum: ['news', 'newspic', 'both'],
      },
      appmsgids: {
        type: 'array',
        description: '可选：定向处理的草稿 appmsgid 列表（scope=targeted 时生效）',
        items: { type: 'string' },
      },
      titles: {
        type: 'array',
        description: '可选：定向处理的草稿标题（scope=targeted 时生效，支持包含匹配）',
        items: { type: 'string' },
      },
      limit: {
        type: 'number',
        description: '可选：最多处理多少个草稿（安全阀，缺省不限制）',
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省使用默认账号',
      },
      auto_sync_schedule: {
        type: 'boolean',
        description: '可选：排期前是否自动同步云端微信后台定时任务列表以刷新排期事实源（默认 true）',
      },
      auto_clean_duplicates: {
        type: 'boolean',
        description: '可选：排期前是否自动物理删除草稿箱内同名重复的冗余草稿（默认 targeted 时 true）',
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
      const account = resolveAccount(cfg, args.account_id)
      const hasSpecificTargets = Boolean((args.titles && args.titles.length > 0) || (args.appmsgids && args.appmsgids.length > 0))

      // 【中文修复依据】：严禁在未指定定向目标时默认排期全草稿箱，彻底杜绝误将草稿箱内用户其他存量未授权草稿排期发表
      if (!hasSpecificTargets && args.scope !== 'all') {
        throw new Error(
          '【安全门禁拦截】：存量草稿排期必须显式指定目标篇目（titles 或 appmsgids）！严禁在未指定目标时扫描排期全草稿箱，以防误将草稿箱内其他历史未授权草稿擅自发表。若确需全量排期请显式传入 scope: "all"。',
        )
      }

      return await scheduleExistingWechatDrafts(cfg, account.id, {
        scope: args.scope ? args.scope : (hasSpecificTargets ? 'targeted' : 'all'),
        articleType: args.article_type || 'both',
        appmsgids: args.appmsgids,
        titles: args.titles,
        limit: args.limit,
        autoSyncSchedule: args.auto_sync_schedule,
        autoCleanDuplicates: hasSpecificTargets ? (args.auto_clean_duplicates ?? true) : Boolean(args.auto_clean_duplicates),
      })
    },
  })
}
