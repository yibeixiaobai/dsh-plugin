// 社媒发布插件 Cloudflare Worker 客户端契约类型

export interface EncryptedEnvelope {
  iv: string // Base64
  ciphertext: string // Base64
  tag: string // Base64
}

export type RecipeActionType =
  | 'NAVIGATE'
  | 'WAIT_SELECTOR'
  | 'CLICK'
  | 'INPUT_TEXT'
  | 'PASTE_HTML'        // 关键：将云端排版好的富文本直接注入富文本框
  | 'UPLOAD_FILE'       // 上传本地图片/封面
  | 'SCROLL'            // 防风控滚动模拟
  | 'WAIT_RESPONSE'     // 等待指定网络接口响应获取 draftId / noteId
  | 'WAIT_MODAL_DISMISS'// 等待阻断弹窗关闭
  | 'EVALUATE'          // 执行特定 DOM 辅助计算
  | 'SUBMIT'            // 点击确认/提交
  | 'SLEEP'             // 防风控停顿

export interface RecipeAction {
  type: RecipeActionType
  selector?: string
  value?: string
  timeout?: number
  options?: Record<string, unknown>
  description?: string
}

export interface RecipeTicket {
  platform: string
  recipeId: string
  expireAt: number
  nonce: string
  titles: string[]
  digests: string[]
  actions: RecipeAction[]
  metadata?: Record<string, unknown>
}

export interface CloudflareWorkerConfig {
  enabled?: boolean
  worker_url?: string
  app_secret?: string
  auth_token?: string // 可选的用户 JWT 或会话 Token
  enforce_encryption?: boolean
}
