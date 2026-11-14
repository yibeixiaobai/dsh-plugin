/**
 * 设置配置与工作区环境运行时评估器 (Settings & Workspace Runtime Evaluator)
 * 职责：
 * 1. 严格落实设置配置单一物理事实来源（Single Source of Truth）；
 * 2. 演练模式真值硬控与层级判定（工作区本地磁盘 -> 内存配置 -> 系统全局物理磁盘）；
 * 3. 生图 API 双层继承自愈与本地工作区自动回写；
 * 4. 活跃工作区上下文记忆，防止流水线多步调用漏传 workspace 参数导致脱轨。
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Config, ImageApiConfig } from '../config.ts'
import { workspaceDir } from '../sync.ts'
import { getGlobalPublisherConfigFiles } from '../wincodeHome.ts'

let lastActiveWorkspacePath: string | undefined

/**
 * 记录最近一次活跃的任务工作区路径（解决智能体在生图等多步流水线中漏传 workspace 参数导致上下文丢失）
 */
export function recordActiveWorkspace(ws?: string): void {
  if (ws && typeof ws === 'string' && ws.trim()) {
    lastActiveWorkspacePath = ws.trim()
  }
}

/**
 * 获取当前记录的活跃任务工作区路径
 */
export function getActiveWorkspace(): string | undefined {
  return lastActiveWorkspacePath
}

/**
 * 严格检测设置配置中是否开启了演练模式 (Settings-Grounded Dry Run Detection)：
 * 【用户铁律架构设计】：
 * 1. 唯一事实来源：用户在插件设置配置（全局 ~/.wincode/v2/social-publisher/publisher_config.json）中显式配置了 dry_run === true；
 * 2. 全局单一事实源：社媒发布的设置配置保持在全局 .wincode 中，不向项目文件夹复制，杜绝项目本地旧配置冲突；
 * 3. 若全局设置配置中为 false 或未开启，绝不因外部传参、环境推断或网络失败而误走演练模式；
 * 4. 只有设置中显式开启了演练模式，才允许进入演练模式。
 */
export function isDryRunEnabledInSettings(cfg: Partial<Config> | undefined, _explicitWorkspace?: string): boolean {
  // 1. 若运行时传入的内存配置 cfg 明确指定（如单元测试或受控沙箱注入），优先以其为准，杜绝外部开发机环境污染
  if (typeof cfg?.runtime?.dry_run === 'boolean') {
    return cfg.runtime.dry_run
  }

  // 2. 生产运行时实时探测系统全局唯一主配置文件（~/.wincode/...）最新落盘事实
  for (const filePath of getGlobalPublisherConfigFiles()) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        if (raw && typeof raw === 'object') {
          if (raw.runtime && typeof raw.runtime === 'object' && typeof raw.runtime.dry_run === 'boolean') {
            return raw.runtime.dry_run
          }
          if (typeof raw.dry_run === 'boolean') {
            return raw.dry_run
          }
        }
      }
    } catch {}
  }

  return false
}

/**
 * 生图 API 与 Provider 配置双层自愈继承机制：
 * 1. 优先读取工作区 publisher_config.json 的 image_api / image_providers；
 * 2. 若本地未配置或 api_key 为空，自动从系统全局（~/.wincode/... 或历史 ~/.wincode/...）继承；
 * 3. 实现 image_api 与 image_providers 双向自动对齐：
 *    - 若 image_providers 含有有效凭据，自动对齐至 image_api；
 *    - 若 image_api 含有有效凭据，自动对齐至 image_providers['default']；
 * 4. 自动将全局生图凭据回填（Auto Backfill）至工作区本地，杜绝因本地配置缺少 API Key 导致误入本地 mock 演练图。
 */
export function resolveEffectiveImageApi(cfg: Config, explicitWorkspace?: string): Config['image_api'] {
  const hasValidApi = (api?: Partial<Config['image_api']>) => Boolean(api && api.api_key && api.api_key.trim())
  const hasValidProvider = (prov?: any) => Boolean(prov && prov.enabled !== false && prov.api_key && String(prov.api_key).trim())

  // 双向同步助手：确保 cfg 内部 image_api 与 image_providers 双向对齐
  const alignConfigApiAndProviders = (target: Partial<Config>) => {
    if (!target.image_providers) (target as any).image_providers = {}
    if (!target.image_api) (target as any).image_api = {}

    // 如果 image_api 有效但 image_providers 没有有效 default，则自动挂载 default
    if (hasValidApi(target.image_api)) {
      const existingDefault = (target.image_providers as any)['default']
      if (!hasValidProvider(existingDefault)) {
        ;(target.image_providers as any)['default'] = {
          name: '默认生图接口',
          enabled: true,
          base_url: target.image_api!.base_url || 'https://api.openai.com',
          api_key: target.image_api!.api_key!.trim(),
          model: target.image_api!.model || 'gpt-image-2',
          priority: 10,
        }
      }
    }

    // 反向：如果 image_providers 存在有效 provider，但 image_api 缺失，自动从优先级最高的 provider 提取
    if (!hasValidApi(target.image_api)) {
      const validEntry = Object.entries(target.image_providers || {})
        .find(([, p]) => hasValidProvider(p))
      if (validEntry) {
        const [, p] = validEntry as [string, any]
        target.image_api!.base_url = p.base_url || target.image_api!.base_url || 'https://api.openai.com'
        target.image_api!.api_key = p.api_key.trim()
        target.image_api!.model = p.model || target.image_api!.model || 'gpt-image-2'
      }
    }
  }

  alignConfigApiAndProviders(cfg)

  if (hasValidApi(cfg.image_api)) {
    return cfg.image_api
  }

  // 优先从全局配置候选路径探测有效的生图 API Key
  for (const filePath of getGlobalPublisherConfigFiles()) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        if (raw && typeof raw === 'object') {
          alignConfigApiAndProviders(raw)

          if (hasValidApi(raw.image_api)) {
            Object.assign(cfg.image_api!, raw.image_api)
            if (raw.image_providers && typeof raw.image_providers === 'object') {
              for (const [pId, pVal] of Object.entries(raw.image_providers)) {
                if (pVal && typeof pVal === 'object' && !(cfg.image_providers as any)[pId]) {
                  ;(cfg.image_providers as any)[pId] = JSON.parse(JSON.stringify(pVal))
                }
              }
            }
            if (Array.isArray(raw.image_api_pool) && (!(cfg as any).image_api_pool || (cfg as any).image_api_pool.length === 0)) {
              ;(cfg as any).image_api_pool = raw.image_api_pool
            }

            alignConfigApiAndProviders(cfg)

            // 【架构规范】：项目目录只放产物，不再向本地项目工作区回写配置副本，全局维护单一凭据真值
            return cfg.image_api
          }
        }
      }
    } catch {}
  }

  return (cfg.image_api || {}) as ImageApiConfig
}
