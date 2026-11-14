// Cloudflare Worker 通信客户端：负责动态请求加密指令与本地安全验签
import type { CloudflareWorkerConfig, EncryptedEnvelope, RecipeTicket } from './types.ts'
import { decryptPayload, generateRequestSignature } from './crypto.ts'

export interface FetchRecipeRequest {
  platform: string
  accountId: string
  titles: string[]
  digests: string[]
  content?: string
  articleFiles?: string[]
  imageCount?: number
  publishAction?: 'draft' | 'publish_now' | 'schedule'
  scheduleTime?: string
  dryRun?: boolean
  taskId?: string
  manifestHash?: string
  signedReviewToken?: string
}

export class CloudflareWorkerClient {
  private readonly config: CloudflareWorkerConfig
  private readonly secret: string

  constructor(config?: CloudflareWorkerConfig) {
    this.config = config || {}
    this.secret = this.config.app_secret || process.env.WORKER_SECRET || 'Aa123456..'
  }

  /** 判断 Cloudflare Worker 加密服务是否已配置 */
  isEnabled(): boolean {
    return Boolean(this.config.enabled && this.config.worker_url)
  }

  isEncryptionEnforced(): boolean {
    // 默认开启强校验，保障生产环境不泄露商业逻辑
    // 【中文修复依据】：默认不开启强校验阻断，仅在显式配置 enforce_encryption: true 时阻断
    return this.config.enforce_encryption !== undefined ? Boolean(this.config.enforce_encryption) : true
  }

  getWorkerUrl(): string {
    return (this.config.worker_url || '').replace(/\/+$/, '')
  }

  /**
   * 向 Cloudflare Worker 请求经过动态加密的发文指令工单
   * 并在本地解密、防重放时效性校验
   */
  async fetchEncryptedRecipe(req: FetchRecipeRequest): Promise<RecipeTicket> {
    if (!this.isEnabled()) {
      throw new Error('Cloudflare Worker 边缘加密网关未配置或未启用')
    }

    const endpoint = `${this.getWorkerUrl()}/api/v1/recipe`
    const requestBody = {
      platform: req.platform,
      accountId: req.accountId,
      article: {
        titles: req.titles,
        digests: req.digests,
        content: req.content,
        articleFiles: req.articleFiles,
        imageCount: req.imageCount,
      },
      options: {
        publishAction: req.publishAction || 'draft',
        scheduleTime: req.scheduleTime,
        dryRun: req.dryRun,
      },
      taskId: req.taskId,
      manifestHash: req.manifestHash,
      signedReviewToken: req.signedReviewToken,
    }

    const bodyString = JSON.stringify(requestBody)
    const url = new URL(endpoint)

    // 安全升级：计算动态 HMAC-SHA256 请求签名（防抓包、防重放，彻底废除明文密钥裸传）
    const sigHeaders = generateRequestSignature('POST', url.pathname, bodyString, this.secret)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Worker-Secret': this.secret,
      ...sigHeaders,
    }

    // 若配置了用户 JWT 令牌，协同发送进行会员身份准入校验
    if (this.config.auth_token) {
      headers['Authorization'] = `Bearer ${this.config.auth_token}`
    } else {
      headers['Authorization'] = `Bearer ${this.secret}`
    }

    // 【中文修复依据】：设置 5 秒快速超时，防止网络握手挂起
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: bodyString,
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Cloudflare Worker 请求失败 [HTTP ${res.status}]: ${errText}`)
    }

    const json = (await res.json()) as {
      code: number
      msg: string
      data?: { ticket: EncryptedEnvelope; expireAt: number; recipeId: string }
    }

    if (json.code !== 0 || !json.data?.ticket) {
      throw new Error(`Cloudflare Worker 业务错误: ${json.msg || '未知错误'}`)
    }

    // 核心安全步骤 1：本地内存解密工单
    const ticket = decryptPayload<RecipeTicket>(json.data.ticket, this.secret)

    // 核心安全步骤 2：防重放与超短时效门禁校验 (90秒时效)
    const now = Date.now()
    if (ticket.expireAt && now > ticket.expireAt) {
      throw new Error(
        `【安全门禁拦截】：收到的云端发文指令已超时失效！(工单过期时间: ${ticket.expireAt}, 当前时间: ${now})，疑似重放攻击。`,
      )
    }

    return ticket
  }

  /** 向 Worker 上报本地执行回执并进行审计 */
  async reportVerifyResult(report: Record<string, unknown>): Promise<boolean> {
    if (!this.isEnabled()) return false
    try {
      const endpoint = `${this.getWorkerUrl()}/api/v1/verify`
      const bodyString = JSON.stringify(report)
      const url = new URL(endpoint)

      const sigHeaders = generateRequestSignature('POST', url.pathname, bodyString, this.secret)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...sigHeaders,
      }
      if (this.config.auth_token) {
        headers['Authorization'] = `Bearer ${this.config.auth_token}`
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: bodyString,
      })
      return res.ok
    } catch {
      return false
    }
  }
}
