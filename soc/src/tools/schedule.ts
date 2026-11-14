import { defineTool } from '../tool-compat.ts'
import type { Config } from '../config.ts'
import {
  loadWechatScheduledTasks,
  type WechatScheduledTask,
} from '../schedule-manager.ts'
import { syncWechatScheduledTasks, cancelWechatScheduledTaskByBrowser } from '../wechat-browser.ts'
import { renderJson } from './shared.ts'

interface ScheduleManageArgs {
  action: 'list' | 'sync' | 'cancel'
  account_id?: string
  task_id?: string
  title?: string
}

interface ScheduleManageResult {
  ok: boolean
  action: string
  message?: string
  wechat_tasks?: WechatScheduledTask[]
  count?: number
  canceled_task_id?: string
}

export function scheduleManageTool(cfg: Config) {
  return defineTool<ScheduleManageArgs, ScheduleManageResult>({
    name: 'gzh_manage_schedule',
    description:
      '微信公众号定时发表任务管理：微信定时发表完全由微信公众平台官方后台原生托管（无本地定时进程）。支持查看已同步的微信后台排期任务列表、立即从微信公众平台首页同步最新排期任务，或取消指定的已排期定时发表任务。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: '操作类型：list=列出微信公众号后台已有定时发表任务，sync=立即从微信公众平台首页同步最新排期任务，cancel=取消指定的微信公众号定时发表任务',
        enum: ['list', 'sync', 'cancel'],
      },
      account_id: {
        type: 'string',
        description: '可选：按指定账号过滤任务列表、执行同步或执行取消（缺省采用默认账号或全部）',
      },
      task_id: {
        type: 'string',
        description: '可选（cancel 时推荐）：待取消任务的 ID',
      },
      title: {
        type: 'string',
        description: '可选（cancel 时支持）：待取消任务的文章标题',
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
      const targetAcc = args.account_id || cfg.default_account || 'default'

      if (args.action === 'sync') {
        const syncRes = await syncWechatScheduledTasks(cfg, targetAcc)
        return {
          ok: syncRes.ok,
          action: 'sync',
          message: syncRes.ok
            ? `成功从微信公众号后台同步 ${syncRes.count} 项已有定时发表任务`
            : `同步微信定时任务失败: ${syncRes.error || '未知原因'}`,
          wechat_tasks: syncRes.tasks,
          count: syncRes.count,
        }
      }

      if (args.action === 'cancel') {
        const cancelRes = await cancelWechatScheduledTaskByBrowser(
          cfg,
          targetAcc,
          args.task_id || '',
          args.title,
        )
        return {
          ok: cancelRes.ok,
          action: 'cancel',
          message: cancelRes.ok ? cancelRes.message : cancelRes.error,
          canceled_task_id: cancelRes.canceledTaskId,
        }
      }

      if (args.action === 'list') {
        const wechatTasks = loadWechatScheduledTasks(cfg, args.account_id)
        return {
          ok: true,
          action: 'list',
          wechat_tasks: wechatTasks,
          count: wechatTasks.length,
        }
      }

      throw new Error(`未识别的 schedule 操作: ${args.action}`)
    },
  })
}
