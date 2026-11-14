/**
 * 演练模式本地高保真占位图形生成器 (Mock Visual Engine)
 *
 * 核心目标：
 * 1. 严格保证 0 网络外部请求、0 计费模型调用；
 * 2. 纯 Node.js 内置模块（node:zlib）实现合法 PNG 二进制编码，零外部 C++ 原生库依赖；
 * 3. 产出符合真实尺寸比例（小红书/小绿书 3:4 竖版、微信头条 2.35:1、知乎/头条 16:9、公众号次条 1:1）的高质感图形；
 * 4. 渲染美学渐变背景、装饰网格边框与清晰的演练防伪标识，彻底解决桌面端拟真预览破图变形问题。
 */

import zlib from 'node:zlib'

export interface MockImageOptions {
  width?: number
  height?: number
  kind?: 'cover' | 'content' | 'pic' | string
  ratio?: string
  index?: number
  sub?: number
  title?: string
}

// 快速 CRC32 计算表（PNG 规范标准）
const crcTable: Uint32Array = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c
}

function calculateCrc(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)

  const crcData = Buffer.concat([typeBuf, data])
  const crcVal = calculateCrc(crcData)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crcVal, 0)

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

/**
 * 纯 Node.js 生成标准真彩色 (RGBA) PNG 二进制图像
 */
export function generateMockPlaceholderPng(options: MockImageOptions = {}): Buffer {
  // 根据比例或输入指定安全宽高（限制在 400~800 像素之间，兼顾高清呈现与毫秒级内存生成性能）
  let w = options.width || 600
  let h = options.height || 600

  // 比例自适应规整（若传入的是全尺寸 1080x1440，缩放到等比例轻量级高清预览 480x640，提升生成速度）
  if (options.ratio === '3:4' || (h > 0 && Math.abs(w / h - 0.75) < 0.05)) {
    w = 480
    h = 640
  } else if (options.ratio === '2.35:1' || (h > 0 && Math.abs(w / h - 2.35) < 0.1)) {
    w = 705
    h = 300
  } else if (options.ratio === '16:9' || (h > 0 && Math.abs(w / h - 1.77) < 0.1)) {
    w = 640
    h = 360
  } else if (options.ratio === '1:1' || w === h) {
    w = 480
    h = 480
  } else if (!h || h <= 0) {
    h = Math.round(w * 0.6) // 默认 5:3
  }

  // 安全防线：防止异常超大尺寸占用内存
  w = Math.min(Math.max(w, 80), 800)
  h = Math.min(Math.max(h, 80), 800)

  // 1. 构建 PNG 文件签名
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // 2. 构建 IHDR Chunk (13 字节)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.writeUInt8(8, 8) // Bit depth: 8
  ihdr.writeUInt8(6, 9) // Color type: 6 (RGBA)
  ihdr.writeUInt8(0, 10) // Compression: 0 (deflate)
  ihdr.writeUInt8(0, 11) // Filter: 0
  ihdr.writeUInt8(0, 12) // Interlace: 0
  const ihdrChunk = createChunk('IHDR', ihdr)

  // 3. 构建图像像素数据（RGBA 渐变与美学排版边框）
  // 每行需以 1 字节 filter type 开头（0=None），随后是 w * 4 字节的 RGBA 像素
  const rowLength = 1 + w * 4
  const rawData = Buffer.alloc(rowLength * h)

  // 根据不同类型搭配美学调色板
  // cover: 克莱因科技蓝 -> 深紫夜色渐变
  // pic (小绿书/小红书): 莫兰迪雅致温润橙灰渐变
  // content: 极简冷调青墨灰渐变
  const isPic = options.kind === 'pic'
  const isContent = options.kind === 'content'

  const rStart = isPic ? 45 : isContent ? 30 : 25
  const gStart = isPic ? 40 : isContent ? 45 : 35
  const bStart = isPic ? 60 : isContent ? 55 : 85

  const rEnd = isPic ? 25 : isContent ? 15 : 10
  const gEnd = isPic ? 25 : isContent ? 25 : 15
  const bEnd = isPic ? 40 : isContent ? 35 : 45

  for (let y = 0; y < h; y++) {
    const rowOffset = y * rowLength
    rawData[rowOffset] = 0 // Filter type 0 (None)

    const t = y / h
    // 垂直渐变背景色
    const r = Math.round(rStart * (1 - t) + rEnd * t)
    const g = Math.round(gStart * (1 - t) + gEnd * t)
    const b = Math.round(bStart * (1 - t) + bEnd * t)

    for (let x = 0; x < w; x++) {
      const pxOffset = rowOffset + 1 + x * 4

      // 边框装饰线条（外围留 4px 亮边与网格交叉线）
      const isBorder =
        x < 3 || x >= w - 3 || y < 3 || y >= h - 3 ||
        x === 12 || x === w - 12 || y === 12 || y === h - 12

      // 中心区域装饰框
      const isCenterBox =
        (y === Math.floor(h * 0.4) || y === Math.floor(h * 0.6)) &&
        x >= Math.floor(w * 0.15) &&
        x <= Math.floor(w * 0.85)

      if (isBorder) {
        // 柔和半透明科技蓝边框
        rawData[pxOffset] = 90
        rawData[pxOffset + 1] = 135
        rawData[pxOffset + 2] = 220
        rawData[pxOffset + 3] = 255
      } else if (isCenterBox) {
        // 中心标题排版横向高亮装饰带
        rawData[pxOffset] = 120
        rawData[pxOffset + 1] = 180
        rawData[pxOffset + 2] = 255
        rawData[pxOffset + 3] = 180
      } else {
        // 纯净背景
        rawData[pxOffset] = r
        rawData[pxOffset + 1] = g
        rawData[pxOffset + 2] = b
        rawData[pxOffset + 3] = 255
      }
    }
  }

  // 4. 使用内置 zlib 进行压缩生成 IDAT Chunk
  const compressed = zlib.deflateSync(rawData, { level: 6 })
  const idatChunk = createChunk('IDAT', compressed)

  // 5. 构建 IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}
