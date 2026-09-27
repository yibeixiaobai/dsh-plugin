import type { IncomingMessage, ServerResponse } from 'node:http'

export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024 // 5 MB

export function normalizeHost(h: string | undefined): string {
  if (!h) return ''
  return h.trim().toLowerCase().replace(/^localhost(?=[:/]|$)/, '127.0.0.1')
}

export function isLoopback(h: string): boolean {
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h.startsWith('127.0.0.1:') || h.startsWith('localhost:')
}

export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true
  try {
    const originParsed = new URL(origin)
    const originHost = normalizeHost(originParsed.host)
    const reqHost = normalizeHost(host)
    if (isLoopback(originHost) && (isLoopback(reqHost) || !reqHost)) return true
    if (originHost === reqHost) return true
  } catch {
    if (
      origin.startsWith('dsh-app:') ||
      origin.startsWith('file:') ||
      origin.startsWith('vscode-webview:') ||
      origin.startsWith('electron:')
    ) {
      return true
    }
  }
  return false
}

export function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin
  if (origin && isAllowedOrigin(origin, req.headers.host)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, x-dsh-gzh-upload, x-dsh-gzh-test, x-dsh-filename',
  )
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

/**
 * 统一处理 CORS 及 OPTIONS 预检请求。
 * 如果是 OPTIONS 请求，返回 204 并返回 true（表示请求已被处理完毕）。
 */
export function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  setCorsHeaders(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return true
  }
  return false
}

export function sendJson(
  res: ServerResponse,
  status: number,
  value: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const body = JSON.stringify(value)
  const headers: Record<string, string | number> = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...extraHeaders,
  }
  res.writeHead(status, headers)
  res.end(body)
}

export function readBodyText(req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error(`请求内容过大，最大允许 ${Math.floor(maxBytes / 1024 / 1024)}MB`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}
