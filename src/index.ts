// dsh-gzh-publisher：文映千秋学术网公众号自动化流水线插件。
// Cordis 约定：导出 name / inject / Config（接口 + 同名 Schemastery schema）/ apply。
// apply 在加载与每次配置热重载时执行：同步凭据到 wx_config.json 并注册全部工具。
import type { Context } from '@deepseek-ai/cordis'
import { Config, type Config as ConfigT } from './config.ts'
import { normalizeConfig, applyNormalizedConfig } from './config-runtime.ts'
import { registerBrandImageRoutes } from './brand-images.ts'
import { registerImageTestRoute } from './image-test.ts'
import { registerZhihuRoutes } from './zhihu.ts'
import { registerPublishHistoryRoutes } from './publish-history.ts'
import { registerDshModelRoutes } from './dsh-models.ts'
import { registerQuickCommand } from './command.ts'
import { ensureWorkspace, hydrateConfigFromWx, syncConfig, workspaceDir } from './sync.ts'
import { buildArticleTool } from './tools/buildArticle.ts'
import { checkTopicsTool } from './tools/checkTopics.ts'
import { genImagesTool } from './tools/genImages.ts'
import { publishTool } from './tools/publish.ts'
import { styleGuideTool } from './tools/styleGuide.ts'
import { validateHtmlTool } from './tools/validateHtml.ts'
import { verifyTool } from './tools/verify.ts'

export const name = 'dsh-gzh-publisher'
export const inject = ['tools', 'commands']
export { Config }
export type { ConfigT }

export const SETTINGS_NAMESPACE = 'gzh-publisher'

const VERSION = '0.1.0'

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

  ctx.inject(['settings'], (settingsCtx) => {
    if (!settingsCtx.settings) return
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
    // 迁移判定必须看解析后的设置值：组合层的 accounts / image_providers 恒为空，
    // 按它判断会在每次加载时把默认账号/接口 merge 回用户层，同样会复活被删除的条目。
    const resolved = settingsCtx.settings.get(SETTINGS_NAMESPACE) as ConfigT | undefined
    if (!resolved) return
    const needAccounts = hydrated || Object.keys(resolved.accounts ?? {}).length === 0
    const needProviders = hydrated || Object.keys(resolved.image_providers ?? {}).length === 0
    if (needAccounts || needProviders) {
      const patch: Record<string, unknown> = {}
      if (needAccounts) {
        patch.accounts = liveConfig.accounts
        patch.default_account = liveConfig.default_account
      }
      if (needProviders) patch.image_providers = liveConfig.image_providers
      void settingsCtx.settings.update(SETTINGS_NAMESPACE, patch).catch((error) => {
        ctx.logger.warn('[gzh] 旧配置自动迁移失败：', error)
      })
    }
  })

  // 凭据同步：留空的设置项沿用既有 wx_config.json，不覆盖
  try {
    const report = syncConfig(liveConfig)
    ctx.logger.info('[gzh] 凭据已同步 →', report.wx_config_path,
      '(appid 来源:', report.appid_source + ', api_key 来源:', report.api_key_source + ')')
  } catch (err) {
    ctx.logger.warn('[gzh] wx_config.json 同步失败，请检查设置中的 runtime.project_root：', err)
  }
  ctx.logger.info('[gzh] 当前任务工作区 →', workspaceDir(liveConfig))

  ctx.tools.register(checkTopicsTool(liveConfig))
  ctx.tools.register(styleGuideTool(liveConfig))
  ctx.tools.register(buildArticleTool(liveConfig))
  ctx.tools.register(genImagesTool(liveConfig, ctx))
  ctx.tools.register(validateHtmlTool(liveConfig))
  ctx.tools.register(publishTool(liveConfig))
  ctx.tools.register(verifyTool(liveConfig))
  registerQuickCommand(ctx, liveConfig)

  ctx.logger.info('[gzh] dsh-gzh-publisher v' + VERSION + ' 已加载：7 个工具与 /gzh 快捷指令就绪' +
    (config.runtime.dry_run ? '（演练模式：不联网生图、不发布）' : ''))
}
