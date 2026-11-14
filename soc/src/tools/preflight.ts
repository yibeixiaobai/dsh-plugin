import { defineTool } from '../tool-compat.js'
import type { Config } from '../config.js'
import { resolveAccount } from '../config-runtime.js'
import { renderJson } from './shared.js'
import { checkAccountLoginHealth } from '../session-manager.js'

export interface PreflightAccountStatus {
  account_id: string
  account_name: string
  platform: string
  logged_in: boolean
  user_name?: string
  error?: string
  status_badge: string
}

export interface PreflightResult {
  all_ready: boolean
  hard_stop?: boolean
  execution_blocked?: boolean
  instruction?: string
  checked_count: number
  accounts: PreflightAccountStatus[]
  unready_accounts: PreflightAccountStatus[]
  guidance?: string
}

interface PreflightArgs {
  account_id?: string
  platform?: string
  dry_run?: boolean
  workspace?: string
}

/**
 * 社媒流水线 Step 0 守卫：前置登录态与环境健康度检测工具
 * 目的：在 AI 模型启动耗时耗资的选题查重、长文写作、单行排版与 AI 生图前，毫秒级探测各平台账号登录会话是否真实在线。
 * 若发现失效，立即拦截并提示用户扫码，彻底杜绝“所有任务完成却不能发布”的严重问题。
 */
export function preflightTool(cfg: Config) {
  return defineTool<PreflightArgs, PreflightResult>({
    name: 'gzh_preflight_check',
    description:
      '【社媒流水线 Step 0 守卫】在启动选题、撰写与生图前，快速预检目标社媒账号（公众号/知乎/小红书/百家号/头条号）的真实登录授权状态。' +
      '毫秒级官方探针探测，不启动真实 Chrome 进程。一旦发现未登录或 Cookie 过期，请在首轮提示用户扫码，避免浪费算力。',
    parameters: {
      account_id: {
        type: 'string',
        description: '可选：待检测的具体账号 ID；留空则检测指定平台或所有已启用的账号',
      },
      platform: {
        type: 'string',
        description: '可选：目标平台（gzh | zhihu | xiaohongshu | baijiahao | toutiao）',
      },
      dry_run: {
        type: 'boolean',
        description: '可选：演练模式标志；演练模式下跳过外部网络探测直接放行',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: renderJson,
    },
    async execute(args, toolContext) {
      const effectiveWs = args.workspace || (toolContext as any)?.workspacePath || (toolContext as any)?.cwd
      if (effectiveWs) {
        try {
          if (!cfg.runtime) cfg.runtime = {} as any
          cfg.runtime.project_root = effectiveWs
        } catch {}
      }
      const isDryRun = Boolean(args.dry_run || cfg.runtime?.dry_run)
      if (isDryRun) {
        return {
          all_ready: true,
          checked_count: 1,
          accounts: [
            {
              account_id: args.account_id || 'dry-run-account',
              account_name: '演练模拟账号',
              platform: args.platform || 'all',
              logged_in: true,
              status_badge: '演练模式 (已放行)',
            },
          ],
          unready_accounts: [],
          guidance: '当前处于演练模式，已跳过真实网络鉴权探测，可安全推演排版与流程。',
        }
      }

      // 解析待核验的账号列表
      const targetAccounts: Array<{ id: string; name: string; platform: string }> = []
      const rawAccounts = cfg.accounts || {}

      if (args.account_id) {
        try {
          const acc = resolveAccount(cfg, args.account_id, args.platform)
          targetAccounts.push({
            id: acc.id,
            name: acc.profile.name || acc.id,
            platform: acc.profile.platform || args.platform || 'gzh',
          })
        } catch {
          targetAccounts.push({
            id: args.account_id,
            name: args.account_id,
            platform: args.platform || 'gzh',
          })
        }
      } else if (args.platform) {
        const normP = args.platform.toLowerCase().replace('xhs', 'xiaohongshu').replace('wechat', 'gzh')
        for (const [id, acc] of Object.entries(rawAccounts)) {
          const p = (acc.platform || 'gzh').toLowerCase().replace('xhs', 'xiaohongshu').replace('wechat', 'gzh')
          if (p === normP && acc.enabled !== false) {
            targetAccounts.push({ id, name: acc.name || id, platform: p })
          }
        }
      } else {
        // 缺省检测全部已启用账号
        for (const [id, acc] of Object.entries(rawAccounts)) {
          if (acc.enabled !== false) {
            const p = (acc.platform || 'gzh').toLowerCase().replace('xhs', 'xiaohongshu').replace('wechat', 'gzh')
            targetAccounts.push({ id, name: acc.name || id, platform: p })
          }
        }
      }

      if (targetAccounts.length === 0) {
        return {
          all_ready: false,
          checked_count: 0,
          accounts: [],
          unready_accounts: [],
          guidance: '未检测到任何已启用的社媒发布账号，请先在设置页中添加并启用账号。',
        }
      }

      const results: PreflightAccountStatus[] = []
      const unready: PreflightAccountStatus[] = []

      // 并发探测各账号的健康度
      await Promise.all(
        targetAccounts.map(async (acc) => {
          try {
            const health = await checkAccountLoginHealth(cfg, acc.platform, acc.id, {
              forceProbe: true,
            })
            const item: PreflightAccountStatus = {
              account_id: acc.id,
              account_name: acc.name,
              platform: acc.platform,
              logged_in: health.valid,
              user_name: health.userName,
              error: health.error,
              status_badge: health.valid ? '已就绪 (在线)' : '未就绪 (凭据失效)',
            }
            results.push(item)
            if (!health.valid) {
              unready.push(item)
            }
          } catch (err: any) {
            const item: PreflightAccountStatus = {
              account_id: acc.id,
              account_name: acc.name,
              platform: acc.platform,
              logged_in: false,
              error: err?.message || '探测异常',
              status_badge: '未就绪 (探测异常)',
            }
            results.push(item)
            unready.push(item)
          }
        }),
      )

      const allReady = unready.length === 0
      let guidance = '所有目标发布账号登录态健康有效，可顺畅推进后续图文生产与发布！'
      let instruction = ''
      if (!allReady) {
        const unreadyNames = unready.map(u => `【${u.platform} - ${u.account_name} (${u.account_id})】`).join('、')
        guidance =
          `【前置硬性拦截警示】：检测到以下账号登录态未就绪：${unreadyNames}。\n` +
          '【硬性熔断铁律】：当前任务已触发流水线熔断拦截！严禁调用 gzh_discover_topics、gzh_check_topics、gzh_build_article、gzh_generate_images 等任何后续生成工具！\n' +
          '请立即终止本轮工具调用，直接向用户展示未就绪账号列表并提示用户扫码或授权。'
        instruction = 'HARD_STOP_EXECUTION_BLOCKED: 账号未就绪，严禁调用任何后续工具，立即停止并向用户汇报未就绪账号。'
      }

      return {
        all_ready: allReady,
        hard_stop: !allReady,
        execution_blocked: !allReady,
        instruction,
        checked_count: results.length,
        accounts: results,
        unready_accounts: unready,
        guidance,
      }
    },
  })
}
