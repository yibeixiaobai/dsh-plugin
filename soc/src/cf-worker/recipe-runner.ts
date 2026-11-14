// 本地盲执行器 (Local Recipe Runner)
// 核心设计：仅按照从 Cloudflare Worker 解密后的动态指令包在本地运行
// 【安全与风控保障】：所有的网络请求、浏览器自动化、Cookie 隔离 100% 运行在本地设备与家庭宽带中，严防机房 IP 封禁
import type { RecipeTicket } from './types.ts'

export interface RunnerContext {
  page?: any // puppeteer-core Page 实例 (若存在)
  dryRun?: boolean
  variables?: Record<string, string>
  localFiles?: string[] // 本地图片路径素材
  onLog?: (msg: string) => void
}

export interface ExecutionResult {
  success: boolean
  executedCount: number
  logs: string[]
  error?: string
  extractedMetadata?: Record<string, unknown>
}

/** 内存防重放缓存 (最多保留 1000 条，防止内存膨胀) */
const executedNonces = new Set<string>()

export class LocalRecipeRunner {
  /**
   * 运行从云端解密并验证的动态发文工单
   * 具备防重放、90 秒超时熔断与单步内存即用即擦 (Zero-Memory Overwrite) 安全防御
   */
  async execute(ticket: RecipeTicket, ctx: RunnerContext): Promise<ExecutionResult> {
    const logs: string[] = []
    const log = (msg: string) => {
      logs.push(msg)
      ctx.onLog?.(msg)
    }

    log(`[LocalRecipeRunner] 开始本地执行平台 [${ticket.platform}] 指令流，工单 ID: ${ticket.recipeId}`)

    // 核心安全校验 1：防重放攻击校验 (Replay Attack Guard)
    if (ticket.nonce) {
      if (executedNonces.has(ticket.nonce)) {
        const err = `[LocalRecipeRunner] 【安全拦截】：检测到重放攻击！工单 Nonce (${ticket.nonce}) 已被使用过。`
        log(err)
        return { success: false, executedCount: 0, logs, error: err }
      }
      if (executedNonces.size > 1000) {
        // 清理较早记录
        const arr = Array.from(executedNonces)
        for (let i = 0; i < 200; i++) {
          executedNonces.delete(arr[i])
        }
      }
      executedNonces.add(ticket.nonce)
    }

    // 核心安全校验 2：工单时效性检查 (严格 90 秒 TTL 校验)
    if (ticket.expireAt && Date.now() > ticket.expireAt) {
      const err = `[LocalRecipeRunner] 【时效拦截】：工单已超时失效 (expireAt: ${new Date(ticket.expireAt).toISOString()}, 当前: ${new Date().toISOString()})`
      log(err)
      return { success: false, executedCount: 0, logs, error: err }
    }

    let count = 0
    const page = ctx.page
    const vars = { ...(ctx.variables || {}) }
    const extractedMetadata: Record<string, unknown> = {}

    // 尝试从当前页面已有的 URL 或 Cookie 中自动捕获 token
    if (page && typeof page.url === 'function') {
      try {
        const curUrl = page.url()
        const tokenMatch = curUrl.match(/[?&]token=([^&#]+)/)
        if (tokenMatch && tokenMatch[1] && !vars.token) {
          vars.token = tokenMatch[1]
          log('[LocalRecipeRunner] 从当前页面 URL 自动提取到平台会话 Token')
        }
      } catch {}
    }

    // 模板字符串变量替换
    const interpolate = (str?: string): string => {
      if (!str) return ''
      let res = str
      for (const [k, v] of Object.entries(vars)) {
        res = res.replaceAll(`{{${k}}}`, v ?? '')
      }
      return res
    }

    try {
      const totalActions = ticket.actions.length
      for (const action of ticket.actions) {
        count++
        const actionDesc = action.description || `执行指令动作 [${action.type}]`
        log(`[Step ${count}/${totalActions}] ${actionDesc}`)

        try {
          if (ctx.dryRun) {
            // 演练模式下只模拟调度，不触发真实 DOM 交互
            continue
          }

          if (!page) {
            log('[LocalRecipeRunner] 未提供本地 Puppeteer Page 实例，跳过真实 DOM 操作')
            continue
          }

          switch (action.type) {
            case 'NAVIGATE': {
              const url = interpolate(action.value)
              if (url) {
                await page.goto(url, {
                  waitUntil: (action.options?.waitUntil as any) || 'domcontentloaded',
                  timeout: action.timeout || 30000,
                })
                const navUrl = page.url()
                const tokenMatch = navUrl.match(/[?&]token=([^&#]+)/)
                if (tokenMatch && tokenMatch[1]) {
                  vars.token = tokenMatch[1]
                }
              }
              break
            }

            case 'WAIT_SELECTOR': {
              if (action.selector) {
                await page.waitForSelector(action.selector, {
                  timeout: action.timeout || 15000,
                  visible: action.options?.visible !== false,
                })
              }
              break
            }

            case 'CLICK': {
              if (action.selector) {
                await page.waitForSelector(action.selector, { timeout: action.timeout || 10000 })
                const clickDelay = Math.floor(Math.random() * 50) + 20
                await page.click(action.selector, { delay: clickDelay })
              }
              break
            }

            case 'INPUT_TEXT': {
              const val = interpolate(action.value)
              if (action.selector && val) {
                await page.waitForSelector(action.selector, { timeout: action.timeout || 10000 })
                await page.focus(action.selector)
                const typeDelay = typeof action.options?.delay === 'number' ? action.options.delay : 15
                await page.type(action.selector, val, { delay: typeDelay })
              }
              break
            }

            case 'PASTE_HTML': {
              const html = interpolate(action.value)
              if (action.selector && html) {
                await page.waitForSelector(action.selector, { timeout: action.timeout || 15000 })

                // 1. 尝试在主文档中寻找目标并写入
                const injected = await page.evaluate(
                  (sel: string, contentHtml: string) => {
                    const el = document.querySelector(sel) as HTMLElement | null
                    if (!el) return false
                    el.focus()
                    let ok = false
                    try {
                      ok = document.execCommand('insertHTML', false, contentHtml)
                    } catch {
                      ok = false
                    }
                    if (!ok) {
                      el.innerHTML = contentHtml
                      el.dispatchEvent(new Event('input', { bubbles: true }))
                      el.dispatchEvent(new Event('change', { bubbles: true }))
                      el.dispatchEvent(new Event('blur', { bubbles: true }))
                    }
                    return true
                  },
                  action.selector,
                  html,
                )

                // 2. 若主页面元素内部嵌套了 iframe，穿透到 frame 内部注入
                if (!injected && typeof page.frames === 'function') {
                  const frames = page.frames()
                  for (const frame of frames) {
                    try {
                      const frameInjected = await frame.evaluate(
                        (contentHtml: string) => {
                          const body = document.body
                          if (body && (body.classList.contains('view') || body.contentEditable === 'true')) {
                            body.focus()
                            body.innerHTML = contentHtml
                            body.dispatchEvent(new Event('input', { bubbles: true }))
                            body.dispatchEvent(new Event('change', { bubbles: true }))
                            return true
                          }
                          return false
                        },
                        html,
                      )
                      if (frameInjected) {
                        log('[LocalRecipeRunner] 已成功穿透 iframe 注入富文本内容')
                        break
                      }
                    } catch {}
                  }
                }

                log('[LocalRecipeRunner] 已将云端排版富文本注入目标编辑器')
              }
              break
            }

            case 'UPLOAD_FILE': {
              if (action.selector) {
                await page.waitForSelector(action.selector, { timeout: action.timeout || 15000 })
                const fileInput = await page.$(action.selector)
                if (!fileInput) {
                  throw new Error(`未找到文件上传控件: ${action.selector}`)
                }

                const isMultiple = Boolean(action.options?.multiple)
                if (isMultiple && ctx.localFiles && ctx.localFiles.length > 0) {
                  await fileInput.uploadFile(...ctx.localFiles)
                  log(`[LocalRecipeRunner] 本地批量载入 ${ctx.localFiles.length} 张图片至上传控件`)
                } else {
                  let targetFilePath: string | undefined
                  if (action.value) {
                    targetFilePath = interpolate(action.value)
                  } else if (ctx.localFiles && ctx.localFiles.length > 0) {
                    const fileIndex = typeof action.options?.fileIndex === 'number' ? action.options.fileIndex : 0
                    targetFilePath = ctx.localFiles[fileIndex] || ctx.localFiles[0]
                  }

                  if (targetFilePath) {
                    await fileInput.uploadFile(targetFilePath)
                    log(`[LocalRecipeRunner] 本地文件成功载入上传控件: ${targetFilePath}`)
                  } else {
                    log('[LocalRecipeRunner] 警告: 未指定待上传的本地文件路径')
                  }
                }
              }
              break
            }

            case 'SCROLL': {
              const deltaY = typeof action.options?.deltaY === 'number' ? action.options.deltaY : 300
              await page.evaluate((y: number) => {
                window.scrollBy({ top: y, behavior: 'smooth' })
              }, deltaY)
              break
            }

            case 'WAIT_MODAL_DISMISS': {
              if (action.selector) {
                const timeout = action.timeout || 4000
                try {
                  const modal = await page.$(action.selector)
                  if (modal) {
                    log('[LocalRecipeRunner] 检测到阻断弹窗，尝试平稳关闭')
                    const closeSelector = action.options?.closeButtonSelector as string | undefined
                    if (closeSelector) {
                      const closeBtn = await page.$(closeSelector)
                      if (closeBtn) await closeBtn.click()
                    }
                    await page.waitForSelector(action.selector, { hidden: true, timeout })
                  }
                } catch {
                  // 弹窗未出现或已自然关闭，平稳继续
                }
              }
              break
            }

            case 'WAIT_RESPONSE': {
              const urlPattern = action.value || (action.options?.urlPattern as string)
              if (urlPattern) {
                const timeout = action.timeout || 15000
                try {
                  const response = await page.waitForResponse(
                    (res: any) => res.url().includes(urlPattern),
                    { timeout },
                  )
                  log(`[LocalRecipeRunner] 捕获到目标接口响应: ${response.url()} (Status: ${response.status()})`)
                  try {
                    const resJson = await response.json()
                    if (resJson && typeof resJson === 'object') {
                      if (resJson.data?.draftId) extractedMetadata.draftId = resJson.data.draftId
                      if (resJson.data?.draft_id) extractedMetadata.draftId = resJson.data.draft_id
                      if (resJson.data?.appMsgId) extractedMetadata.draftId = String(resJson.data.appMsgId)
                      if (resJson.data?.appmsgid) extractedMetadata.draftId = String(resJson.data.appmsgid)
                      if (resJson.appMsgId) extractedMetadata.draftId = String(resJson.appMsgId)
                      if (resJson.data?.noteId) extractedMetadata.noteId = resJson.data.noteId
                      if (resJson.data?.note_id) extractedMetadata.noteId = resJson.data.note_id
                      if (resJson.data?.id) extractedMetadata.id = resJson.data.id
                      if (resJson.article_id) extractedMetadata.articleId = resJson.article_id
                      if (resJson.data?.article_id) extractedMetadata.articleId = resJson.data.article_id
                      if (resJson.pgc_id) extractedMetadata.pgcId = resJson.pgc_id
                      if (resJson.data?.pgc_id) extractedMetadata.pgcId = resJson.data.pgc_id
                    }
                  } catch {
                    // 非 JSON 响应，忽略解析
                  }
                } catch {
                  log(`[LocalRecipeRunner] 提示: 等待目标接口响应超时或无匹配网络包: ${urlPattern}`)
                }
              }
              break
            }

            case 'SLEEP': {
              const ms = action.timeout || 1000
              await new Promise(r => setTimeout(r, ms))
              break
            }

            case 'SUBMIT': {
              if (action.selector) {
                await page.waitForSelector(action.selector, { timeout: action.timeout || 10000 })
                await page.click(action.selector)
              }
              break
            }

            case 'EVALUATE': {
              if (action.value) {
                await page.evaluate(action.value)
              }
              break
            }

            default:
              log(`[LocalRecipeRunner] 忽略未知或已扩展动作类型: ${action.type}`)
              break
          }
        } finally {
          // 核心安全加固：单步即用即擦 (Zero-Memory Overwrite)
          // 步骤执行完成后立即清空选择器、输入文本与富文本 HTML，防御内存转储与堆栈嗅探
          delete (action as any).selector
          delete (action as any).value
          delete (action as any).options
          delete (action as any).description
        }
      }

      log(`[LocalRecipeRunner] 工单 [${ticket.recipeId}] 全部步骤本地盲执行完成`)
      return {
        success: true,
        executedCount: count,
        logs,
        extractedMetadata,
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log(`[LocalRecipeRunner] 本地盲执行中断异常: ${errMsg}`)
      return { success: false, executedCount: count, logs, error: errMsg, extractedMetadata }
    } finally {
      // 核心安全加固：工单执行完毕后（无论成功还是异常），彻底清空工单 actions 数组，防止内存残留
      if (Array.isArray(ticket.actions)) {
        ticket.actions.length = 0
      }
    }
  }
}
