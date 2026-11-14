import { defineTool } from '../tool-compat.ts'
import type { Config } from '../config.ts'
import { renderJson, getActiveWorkspace, recordActiveWorkspace } from './shared.ts'
import { resolveAccount } from '../config-runtime.ts'
import { normalizePlatform } from '../config.ts'
import {
  calculateManifestFingerprint,
  resolveTaskSandbox,
} from '../sandbox/taskSandbox.ts'
import {
  executeSingleArticleBuild,
  type BuildOk,
  type SingleArticleBuildInput,
} from './buildArticle.ts'

export interface ArticleBatchItemInput {
  doc?: Record<string, unknown>
  doc_json?: string
  index?: number
  title?: string
}

export interface BuildBatchOk {
  account_id: string
  task_id?: string
  manifest_fingerprint?: string
  total: number
  passed: boolean
  articles: BuildOk[]
  errors?: string[]
}

export function buildArticleBatchTool(cfg: Config) {
  return defineTool<
    {
      articles: ArticleBatchItemInput[]
      account_id?: string
      platform?: string
      task_id?: string
      workspace?: string
      concurrency?: number
    },
    BuildBatchOk
  >({
    name: 'gzh_build_articles_batch',
    description:
      '批量并发构建多篇长文/卡片产物并落盘（大幅缩短多篇创作耗时）：' +
      '主 Agent 一次性提交全部 1..N 篇 doc spec 或大纲，底层通过高并发管线并行渲染单行 HTML、Markdown 或小红书卡片，' +
      '自动更新任务沙箱与 Manifest。免去单篇逐轮调用的冗长等待。',
    parameters: {
      articles: {
        type: 'array',
        required: true,
        description: '待构建的文章列表（每项包含 doc spec JSON 对象或 doc_json 字符串）',
        items: { type: 'object' },
      },
      platform: {
        type: 'string',
        description: '可选：指定社媒平台（gzh / zhihu / xiaohongshu / baijiahao / toutiao）',
        enum: ['gzh', 'zhihu', 'xiaohongshu', 'baijiahao', 'toutiao'],
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省结合 platform 自动寻找启用账号，或回退至默认账号',
      },
      task_id: {
        type: 'string',
        description: '可选：任务批次 ID（如 task_YYYYMMDD_xxxx）；用于沙箱物理隔离，缺省自动分配或沿用当前活跃沙箱',
      },
      workspace: {
        type: 'string',
        description: '可选：执行该任务会话所属的项目文件夹绝对路径（确保产物落盘于当前项目工作区）',
      },
      concurrency: {
        type: 'number',
        description: '可选：并发构建线程数（默认 4，支持 1~8 并发）',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: renderJson,
    },
    async execute(args, toolContext) {
      if (!(args as any).from_unified_tool && !(args as any).force) {
        throw new Error(
          '❌ 【社媒工具统一收敛拦截】：系统已全面升级为极简确定性流水线！\n' +
          '严禁直接调用散装工具 gzh_build_articles_batch。\n' +
          '请改用社媒发布插件唯一指定的统一门面工具：\n' +
          '👉 创作阶段：social_publisher(action: "produce", account_id: "...", articles: [...] 或 title/content)\n' +
          '👉 发布阶段：social_publisher(action: "publish", account_id: "...", task_id: "...", user_confirmed: true)',
        )
      }
      const sessionId = (toolContext as any)?.sessionId
      const effectiveWs =
        args.workspace ||
        (toolContext as any)?.workspacePath ||
        (toolContext as any)?.cwd ||
        getActiveWorkspace()
      if (effectiveWs) {
        recordActiveWorkspace(effectiveWs)
      }

      const account = resolveAccount(cfg, args.account_id, args.platform)
      const platform = normalizePlatform(account.profile.platform)
      const rawItems = Array.isArray(args.articles) ? args.articles : []
      if (rawItems.length === 0) {
        throw new Error('articles 列表不能为空，请至少提供一篇待构建文章')
      }

      const maxParallel = Math.max(1, Math.min(8, Number(args.concurrency || 4)))
      const results: BuildOk[] = []
      const errors: string[] = []

      // 使用异步并发块处理批量文章构建
      for (let i = 0; i < rawItems.length; i += maxParallel) {
        const chunk = rawItems.slice(i, i + maxParallel)
        const chunkPromises = chunk.map(async (item, chunkIdx) => {
          const itemIdx = item.index ?? (i + chunkIdx + 1)
          const singleInput: SingleArticleBuildInput = {
            doc: item.doc,
            doc_json: item.doc_json,
            account_id: args.account_id,
            platform: args.platform,
            task_id: args.task_id,
            workspace: effectiveWs,
            isBatch: true, // 核心：标记批处理模式，放行前置跳号拦截
          }
          try {
            const built = await executeSingleArticleBuild(cfg, singleInput, toolContext)
            return { ok: true as const, built }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            return { ok: false as const, index: itemIdx, error: msg }
          }
        })

        const chunkOutcomes = await Promise.all(chunkPromises)
        for (const out of chunkOutcomes) {
          if (out.ok) {
            results.push(out.built)
          } else {
            errors.push(`第 ${out.index} 篇构建失败: ${out.error}`)
          }
        }
      }

      const sandbox = resolveTaskSandbox(
        cfg,
        args.task_id,
        platform,
        account.id,
        undefined,
        sessionId,
        effectiveWs,
      )

      if (errors.length > 0) {
        throw new Error(`【批量构建部分失败】（${results.length}/${rawItems.length} 成功）：\n${errors.join('\n')}`)
      }

      return {
        account_id: account.id,
        task_id: sandbox.taskId,
        manifest_fingerprint: calculateManifestFingerprint(sandbox.manifest),
        total: results.length,
        passed: true,
        articles: results.sort((a, b) => a.index - b.index),
      }
    },
  })
}
