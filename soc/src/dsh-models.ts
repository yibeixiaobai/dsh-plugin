import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

export interface DshImageModelCandidate {
  provider: string
  provider_name: string
  model_id: string
  model_name: string
  base_url?: string
  api_key?: string
  source: 'dsh-llm' | 'dsh-settings'
}

const IMAGE_MODEL_KEYWORD_RE =
  /(image|dall-?e|flux|sd|stable-diffusion|midjourney|recraft|cogview|kolors|janus|imagen|wanx|visual)/i

import { handleCors, sendJson, isAllowedOrigin } from './http-helpers.ts'

function sameOrigin(req: IncomingMessage): boolean {
  return isAllowedOrigin(req.headers.origin, req.headers.host)
}

/**
 * 从主 dsh 的 settings.yaml（位于 ~/.dsh/settings.yaml）读取 provider 的配置信息（如 baseURL、apiKey）
 */
function readDshSettingsFile(): Record<string, any> | null {
  try {
    const userDir = os.homedir()
    const yamlPath = path.join(userDir, '.dsh', 'settings.yaml')
    if (!fs.existsSync(yamlPath)) return null
    const content = fs.readFileSync(yamlPath, 'utf-8')
    // 简易解析 YAML 或提取关键配置块
    return parseSimpleYaml(content)
  } catch {
    return null
  }
}

/** 针对 settings.yaml 的安全轻量级提取 */
function parseSimpleYaml(text: string): Record<string, any> {
  const result: Record<string, any> = {}
  try {
    // 提取 llm-pi-ai 或其它提供商的基础配置
    const providerMatches = text.matchAll(/([a-zA-Z0-9_-]+):\s*\{\s*displayName:\s*([^,\n}]+)[^}]*baseURL:\s*([^,\n}]+)[^}]*\}/g)
    for (const match of providerMatches) {
      const id = match[1]?.trim()
      if (id) {
        result[id] = {
          displayName: match[2]?.trim(),
          baseURL: match[3]?.trim(),
        }
      }
    }
  } catch {
    /* 忽略解析异常 */
  }
  return result
}

/**
 * 遍历并发现主 dsh 中的生图模型
 */
export async function discoverDshImageModels(ctx: Context): Promise<DshImageModelCandidate[]> {
  const candidates: DshImageModelCandidate[] = []
  const seen = new Set<string>()

  // 1. 如果运行时注入了 ctx.llm，通过官方 API 探查
  if (ctx.llm && typeof ctx.llm.listProviders === 'function') {
    try {
      const providers = ctx.llm.listProviders()
      for (const p of providers) {
        try {
          const models = await ctx.llm.listModels(p.provider)
          for (const m of models) {
            const hasImageModality = Array.isArray(m.inputModalities) && m.inputModalities.includes('image')
            const isMatch = IMAGE_MODEL_KEYWORD_RE.test(m.id) ||
                            (m.name ? IMAGE_MODEL_KEYWORD_RE.test(m.name) : false) ||
                            hasImageModality

            if (isMatch) {
              const key = `${p.provider}:${m.id}`
              if (!seen.has(key)) {
                seen.add(key)
                candidates.push({
                  provider: p.provider,
                  provider_name: p.displayName || p.provider,
                  model_id: m.id,
                  model_name: m.name || m.id,
                  source: 'dsh-llm',
                })
              }
            }
          }
        } catch {
          /* 忽略单 provider 模型枚举失败 */
        }
      }
    } catch (e) {
      ctx.logger.warn('[gzh] 通过 ctx.llm 探查模型列表失败：', e)
    }
  }

  // 2. 补充探查主 dsh 的 settings 中的配置
  try {
    let settingsProviders: Record<string, any> = {}
    if (ctx.settings && typeof ctx.settings.get === 'function') {
      const piAi = ctx.settings.get('llm-pi-ai') as any
      if (piAi && typeof piAi === 'object' && piAi.providers) {
        settingsProviders = piAi.providers
      }
    }

    if (Object.keys(settingsProviders).length === 0) {
      const fromFile = readDshSettingsFile()
      if (fromFile) settingsProviders = fromFile
    }

    for (const [pId, pData] of Object.entries(settingsProviders)) {
      if (!pData || typeof pData !== 'object') continue
      const baseURL = String(pData.baseURL || pData.base_url || '').trim()
      const apiKey = String(pData.apiKey || pData.api_key || '').trim()
      const dName = String(pData.displayName || pId).trim()
      const models = Array.isArray(pData.models) ? pData.models : []

      for (const m of models) {
        const mId = typeof m === 'string' ? m : (m?.id || m?.name || '')
        const mName = typeof m === 'object' && m?.name ? m.name : mId
        if (!mId) continue

        if (IMAGE_MODEL_KEYWORD_RE.test(mId) || IMAGE_MODEL_KEYWORD_RE.test(mName)) {
          const key = `${pId}:${mId}`
          if (!seen.has(key)) {
            seen.add(key)
            candidates.push({
              provider: pId,
              provider_name: dName,
              model_id: mId,
              model_name: mName,
              base_url: baseURL,
              api_key: apiKey,
              source: 'dsh-settings',
            })
          } else {
            // 补充之前由 ctx.llm 发现但缺少 baseURL/apiKey 的候选
            const existing = candidates.find((c) => c.provider === pId && c.model_id === mId)
            if (existing) {
              if (!existing.base_url && baseURL) existing.base_url = baseURL
              if (!existing.api_key && apiKey) existing.api_key = apiKey
            }
          }
        }
      }
    }
  } catch (e) {
    ctx.logger.warn('[gzh] 从 settings 探查提供商配置失败：', e)
  }

  return candidates
}

/**
 * 注册主 dsh 模型发现 API 路由：/api/gzh-publisher/dsh-image-models
 */
export async function handleDshModelsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: Context,
): Promise<void> {
  if (handleCors(req, res)) return
  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: '仅允许同源或本地请求' })
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: '仅支持 GET 请求' })
    return
  }
  try {
    const models = await discoverDshImageModels(ctx)
    sendJson(res, 200, { ok: true, models })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error) })
  }
}

/**
 * 注册主 dsh 模型发现 API 路由：/api/gzh-publisher/dsh-image-models
 */
export function registerDshModelRoutes(ctx: Context): void {
  ctx.inject(['webServer'], (serverCtx) => {
    if (!serverCtx.webServer) return
    serverCtx.webServer.register({
      kind: 'exact',
      path: '/api/gzh-publisher/dsh-image-models',
      handler: (req, res) => handleDshModelsRoute(req, res, ctx),
    })
  })
}
