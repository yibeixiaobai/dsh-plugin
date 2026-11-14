import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '../tool-compat.ts'
import type { Config } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import { accountScriptsDir, detectRealtimeDryRun, isDryRunEnabledInSettings, renderJson } from './shared.ts'
import { adapterRegistry } from '../adapters/index.ts'
import type { PublishContext } from '../adapters/types.ts'
import { CloudflareWorkerClient } from '../cf-worker/client.ts'
import { checkAccountLoginHealth } from '../session-manager.ts'
import { resolveTraceId } from '../diagnostics/index.ts'
import { calculateManifestFingerprint, resolveTaskSandbox, archiveTaskSandbox, sealTaskSandbox, verifyReviewSignature, writeTaskManifest } from '../sandbox/taskSandbox.ts'
import { formatPublishResponse } from './publishResponseHelper.ts'
import { enforceAntiDumpScan } from '../security/antiDumpWatchdog.ts'
import { adaptTitleForPlatform, isInvalidPlaceholderTitle } from '../title-adapter.ts'

import type { ZhihuDraftInfo, PublishOk, PublishArgs, WechatOriginalResult } from './publishTypes.ts'
export type { ZhihuDraftInfo, PublishOk, PublishArgs }

export function publishTool(cfg: Config) {
  return defineTool<PublishArgs, PublishOk>({
    name: 'gzh_publish_draft',
    description: '社媒文章与草稿发布服务，支持将已创作的内容保存至平台草稿箱或设置定时发布。',
    parameters: {
      titles: {
        type: 'array',
        required: true,
        description: '每篇标题（长文/百家号 ≤64 字，小绿书/小红书 ≤32 字，知乎 ≤100 字，头条号 ≤30 字），数量须与 digests 一致（支持补充要求自定义篇数 1~20 篇）',
        items: { type: 'string' },
      },
      digests: {
        type: 'array',
        required: true,
        description: '每篇摘要（≤120 字）；数量必须与 titles 数量一致',
        items: { type: 'string' },
      },
      article_files: {
        type: 'array',
        description: '可选：自定义文章文件名（scripts 目录内）；缺省长文用 article_v2_1..N.html，小绿书用 article_v2_1..N_pic.json，知乎/百家号/头条号用 article_v2_1..N.md，小红书用 article_v2_1..N_xhs.txt',
        items: { type: 'string' },
      },
      platform: {
        type: 'string', description: '可选：指定社媒平台（gzh / zhihu / xiaohongshu / baijiahao / toutiao），缺省结合账号或默认账号确定',
        enum: ['gzh', 'zhihu', 'xiaohongshu', 'baijiahao', 'toutiao'],
      },
      article_type: {
        type: 'string', description: '可选：指定发布的文章形态（news=长图文草稿，newspic=小绿书图片消息草稿）；缺省按账号设置',
        enum: ['news', 'newspic'],
      },
      publish_mode: {
        type: 'string', description: '可选：指定发布方案（api=官方 API 接口，browser=免 API 浏览器自动化）；缺省按账号配置 publish_mode（默认 api）',
        enum: ['api', 'browser'],
      },
      force: {
        type: 'boolean', description: '可选：强制发布，跳过防重复创建检查（默认 false 自动拦截相同标题或超出篇数配额的重复调用）',
      },
      account_id: {
        type: 'string', description: '账号 ID；缺省结合 platform 自动寻找启用账号，或回退至默认账号',
      },
      auto_enable_original: {
        type: 'boolean', description: '可选：草稿发布成功后，是否自动通过浏览器模拟打开草稿箱批量开启文字原创并保存（缺省采用账号配置 auto_enable_original）',
      },
      publish_action: {
        type: 'string', description: '可选：发布动作（draft=仅存为草稿箱，publish_now=立即正式发布，schedule=定时发布）；缺省严格读取账号配置的 publish_action_default（如配置为 schedule 则自动走微信后台原生定时发布，严禁无故默认为 draft）',
        enum: ['draft', 'publish_now', 'schedule'],
      },
      schedule_time: {
        type: 'string', description:
          '可选：当 publish_action=schedule 时的定时发布时间。微信公众号定时发表完全由微信公众平台官方后台原生托管（无本地定时进程）。若用户在任务提示/备注中有明确要求具体时间（如 16:00、明天09:30、+2h 等），必须填入（备注要求最高优先级）；若用户未明确指定具体时间，请保持留空或传 "auto"，系统将自动按照账号时间规则并排查微信后台已同步排期，优先选择离当前时间最近的无任务时间段。',
      },
      auto_sync_schedule: {
        type: 'boolean', description: '可选：当 publish_action=schedule 时，是否在排期前自动从微信公众平台首页同步最新定时任务列表以确保时段事实源最新（默认 true）',
      },
      auto_clean_duplicates: {
        type: 'boolean', description: '可选：当 publish_action=schedule 或创建草稿时，是否自动拉取最新草稿箱并清理同名重复冗余草稿（默认 true）',
      },
      duplicate_keep_strategy: {
        type: 'string', description: '可选：清理重复冗余草稿时的保留策略（keep_latest=保留最新，keep_complete=保留最完整，keep_oldest=保留最早；默认 keep_latest）',
        enum: ['keep_latest', 'keep_complete', 'keep_oldest'],
      },
      dry_run: {
        type: 'boolean', description: '可选：演练模式标志。必须在设置中显式开启演练模式后方可为 true；若设置未开启严禁传入 true；遇到发布异常请直接向用户汇报！',
      },
      owner_task_id: {
        type: 'string', description: '可选：关联的发起该发布操作的宿主聊天会话 ID，用于右侧受控浏览器侧边栏精准隔离。',
      },
      trace_id: {
        type: 'string', description: '可选：全链路 Trace ID，缺省自动生成或沿用会话追踪标记',
      },
      task_id: {
        type: 'string', description: '可选：任务批次 ID（如 task_YYYYMMDD_xxxx）；用于沙箱物理隔离，缺省自动分配或沿用当前活跃沙箱',
      },
      signed_manifest_hash: {
        type: 'string', description: '可选：用户审校确认时的物料清单全量签名指纹（sha256）；发布前严格比对防错版，不一致时硬性拦截',
      },
      signed_article_hashes: {
        type: 'object',
        description: '可选：按篇独立审校签名指纹映射表（篇号 -> 签名指纹）；支持单篇或局部发布独立放行',
      },
      target_article_indices: {
        type: 'array',
        description: '可选：局部发布目标篇目序号列表（如 [1] 仅发布第 1 篇）',
        items: { type: 'number' },
      },
      combine_as_batch: {
        type: 'boolean', description: '可选：微信公众号多篇长文是否组合为一个多图文合辑草稿（定时发布缺省 false 独立多槽位，草稿/群发缺省 true）',
      },
      user_confirmed: {
        type: 'boolean', description: '【发布门禁强校验】：是否已获得用户在图文审校预览卡片中的明确确认（或用户在对话中明确发出了发布确认指令）。未获得用户审校确认前严禁擅自调用！缺省 false',
      },
      workspace: {
        type: 'string', description: '可选：执行该任务会话所属的项目文件夹绝对路径',
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
      const resolvedOwnerTaskId = args.owner_task_id || (toolContext as any)?.sessionId
      const effectiveTraceId = resolveTraceId(args.trace_id || (toolContext as any)?.traceId || resolvedOwnerTaskId)
      const sessionId = (toolContext as any)?.sessionId
      const effectiveWs = args.workspace || (toolContext as any)?.workspacePath || (toolContext as any)?.cwd
      // 0. 统一工具收敛强拦截：严禁直接调用底层散装 gzh_publish_draft 工具
      if (!args.from_unified_tool && !args.force) {
        throw new Error(
          '❌ 【发布工具规范拦截】：严禁直接调用底层散装工具 gzh_publish_draft！\n' +
          '所有平台的发布、存草稿与定时排期任务，必须统一调用社媒发布插件唯一指定的统一集成工具：\n' +
          '👉 social_publisher(action: "publish", account_id: "...", task_id: "...", user_confirmed: true)\n' +
          '请立即改用 social_publisher 统一工具执行发布。',
        )
      }

      // 发布门禁强拦截：未获用户明确确认且非 force 模式时，物理拦截发布
      if (args.user_confirmed !== true && !args.force) {
        throw new Error(
          '【发布强门禁拦截】：稿件尚未经过用户审校确认！请务必在当前轮次向用户呈现图文预览卡片与生成效果，等待用户确认发布指令后，方可传入 user_confirmed: true 执行正式推送到草稿箱。',
        )
      }

      // 计算本次有效演练模式开关（严格以设置配置为准，未开启时禁止调用方越权开启）
      const isSettingsDry = isDryRunEnabledInSettings(cfg, effectiveWs)
      if (args.dry_run === true && !isSettingsDry) {
        throw new Error(
          '❌ 【演练模式越权拦截】：当前系统设置未开启演练模式 (runtime.dry_run !== true)！严禁在正式发布流程中擅自传入 dry_run: true 伪造发布回执。',
        )
      }
      const isDryRun = isSettingsDry
      const effectiveCfg: Config = {
        ...cfg,
        runtime: {
          ...(cfg.runtime || {}),
          dry_run: isDryRun,
        } as any,
      }

      // 1. 定位账号并解析目标适配器
      const account = resolveAccount(effectiveCfg, args.account_id, args.platform)
      const rawPlatform = account.profile.platform || args.platform || 'gzh'
      const adapter = adapterRegistry.get(rawPlatform)

      const sandbox = resolveTaskSandbox(effectiveCfg, args.task_id, rawPlatform, account.id, args.article_type, sessionId, effectiveWs)
      const sdir = sandbox.targetGroup.targetDir || accountScriptsDir(effectiveCfg, account.id)

      // 0.2 审校签名指纹防错版硬闸门：实盘模式强制要求校验审校指纹，严禁绕过审校推流
      const hasArticleHashes = Boolean(args.signed_article_hashes && Object.keys(args.signed_article_hashes).length > 0)
      if (!isDryRun && !args.force) {
        if (!args.signed_manifest_hash && !hasArticleHashes) {
          throw new Error(
            '【发布防错版拦截】：实盘发布强制要求提供人机审校签名指纹 (signed_manifest_hash 或 signed_article_hashes)！未经过图文审校预览与签名严禁擅自推送到官方后台。',
          )
        }
        const sigRes = verifyReviewSignature(sandbox.manifest, args.signed_manifest_hash, {
          isDryRun,
          targetKey: sandbox.targetKey,
          targetArticleIndices: args.target_article_indices,
          signedArticleHashes: args.signed_article_hashes,
        })
        if (!sigRes.valid) {
          throw new Error(`【发布防错版拦截】：${sigRes.reason}`)
        }
      } else if (args.signed_manifest_hash || hasArticleHashes) {
        const sigRes = verifyReviewSignature(sandbox.manifest, args.signed_manifest_hash, {
          isDryRun,
          targetKey: sandbox.targetKey,
          targetArticleIndices: args.target_article_indices,
          signedArticleHashes: args.signed_article_hashes,
        })
        if (!sigRes.valid) {
          throw new Error(`【发布防错版拦截】：${sigRes.reason}`)
        }
      }

      // 0.3 封签锁定沙箱（Publish Seal）：执行任何类型发布指令，立即物理锁定沙箱物料不可变
      if (typeof sealTaskSandbox === 'function') {
        try { sealTaskSandbox(effectiveCfg, sandbox.manifest, effectiveWs) } catch (e) { console.warn('[publish] seal non-fatal:', e) }
      }

      // 2. 组装标准发布执行上下文（精准按长文/小绿书形态过滤与自动数量对齐）
      const isNewspic = args.article_type === 'newspic'
      const rawSandboxed = sandbox.targetGroup.articles || []
      // 【中文修复依据】：严禁长文（6篇）与小绿书（1篇）混在一起导致 digests 数量不匹配
      const sandboxedArticles = rawSandboxed.filter(a =>
        isNewspic ? ((a as any).kind === 'newspic' || a.fileName?.includes('_pic.json')) : ((a as any).kind !== 'newspic' && !a.fileName?.includes('_pic.json')),
      )
      // 【底层硬性约束修复】：公众号多篇长文（≥2篇）在未显式传入 force_single_article 或 combine_as_batch=false 时，
      // 无论当前动作是 schedule、draft 还是 publish_now，一律底层默认强制作为多图文合辑组合发布，
      // 彻底杜绝在定时排期或默认动作下被误拆分为单篇离散上传或漏发的问题。
      const isGzhLongNews = rawPlatform === 'gzh' && !isNewspic
      const isExplicitSingle = Boolean((args as any).force_single_article)
      const hasMultipleArticles = sandboxedArticles.length > 1
      const shouldCombine = args.combine_as_batch !== undefined
        ? Boolean(args.combine_as_batch)
        : (isGzhLongNews && hasMultipleArticles && !isExplicitSingle ? true : true)

      let rawTitles = (args.titles && args.titles.length > 0)
        ? [...args.titles]
        : sandboxedArticles.map(a => a.title).filter(Boolean)

      if (isGzhLongNews && sandboxedArticles.length > 1 && rawTitles.length < sandboxedArticles.length && !isExplicitSingle && shouldCombine) {
        console.log(`[social-publisher] 账号 ${account.id} 沙箱中存在 ${sandboxedArticles.length} 篇长文，底层强制扩展为完整多图文合辑组合发布（共 ${sandboxedArticles.length} 篇）`)
        rawTitles = sandboxedArticles.map(a => a.title).filter(Boolean)
      }
      const resolvedTitles: string[] = []
      let manifestUpdated = false
      for (let i = 0; i < rawTitles.length; i++) {
        let t = (rawTitles[i] || '').trim()
        if (isInvalidPlaceholderTitle(t)) {
          const matchedArticle = sandboxedArticles[i]
          const candidatePath = matchedArticle?.filePath || (matchedArticle?.fileName ? path.join(sdir, matchedArticle.fileName) : '')
          let healed = ''
          if (candidatePath && fs.existsSync(candidatePath)) {
            try {
              const fileContent = fs.readFileSync(candidatePath, 'utf-8')
              const h2Match = fileContent.match(/<section[^>]*style="[^"]*background:[^"]*"[^>]*>.*?<span[^>]*>([^<]{4,64})<\/span>.*?<\/section>/)
                || fileContent.match(/<h2[^>]*>(?:<span[^>]*>)?([^<]{4,64})(?:<\/span>)?<\/h2>/)
              if (h2Match && !isInvalidPlaceholderTitle(h2Match[1])) healed = h2Match[1].trim()
              if (!healed) {
                const bookMatch = fileContent.match(/《([^》]{4,60})》/)
                if (bookMatch && !isInvalidPlaceholderTitle(bookMatch[1])) healed = bookMatch[1].trim()
              }
              if (!healed) {
                const titleMetaMatch = fileContent.match(/<!--\s*TITLE:\s*([^\n\r]+?)\s*-->/i) || fileContent.match(/^#\s+([^\n\r]{4,64})/m)
                if (titleMetaMatch && !isInvalidPlaceholderTitle(titleMetaMatch[1])) healed = titleMetaMatch[1].trim()
              }
            } catch {}
          }
          if (healed) {
            t = healed
            if (matchedArticle) { matchedArticle.title = healed; manifestUpdated = true }
          } else {
            throw new Error(`【发布安全硬阻断】：第 ${i + 1} 篇文章标题为无效占位符「${t}」，且未能自愈提取出有效业务标题！严禁推送到微信公众号官方后台，请先使用有效真实标题重新构建文章。`)
          }
        }
        resolvedTitles.push(t)
      }
      if (manifestUpdated) {
        try { writeTaskManifest(effectiveCfg, sandbox.manifest) } catch {}
      }
      const effectiveTitles = resolvedTitles
      const targetCount = effectiveTitles.length
      const rawDigests = (args.digests && args.digests.length > 0) ? args.digests : sandboxedArticles.map(a => a.digest || '')
      const effectiveDigests = Array.from({ length: targetCount }, (_, i) => rawDigests[i] || '')
      const rawFiles = (args.article_files && args.article_files.length > 0)
        ? args.article_files
        : sandboxedArticles.map(a => (a.filePath && fs.existsSync(a.filePath) ? a.filePath : a.fileName)).filter(Boolean) as string[]
      const effectiveArticleFiles = rawFiles.slice(0, targetCount)
      const normalizedTitles = effectiveTitles.map(t => adaptTitleForPlatform(t, adapter.capabilities.id, isNewspic).title)

      const context: PublishContext = {
        cfg: effectiveCfg,
        accountId: account.id,
        ownerTaskId: resolvedOwnerTaskId,
        platform: adapter.capabilities.id,
        titles: normalizedTitles,
        digests: effectiveDigests,
        articleFiles: effectiveArticleFiles,
        articleType: args.article_type,
        publishMode: args.publish_mode,
        publishAction: args.publish_action,
        scheduleTime: args.schedule_time,
        force: args.force,
        autoEnableOriginal: args.auto_enable_original,
        scriptsDir: sdir,
        autoSyncSchedule: args.auto_sync_schedule,
        autoCleanDuplicates: args.auto_clean_duplicates,
        duplicateKeepStrategy: args.duplicate_keep_strategy === 'newest'
          ? 'keep_latest'
          : args.duplicate_keep_strategy === 'oldest'
            ? 'keep_oldest'
            : (args.duplicate_keep_strategy as any),
        dryRun: isDryRun,
        traceId: effectiveTraceId,
        taskId: sandbox.taskId,
        sandbox,
        signedManifestHash: args.signed_manifest_hash,
        signedArticleHashes: args.signed_article_hashes,
        targetArticleIndices: args.target_article_indices,
        combineAsBatch: shouldCombine,
      }

      // 3. 执行适配器前置参数与合规校验
      const validation = await adapter.validateBeforePublish(context)
      if (!validation.valid && validation.errors.length > 0) {
        throw new Error(validation.errors.join('\n'))
      }

      // 3.1 前置登录态真实健康度熔断预检 (Pre-flight Login Health Guard)
      const hasApiCreds = Boolean(account.profile.appid && account.profile.app_secret)
      const requiresBrowserSession =
        adapter.capabilities.id !== 'gzh' ||
        (context.publishMode || account.profile.publish_mode) === 'browser' ||
        Boolean(context.autoEnableOriginal ?? account.profile.auto_enable_original) ||
        (hasApiCreds && (context.publishAction === 'schedule' || context.publishAction === 'publish_now'))

      if (!isDryRun && requiresBrowserSession) {
        const loginHealth = await checkAccountLoginHealth(effectiveCfg, adapter.capabilities.id, account.id, {
          forceProbe: true,
        })
        if (!loginHealth.loggedIn) {
          context.needsInteractiveLogin = true
        }
      }

      // 3.5. Cloudflare Worker 边缘加密动态配方流处理
      const cfClient = new CloudflareWorkerClient(effectiveCfg.cloudflare_worker)
      let cfRecipeId: string | undefined
      let encryptedUsed = false

      if (cfClient.isEnabled()) {
        try {
          // 【纵深防御】：发布前执行工作区防脱壳看门狗巡检
          await enforceAntiDumpScan(effectiveWs, cfClient)

          const ticket = await cfClient.fetchEncryptedRecipe({
            platform: adapter.capabilities.id,
            accountId: account.id,
            titles: normalizedTitles,
            digests: effectiveDigests,
            articleFiles: effectiveArticleFiles,
            publishAction: args.publish_action,
            scheduleTime: args.schedule_time,
            dryRun: isDryRun,
            taskId: sandbox.taskId || args.task_id,
            manifestHash: args.signed_manifest_hash || (sandbox.manifest ? calculateManifestFingerprint(sandbox.manifest) : undefined),
            signedReviewToken: args.signed_manifest_hash,
          })
          cfRecipeId = ticket.recipeId
          encryptedUsed = true
          context.recipeTicket = ticket
          context.encryptedWorkflowUsed = true
          console.log(`[social-publisher] 🚀 【云端管控】：已成功从 Cloudflare Worker (wokers.win00.cn) 获取并解密发文工单: ${ticket.recipeId} (有效期至 ${new Date(ticket.expireAt).toLocaleTimeString()})，包含 ${ticket.actions.length} 项原子动作`)
        } catch (cfErr: unknown) {
          const errMsg = cfErr instanceof Error ? cfErr.message : String(cfErr)
          throw new Error(`【安全门禁拦截】：Cloudflare 边缘发文调度工单获取失败: ${errMsg}。本地明文通道已永久关闭！`)
        }
      } else {
        throw new Error('【安全门禁拦截】：系统已强制开启云端防篡改加密发布，但当前未配置或未启用 Cloudflare Worker 服务！')
      }

      if (!context.recipeTicket) {
        throw new Error('【安全门禁拦截】：未获得有效解密的云端发文调度工单 (RecipeTicket)，严禁在本地降级执行明文发文脚本！')
      }

      // 4. 调用适配器核心发布逻辑（强制盲执行，严禁降级回退）
      const res = await adapter.publish(context)

      // 4.5. 异步向 Cloudflare Worker 上报审计结果
      if (cfClient.isEnabled() && encryptedUsed && cfRecipeId) {
        cfClient.reportVerifyResult({
          recipeId: cfRecipeId,
          platform: res.platform,
          accountId: res.accountId,
          titles: res.titles,
          status: res.scheduleError ? 'failed' : 'success',
          mediaId: res.mediaId,
        }).catch(() => {})
      }

      // 5. 格式化并映射为完全向后兼容的 PublishOk 响应
      return formatPublishResponse({
        res,
        sandbox,
        effectiveCfg,
        isDryRun,
        effectiveTraceId,
        cfRecipeId,
        encryptedUsed,
      })
    },
  })
}
