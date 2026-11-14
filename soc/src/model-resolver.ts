/**
 * 社媒发布生图模型解析桥接层
 * 收敛统一生图模型解析算法，消除多头读盘与分裂分叉。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getWinCodeHome } from './wincodeHome.ts'

export interface ProjectImageModelInfo {
  providerId: string
  modelId: string
  name?: string
  apiKey?: string
  baseUrl?: string
  priority: number
}

function getCandidateProviderConfigPaths(workspacePath?: string): string[] {
  const paths: string[] = []
  const userHome = os.homedir()

  if (workspacePath && typeof workspacePath === 'string' && workspacePath.trim()) {
    const ws = workspacePath.trim()
    paths.push(path.join(ws, '.dsh', 'provider_config.json'))
    paths.push(path.join(ws, '.wincode', 'provider_config.json'))
    paths.push(path.join(ws, '.social-publisher', 'provider_config.json'))
  }

  paths.push(path.join(userHome, '.dsh', 'provider_config.json'))
  paths.push(path.join(userHome, '.dsh', 'social-publisher', 'provider_config.json'))
  paths.push(path.join(getWinCodeHome(), 'v2', 'provider_config.json'))
  paths.push(path.join(getWinCodeHome(), 'provider_config.json'))
  paths.push(path.join(userHome, '.wincode', 'v2', 'provider_config.json'))
  paths.push(path.join(userHome, '.wincode', 'provider_config.json'))

  return Array.from(new Set(paths))
}

function parseImageModelsFromConfig(rawConfig: any): ProjectImageModelInfo[] {
  const result: ProjectImageModelInfo[] = []
  let priority = 1

  // 1. Support v2 providerConfigRules / providerModelRules format
  const v2Rules = rawConfig.config?.providerConfigRules?.providerRules || rawConfig.providerConfigRules?.providerRules
  const v2ModelRules = rawConfig.config?.modelConfigRules?.providerModelRules || rawConfig.modelConfigRules?.providerModelRules
  if (Array.isArray(v2Rules)) {
    const imageRegex = /(?:image|flux|dall-?e|cogview|stable-?diffusion|midjourney|ideogram|recraft|wanx)/i
    for (const rule of v2Rules) {
      if (!rule || typeof rule !== 'object') continue
      const providerId = String(rule.providerId || '')
      const providerName = rule.providerName || providerId
      const apiKey = rule.config?.access?.apiKey || rule.access?.apiKey || ''
      const baseUrl = rule.config?.api?.baseUrl || rule.api?.baseUrl || ''
      const personalModelIds = rule.config?.personalModelIds || rule.personalModelIds || []

      const imageModels = new Set<string>()
      for (const mId of personalModelIds) {
        if (typeof mId === 'string' && imageRegex.test(mId)) {
          imageModels.add(mId)
        }
      }
      if (Array.isArray(v2ModelRules)) {
        for (const mr of v2ModelRules) {
          if (mr.providerId === providerId && mr.modelId) {
            const outFormat = mr.config?.properties?.outputFormat
            if (outFormat?.supportsImage === true || imageRegex.test(mr.modelId)) {
              imageModels.add(mr.modelId)
            }
          }
        }
      }
      for (const modelId of imageModels) {
        result.push({
          providerId,
          modelId,
          name: `${providerName}/${modelId}`,
          apiKey,
          baseUrl,
          priority: priority++,
        })
      }
    }
  }

  // 2. Support classic format: image_providers || imageProviders || providers
  const providers = rawConfig.image_providers || rawConfig.imageProviders || rawConfig.providers || {}

  for (const [providerId, provider] of Object.entries(providers) as [string, any][]) {
    if (!provider || typeof provider !== 'object') continue
    const apiKey = provider.api_key || provider.apiKey || ''
    const baseUrl = provider.base_url || provider.baseUrl || ''
    const models = Array.isArray(provider.models) ? provider.models : [provider.model || 'default']

    for (const modelId of models) {
      if (typeof modelId !== 'string' || !modelId.trim()) continue
      if (!result.some(r => r.providerId === providerId && r.modelId === modelId)) {
        result.push({
          providerId,
          modelId,
          name: provider.name || `${providerId}/${modelId}`,
          apiKey,
          baseUrl,
          priority: priority++,
        })
      }
    }
  }

  return result
}

export function resolveProjectImageModels(workspacePath?: string): ProjectImageModelInfo[] {
  const candidatePaths = getCandidateProviderConfigPaths(workspacePath)
  let rawConfig: any = null

  for (const cfgPath of candidatePaths) {
    if (fs.existsSync(cfgPath)) {
      try {
        const text = fs.readFileSync(cfgPath, 'utf-8')
        const parsed = JSON.parse(text)
        if (parsed && (parsed.image_providers || parsed.imageProviders || parsed.providers || parsed.config)) {
          rawConfig = parsed
          break
        }
      } catch {}
    }
  }

  if (!rawConfig) {
    return []
  }

  return parseImageModelsFromConfig(rawConfig)
}

export function resolveDefaultImageModelSetting(workspacePath?: string): string {
  if (process.env.DSH_DEFAULT_IMAGE_MODEL) return process.env.DSH_DEFAULT_IMAGE_MODEL.trim()
  const candidatePaths = getCandidateProviderConfigPaths(workspacePath)
  for (const cfgPath of candidatePaths) {
    if (fs.existsSync(cfgPath)) {
      try {
        const text = fs.readFileSync(cfgPath, 'utf-8')
        const parsed = JSON.parse(text)
        const val = parsed.defaultImageModel || parsed.config?.defaultImageModel || parsed.default_image_model
        if (typeof val === 'string' && val.trim()) return val.trim()
      } catch {}
    }
  }
  const userHome = os.homedir()
  const settingsPaths = [
    path.join(userHome, '.wincode', 'v2', 'setting.json'),
    path.join(userHome, '.wincode', 'setting.json'),
    path.join(userHome, '.dsh', 'settings.json'),
  ]
  for (const sPath of settingsPaths) {
    if (fs.existsSync(sPath)) {
      try {
        const text = fs.readFileSync(sPath, 'utf-8')
        const parsed = JSON.parse(text)
        const val = parsed.defaultImageModel || parsed.default_image_model
        if (typeof val === 'string' && val.trim()) return val.trim()
      } catch {}
    }
  }
  return 'auto'
}

export function resolveDefaultProjectImageModel(workspacePath?: string): ProjectImageModelInfo | null {
  const models = resolveProjectImageModels(workspacePath)
  const defaultSetting = resolveDefaultImageModelSetting(workspacePath)

  if (defaultSetting && defaultSetting !== 'auto') {
    const matched = models.find(m =>
      `${m.providerId}/${m.modelId}` === defaultSetting || m.modelId === defaultSetting,
    )
    if (matched) return matched
  }

  // Auto mode: Prioritize WinCode official account gpt-image-2.5, then failover to other ready models
  const officialModel = models.find(m =>
    (m.providerId === 'win00-official' || m.providerId === 'wincode-account')
    && m.modelId.includes('gpt-image')
    && Boolean(m.apiKey)
    && Boolean(m.baseUrl),
  )
  if (officialModel) return officialModel

  const readyModel = models.find(m => Boolean(m.apiKey) && Boolean(m.baseUrl))
  return readyModel || models[0] || null
}
