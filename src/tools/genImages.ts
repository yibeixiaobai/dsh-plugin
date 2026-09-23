import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { COVER_SIZES, type Config, ZHIHU_COVER_RATIO, type CoverRatio } from '../config.ts'
import { providerPool, resolveAccount } from '../config-runtime.ts'
import { discoverDshImageModels } from '../dsh-models.ts'
import { syncConfig } from '../sync.ts'
import { accountScriptsDir, assertImageCreds, contentImagesPerArticle, renderJson, runPipeline } from './shared.ts'

interface GenItem {
  kind: 'cover' | 'content' | 'pic'
  index: number
  sub?: number
  prompt: string
  out: string
  size: [number, number]
}

interface GenReport {
  account_id: string
  generated: Array<{ out: string; w?: number; h?: number; dry_run?: boolean; fallback?: boolean }>
  failed: Array<{ index?: number; sub?: number; error: string }>
  dry_run: boolean
  provider_used?: string
  provider_attempts?: Array<{ provider_id: string; error: string }>
}

interface ImageItemInput {
  kind?: string
  type?: string
  index: number | string
  sub?: number | string
  prompt?: string
  description?: string
  text?: string
}

export function genImagesTool(cfg: Config, ctx?: Context) {
  return defineTool<{ items_json?: string | any[]; items?: any[]; account_id?: string }, GenReport>({
    name: 'gzh_generate_images',
    description:
      'AI 生图：封面、正文信息图及小绿书卡片图。多线程并发生图加速，支持同接口备用模型与本地优雅降级保底。' +
      '公众号长文封面比例头条 ' + cfg.image_api.headline_cover_ratio + ' / 次条 ' +
      cfg.image_api.secondary_cover_ratio + '；小绿书卡片图（kind: pic）统一按账号配置比例生成；知乎账号统一 ' + ZHIHU_COVER_RATIO + '。' +
      '按生图接口优先级执行：任何接口级失败自动切换下一个接口，成功后保持该接口；全网接口失败自动触发本地优雅保底。演练模式（dry_run）只校验不联网。',
    parameters: {
      items_json: {
        type: 'string',
        description:
          '生图任务列表：支持传入 JSON 数组字符串或直接传对象数组。每项如 {"kind":"cover","index":1,"prompt":"封面提示词"}、' +
          '{"kind":"content","index":1,"sub":1,"prompt":"信息图提示词"} 或 {"kind":"pic","index":1,"sub":1,"prompt":"小绿书卡片提示词"}。' +
          'cover 自动落盘 cover_{index}.png，content 落盘 content_{index}_{sub}.png，pic 落盘 pic_{index}_{sub}.png',
      },
      items: {
        type: 'array',
        description: '生图任务对象数组（可选，若 items_json 已传可不传）',
      },
      account_id: {
        type: 'string',
        description: '公众号账号 ID；缺省使用默认账号，用于读取该账号的每日文章数',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      const count = account.profile.content.articles_per_day
      const newspicCount = account.profile.content.newspic_articles_per_day || 1
      let inputs: ImageItemInput[] = []
      const raw = args.items ?? args.items_json
      if (!raw) {
        throw new Error('缺少 items_json 或 items 参数，请传入生图任务列表')
      }
      if (Array.isArray(raw)) {
        inputs = raw as ImageItemInput[]
      } else if (typeof raw === 'string') {
        try {
          inputs = JSON.parse(raw) as ImageItemInput[]
        } catch {
          throw new Error('items_json 不是合法 JSON: ' + String(raw).slice(0, 100))
        }
      } else if (typeof raw === 'object') {
        inputs = [raw as ImageItemInput]
      }
      if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('生图任务列表不能为空')

      const items: GenItem[] = inputs.map((it) => {
        const index = Number(it.index)
        const prompt = String(it.prompt || it.description || it.text || '').trim()
        if (!prompt) throw new Error('prompt 提示词不能为空')
        const rawKind = String(it.kind || it.type || '').trim().toLowerCase()
        const maxIdx = rawKind === 'pic' ? newspicCount : count
        if (!Number.isInteger(index) || index < 1 || index > maxIdx) {
          throw new Error('index 必须是 1~' + maxIdx)
        }
        if (rawKind === 'pic') {
          const sub = Number(it.sub ?? 1)
          if (!Number.isInteger(sub) || sub < 1 || sub > 20) {
            throw new Error('pic 图 sub 必须是 1~20（按小绿书卡片张数）')
          }
          const ratio = (account.profile.content.newspic_image_ratio || '3:4') as CoverRatio
          const picSize = COVER_SIZES[ratio] || COVER_SIZES['3:4']
          return {
            kind: 'pic', index, sub, prompt,
            out: 'pic_' + index + '_' + sub + '.png',
            size: [...picSize] as [number, number],
          }
        }
        const isCover = rawKind === 'cover' || (!it.sub && rawKind !== 'content')
        if (isCover) {
          // 知乎封面统一 16:9（机器强制）；公众号按设置的头条/次条比例
          const ratio = account.profile.platform === 'zhihu'
            ? ZHIHU_COVER_RATIO
            : (index === 1 ? cfg.image_api.headline_cover_ratio : cfg.image_api.secondary_cover_ratio)
          return {
            kind: 'cover', index, prompt,
            out: 'cover_' + index + '.png', size: [...COVER_SIZES[ratio]] as [number, number],
          }
        }
        // content 正文图
        const sub = Number(it.sub ?? 1)
        const limit = contentImagesPerArticle(cfg)
        if (limit === 0) throw new Error('设置的每篇正文配图数为 0，不生成正文配图（IMG_A*）')
        if (!Number.isInteger(sub) || sub < 1 || sub > limit) {
          throw new Error('content 图 sub 必须是 1~' + limit + '（按设置的每篇正文配图数）')
        }
        return {
          kind: 'content', index, sub, prompt,
          out: 'content_' + index + '_' + sub + '.png', size: [1080, 0],
        }
      })

      const dryRun = cfg.runtime.dry_run
      let providers = providerPool(cfg)
      if (!dryRun && providers.length === 0 && ctx) {
        try {
          const dshModels = await discoverDshImageModels(ctx)
          const usable = dshModels.filter((m) => m.base_url && m.api_key)
          if (usable.length > 0) {
            providers = usable.map((m, idx) => ({
              id: 'dsh-' + m.provider + '-' + m.model_id,
              provider: {
                enabled: true,
                name: `主dsh-${m.provider_name}-${m.model_name}`,
                base_url: m.base_url!,
                api_key: m.api_key!,
                model: m.model_id,
                priority: 900 + idx,
              },
            }))
          }
        } catch {
          /* 忽略主 dsh 模型探测失败 */
        }
      }

      const enableFallback = cfg.image_api.enable_local_fallback ?? true
      if (!dryRun && providers.length === 0 && !enableFallback) {
        throw new Error('没有启用的生图接口，且未开启本地降级保底')
      }

      syncConfig(cfg)

      const timeoutSecPerItem = Math.max(60, Math.round((cfg.runtime.request_timeout_ms || 30000) / 1000))
      const concurrency = Math.max(1, Math.min(10, Number(cfg.image_api.concurrency || 3)))
      const job = {
        items,
        provider_ids: providers.map(({ id }) => id),
        providers: providers.map(({ id, provider }) => ({ id, ...provider })),
        model: providers[0]?.provider.model ?? cfg.image_api.model,
        dry_run: dryRun,
        zh_only: cfg.image_api.image_lang_zh_only,
        concurrency,
        enable_local_fallback: enableFallback,
        timeout_sec: timeoutSecPerItem,
      }
      const report = await runPipeline<Omit<GenReport, 'account_id'>>(
        cfg,
        'gen_images_pipeline.py',
        ['--job-json', JSON.stringify(job), '--scripts-dir', accountScriptsDir(cfg, account.id)],
        Math.max(180000, Math.ceil(items.length / concurrency) * (timeoutSecPerItem * 2 + 10) * 1000),
      )
      return { account_id: account.id, ...report }
    },
  })
}
