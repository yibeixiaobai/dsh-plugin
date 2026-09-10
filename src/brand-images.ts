import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import { resolveAccount } from './config-runtime.ts'
import { brandDir, brandImagePath } from './tools/shared.ts'

export const BRAND_IMAGE_ROUTE = '/api/gzh-publisher/brand-image'
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const UPLOAD_HEADER = 'x-dsh-gzh-upload'

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

function sniffImage(data: Buffer): { ext: 'jpg' | 'png' | 'webp'; mediaType: string } | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { ext: 'jpg', mediaType: 'image/jpeg' }
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (data.length >= png.length && data.subarray(0, png.length).equals(png)) {
    return { ext: 'png', mediaType: 'image/png' }
  }
  if (
    data.length >= 12
    && data.subarray(0, 4).toString('ascii') === 'RIFF'
    && data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mediaType: 'image/webp' }
  }
  return null
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_UPLOAD_BYTES) {
        reject(new Error('图片超过 10 MB 限制'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function safeLeafName(value: string): string {
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // Keep the raw header when it is not URI-encoded.
  }
  const leaf = path.basename(decoded).replace(/\.[^.]+$/, '')
  const safe = leaf.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe.slice(0, 48) || 'brand-image'
}

function uploadDirectory(config: Config): string {
  return path.join(path.resolve(brandDir(config)), 'uploads')
}

function relativeBrandPath(base: string, absolute: string): string {
  return path.relative(base, absolute).split(path.sep).join('/')
}

function isReferenced(config: Config, relative: string): boolean {
  return Object.values(config.accounts).some((account) =>
    account.brand_images.header.file === relative || account.brand_images.footer.file === relative,
  )
}

async function handle(req: IncomingMessage, res: ServerResponse, config: Config, url: URL): Promise<void> {
  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: '仅允许同源请求' })
    return
  }

  const accountId = url.searchParams.get('account') ?? undefined
  const base = path.resolve(brandDir(config))
  if (req.method === 'GET') {
    const slot = url.searchParams.get('slot')
    if (slot !== 'header' && slot !== 'footer') {
      sendJson(res, 400, { error: 'slot 必须是 header 或 footer' })
      return
    }
    const account = resolveAccount(config, accountId)
    const fallback = slot === 'header' ? 'brand_top.jpg' : 'brand_bot.jpg'
    const file = brandImagePath(config, account.profile.brand_images[slot].file, fallback)
    if (!fs.existsSync(file)) {
      sendJson(res, 404, { error: '品牌图不存在', file: relativeBrandPath(base, file) })
      return
    }
    const stat = fs.statSync(file)
    const ext = path.extname(file).toLowerCase()
    const mediaType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    res.writeHead(200, {
      'content-type': mediaType,
      'content-length': stat.size,
      'cache-control': 'no-store',
    })
    fs.createReadStream(file).pipe(res)
    return
  }

  if (req.headers[UPLOAD_HEADER] !== 'brand-image') {
    sendJson(res, 403, { error: '缺少上传请求标记' })
    return
  }

  if (req.method === 'POST') {
    const slot = url.searchParams.get('slot')
    if (slot !== 'header' && slot !== 'footer') {
      sendJson(res, 400, { error: 'slot 必须是 header 或 footer' })
      return
    }
    try {
      const body = await readBody(req)
      const image = sniffImage(body)
      if (!image) {
        sendJson(res, 415, { error: '仅支持 JPEG、PNG、WebP 图片' })
        return
      }
      const dir = uploadDirectory(config)
      fs.mkdirSync(dir, { recursive: true })
      const stem = safeLeafName(String(req.headers['x-dsh-filename'] ?? 'brand-image'))
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${stem}.${image.ext}`
      const destination = path.join(dir, name)
      const temporary = destination + '.part'
      fs.writeFileSync(temporary, body)
      fs.renameSync(temporary, destination)
      const relative = relativeBrandPath(base, destination)
      sendJson(res, 200, {
        account_id: accountId || config.default_account || 'default',
        slot,
        file: relative,
        bytes: body.length,
        media_type: image.mediaType,
      })
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (req.method === 'DELETE') {
    const relative = url.searchParams.get('file') ?? ''
    if (!relative.replace(/\\/g, '/').startsWith('uploads/')) {
      sendJson(res, 400, { error: '只能删除 brand_assets/uploads 内的上传文件' })
      return
    }
    const absolute = path.resolve(base, relative)
    const uploads = path.resolve(uploadDirectory(config))
    if (absolute !== uploads && !absolute.startsWith(uploads + path.sep)) {
      sendJson(res, 400, { error: '路径越界' })
      return
    }
    if (isReferenced(config, relative)) {
      sendJson(res, 409, { error: '文件已被账号配置引用，不能删除' })
      return
    }
    if (fs.existsSync(absolute)) fs.unlinkSync(absolute)
    sendJson(res, 200, { deleted: true, file: relative })
    return
  }

  sendJson(res, 405, { error: '不支持的请求方法' })
}

export function registerBrandImageRoutes(ctx: Context, getConfig: () => Config): void {
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return
    webCtx.effect(() => webCtx.webServer!.register({
      kind: 'exact',
      path: BRAND_IMAGE_ROUTE,
      handler: (req, res) => {
        const url = new URL(req.url ?? BRAND_IMAGE_ROUTE, `http://${req.headers.host ?? '127.0.0.1'}`)
        return handle(req, res, getConfig(), url)
      },
    }), 'gzh-publisher: brand image route')
  })
}
