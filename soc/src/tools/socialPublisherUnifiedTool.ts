import { defineTool } from '../tool-compat.js'
import type { Config } from '../config.js'
import { resolveAccount } from '../config-runtime.js'
import {
  getActiveWorkspace,
  getStrictImageQuota,
  isDryRunEnabledInSettings,
  recordActiveWorkspace,
  renderJson,
} from './shared.js'
import { checkAccountLoginHealth } from '../session-manager.js'
import { loadWechatScheduledTasks } from '../schedule-manager.js'
import { syncWechatScheduledTasks, cancelWechatScheduledTaskByBrowser } from '../wechat-browser.js'
import { executeProduceAction } from './socialPublisherProduceRunner.ts'
import { executePublishAction } from './socialPublisherPublishRunner.ts'

import type {
  ArticleProduceItem,
  SocialPublisherToolArgs,
} from './socialPublisherUnifiedTypes.ts'
export type { ArticleProduceItem, SocialPublisherToolArgs }

/**
 * 社媒发布统一集成工具 (Social Publisher Unified Facade Tool)
 * 职责：社媒发布模块的高内聚统一能力门面。
 * 智能体执行社媒任务时优先调用本工具，对外隐藏内部琐碎步骤，产物 100% 物理存放在会话项目文件夹沙箱内。
 */
export function socialPublisherTool(cfg: Config) {
  return defineTool<SocialPublisherToolArgs, any>({
    name: 'social_publisher',
    description:
      '通用多平台社交媒体内容生产与发布服务，支持微信公众号、小红书、知乎、百家号、今日头条的规范查询、图文排版、AI 配图、草稿同步与定时排期。',
    parameters: {
      action: {
        type: 'string',
        enum: ['detect_login', 'get_content_rules', 'produce', 'publish', 'manage_schedule'],
        description:
          '执行的社媒动作：detect_login (账号登录态检测) | get_content_rules (内容规范查询) | produce (图文与配图创作) | publish (草稿同步与发布) | manage_schedule (官方排期同步与取消)',
      },
      action_type: {
        type: 'string',
        enum: ['sync', 'cancel', 'list'],
        description:
          '当 action=manage_schedule 时的子操作：sync (从官方后台实时同步最新排期) | cancel (取消指定已排期发表任务) | list (查看本地缓存排期列表)',
      },
      account_id: {
        type: 'string',
        description: '目标账号 ID 或名称（例如 wyxst、default，或直接传入账号名称如 文映学术通）',
      },
      platform: {
        type: 'string',
        description: '可选：目标平台（xiaohongshu | gzh | zhihu | baijiahao | toutiao）',
      },
      workspace: {
        type: 'string',
        description: '当前任务工作区路径（产物将保存在工作区专属目录下）',
      },
      title: {
        type: 'string',
        description: 'produce 动作可选：单篇时提供标题',
      },
      content: {
        type: 'string',
        description: 'produce 动作可选：单篇时提供正文主体内容（Markdown / HTML）',
      },
      articles: {
        type: 'array',
        description: '多篇批量创作物料列表（公众号多图文合辑、知乎专栏、多篇小红书笔记等）',
        items: {
          type: 'object',
          properties: {
            index: { type: 'number', description: '篇目序号（从 1 开始）' },
            title: { type: 'string', description: '篇目标题' },
            content: { type: 'string', description: '正文内容（公众号单行 HTML / 小红书文本 / Markdown）' },
            digest: { type: 'string', description: '摘要' },
            visual_slots: { type: 'array', description: '该篇配图插槽列表' },
          },
          required: ['title', 'content'],
        },
      },
      schedule_time: {
        type: 'string',
        description: '当 publish_action=schedule 时的定时发布时间（如 16:00、明天09:30、auto 等）',
      },
      visual_slots: {
        type: 'array',
        description: '配图规划插槽列表（包含图片角色、尺寸比例与画面提示词）',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', description: '图片角色：cover(封面) | card(多图卡片) | inline(正文插图)' },
            aspect_ratio: { type: 'string', description: '宽高比：3:4(小红书) | 16:9 | 1:1 | 2.35:1(公众号长文封面)' },
            description: { type: 'string', description: '详细的画面构思与视觉意图说明' },
            prompt: { type: 'string', description: 'AI 生图或搜图 prompt 描述词' },
          },
          required: ['description', 'prompt'],
        },
      },
      task_id: {
        type: 'string',
        description: '任务唯一标识符（可选，留空将自动生成专属任务沙箱）',
      },
      dry_run: {
        type: 'boolean',
        description: '可选：演练模式标志。必须在设置中开启后才允许为 true；未开启严禁传入！',
      },
      publish_immediately: {
        type: 'boolean',
        description: 'publish 动作可选：是否立即公开发布（默认 false 仅保存为草稿箱）',
      },
      user_confirmed: {
        type: 'boolean',
        description: '用户是否已确认草稿内容（仅在审校确认后为 true，默认为 false）',
      },
      force: {
        type: 'boolean',
        description: '可选：强制发布，跳过审校门禁检查（默认 false）',
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
      const action = args.action || 'detect_login'
      const effectiveWs =
        args.workspace ||
        (toolContext as any)?.workspacePath ||
        (toolContext as any)?.cwd ||
        getActiveWorkspace()
      if (effectiveWs) {
        recordActiveWorkspace(effectiveWs)
        try {
          if (!cfg.runtime) cfg.runtime = {} as any
          cfg.runtime.project_root = effectiveWs
        } catch {}
      }

      const isSettingsDry = isDryRunEnabledInSettings(cfg, effectiveWs)
      if (args.dry_run === true && !isSettingsDry) {
        throw new Error(
          '❌ 【演练模式越权拦截】：当前系统设置未开启演练模式，禁止使用演练配图！严禁在正式生产发布中擅自启用 dry_run 伪造占位物料。',
        )
      }
      const isDry = isSettingsDry
      let resolvedAcc: ReturnType<typeof resolveAccount> | null = null
      try {
        resolvedAcc = resolveAccount(cfg, args.account_id, args.platform)
      } catch {}

      const targetAccountId =
        resolvedAcc?.id || args.account_id || cfg.default_account || Object.keys(cfg.accounts || {})[0] || 'default_acc'
      let targetPlatform = (args.platform || resolvedAcc?.profile?.platform || '')
        .toLowerCase()
        .replace('xhs', 'xiaohongshu')
        .replace('wechat', 'gzh')
      if (!targetPlatform && cfg.accounts?.[targetAccountId]) {
        targetPlatform = (cfg.accounts[targetAccountId].platform || 'gzh')
          .toLowerCase()
          .replace('xhs', 'xiaohongshu')
          .replace('wechat', 'gzh')
      }

      // ==========================================
      // 【安全护栏与敏感意图拦截】：检测到下载、导出、转储、破解云端加密工单的脱壳意图时，直接硬阻断
      // ==========================================
      const sensitiveIntentPatterns = [
        /(?:下载|导出|转储|另存为?|提取|保存|查看|dump|export|download).*?(?:解密.*?)?(?:工单|recipe|ticket|选择器|配方)/i,
        /(?:解密.*?)?(?:工单|recipe|ticket).*?(?:文件|json|落盘|到本地)/i,
      ]

      const anyArgs = args as any
      const checkString = `${anyArgs.topic || ''} ${anyArgs.supplement_requirements || ''} ${args.title || ''} ${(args.titles || []).join(' ')} ${args.action || ''}`
      for (const pattern of sensitiveIntentPatterns) {
        if (pattern.test(checkString)) {
          console.warn(`🚨 [Agent Guardrail] 【安全策略阻断】：捕获到工单脱壳导出敏感意图: "${checkString.trim()}"`)
          return {
            ok: false,
            action,
            error: '抱歉，系统不支持下载或导出工单。',
            guidance: '请继续进行正常的图文创作或发布流程。',
          }
        }
      }

      // ==========================================
      // Action 1: detect_login (统一登录态检测与继承自愈)
      // ==========================================
      if (action === 'detect_login') {
        if (isDry) {
          return {
            ok: true,
            action,
            all_ready: true,
            account_id: targetAccountId,
            platform: targetPlatform,
            status_badge: '演练模式 (已放行)',
            guidance: '当前处于演练模式，已跳过真实网络鉴权探测。',
          }
        }

        const health = await checkAccountLoginHealth(cfg, targetPlatform || 'gzh', targetAccountId, {
          forceProbe: true,
        })
        if (health.valid) {
          const resolvedUserName = health.userName || cfg.accounts?.[targetAccountId]?.name || targetAccountId
          return {
            ok: true,
            action,
            all_ready: true,
            account_id: targetAccountId,
            platform: targetPlatform || 'gzh',
            user_name: resolvedUserName,
            status_badge: '已就绪 (在线)',
            guidance: `目标账号 [${targetAccountId}] 登录态健康有效，可顺畅推进后续图文生产与发布！`,
          }
        }

        return {
          ok: false,
          action,
          all_ready: false,
          hard_stop: true,
          execution_blocked: true,
          account_id: targetAccountId,
          platform: targetPlatform,
          error: health.error || '未找到本地凭据文件或凭据列表为空',
          status_badge: '未就绪 (凭据失效)',
          guidance: `【登录态阻断拦截】：目标账号 [${targetAccountId}] 尚未完成登录授权或凭据已失效（原因: ${health.error || '未登录'}）。请在设置中心「社媒发布」中扫码登录该账号后再试。`,
        }
      }

      // ==========================================
      // Action 2: get_content_rules (内容规范与硬性配图配额查询)
      // ==========================================
      if (action === 'get_content_rules') {
        const accountProfile =
          cfg.accounts?.[targetAccountId] || ({ id: targetAccountId, platform: targetPlatform } as any)
        const quotaInfo = getStrictImageQuota(cfg, accountProfile)
        const strictQuota = quotaInfo.totalRequiredImages
        const isXhs = targetPlatform === 'xiaohongshu'
        const isGzh = targetPlatform === 'gzh'

        return {
          ok: true,
          action,
          account_id: targetAccountId,
          platform: targetPlatform,
          image_quota: strictQuota,
          image_requirements: {
            exact_count: strictQuota,
            aspect_ratio: isXhs ? '3:4' : isGzh ? '2.35:1 封面 + 16:9 插图' : '16:9',
            roles_distribution: isXhs
              ? `必须提供 ${strictQuota} 张 3:4 竖版多图卡片 (1张 cover 封面 + ${strictQuota - 1}张 card 干货卡片)`
              : `必须提供 1 张封面 (cover) 与 ${Math.max(0, strictQuota - 1)} 张插图 (inline)`,
          },
          text_requirements: {
            min_words: isXhs ? 600 : 1200,
            max_words: isXhs ? 1000 : 3500,
            recommend_structure: isXhs
              ? '痛点引入 -> 核心解法/干货清单 -> 行动号召 -> 热门话题标签'
              : '引言阐述 -> 分段论证 -> 总结展望',
          },
          instruction: `【重要契约】：后续调用 action: 'produce' 时，传入的 visual_slots 数组长度必须严格等于 ${strictQuota}，不允许多生或少生！`,
        }
      }

      // ==========================================
      // Action 3: produce (委派至 executeProduceAction)
      // ==========================================
      if (action === 'produce') {
        return executeProduceAction({
          cfg,
          args,
          targetAccountId,
          targetPlatform,
          effectiveWs,
          isDry,
          toolContext,
        })
      }

      // ==========================================
      // Action 4: publish (委派至 executePublishAction)
      // ==========================================
      if (action === 'publish') {
        return executePublishAction({
          cfg,
          args,
          targetAccountId,
          targetPlatform,
          effectiveWs,
          isDry,
          toolContext,
        })
      }

      // ==========================================
      // Action 5: manage_schedule (排期同步、查看与取消)
      // ==========================================
      if (action === 'manage_schedule') {
        const subAction = anyArgs.action_type || anyArgs.schedule_action || 'sync'
        if (subAction === 'sync') {
          const syncRes = await syncWechatScheduledTasks(cfg, targetAccountId)
          return {
            ok: syncRes.ok,
            action,
            sub_action: 'sync',
            account_id: targetAccountId,
            message: syncRes.ok
              ? `成功从微信公众号后台同步 ${syncRes.count} 项已有定时发表任务`
              : `同步微信定时任务失败: ${syncRes.error || '未知原因'}`,
            wechat_tasks: syncRes.tasks,
            count: syncRes.count,
          }
        }
        if (subAction === 'cancel') {
          const cancelRes = await cancelWechatScheduledTaskByBrowser(
            cfg,
            targetAccountId,
            args.task_id || anyArgs.schedule_task_id || '',
            args.title,
          )
          return {
            ok: cancelRes.ok,
            action,
            sub_action: 'cancel',
            account_id: targetAccountId,
            message: cancelRes.ok ? cancelRes.message : cancelRes.error,
            canceled_task_id: cancelRes.canceledTaskId,
          }
        }
        const tasks = loadWechatScheduledTasks(cfg, targetAccountId)
        return {
          ok: true,
          action,
          sub_action: 'list',
          account_id: targetAccountId,
          count: tasks.length,
          wechat_tasks: tasks,
        }
      }

      throw new Error(`未知的 action: ${action}`)
    },
  })
}
