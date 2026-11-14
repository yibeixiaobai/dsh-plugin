// Node.js 原生 crypto 模块实现的 AES-256-GCM 加密与解密
// 确保与 Cloudflare Worker 的 Web Crypto API 算法及 Base64 封包规范 100% 字节级对齐
import crypto from 'node:crypto'
import type { EncryptedEnvelope } from './types.ts'

/** 通过 SHA-256 将任意长度密码派生为 32 字节 (256 位) 密钥 */
export function deriveKeyBytes(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

/**
 * 本地解密来自 Cloudflare Worker 的 AES-256-GCM 加密工单
 */
export function decryptPayload<T>(envelope: EncryptedEnvelope, secret: string): T {
  if (!envelope || !envelope.iv || !envelope.ciphertext || !envelope.tag) {
    throw new Error('无效的加密信封格式 (缺少 iv、ciphertext 或 tag)')
  }

  const key = deriveKeyBytes(secret)
  const iv = Buffer.from(envelope.iv, 'base64')
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64')
  const tag = Buffer.from(envelope.tag, 'base64')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  const jsonStr = decrypted.toString('utf8')
  return JSON.parse(jsonStr) as T
}

/**
 * 本地加密数据包 (供测试或向 Worker 上报端到端加密数据使用)
 */
export function encryptPayload<T>(payload: T, secret: string): EncryptedEnvelope {
  const key = deriveKeyBytes(secret)
  const iv = crypto.randomBytes(12) // 12-byte GCM IV

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const jsonStr = JSON.stringify(payload)

  const ciphertext = Buffer.concat([
    cipher.update(jsonStr, 'utf8'),
    cipher.final(),
  ])

  const tag = cipher.getAuthTag()

  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export interface RequestSignatureHeaders {
  'X-Worker-Timestamp': string
  'X-Worker-Nonce': string
  'X-Worker-Signature': string
}

/**
 * 计算发向 Cloudflare Worker 的防抓包防重放 HMAC-SHA256 请求签名
 * 修复依据：废除请求头明文 Secret 裸传，阻断中间人代理截获解密密钥
 */
export function generateRequestSignature(
  method: string,
  pathname: string,
  bodyString: string,
  secret: string,
): RequestSignatureHeaders {
  const timestamp = Date.now().toString()
  const nonce = crypto.randomUUID()
  const bodyHash = crypto.createHash('sha256').update(bodyString, 'utf8').digest('hex')
  const payloadToSign = `${method.toUpperCase()}\n${pathname}\n${timestamp}\n${nonce}\n${bodyHash}`
  const signature = crypto.createHmac('sha256', secret).update(payloadToSign, 'utf8').digest('hex')

  return {
    'X-Worker-Timestamp': timestamp,
    'X-Worker-Nonce': nonce,
    'X-Worker-Signature': signature,
  }
}
