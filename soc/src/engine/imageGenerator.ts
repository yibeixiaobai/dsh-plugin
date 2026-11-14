// 原生纯 TypeScript 图片生成与落盘引擎（Zero-Dependency Image Generator）
// 彻底摆脱对外部 Python Pillow、requests 与 gen_images_pipeline.py 的依赖
import fs from 'node:fs'
import path from 'node:path'

/**
 * 【中文修复依据】：动态提取系统代理配置，确保本地开启代理（如 Clash 7890 端口）时 fetch 正常通信
 */
function getFetchDispatcher() {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy
  if (!proxy) return undefined
  try {
    const undici = require('undici')
    if (undici && typeof undici.ProxyAgent === 'function') {
      return new undici.ProxyAgent(proxy)
    }
  } catch {
    // 忽略异常，降级直连
  }
  return undefined
}

/**
 * 【中文修复依据】：生图提示词智能语义引导器（废除暴力反图表一刀切拦截）
 * 1. 彻底删除将“信息图/流程图/架构图”粗暴篡改为“authentic editorial scene”的错误逻辑；
 * 2. 识别示意图/图解/看板/流程等专业图表意图，注入现代平面信息图解（Infographic）质感与防空框硬约束；
 * 3. 严格遵循 zhOnly 语言排版规则，杜绝英文乱码。
 */
function sanitizeImagePrompt(rawPrompt: string, zhOnly: boolean = true): string {
  let prompt = (rawPrompt || '').trim()

  // 【中文修复依据】：物理剥离连续英文词组，防止文生图大模型把英文标题印刷到画面上
  if (zhOnly) {
    prompt = prompt
      .replace(/\b(?!(?:8k|4k|hd|c4d)\b)[a-zA-Z]{2,}(?:\s+[a-zA-Z]{2,})+\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  const isDiagramIntent =
    /(?:信息图|对比图表|流程图|拆解卡|架构图|结构图|卡片排版|数据流向图|示意图|图解|看板|图谱|清单|指标|维度|流程|导向|机制|时序|矩阵|路线图|闭环|链|模型|漏斗|体系|准则|评估|审查|佐证)/.test(
      prompt,
    ) || /\b(?:infographic|diagram|flowchart|chart|roadmap|pipeline|schema|matrix|workflow|loop)\b/i.test(prompt)

  if (isDiagramIntent) {
    prompt +=
      '；【专业信息图解设计质感】：16:9 宽屏现代高水准专业科技与商业信息图解（Infographic），模块化卡片布局，清晰逻辑流向与层级关系，高级莫兰迪素雅配色，精致现代平面设计质感，全中文排版，严禁纯场景静物摆拍、空讲台、会议室椅子与无关人物生活照，【杜绝无字空框铁律】：画面中所有卡片、矩形框与流程节点内部必须印制清晰真实的中文短语文字，绝对严禁只有空背景框、骨架条或无字线框（strictly render real legible Chinese text in each block, absolutely NO empty boxes, NO blank rectangles, NO placeholder wireframes）'
  } else {
    prompt +=
      '；【画面质感约束】：高端专业商务与科技全流程分析看板，现代平面构图，超高清8K，画面纯净通透，严禁空讲台、红幕布、礼堂空座椅、叠放书本与老花镜钢笔等无意义静物摄影，严禁无关路人与低质生活照'
  }

  if (zhOnly) {
    prompt +=
      '；【语言铁律】：画面中所有文字必须全部为中文字符，严禁出现任何英文单词、英文字母、西文乱码与拼音（strictly no English typography, no Latin letters, all text strictly in Chinese characters only）'
  } else {
    prompt +=
      '；【纯净视觉美学】：现代专业高信息密度视觉呈现，画面纯净自然无多余无意义装饰道具（strictly no English words, no meaningless still life props）'
  }

  return prompt
}

export interface ImageJobItem {
  prompt: string
  out: string
  size?: string | [number, number]
  width?: number
  height?: number
  ratio?: string
  article_idx?: number
  image_idx?: number
  preferred_provider_id?: string
  zh_only?: boolean
}

export interface ImageJobProvider {
  id?: string
  name?: string
  base_url?: string
  api_key?: string
  model?: string
  priority?: number
}

export interface ImageJobSpec {
  items: ImageJobItem[]
  dry_run?: boolean
  api_key?: string
  api_base?: string
  model?: string
  scripts_dir?: string
  providers?: ImageJobProvider[]
  cover_zh_only?: boolean
  content_zh_only?: boolean
  zh_only?: boolean
}

export interface ImageGenerationResult {
  generated: string[]
  failed: Array<{ out: string; reason: string }>
  dry_run: boolean
  provider_used?: string
}

/**
 * 构造一个极简且完全合法的单色 PNG 图像 Buffer（零依赖纯算法实现）
 * 结构：PNG 签名 + IHDR + IDAT (DEFLATE 无压缩块) + IEND
 */
export function createSolidColorPngBuffer(
  width = 800,
  height = 450,
  r = 70,
  g = 130,
  b = 180,
): Buffer {
  // 简易 1x1 或轻量标准尺寸 PNG
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(1, 0) // width = 1
  ihdrData.writeUInt32BE(1, 4) // height = 1
  ihdrData.writeUInt8(8, 8) // 8-bit depth
  ihdrData.writeUInt8(2, 9) // Truecolor (RGB)
  ihdrData.writeUInt8(0, 10) // compression = 0
  ihdrData.writeUInt8(0, 11) // filter = 0
  ihdrData.writeUInt8(0, 12) // interlace = 0

  const ihdrChunk = createPngChunk('IHDR', ihdrData)

  // 1x1 RGB scanline: filter_byte (0) + R + G + B
  const scanline = Buffer.from([0, r, g, b])
  // DEFLATE 无压缩块: 0x01 (BFINAL=1, BTYPE=00), len, ~len, data
  const len = scanline.length
  const nlen = ~len & 0xffff
  const idatRaw = Buffer.alloc(1 + 2 + 2 + len + 4)
  // zlib header
  idatRaw.writeUInt8(0x78, 0)
  idatRaw.writeUInt8(0x01, 1)
  // block header
  idatRaw.writeUInt8(0x01, 2)
  idatRaw.writeUInt16LE(len, 3)
  idatRaw.writeUInt16LE(nlen, 5)
  scanline.copy(idatRaw, 7)
  // adler32 of scanline
  let s1 = 1
  let s2 = 0
  for (let i = 0; i < scanline.length; i++) {
    s1 = (s1 + scanline[i]) % 65521
    s2 = (s2 + s1) % 65521
  }
  const adler = ((s2 << 16) | s1) >>> 0
  idatRaw.writeUInt32BE(adler, idatRaw.length - 4)

  const idatChunk = createPngChunk('IDAT', idatRaw)
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const len = data.length
  const chunk = Buffer.alloc(4 + 4 + len + 4)
  chunk.writeUInt32BE(len, 0)
  chunk.write(type, 4, 4, 'ascii')
  data.copy(chunk, 8)

  // 计算 CRC32
  let crc = 0xffffffff
  const bytes = Buffer.concat([Buffer.from(type, 'ascii'), data])
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  crc = (crc ^ 0xffffffff) >>> 0
  chunk.writeUInt32BE(crc, chunk.length - 4)

  return chunk
}

function resolveItemDimension(item: ImageJobItem): string {
  if (item.ratio === '16:9' || item.ratio === '2.35:1') {
    return '1792x1024'
  }
  if (item.ratio === '3:4' || item.ratio === '9:16') {
    return '1024x1792'
  }
  if (item.ratio === '1:1') {
    return '1024x1024'
  }

  // 若传入了数字尺寸，根据其宽高比例归一化为 OpenAI/FLUX 兼容的标准生图尺寸
  if (Array.isArray(item.size) && item.size.length === 2 && item.size[0] > 0 && item.size[1] > 0) {
    const r = item.size[0] / item.size[1]
    if (r > 1.4) return '1792x1024'
    if (r < 0.8) return '1024x1792'
    return '1024x1024'
  }

  if (typeof item.size === 'string' && /^\d+x\d+$/.test(item.size)) {
    const [w, h] = item.size.split('x').map(Number)
    if (w && h) {
      const r = w / h
      if (r > 1.4) return '1792x1024'
      if (r < 0.8) return '1024x1792'
      return '1024x1024'
    }
  }

  if (item.width && item.height) {
    const r = item.width / item.height
    if (r > 1.4) return '1792x1024'
    if (r < 0.8) return '1024x1792'
    return '1024x1024'
  }

  // 默认正文插图回退 16:9 宽屏
  if (item.out && item.out.includes('content_')) {
    return '1792x1024'
  }
  return '1024x1024'
}

/**
 * 原生执行图片生成流水线
 * [中文修复依据]：
 * 1. 深度支持从 job.providers 数组及 item.preferred_provider_id 路由模型凭据；
 * 2. 自动拼合 job.scripts_dir 沙箱绝对路径，彻底杜绝相对路径落盘丢失；
 * 3. 规范支持 OpenAI 图像生成兼容协议并自动下载保存图片。
 */
export async function generateImagesNative(job: ImageJobSpec): Promise<ImageGenerationResult> {
  const generated: string[] = []
  const failed: Array<{ out: string; reason: string }> = []
  const isDryRun = Boolean(job.dry_run)

  for (const item of job.items || []) {
    let outPath = item.out
    if (!outPath) continue

    // [中文修复依据]：若为相对路径，自动拼合沙箱 scripts_dir 绝对路径
    if (!path.isAbsolute(outPath) && job.scripts_dir) {
      outPath = path.join(job.scripts_dir, outPath)
    }

    // 确保目标目录存在
    const dir = path.dirname(outPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // 若已经存在且非空，直接复用
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100) {
      generated.push(outPath)
      continue
    }

    // [中文修复依据]：解析当前 item 实际生效的生图 Provider 凭据
    let activeKey = job.api_key
    let activeBase = job.api_base
    let activeModel = job.model

    if (Array.isArray(job.providers) && job.providers.length > 0) {
      const matched = item.preferred_provider_id
        ? job.providers.find(p => p.id === item.preferred_provider_id)
        : job.providers[0]
      if (matched && matched.api_key) {
        activeKey = matched.api_key
        activeBase = matched.base_url || activeBase
        activeModel = matched.model || activeModel
      }
    }

    if (isDryRun) {
      // [中文修复依据]：仅在明确启用演练模式 (Dry Run) 时，允许快速落盘演练占位图
      try {
        const dummyBuffer = createSolidColorPngBuffer(800, 450, 60, 110, 180)
        fs.writeFileSync(outPath, dummyBuffer)
        generated.push(outPath)
      } catch (err: any) {
        failed.push({ out: outPath, reason: err.message })
      }
      continue
    }

    if (!activeKey) {
      // [中文修复依据]：实盘生产模式下若无 API Key，坚决不伪造纯色图交差，必须如实报告失败并引导配置
      failed.push({
        out: outPath,
        reason:
          '【未配置生图 API Key】：当前项目或接口池中未配置可用的生图密钥。请前往【设置 -> 模型设置】为相应生图模型勾选生图模态并填写真实 API Key；若仅需测试流程，请在设置中开启【演练模式】。',
      })
      continue
    }

    // 线上 API 调用分支 (OpenAI 兼容接口)
    const baseUrl = String(activeBase || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const apiUrl = baseUrl.endsWith('/images/generations')
      ? baseUrl
      : baseUrl.endsWith('/v1')
        ? `${baseUrl}/images/generations`
        : `${baseUrl}/v1/images/generations`
    const model = activeModel || 'dall-e-3'
    const dimension = resolveItemDimension(item)

    try {
      // 单次请求 25 秒快速超时熔断，避免挂起死等
      const isCoverItem =
        item.out.includes('cover_') ||
        (item.ratio && item.ratio !== '1:1' && !item.out.includes('content_'))
      const itemZhOnly =
        item.zh_only !== undefined
          ? Boolean(item.zh_only)
          : isCoverItem
            ? Boolean(job.cover_zh_only ?? job.zh_only ?? true)
            : Boolean(job.content_zh_only ?? job.zh_only ?? true)

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey}`,
        },
        body: JSON.stringify({
          model,
          prompt: sanitizeImagePrompt(item.prompt, itemZhOnly),
          n: 1,
          size: dimension,
          response_format: 'b64_json',
        }),
        // @ts-expect-error
        dispatcher: getFetchDispatcher(),
        signal: AbortSignal.timeout(80_000), // 【中文修复依据】：放宽至 80s 避免中转 AI 生图超时被杀
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`接口响应状态码 ${response.status}: ${errorText.slice(0, 200)}`)
      }

      const resData = (await response.json()) as any
      const b64 = resData.data?.[0]?.b64_json
      const url = resData.data?.[0]?.url

      if (b64) {
        fs.writeFileSync(outPath, Buffer.from(b64, 'base64'))
        generated.push(outPath)
      } else if (url) {
        const imgRes = await fetch(url, {
          // @ts-expect-error
          dispatcher: getFetchDispatcher(),
          signal: AbortSignal.timeout(45_000),
        })
        if (!imgRes.ok) {
          throw new Error(`下载生成的图片失败 (${imgRes.status})`)
        }
        const arrBuf = await imgRes.arrayBuffer()
        fs.writeFileSync(outPath, Buffer.from(arrBuf))
        generated.push(outPath)
      } else {
        throw new Error('生图接口未返回合法的图片数据 (既无 b64_json 亦无 url)')
      }
    } catch (err: any) {
      // [中文修复依据]：实盘模式下捕获失败，记录具体原因与用户修复指引，坚决杜绝写入纯色保底图，绝不伪装成功
      const causeMsg = err?.cause
        ? ` (原因: ${err.cause?.code || err.cause?.message || err.cause})`
        : ''
      const errorMsg = `${err?.message || String(err)}${causeMsg}`
      failed.push({
        out: outPath,
        reason: `【生图端点异常或超时】：模型 ${model} 请求端点 ${apiUrl} 失败 (${errorMsg})。请检查端点是否支持 /v1/images/generations 生图接口（本地纯聊天代理不支持生图），或前往【设置 -> 模型设置】切换为有效生图模型。`,
      })
    }
  }

  return {
    generated,
    failed,
    dry_run: isDryRun,
    provider_used:
      job.api_key || (job.providers && job.providers.length > 0)
        ? 'online_ai'
        : 'native_self_contained',
  }
}
