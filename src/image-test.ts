import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import { providerPool } from './config-runtime.ts'
import { scriptsDir } from './sync.ts'
import { runPipeline } from './tools/shared.ts'

export const IMAGE_TEST_ROUTE = '/api/gzh-publisher/test-image'
const REQUEST_HEADER = 'x-dsh-gzh-test'
const MAX_BODY_BYTES = 16 * 1024
const DEFAULT_PROMPT = '生成一张简洁、专业的学术出版主题测试封面，红酒色与金色点缀，画面干净，无文字。'

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return false
    } catch {
      return false
    }
  }
  const site = String(req.headers['sec-fetch-site'] ?? '')
  return site === '' || site === 'same-origin' || site === 'none'
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(new Error('请求内容过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function safeProviderId(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

function safeTestFile(value: string): string {
  const normalized = value.replace(/\\/g, '/')
  if (!normalized.startsWith('gzh_test_images/') || normalized.includes('..')) {
    throw new Error('测试图片路径无效')
  }
  return normalized
}

async function handle(req: IncomingMessage, res: ServerResponse, config: Config, url: URL): Promise<void> {
  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: '仅允许同源请求' })
    return
  }

  const base = path.resolve(scriptsDir(config))
  if (req.method === 'GET') {
    try {
      const relative = safeTestFile(url.searchParams.get('file') ?? '')
      const file = path.resolve(base, relative)
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) {
        sendJson(res, 404, { error: '测试图片不存在' })
        return
      }
      const stat = fs.statSync(file)
      res.writeHead(200, {
        'content-type': 'image/png',
        'content-length': stat.size,
        'cache-control': 'no-store',
      })
      fs.createReadStream(file).pipe(res)
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: '不支持的请求方法' })
    return
  }
  if (req.headers[REQUEST_HEADER] !== 'image-test') {
    sendJson(res, 403, { error: '缺少测试请求标记' })
    return
  }

  try {
    const raw = JSON.parse((await readBody(req)).toString('utf-8')) as Record<string, unknown>
    const providerId = String(raw.provider_id ?? '').trim()
    const prompt = String(raw.prompt ?? '').trim() || DEFAULT_PROMPT
    if (!safeProviderId(providerId)) throw new Error('provider_id 无效')
    if (prompt.length > 2000) throw new Error('测试提示词不能超过 2000 字')

    const provider = providerPool(config).find((item) => item.id === providerId)
    if (!provider) throw new Error('接口不存在或未启用: ' + providerId)
    if (!provider.provider.api_key.trim()) throw new Error('该接口尚未填写 API Key')
    if (config.runtime.dry_run) {
      sendJson(res, 200, { ok: true, dry_run: true, provider_id: providerId, message: '当前为演练模式，未发起真实请求' })
      return
    }

    const relative = `gzh_test_images/${providerId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.png`
    const output = path.resolve(base, relative)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    const job = {
      // gen_images_pipeline.py 的路径守卫要求 job 输出路径可解析到 scripts 目录内。
      // 这里传绝对路径，避免它相对 dsh 进程工作目录解析而误报越界。
      items: [{ kind: 'cover', index: 1, prompt, out: output, size: [768, 327] }],
      provider_ids: [providerId],
      model: provider.provider.model,
      dry_run: false,
      zh_only: false,
      timeout_sec: Math.max(30, Math.round(config.runtime.request_timeout_ms / 1000)),
    }
    const report = await runPipeline<Record<string, unknown>>(
      config,
      'gen_images_pipeline.py',
      ['--job-json', JSON.stringify(job), '--scripts-dir', base],
      Math.max(60000, config.runtime.request_timeout_ms * 2),
    )
    if (Array.isArray(report.failed) && report.failed.length > 0) {
      throw new Error(String((report.failed[0] as Record<string, unknown>).error ?? '接口测试失败'))
    }
    if (!fs.existsSync(output)) throw new Error('接口未返回可预览图片')
    sendJson(res, 200, {
      ok: true,
      provider_id: providerId,
      provider_name: provider.provider.name,
      model: provider.provider.model,
      file: relative,
      preview_url: `${IMAGE_TEST_ROUTE}?file=${encodeURIComponent(relative)}&t=${Date.now()}`,
    })
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

export function registerImageTestRoute(ctx: Context, getConfig: () => Config): void {
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return
    webCtx.effect(() => webCtx.webServer!.register({
      kind: 'exact',
      path: IMAGE_TEST_ROUTE,
      handler: (req, res) => {
        const url = new URL(req.url ?? IMAGE_TEST_ROUTE, `http://${req.headers.host ?? '127.0.0.1'}`)
        return handle(req, res, getConfig(), url)
      },
    }), 'gzh-publisher: image test route')
  })
}
