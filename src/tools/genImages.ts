import { defineTool } from '@deepseek-ai/dsh-tools'
import { COVER_SIZES, type Config } from '../config.ts'
import { providerPool, resolveAccount } from '../config-runtime.ts'
import { assertImageCreds, renderJson, runPipeline, scriptsDir } from './shared.ts'

interface GenItem {
  kind: 'cover' | 'content'
  index: number
  sub?: number
  prompt: string
  out: string
  size: [number, number]
}

interface GenReport {
  account_id: string
  generated: Array<{ out: string; w?: number; h?: number; dry_run?: boolean }>
  failed: Array<{ index?: number; sub?: number; error: string }>
  dry_run: boolean
  provider_used?: string
  provider_attempts?: Array<{ provider_id: string; error: string }>
}

interface ImageItemInput {
  kind: string
  index: number
  sub?: number
  prompt: string
}

export function genImagesTool(cfg: Config) {
  return defineTool<{ items_json: string; account_id?: string }, GenReport>({
    name: 'gzh_generate_images',
    description:
      'AI 生图：封面（头条 ' + cfg.image_api.headline_cover_ratio + ' / 次条 ' + cfg.image_api.secondary_cover_ratio +
      '）与正文信息图。按生图接口优先级执行，可重试错误自动切换并保持成功接口。' +
      '演练模式（设置中 dry_run）只校验不联网。',
    parameters: {
      items_json: {
        type: 'string',
        required: true,
        description:
          '生图任务 JSON 数组字符串，每项 {"kind":"cover","index":1,"prompt":"封面提示词（标题+副标题）"} ' +
          '或 {"kind":"content","index":2,"sub":1,"prompt":"信息图提示词"}。cover 自动落盘 cover_{index}.png，' +
          'content 落盘 content_{index}_{sub}.png',
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
      let inputs: ImageItemInput[]
      try {
        inputs = JSON.parse(args.items_json) as ImageItemInput[]
      } catch {
        throw new Error('items_json 不是合法 JSON')
      }
      if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('items_json 不能为空数组')

      const items: GenItem[] = inputs.map((it) => {
        const index = Number(it.index)
        if (!Number.isInteger(index) || index < 1 || index > count) {
          throw new Error('index 必须是 1~' + count)
        }
        if (!it.prompt || typeof it.prompt !== 'string') throw new Error('prompt 不能为空')
        if (it.kind === 'cover') {
          const ratio = index === 1 ? cfg.image_api.headline_cover_ratio : cfg.image_api.secondary_cover_ratio
          return {
            kind: 'cover', index, prompt: it.prompt,
            out: 'cover_' + index + '.png', size: [...COVER_SIZES[ratio]] as [number, number],
          }
        }
        if (it.kind === 'content') {
          const sub = Number(it.sub ?? 1)
          if (!Number.isInteger(sub) || sub < 1 || sub > 4) throw new Error('content 图 sub 必须是 1~4')
          return {
            kind: 'content', index, sub, prompt: it.prompt,
            out: 'content_' + index + '_' + sub + '.png', size: [1080, 0],
          }
        }
        throw new Error("kind 必须是 'cover' 或 'content'，得到: " + String(it.kind))
      })

      const dryRun = cfg.runtime.dry_run
      if (!dryRun) assertImageCreds(cfg)
      const providers = providerPool(cfg)
      if (!dryRun && providers.length === 0) throw new Error('没有启用的生图接口')

      const job = {
        items,
        provider_ids: providers.map(({ id }) => id),
        model: providers[0]?.provider.model ?? cfg.image_api.model,
        dry_run: dryRun,
        zh_only: cfg.image_api.image_lang_zh_only,
        timeout_sec: Math.max(30, Math.round(cfg.runtime.request_timeout_ms / 1000) * 4),
      }
      const report = await runPipeline<Omit<GenReport, 'account_id'>>(
        cfg,
        'gen_images_pipeline.py',
        ['--job-json', JSON.stringify(job), '--scripts-dir', scriptsDir(cfg)],
        Math.max(60000, items.length * 180000),
      )
      return { account_id: account.id, ...report }
    },
  })
}
