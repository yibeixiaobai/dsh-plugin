// dsh-social-publisher：通用社媒自动化内容生产与发布插件（公众号/知乎等多平台）。
// Cordis 约定：导出 name / inject / Config（接口 + 同名 Schemastery schema）/ apply。
// apply 在加载与每次配置热重载时执行：同步凭据到 wx_config.json 并注册全部工具与社媒命令。
import type { Context } from '@deepseek-ai/cordis'
import { Config, type Config as ConfigT } from './config.ts'
import { normalizeConfig, applyNormalizedConfig, hasRealAccounts, hasRealProviders } from './config-runtime.ts'
import { registerBrandImageRoutes } from './brand-images.ts'
import { registerImageTestRoute } from './image-test.ts'
import { registerZhihuRoutes } from './zhihu.ts'
import { registerWechatRoutes, enableOriginalTool } from './wechat-browser.ts'
import { registerPublishHistoryRoutes } from './publish-history.ts'
import { registerDshModelRoutes } from './dsh-models.ts'
import { registerConfigRoutes } from './config-routes.ts'
import { registerQuickCommand, PLUGIN_NAME } from './command.ts'
import { ensureWorkspace, hydrateConfigFromWx, syncConfig, workspaceDir } from './sync.ts'
import { buildArticleTool } from './tools/buildArticle.ts'
import { checkTopicsTool } from './tools/checkTopics.ts'
import { genImagesTool } from './tools/genImages.ts'
import { publishTool } from './tools/publish.ts'
import { styleGuideTool } from './tools/styleGuide.ts'
import { validateHtmlTool } from './tools/validateHtml.ts'
import { verifyTool } from './tools/verify.ts'

export const name = PLUGIN_NAME
export const inject = ['tools', 'commands']
export { Config }
export type { ConfigT }

export const SETTINGS_NAMESPACE = 'social-publisher'
export const LEGACY_SETTINGS_NAMESPACE = 'gzh-publisher'

const VERSION = '0.2.0'

async function updateSettingsWithRetry(
  settingsService: any,
  namespace: string,
  data: unknown,
  logger: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
  contextLabel: string,
  maxRetries = 3,
): Promise<void> {
  if (!settingsService || typeof settingsService.update !== 'function') return
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await settingsService.update(namespace, data)
      return
    } catch (e) {
      if (attempt < maxRetries) {
        const delay = (attempt + 1) * 500
        logger.warn(`[social-publisher] ${contextLabel} 第 ${attempt + 1} 次重试失败，${delay}ms 后重试：`, e)
        await new Promise((resolve) => setTimeout(resolve, delay))
      } else {
        logger.error(`[social-publisher] ${contextLabel} 全部 ${maxRetries + 1} 次尝试均失败：`, e)
      }
    }
  }
}

export function apply(ctx: Context, config: ConfigT) {
  const { config: hydratedConfig, changed: hydrated } = hydrateConfigFromWx(config)
  // 传给 installSection 的组合 base 必须是静态对象且不带 accounts / image_providers：
  // 宿主每次求值都做 schema(mergeLayers(base, 用户层))，对象层按 key 递归合并，
  // base 里残留的 dict 条目会把用户层已删除的账号/生图接口合并回来（删除后保存即复活）。
  // dict 条目是纯用户数据，一律以设置界面（用户层）为唯一事实来源。
  const compositionEntry: ConfigT = { ...hydratedConfig, accounts: {}, image_providers: {} }
  // 工具与路由读 liveConfig；settings 注入前它由组合层规范化而来，之后随 onChange 刷新，
  // compositionEntry 自注册起不再改动。
  const liveConfig = normalizeConfig(hydratedConfig)
  ensureWorkspace(liveConfig)
  registerBrandImageRoutes(ctx, () => liveConfig)
  registerImageTestRoute(ctx, () => liveConfig)
  registerZhihuRoutes(ctx, () => liveConfig)
  registerWechatRoutes(ctx, () => liveConfig)
  registerPublishHistoryRoutes(ctx, () => liveConfig)
  registerDshModelRoutes(ctx)
  let source = () => liveConfig
  let settingsService: any = null

  registerConfigRoutes(ctx, {
    getConfig: () => liveConfig,
    async onConfigImported(newConfig) {
      applyNormalizedConfig(liveConfig, newConfig)
      ensureWorkspace(liveConfig)
      syncConfig(liveConfig)
      if (settingsService && typeof settingsService.update === 'function') {
        await updateSettingsWithRetry(settingsService, SETTINGS_NAMESPACE, liveConfig, ctx.logger, '导入配置同步更新至 settings')
      }
    },
  })

  ctx.inject(['settings'], (settingsCtx) => {
    if (!settingsCtx.settings) return
    settingsService = settingsCtx.settings
    if (typeof (settingsCtx.settings as any).configure === 'function') {
      try {
        (settingsCtx.settings as any).configure({ auto: false }, (ctx as any).fiber)
      } catch {}
    }
    if (typeof settingsCtx.settings.installSection === 'function') {
      settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, compositionEntry, {
        setSource(next) {
          source = () => next() as ConfigT
        },
        onChange() {
          const next = source()
          if (!next || typeof next !== 'object') return
          // 绝不用空账号字典或未配置占位项覆盖已有账号与接口！
          if (hasRealAccounts(liveConfig.accounts) && !hasRealAccounts(next.accounts)) {
            next.accounts = { ...liveConfig.accounts }
            next.default_account = liveConfig.default_account
          }
          if (hasRealProviders(liveConfig.image_providers) && !hasRealProviders(next.image_providers)) {
            next.image_providers = { ...liveConfig.image_providers }
          }
          applyNormalizedConfig(liveConfig, next)
          ensureWorkspace(liveConfig)
          syncConfig(liveConfig)
          // 显式持久化至 settings 存储（auto:false + volatile 字段不会自动落盘）
          if (settingsService && typeof settingsService.update === 'function') {
            updateSettingsWithRetry(settingsService, SETTINGS_NAMESPACE, liveConfig, ctx.logger, '保存配置至 settings').catch(() => {})
          }
        },
      })
    }

    // 检查是否有历史配置（来自旧命名空间 gzh-publisher）
    const legacyResolved = settingsCtx.settings.get(LEGACY_SETTINGS_NAMESPACE) as ConfigT | undefined
    const resolved = settingsCtx.settings.get(SETTINGS_NAMESPACE) as ConfigT | undefined

    const legacyAccountCount = Object.keys(legacyResolved?.accounts ?? {}).length
    const hasLiveAccounts = hasRealAccounts(liveConfig.accounts)

    // 仅在当前 liveConfig 没有任何有效账号，且旧版存在有效账号时才进行旧账号继承（防止每次重启抹除现有实体账号）
    if (legacyResolved && legacyAccountCount > 0 && !hasLiveAccounts) {
      ctx.logger.info('[social-publisher] 检测到旧版 gzh-publisher 配置，自动继承迁移至 social-publisher...')
      const merged: ConfigT = {
        ...legacyResolved,
        ...(resolved ?? {}),
        accounts: {
          ...(legacyResolved.accounts ?? {}),
          ...(liveConfig.accounts ?? {}),
        },
        image_providers: {
          ...(legacyResolved.image_providers ?? {}),
          ...(liveConfig.image_providers ?? {}),
        },
      }
      applyNormalizedConfig(liveConfig, merged)
      updateSettingsWithRetry(settingsCtx.settings, SETTINGS_NAMESPACE, merged, ctx.logger, '旧配置自动平滑迁移').catch(() => {})
    }

    const currentResolved = resolved || legacyResolved
    if (!currentResolved) return
    const needAccounts = hydrated || Object.keys(currentResolved.accounts ?? {}).length === 0
    const needProviders = hydrated || Object.keys(currentResolved.image_providers ?? {}).length === 0
    if (needAccounts || needProviders) {
      const patch: Record<string, unknown> = {}
      if (needAccounts) {
        patch.accounts = liveConfig.accounts
        patch.default_account = liveConfig.default_account
      }
      if (needProviders) patch.image_providers = liveConfig.image_providers
      updateSettingsWithRetry(settingsCtx.settings, SETTINGS_NAMESPACE, patch, ctx.logger, '默认配置自动初始化').catch(() => {})
    }
  })

  // 监听 DSH 0.1.7 loader/volatile-update 事件，响应配置变更并热重载落盘
  if (typeof (ctx as any).on === 'function') {
    (ctx as any).on('loader/volatile-update', (targetCtx: any, patch: any) => {
      try {
        if (targetCtx === ctx || targetCtx?.name === PLUGIN_NAME || patch?.ns === SETTINGS_NAMESPACE) {
          if (patch?.config) {
            const next = patch.config
            if (hasRealAccounts(liveConfig.accounts) && !hasRealAccounts(next.accounts)) {
              next.accounts = { ...liveConfig.accounts }
              next.default_account = liveConfig.default_account
            }
            if (hasRealProviders(liveConfig.image_providers) && !hasRealProviders(next.image_providers)) {
              next.image_providers = { ...liveConfig.image_providers }
            }
            applyNormalizedConfig(liveConfig, next)
            ensureWorkspace(liveConfig)
            syncConfig(liveConfig)
          }
        }
      } catch (e) {
        ctx.logger.warn('[social-publisher] 处理 volatile-update 异常：', e)
      }
    })
  }

  // 凭据同步：留空的设置项沿用既有 wx_config.json，不覆盖
  try {
    const report = syncConfig(liveConfig)
    ctx.logger.info('[social-publisher] 凭据已同步 →', report.wx_config_path,
      '(appid 来源:', report.appid_source + ', api_key 来源:', report.api_key_source + ')')
  } catch (err) {
    ctx.logger.warn('[social-publisher] wx_config.json 同步失败，请检查设置中的 runtime.project_root：', err)
  }
  ctx.logger.info('[social-publisher] 当前任务工作区 →', workspaceDir(liveConfig))

  ctx.tools.register(checkTopicsTool(liveConfig))
  ctx.tools.register(styleGuideTool(liveConfig))
  ctx.tools.register(buildArticleTool(liveConfig))
  ctx.tools.register(genImagesTool(liveConfig, ctx))
  ctx.tools.register(validateHtmlTool(liveConfig))
  ctx.tools.register(publishTool(liveConfig))
  ctx.tools.register(verifyTool(liveConfig))
  ctx.tools.register(enableOriginalTool(liveConfig))
  registerQuickCommand(ctx, liveConfig)

  ctx.logger.info('[social-publisher] dsh-social-publisher v' + VERSION + ' 已加载：8 个生产工具与 /publish, /post, /zhihu, /gzh, /publish-config 指令就绪' +
    (config.runtime.dry_run ? '（演练模式：不联网生图、不发布）' : ''))
}
