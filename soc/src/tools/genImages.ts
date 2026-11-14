import { searchAndDownloadWebImage } from './browserImageSearcher.ts'
import fs from 'node:fs'
import path from 'node:path'
import type { Context } from '../tool-compat.ts'
import { defineTool } from '../tool-compat.ts'
import type { CoverRatio } from '../types.ts'
import {
  type Config,
  XHS_COVER_RATIO,
  ZHIHU_COVER_RATIO,
  BAIJIAHAO_COVER_RATIO,
  TOUTIAO_COVER_RATIO,
} from '../config.ts'
import { providerPool, resolveAccount } from '../config-runtime.ts'
import { discoverDshImageModels } from '../dsh-models.ts'
import { resolveProjectImageModels } from '../model-resolver.ts'
import { syncConfig } from '../sync.ts'
import {
  assertImageCreds,
  detectRealtimeDryRun,
  getActiveWorkspace,
  isDryRunEnabledInSettings,
  recordActiveWorkspace,
  removeJobFile,
  renderJson,
  resolveCoverRatio,
  resolveEffectiveImageApi,
  runPipeline,
  writeJobFile,
} from './shared.ts'
import { assertDiskSpaceAvailable } from '../diskSpaceGuard.ts'
import { assertStrictImageQuota } from './genImagesQuotaValidator.ts'
import {
  checkAndDeductQuotaDirect,
  rollbackQuotaDirect,
  type DeductionRecord,
} from './imageQuota.ts'
import {
  assertGenerateImagesOrder,
  calculateManifestFingerprint,
  recordImagesGenerated,
  resolveTaskSandbox,
} from '../sandbox/taskSandbox.ts'
import { executeDryRunGenImages } from './genImagesDryRun.ts'
import { assertImageGenerationOutcome } from './genImagesGuidance.ts'
import { handleWebImageSearchPrepass, registerGeneratedImagesToSandbox } from './genImagesSearchHelper.ts'
import { assembleImageProviders } from './genImagesProviderHelper.ts'
import { imageCircuitBreaker } from './imageCircuitBreaker.ts'
import { buildEnhancedGenItems, resolveTaskEffectiveTitles } from './genImagesPrompts.ts'
import type { GenItem, GenReport, ImageItemInput } from './genImagesTypes.ts'
export function genImagesTool(cfg: Config, ctx?: Context) {
  return defineTool<
    {
      items_json?: string | any[]
      items?: any[]
      account_id?: string
      platform?: string
      titles?: string[]
      timeout_ms?: number
      dry_run?: boolean
      task_id?: string
      workspace?: string
    },
    GenReport
  >({
    name: 'gzh_generate_images',
    description:
      'AI 生图与网络搜图协同：封面、正文高清插图及小绿书卡片图。只设计 AI 生图与搜图，彻底杜绝任何代码画图。多线程并发生图加速，支持同接口备用模型与接口池自动轮换。' +
      '公众号长文封面比例头条 ' +
      (cfg.image_api?.headline_cover_ratio || '2.35:1') +
      ' / 次条 ' +
      (cfg.image_api?.secondary_cover_ratio || '1:1') +
      '；小绿书卡片图（kind: pic）统一按账号配置比例生成；知乎账号统一 ' +
      ZHIHU_COVER_RATIO +
      '。' +
      '按生图接口优先级执行：任何接口级失败自动切换下一个接口，成功后保持该接口。演练模式（dry_run）只校验不联网。' +
      '【产物路径规则与免检原则】：本工具内部自动按照确定性命名与路径规则在账号目录生成图片并落盘，每次调用均为全新任务写入，调用者严禁检查本地已有图片或扫描旧文件夹内容。',
    parameters: {
      items_json: {
        type: 'string',
        description:
          '生图与搜图任务列表：支持传入 JSON 数组字符串或直接传对象数组。每项如 {"kind":"cover","index":1,"prompt":"封面提示词"}、' +
          '{"kind":"content","index":1,"sub":1,"prompt":"正文插图提示词","source":"search","search_query":"关键词"}、' +
          '{"kind":"content","index":1,"sub":1,"prompt":"正文插图提示词"} 或 {"kind":"pic","index":1,"sub":1,"prompt":"小绿书卡片提示词"}。' +
          'cover 自动落盘 cover_{index}.png，content 落盘 content_{index}_{sub}.png，pic 落盘 pic_{index}_{sub}.png',
      },
      items: {
        type: 'array',
        description: '生图任务对象数组（可选，若 items_json 已传可不传）',
      },
      platform: {
        type: 'string',
        description:
          '可选：指定社媒平台（gzh / zhihu / xiaohongshu / baijiahao / toutiao），缺省结合账号或默认账号确定',
        enum: ['gzh', 'zhihu', 'xiaohongshu', 'baijiahao', 'toutiao'],
      },
      task_id: {
        type: 'string',
        description:
          '可选：任务批次 ID（如 task_YYYYMMDD_xxxx）；用于沙箱物理隔离，缺省自动分配或沿用当前活跃沙箱',
      },
      account_id: {
        type: 'string',
        description: '社媒账号 ID；缺省结合 platform 自动寻找启用账号，或回退至默认账号',
      },
      titles: {
        type: 'array',
        description:
          '可选：每篇文章标题数组（用于封面图提示词自动注入标题文字渲染约束，确保封面与选题匹配）',
        items: { type: 'string' },
      },
      timeout_ms: {
        type: 'number',
        description:
          '可选：自定义生图执行超时时间（毫秒，默认 300000ms/5分钟，多图批处理可按需调大）',
      },
      dry_run: {
        type: 'boolean',
        description:
          '可选：演练模式标志。必须在设置中显式开启演练模式后方可为 true；若设置未开启严禁传入 true；遇到生图或物料故障必须直接向用户汇报，严禁私用演练伪造占位物料！',
      },
      workspace: {
        type: 'string',
        description: '可选：执行该任务会话所属的项目文件夹绝对路径（确保配图落盘于当前项目工作区）',
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
          '严禁直接调用散装工具 gzh_generate_images。\n' +
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
      const isSettingsDry = isDryRunEnabledInSettings(cfg, effectiveWs)
      // 中文注释：严格限制演练模式使用，若设置中未开启演练模式，严禁调用者传入 dry_run: true 伪造占位物料
      if (args.dry_run === true && !isSettingsDry) {
        throw new Error(
          '❌ 【演练模式越权拦截】：当前系统设置未开启演练模式 (runtime.dry_run !== true)！严禁在正式生产发布中擅自启用 dry_run 伪造占位物料。遇到配图或网络异常，必须直接向用户汇报真实问题，交还控制权等待用户处理。',
        )
      }
      const dryRun = isSettingsDry
      const account = resolveAccount(cfg, args.account_id, args.platform)
      const count = account.profile.content?.articles_per_day || 1
      const newspicCount = account.profile.content?.newspic_articles_per_day || 1
      const titles = Array.isArray(args.titles) ? args.titles.map(String) : []
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
      const isNewspic =
        account.profile.platform === 'xiaohongshu' ||
        (args.platform === 'gzh' && (args as any).article_type === 'newspic') ||
        inputs.some(it => it.kind === 'pic')
      const sandbox = resolveTaskSandbox(
        cfg,
        args.task_id,
        args.platform || account.profile.platform,
        account.id,
        isNewspic ? 'newspic' : 'news',
        sessionId,
        effectiveWs,
      )
      // 【中文修复依据】：自动自愈有效真实标题，防止重绘或漏传 titles 时出现占位符
      const effectiveTitles = resolveTaskEffectiveTitles(titles, sandbox, Math.max(count, inputs.length))
      const items = buildEnhancedGenItems({ rawItems: inputs, account, titles: effectiveTitles, cfg })
      const genDir = sandbox.targetGroup.imagesDir
      assertStrictImageQuota({ cfg, account, items, isNewspic })
      await assertDiskSpaceAvailable({ targetDir: genDir })
      // 【中文修复依据】：多篇任务流水线阶段与顺序门禁检查
      const targetIndexes = Array.from(new Set(items.map(it => it.index)))
      assertGenerateImagesOrder({
        sandbox,
        targetIndexes,
        totalArticles: Math.max(count, targetIndexes.length),
      })
      // 演练模式 100% 物理绝对阻断：绝不发起任何外部网络生图请求，直接在账号目录生成合法尺寸的演练占位图
      if (dryRun) {
        recordImagesGenerated(sandbox, targetIndexes, cfg)
        return executeDryRunGenImages({
          cfg,
          account,
          sandbox,
          items,
          titles,
        })
      }
      const allProviders = assembleImageProviders(cfg, effectiveWs)
      const providers = imageCircuitBreaker.filterHealthyProviders(allProviders)
      if (providers.length === 0) {
        throw new Error(
          '【未配置生图模型】：当前社媒发布默认采用项目模型设置中的生图模型，不再使用社媒发布菜单下的生图接口。系统未检测到勾选了【生图】输出类型的模型，请前往【模型设置】勾选相应模型的生图输出类型，或开启演练模式。',
        )
      }
      syncConfig(cfg)
      const primaryModel = providers[0]?.provider?.model ?? cfg.image_api?.model ?? ''
      // 【自适应动态超时】：FLUX 20s，DALL-E 3 / gpt-image 40s，通用 30s 快速熔断
      const m = primaryModel.toLowerCase()
      const adaptiveSec = m.includes('flux') ? 20 : (m.includes('dall-e') || m.includes('gpt-image')) ? 40 : 30
      const timeoutSecPerItem = Math.max(15, adaptiveSec)
      // 【中文修复依据】：解除单线程锁，默认支持 3~4 并发多线程并行生图，大幅缩短配图排队耗时
      const concurrency = Math.max(1, Math.min(4, Number(cfg.image_api?.concurrency || 3)))
      // 【自动轮换】：多张配图按已启用的生图模型池进行 Round-Robin 轮换绑定，打散单一模型特征
      // [中文修复依据]：执行真实网络素材搜图预处理，命中的搜图项免大模型生图配额直接落盘；搜图失败平滑放行至 AI 绘图保底
      const { remainingItems, searchGenerated } = await handleWebImageSearchPrepass({
        cfg,
        account,
        items,
        genDir,
        dryRun,
        titles: effectiveTitles,
      })
      if (remainingItems.length === 0) {
        // 【中文修复依据】：全搜图场景下，将所有搜图产物全量登记入沙箱 Manifest 并生成镜像副本
        registerGeneratedImagesToSandbox(searchGenerated, items, sandbox, genDir, cfg, account)
        recordImagesGenerated(sandbox, targetIndexes, cfg)
        return {
          account_id: account.id,
          task_id: sandbox.taskId,
          manifest_fingerprint: calculateManifestFingerprint(sandbox.manifest),
          generated: searchGenerated,
          failed: [],
          dry_run: false,
        }
      }
      const primaryProvider = providers[0]?.provider
      const rotatedItems = remainingItems.map((it, itemIdx) => {
        // [中文修复依据]：确保每个 item 的 out 字段带有绝对路径基准，避免 Native 引擎在当前 cwd 错乱落盘
        const resolvedOut = path.isAbsolute(it.out) ? it.out : path.join(genDir, it.out)
        return {
          ...it,
          out: resolvedOut,
          zh_only: it.zh_only,
          preferred_provider_id: providers[itemIdx % providers.length]?.id,
        }
      })

      const legacyZhOnly = account.profile.content?.image_lang_zh_only ?? true
      const coverZhOnly = Boolean(account.profile.content?.cover_lang_zh_only ?? legacyZhOnly)
      const contentZhOnly = Boolean(
        account.profile.content?.content_image_lang_zh_only ?? legacyZhOnly,
      )

      const job = {
        items: rotatedItems,
        provider_ids: providers.map(({ id }) => id),
        providers: providers.map(({ id, provider }) => ({ id, ...provider })),
        // [中文修复依据]：向顶层平铺首选模型凭据与脚本沙箱目录，保持与原生 TypeScript 生图引擎契约一致
        model: primaryProvider?.model ?? cfg.image_api?.model ?? 'dall-e-3',
        api_key: primaryProvider?.api_key,
        api_base: primaryProvider?.base_url,
        scripts_dir: genDir,
        dry_run: dryRun,
        cover_zh_only: coverZhOnly,
        content_zh_only: contentZhOnly,
        zh_only: coverZhOnly && contentZhOnly,
        concurrency,
        timeout_sec: timeoutSecPerItem,
      }
      // job 落临时文件而非 --job-json 内联：批量图片（25+ 项，含 providers 配置与绝对路径）内联会逼近 Windows argv 上限
      // 复用沙箱 genDir (sandbox.targetGroup.imagesDir)
      const jobFile = writeJobFile(genDir, job, 'genimg')
      // 【中文修复依据】：T点计费单位与云端完全统一为“图片张数”而非历史“篇数”；
      // 根据经过搜图预处理后实际需要调大模型绘图的项数 (remainingItems.length) 准确核扣 T点，杜绝篇与张的记账偏差
      const actualImageCount = remainingItems.length
      let quotaDeductionRecord: DeductionRecord | null = null
      // [中文修复依据]：仅在调用官方模型 (win00-official) 时计算扣除 T点；用户自备第三方生图 Provider 时完全免费不消耗任何 T点
      const isOfficialImageProvider = Boolean(
        primaryProvider?.providerId === 'win00-official' ||
        providers[0]?.id?.includes('win00-official'),
      )
      if (!dryRun && isOfficialImageProvider && actualImageCount > 0) {
        quotaDeductionRecord = checkAndDeductQuotaDirect(actualImageCount)
      }

      let report: Omit<GenReport, 'account_id'>
      const genStartTime = Date.now()
      try {
        // [中文修复依据]：传给 --job 必须使用 jobFile.file 绝对路径，杜绝跨进程 cwd 判定失败导致 jobSpec 为空
        report = await runPipeline<Omit<GenReport, 'account_id'>>(
          cfg,
          'gen_images_pipeline.py',
          ['--job', jobFile.file, '--scripts-dir', genDir],
          Math.max(
            180000,
            Math.ceil(items.length / concurrency) * (timeoutSecPerItem * 2 + 10) * 1000,
          ),
        )
        const elapsed = Date.now() - genStartTime
        if (providers[0]?.id) {
          imageCircuitBreaker.recordSuccess(providers[0].id, elapsed)
        }
      } catch (pipelineErr) {
        if (providers[0]?.id) {
          imageCircuitBreaker.recordFailure(providers[0].id, pipelineErr)
        }
        if (quotaDeductionRecord) {
          rollbackQuotaDirect(quotaDeductionRecord)
        }

        // [中文修复依据]：AI 生图遭遇 ECONNRESET、超时或端点网络不可达时，自动启动真实素材搜图应急降级保底，避免整个流水线中断
        const errMsg = String(pipelineErr instanceof Error ? pipelineErr.message : pipelineErr)
        const isNetworkFailure = /ECONNRESET|ETIMEDOUT|fetch failed|网络连接超时|连接失败|端点异常|status 50/i.test(errMsg)

        if (isNetworkFailure && !dryRun && remainingItems.length > 0) {
          const fallbackGenerated: Array<{ out: string; w?: number; h?: number; dry_run?: boolean; fallback?: boolean; source?: string }> = []
          const browserCacheDir = path.join(genDir, '.browser_cache')
          const usedUrls = new Set<string>()

          for (const it of remainingItems) {
            const destPath = path.isAbsolute(it.out) ? it.out : path.join(genDir, it.out)
            const articleTitle = effectiveTitles[it.index - 1] || ''
            const promptSnippet = it.prompt.split(/[；;，,]/)[0].trim()
            const rawQuery = it.search_query || (articleTitle ? `${articleTitle} 实务` : promptSnippet) || '前沿科技'
            const query = rawQuery.replace(/[#\s/\\<>:"|?*]/g, ' ').trim().slice(0, 30)
            try {
              const res = await searchAndDownloadWebImage(query, destPath, {
                cfg,
                timeoutMs: 15000,
                userDataDir: browserCacheDir,
                articleIndex: it.index,
                usedUrls,
              })
              if (res.success && fs.existsSync(destPath)) {
                fallbackGenerated.push({
                  out: it.out,
                  w: res.width || 1080,
                  h: res.height || 720,
                  dry_run: false,
                  fallback: true,
                  source: 'web_search_fallback',
                })
              }
            } catch {}
          }

          if (fallbackGenerated.length === remainingItems.length) {
            report = {
              generated: fallbackGenerated,
              failed: [],
              dry_run: false,
            }
          } else {
            throw pipelineErr
          }
        } else {
          throw pipelineErr
        }
      } finally {
        removeJobFile(jobFile.dir, jobFile.name)
      }

      // [中文修复依据]：配图结果强制校验与用户指引拦截，严禁 Agent 自写脚本自救
      assertImageGenerationOutcome({
        remainingCount: remainingItems.length,
        generated: report.generated,
        failed: report.failed,
        dryRun,
      })

      // 【中文修复依据】：将搜图成功物料与 AI 生图物料全量登记入沙箱 Manifest，并合并至最终 generated 清单
      const fullGenerated = [...searchGenerated, ...(Array.isArray(report.generated) ? report.generated : [])]
      registerGeneratedImagesToSandbox(fullGenerated, items, sandbox, genDir, cfg, account)

      return {
        account_id: account.id,
        task_id: sandbox.taskId,
        manifest_fingerprint: calculateManifestFingerprint(sandbox.manifest),
        ...report,
        generated: fullGenerated,
      }
    },
  })
}
