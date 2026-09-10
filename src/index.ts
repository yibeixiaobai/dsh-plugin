// dsh-gzh-publisher：文映千秋学术网公众号自动化流水线插件。
// Cordis 约定：导出 name / inject / Config（接口 + 同名 Schemastery schema）/ apply。
// apply 在加载与每次配置热重载时执行：同步凭据到 wx_config.json 并注册全部工具。
import type { Context } from '@deepseek-ai/cordis'
import { Config, type Config as ConfigT } from './config.ts'
import { syncConfig } from './sync.ts'
import { buildArticleTool } from './tools/buildArticle.ts'
import { checkTopicsTool } from './tools/checkTopics.ts'
import { genImagesTool } from './tools/genImages.ts'
import { publishTool } from './tools/publish.ts'
import { styleGuideTool } from './tools/styleGuide.ts'
import { validateHtmlTool } from './tools/validateHtml.ts'
import { verifyTool } from './tools/verify.ts'

export const name = 'dsh-gzh-publisher'
export const inject = ['tools']
export { Config }
export type { ConfigT }

export const SETTINGS_NAMESPACE = 'gzh-publisher'

const VERSION = '0.1.0'

export function apply(ctx: Context, config: ConfigT) {
  let source = () => config

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, config, {
      setSource(next) {
        source = () => next() as ConfigT
      },
      onChange() {
        const next = source()
        Object.assign(config, next)
        syncConfig(config)
      },
    })
  })

  // 凭据同步：留空的设置项沿用既有 wx_config.json，不覆盖
  try {
    const report = syncConfig(config)
    ctx.logger.info('[gzh] 凭据已同步 →', report.wx_config_path,
      '(appid 来源:', report.appid_source + ', api_key 来源:', report.api_key_source + ')')
  } catch (err) {
    ctx.logger.warn('[gzh] wx_config.json 同步失败，请检查设置中的 runtime.project_root：', err)
  }

  ctx.tools.register(checkTopicsTool(config))
  ctx.tools.register(styleGuideTool(config))
  ctx.tools.register(buildArticleTool(config))
  ctx.tools.register(genImagesTool(config))
  ctx.tools.register(validateHtmlTool(config))
  ctx.tools.register(publishTool(config))
  ctx.tools.register(verifyTool(config))

  ctx.logger.info('[gzh] dsh-gzh-publisher v' + VERSION + ' 已加载：7 个工具就绪' +
    (config.runtime.dry_run ? '（演练模式：不联网生图、不发布）' : ''))
}
