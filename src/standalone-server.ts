// 独立保底 HTTP API 直通守护进程
// 无论宿主 DSH 处于桌面端、网页端、或是未重启状态，
// 本直通进程直接常驻在 127.0.0.1:3088（若被占顺延），
// 直接处理微信/知乎/小红书扫码登录（启动 Chrome 窗口）、登录态检测、配置保存与导入导出。
import { startEmbeddedServer, DEFAULT_EMBEDDED_PORT } from './embedded-server.ts'
import { normalizeConfig, applyNormalizedConfig } from './config-runtime.ts'
import { ensureWorkspace, hydrateConfigFromWx, syncConfig } from './sync.ts'

async function main() {
  const { config: rawConfig } = hydrateConfigFromWx({})
  const liveConfig = normalizeConfig(rawConfig)
  ensureWorkspace(liveConfig)

  const dummyCtx: any = {
    logger: console,
    effect: (fn: any) => fn(),
  }

  const server = await startEmbeddedServer({
    ctx: dummyCtx,
    getConfig: () => liveConfig,
    async onConfigImported(newConfig, allowDelete = true) {
      applyNormalizedConfig(liveConfig, newConfig, allowDelete)
      ensureWorkspace(liveConfig)
      syncConfig(liveConfig)
      console.log('[standalone-server] 配置已同步更新并落盘')
    },
  })

  console.log(`[standalone-server] 社媒发布直通保底服务已在 127.0.0.1:${server.port} 持续运行！`)

  process.on('SIGINT', () => {
    console.log('[standalone-server] 收到终止信号，正在关闭...')
    server.close()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('[standalone-server] 收到终止信号，正在关闭...')
    server.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[standalone-server] 启动失败:', err)
  process.exit(1)
})
