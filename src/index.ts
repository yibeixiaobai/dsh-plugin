// dsh-social-publisher：通用社媒自动化内容生产与发布插件（公众号/知乎等多平台）。
// Cordis 约定：导出 name / inject / Config（接口 + 同名 Schemastery schema）/ apply。
// apply 在加载与每次配置热重载时执行：同步凭据到 wx_config.json 并注册全部工具与社媒命令。
import type { Context } from '@deepseek-ai/cordis'
import { Config, type Config as ConfigT } from './config.ts'
import { normalizeConfig, applyNormalizedConfig } from './config-runtime.ts'
import { registerBrandImageRoutes } from './brand-images.ts'
import { registerImageTestRoute } from './image-test.ts'
import { registerZhihuRoutes } from './zhihu.ts'
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

export function apply(ctx: Context, config: ConfigT) {
  const hydrated = hydrateConfigFromWx(config)
  // 传给 installSection 的组合 base 必须是静态对象且不带 accounts / image_providers：
  // 宿主每次求值都做 schema(mergeLayers(base, 用户层))，对象层按 key 递归合并，
  // base 里残留的 dict 条目会把用户层已删除的账号/生图接口合并回来（删除后保存即复活）。
  // dict 条目是纯用户数据，一律以设置界面（用户层）为唯一事实来源。
  const compositionEntry: ConfigT = { ...config, accounts: {}, image_providers: {} }
  // 工具与路由读 liveConfig；settings 注入前它由组合层规范化而来，之后随 onChange 刷新，
  // compositionEntry 自注册起不再改动。
  const liveConfig = normalizeConfig(config)
  ensureWorkspace(liveConfig)
  registerBrandImageRoutes(ctx, () => liveConfig)
  registerImageTestRoute(ctx, () => liveConfig)
  registerZhihuRoutes(ctx, () => liveConfig)
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
        try {
          await settingsService.update(SETTINGS_NAMESPACE, liveConfig)
        } catch (e) {
          ctx.logger.warn('[social-publisher] 导入配置同步更新至 settings 异常：', e)
        }
      }
    },
  })

  ctx.inject(['settings'], (settingsCtx) => {
    if (!settingsCtx.settings) return
    settingsService = settingsCtx.settings
    settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, compositionEntry, {
      setSource(next) {
        source = () => next() as ConfigT
      },
      onChange() {
        const next = source()
        applyNormalizedConfig(liveConfig, next)
        ensureWorkspace(liveConfig)
        syncConfig(liveConfig)
      },
    })

    // 检查是否有历史配置（来自旧命名空间 gzh-publisher）
    const legacyResolved = settingsCtx.settings.get(LEGACY_SETTINGS_NAMESPACE) as ConfigT | undefined
    const resolved = settingsCtx.settings.get(SETTINGS_NAMESPACE) as ConfigT | undefined

    const legacyAccountCount = Object.keys(legacyResolved?.accounts ?? {}).length
    const resolvedAccountCount = Object.keys(resolved?.accounts ?? {}).length

    // 若新命名空间尚未写入配置，或新命名空间账号数少于旧命名空间（处于初始状态），自动完整继承旧配置
    if (legacyResolved && legacyAccountCount > 0 && (resolvedAccountCount === 0 || legacyAccountCount > resolvedAccountCount)) {
      ctx.logger.info('[social-publisher] 检测到旧版 gzh-publisher 配置，自动继承迁移至 social-publisher...')
      const merged: ConfigT = {
        ...legacyResolved,
        ...(resolved ?? {}),
        accounts: {
          ...(legacyResolved.accounts ?? {}),
          ...(resolved?.accounts ?? {}),
        },
        image_providers: {
          ...(legacyResolved.image_providers ?? {}),
          ...(resolved?.image_providers ?? {}),
        },
      }
      applyNormalizedConfig(liveConfig, merged)
      void settingsCtx.settings.update(SETTINGS_NAMESPACE, merged).catch((error) => {
        ctx.logger.warn('[social-publisher] 旧配置自动平滑迁移失败：', error)
      })
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
      void settingsCtx.settings.update(SETTINGS_NAMESPACE, patch).catch((error) => {
        ctx.logger.warn('[social-publisher] 默认配置自动初始化失败：', error)
      })
    }
  })

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
  registerQuickCommand(ctx, liveConfig)

  ctx.logger.info('[social-publisher] dsh-social-publisher v' + VERSION + ' 已加载：7 个生产工具与 /publish, /post, /zhihu, /gzh 指令就绪' +
    (config.runtime.dry_run ? '（演练模式：不联网生图、不发布）' : ''))
}
