import type http from 'node:http'
import { automationStreamHub } from './automationStreamHub.js'

async function readBodyText(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  const json = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
  })
  res.end(json)
}

/**
 * 处理自动化实时监控、SSE 画面推流与双向人机接管输入路由
 */
export async function handleAutomationRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/gzh-publisher/automation/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    res.write(': stream connected\n\n')
    const remove = automationStreamHub.addSseClient(res)
    req.on('close', remove)
    return true
  }

  if (pathname === '/api/gzh-publisher/automation/active') {
    sendJson(res, 200, { ok: true, ...automationStreamHub.getSnapshot() })
    return true
  }

  if (pathname === '/api/gzh-publisher/automation/session' && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    try {
      const body = JSON.parse(text)
      automationStreamHub.setSession(body)
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' })
    }
    return true
  }

  if (pathname === '/api/gzh-publisher/automation/step' && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    try {
      const body = JSON.parse(text)
      automationStreamHub.updateStep(
        body.sessionId,
        body.stepId,
        body.status,
        body.detail,
        body.currentUrl,
      )
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' })
    }
    return true
  }

  if (pathname === '/api/gzh-publisher/automation/frame' && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    try {
      const body = JSON.parse(text)
      automationStreamHub.pushFrame(body)
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' })
    }
    return true
  }

  if (pathname === '/api/gzh-publisher/automation/complete' && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    try {
      const body = JSON.parse(text)
      automationStreamHub.endSession(body.sessionId, body.success, body.error)
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' })
    }
    return true
  }

  if (pathname === '/api/gzh-publisher/automation/input' && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    try {
      const body = JSON.parse(text)
      automationStreamHub.dispatchInput(body)
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' })
    }
    return true
  }

  if (pathname === '/api/gzh-publisher/automation/login-synced' && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    try {
      const body = JSON.parse(text)
      automationStreamHub.syncLogin(body)
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' })
    }
    return true
  }

  if (pathname === '/api/gzh-publisher/automation/takeover' && req.method === 'POST') {
    const text = await readBodyText(req).catch(() => '')
    try {
      const body = JSON.parse(text)
      automationStreamHub.setTakeover(
        body.sessionId,
        Boolean(body.enabled),
        body.reason,
        body.action,
      )
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid json' })
    }
    return true
  }

  return false
}
