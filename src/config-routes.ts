import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import {
  exportConfigData,
  mergeConfigData,
  validateImportConfig,
  type ExportScope,
  type MergeMode,
} from './config-io.ts'

export const CONFIG_EXPORT_ROUTE = '/api/gzh-publisher/config/export'
export const CONFIG_VALIDATE_ROUTE = '/api/gzh-publisher/config/validate'
export const CONFIG_IMPORT_ROUTE = '/api/gzh-publisher/config/import'
export const CONFIG_SAVE_ROUTE = '/api/gzh-publisher/config/save'

const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024 // 5 MB

function sendJson(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(value, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(body)
}

function normalizeHost(h: string | undefined): string {
  if (!h) return ''
  return h.trim().toLowerCase().replace(/^localhost(?=[:/]|$)/, '127.0.0.1')
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin) {
    try {
      const originHost = normalizeHost(new URL(origin).host)
      const reqHost = normalizeHost(req.headers.host)
      if (originHost !== reqHost) return false
    } catch {
      return false
    }
  }
  const site = String(req.headers['sec-fetch-site'] ?? '').toLowerCase()
  return site === '' || site === 'same-origin' || site === 'same-site' || site === 'none'
}

function readBodyText(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_JSON_BODY_BYTES) {
        reject(new Error('请求内容过大，最大允许 5MB'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

export interface ConfigRouteOptions {
  getConfig: () => Config
  onConfigImported?: (newConfig: Config) => void | Promise<void>
}

/**
 * 注册配置导入、导出与预校验 HTTP 路由
 */
export function registerConfigRoutes(
  ctx: Context,
  options: ConfigRouteOptions,
): void {
  const { getConfig, onConfigImported } = options

  ctx.inject(['webServer'], (serverCtx) => {
    const webServer = serverCtx.webServer
    if (!webServer) return
    serverCtx.effect(() => {
      // 1. GET /api/gzh-publisher/config/export
      webServer.register({
      kind: 'exact',
      path: CONFIG_EXPORT_ROUTE,
      handler(req, res) {
        if (!sameOrigin(req)) {
          sendJson(res, 403, { error: '仅允许同源请求' })
          return
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: '仅支持 GET 请求' })
          return
        }

        try {
          const url = new URL(req.url ?? CONFIG_EXPORT_ROUTE, `http://${req.headers.host ?? '127.0.0.1'}`)
          const includeSecrets = url.searchParams.get('include_secrets') === 'true'
          const scope = (url.searchParams.get('scope') || 'all') as ExportScope
          const download = url.searchParams.get('download') !== 'false'

          const exported = exportConfigData(getConfig(), { includeSecrets, scope })

          const headers: Record<string, string> = {}
          if (download) {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
            const filename = `dsh-social-publisher-config-${scope}-${dateStr}.json`
            headers['content-disposition'] = `attachment; filename="${filename}"`
          }

          sendJson(res, 200, exported, headers)
        } catch (error) {
          sendJson(res, 500, { error: '导出配置失败：' + (error instanceof Error ? error.message : String(error)) })
        }
      },
    })

    // 2. POST /api/gzh-publisher/config/validate
    webServer.register({
      kind: 'exact',
      path: CONFIG_VALIDATE_ROUTE,
      async handler(req, res) {
        if (!sameOrigin(req)) {
          sendJson(res, 403, { error: '仅允许同源请求' })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: '仅支持 POST 请求' })
          return
        }

        try {
          const text = await readBodyText(req)
          const result = validateImportConfig(text)
          sendJson(res, 200, { ok: result.valid, ...result })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: '解析校验失败：' + (error instanceof Error ? error.message : String(error)) })
        }
      },
    })

    // 3. POST /api/gzh-publisher/config/import
    webServer.register({
      kind: 'exact',
      path: CONFIG_IMPORT_ROUTE,
      async handler(req, res) {
        if (!sameOrigin(req)) {
          sendJson(res, 403, { error: '仅允许同源请求' })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: '仅支持 POST 请求' })
          return
        }

        try {
          const url = new URL(req.url ?? CONFIG_IMPORT_ROUTE, `http://${req.headers.host ?? '127.0.0.1'}`)
          const mode = (url.searchParams.get('mode') === 'overwrite' ? 'overwrite' : 'merge') as MergeMode

          const text = await readBodyText(req)
          const validation = validateImportConfig(text)

          if (!validation.valid || !validation.data) {
            sendJson(res, 400, {
              ok: false,
              error: '配置校验未通过',
              errors: validation.errors,
              warnings: validation.warnings,
            })
            return
          }

          const current = getConfig()
          const merged = mergeConfigData(current, validation.data, mode)

          if (onConfigImported) {
            await onConfigImported(merged)
          }

          sendJson(res, 200, {
            ok: true,
            mode,
            config: merged,
            message: mode === 'merge' ? '已成功增量合并导入配置' : '已成功全量覆盖导入配置',
            summary: validation.summary,
            warnings: validation.warnings,
          })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: '导入配置失败：' + (error instanceof Error ? error.message : String(error)) })
        }
      },
    })

    // 4. POST /api/gzh-publisher/config/save
    webServer.register({
      kind: 'exact',
      path: CONFIG_SAVE_ROUTE,
      async handler(req, res) {
        if (!sameOrigin(req)) {
          sendJson(res, 403, { error: '仅允许同源请求' })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: '仅支持 POST 请求' })
          return
        }

        try {
          const text = await readBodyText(req)
          let payload: unknown
          try {
            payload = JSON.parse(text)
          } catch {
            sendJson(res, 400, { ok: false, error: '请求内容非有效 JSON 格式' })
            return
          }

          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            sendJson(res, 400, { ok: false, error: '配置数据格式错误，必须为 JSON 对象' })
            return
          }

          const current = getConfig()
          const incomingObj = payload as Record<string, any>

          // 凭据安全保留机制：空密码或脱敏值时不覆盖已有凭据
          if (incomingObj.wechat && typeof incomingObj.wechat === 'object') {
            const secret = String(incomingObj.wechat.app_secret ?? '').trim()
            if (!secret && current.wechat.app_secret) incomingObj.wechat.app_secret = current.wechat.app_secret
          }
          if (incomingObj.image_api && typeof incomingObj.image_api === 'object') {
            const key = String(incomingObj.image_api.api_key ?? '').trim()
            if (!key && current.image_api.api_key) incomingObj.image_api.api_key = current.image_api.api_key
          }
          if (incomingObj.accounts && typeof incomingObj.accounts === 'object') {
            for (const [id, acc] of Object.entries(incomingObj.accounts as Record<string, any>)) {
              if (acc && typeof acc === 'object') {
                const secret = String(acc.app_secret ?? '').trim()
                if (!secret && current.accounts[id]?.app_secret) {
                  acc.app_secret = current.accounts[id].app_secret
                }
              }
            }
          }
          if (incomingObj.image_providers && typeof incomingObj.image_providers === 'object') {
            for (const [id, prov] of Object.entries(incomingObj.image_providers as Record<string, any>)) {
              if (prov && typeof prov === 'object') {
                const key = String(prov.api_key ?? '').trim()
                if (!key && current.image_providers[id]?.api_key) {
                  prov.api_key = current.image_providers[id].api_key
                }
              }
            }
          }

          const validation = validateImportConfig(incomingObj)
          if (!validation.valid || !validation.data) {
            sendJson(res, 400, {
              ok: false,
              error: '配置校验未通过',
              errors: validation.errors,
              warnings: validation.warnings,
            })
            return
          }

          const merged = mergeConfigData(current, validation.data, 'overwrite')
          if (onConfigImported) {
            await onConfigImported(merged)
          }

          sendJson(res, 200, {
            ok: true,
            config: merged,
            message: '配置已成功保存并同步落盘',
            summary: validation.summary,
            warnings: validation.warnings,
          })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: '保存配置失败：' + (error instanceof Error ? error.message : String(error)) })
        }
      },
    })
  })
})
}
