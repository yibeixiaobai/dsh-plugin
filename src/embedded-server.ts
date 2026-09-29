import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import { handleCors, sendJson } from './http-helpers.ts'
import { handleXhsLoginRoute, XHS_LOGIN_ROUTE } from './xiaohongshu.ts'
import { handleZhihuLoginRoute, ZHIHU_LOGIN_ROUTE } from './zhihu.ts'
import { handleBaijiahaoLoginRoute, BAIJIAHAO_LOGIN_ROUTE } from './baijiahao.ts'
import { handleWechatLoginRoute, WECHAT_LOGIN_ROUTE } from './wechat-browser.ts'
import {
  handleConfigSaveRoute,
  handleConfigImportRoute,
  handleConfigExportRoute,
  handleConfigValidateRoute,
  CONFIG_SAVE_ROUTE,
  CONFIG_IMPORT_ROUTE,
  CONFIG_EXPORT_ROUTE,
  CONFIG_VALIDATE_ROUTE,
} from './config-routes.ts'
import { handlePublishHistoryRoute, PUBLISH_HISTORY_ROUTE } from './publish-history.ts'
import { handleBrandImageRoute, BRAND_IMAGE_ROUTE } from './brand-images.ts'
import { handleImageTestRoute, IMAGE_TEST_ROUTE } from './image-test.ts'
import { handleDshModelsRoute } from './dsh-models.ts'

export const DEFAULT_EMBEDDED_PORT = 3088
const DSH_MODELS_ROUTE = '/api/gzh-publisher/dsh-image-models'
const PING_ROUTE = '/api/gzh-publisher/ping'

export interface EmbeddedServerOptions {
  ctx: Context
  getConfig: () => Config
  onConfigImported?: (newConfig: Config, allowDelete?: boolean) => void | Promise<void>
}

let activeEmbeddedServers: http.Server[] = []
let activeEmbeddedPort = 0

export function getEmbeddedServerPort(): number {
  return activeEmbeddedPort
}

function writePortFile(port: number): void {
  try {
    const baseDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    const dir = path.join(baseDir, 'dsh-social-publisher')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'api-port.txt'), String(port), 'utf-8')
  } catch {}
}

export async function startEmbeddedServer(options: EmbeddedServerOptions): Promise<{ port: number; close: () => void }> {
  if (activeEmbeddedServers.length > 0 && activeEmbeddedPort > 0) {
    return {
      port: activeEmbeddedPort,
      close: () => {
        for (const s of activeEmbeddedServers) {
          try { s.close() } catch {}
        }
        activeEmbeddedServers = []
        activeEmbeddedPort = 0
      },
    }
  }

  const { ctx, getConfig, onConfigImported } = options

  const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    // 统一处理 CORS 及 OPTIONS 预检
    if (handleCors(req, res)) return

    const rawUrl = req.url ?? '/'
    let parsedUrl: URL
    try {
      parsedUrl = new URL(rawUrl, `http://${req.headers.host ?? '127.0.0.1'}`)
    } catch {
      sendJson(res, 400, { error: 'URL 格式错误' })
      return
    }

    const pathname = parsedUrl.pathname

    try {
      if (pathname === PING_ROUTE) {
        sendJson(res, 200, { ok: true, port: activeEmbeddedPort, version: '0.2.0' })
        return
      }

      if (pathname === XHS_LOGIN_ROUTE) {
        await handleXhsLoginRoute(req, res, getConfig)
        return
      }

      if (pathname === ZHIHU_LOGIN_ROUTE) {
        await handleZhihuLoginRoute(req, res, getConfig)
        return
      }

      if (pathname === BAIJIAHAO_LOGIN_ROUTE) {
        await handleBaijiahaoLoginRoute(req, res, getConfig)
        return
      }

      if (pathname === WECHAT_LOGIN_ROUTE) {
        await handleWechatLoginRoute(req, res, getConfig)
        return
      }

      if (pathname === CONFIG_SAVE_ROUTE) {
        await handleConfigSaveRoute(req, res, getConfig, onConfigImported)
        return
      }

      if (pathname === CONFIG_IMPORT_ROUTE) {
        await handleConfigImportRoute(req, res, getConfig, onConfigImported)
        return
      }

      if (pathname === CONFIG_EXPORT_ROUTE) {
        handleConfigExportRoute(req, res, getConfig)
        return
      }

      if (pathname === CONFIG_VALIDATE_ROUTE) {
        await handleConfigValidateRoute(req, res)
        return
      }

      if (pathname === PUBLISH_HISTORY_ROUTE) {
        handlePublishHistoryRoute(req, res, getConfig)
        return
      }

      if (pathname === BRAND_IMAGE_ROUTE) {
        await handleBrandImageRoute(req, res, getConfig(), parsedUrl)
        return
      }

      if (pathname === IMAGE_TEST_ROUTE) {
        await handleImageTestRoute(req, res, getConfig(), parsedUrl)
        return
      }

      if (pathname === DSH_MODELS_ROUTE) {
        await handleDshModelsRoute(req, res, ctx)
        return
      }

      sendJson(res, 404, { error: `未找到接口: ${pathname}` })
    } catch (error) {
      ctx.logger?.error?.('[social-publisher] embedded server request error:', error)
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  // 尝试绑定端口：优先尝试 3080（旧前端默认），同时也绑定 3088~3090（新架构保底）
  const candidatePorts = [3080, 3088, 3089, 3090]
  const boundServers: http.Server[] = []
  const boundPorts: number[] = []

  for (const p of candidatePorts) {
    const s = http.createServer(requestHandler)
    const ok = await new Promise<boolean>((resolve) => {
      s.once('error', () => resolve(false))
      s.listen(p, '127.0.0.1', () => resolve(true))
    })
    if (ok) {
      boundServers.push(s)
      boundPorts.push(p)
      if (activeEmbeddedPort === 0) activeEmbeddedPort = p
      ctx.logger?.info?.(`[social-publisher] 直通 API 服务已就绪：http://127.0.0.1:${p}`)
    }
  }

  activeEmbeddedServers = boundServers
  if (boundPorts.length > 0) {
    writePortFile(boundPorts[0])
  }

  const close = () => {
    for (const s of boundServers) {
      try { s.close() } catch {}
    }
    activeEmbeddedServers = []
    activeEmbeddedPort = 0
  }

  return { port: activeEmbeddedPort, close }
}
