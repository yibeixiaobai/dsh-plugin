/**
 * 社媒多篇任务顺序生产流水线守护模块 (Task Sandbox Pipeline Guard)
 * 遵循 specs/social-publisher-task-isolation-and-dedup.md 第 15 条规范
 * 核心目标：物理状态机门禁，彻底杜绝多篇长文生产过程中“想到哪个做哪个”的乱序、跳跃与提前偷跑行为。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Config, AccountProfile } from '../config.ts'
import type {
  PipelineMode,
  PipelineTracker,
  TaskSandboxContext,
} from './taskSandboxTypes.ts'

/**
 * 原子持久化 Manifest
 */
function persistManifest(sandbox: TaskSandboxContext): void {
  try {
    if (!sandbox.manifestPath) return
    sandbox.manifest.updatedAt = new Date().toISOString()
    const manifestFile = sandbox.manifestPath
    const dir = path.dirname(manifestFile)
    fs.mkdirSync(dir, { recursive: true })
    const tmpFile = manifestFile + `.tmp_${Date.now()}`
    fs.writeFileSync(tmpFile, JSON.stringify(sandbox.manifest, null, 2) + '\n', 'utf-8')
    fs.renameSync(tmpFile, manifestFile)
  } catch {
    /* 忽略轻量级原子重命名异常 */
  }
}

/**
 * 智能解析当前任务生效的流水线模式：
 * 1. 优先从用户指令 request 中提取显式意图（最高优先级）
 * 2. 其次读取账号配置 content.multi_article_pipeline_mode
 * 3. 其次读取全局配置 runtime.multi_article_pipeline_mode
 * 4. 默认回退为 'batch_phase'（先生文后统一生图，批量推荐）
 */
export function resolveEffectivePipelineMode(params: {
  cfg?: Partial<Config>
  accountProfile?: AccountProfile
  request?: string
  totalArticles?: number
}): PipelineMode {
  const req = (params.request || '').trim()
  if (/(?:逐篇|一篇一生图|逐一生文生图|边写边配图|逐篇搞定)/i.test(req)) {
    return 'per_article'
  }
  if (/(?:先生文后生图|先写完再配图|统一生图|批量配图)/i.test(req)) {
    return 'batch_phase'
  }

  const accountMode = params.accountProfile?.content?.multi_article_pipeline_mode
  if (accountMode === 'per_article' || accountMode === 'batch_phase') {
    return accountMode
  }

  const runtimeMode = (params.cfg?.runtime as any)?.multi_article_pipeline_mode
  if (runtimeMode === 'per_article' || runtimeMode === 'batch_phase') {
    return runtimeMode
  }

  return 'batch_phase'
}

/**
 * 初始化或自愈沙箱内的流水线追踪状态
 */
export function ensurePipelineTracker(
  sandbox: TaskSandboxContext,
  expectedTotalArticles: number,
  mode?: PipelineMode,
): PipelineTracker {
  const existingArticles = sandbox.targetGroup?.articles || []
  const writtenFromDisk = existingArticles
    .filter(a => a.filePath && fs.existsSync(a.filePath))
    .map(a => a.index)
    .sort((a, b) => a - b)

  const imagedFromDisk = existingArticles
    .filter(a => a.coverImage?.path && fs.existsSync(a.coverImage.path))
    .map(a => a.index)
    .sort((a, b) => a - b)

  const resolvedTotal = Math.max(
    expectedTotalArticles || 1,
    writtenFromDisk.length,
    1,
  )

  let tracker = sandbox.manifest.pipelineTracker
  if (!tracker) {
    tracker = {
      mode: mode || 'batch_phase',
      totalArticles: resolvedTotal,
      writtenIndexes: writtenFromDisk,
      imagedIndexes: imagedFromDisk,
      phase: writtenFromDisk.length >= resolvedTotal && writtenFromDisk.length > 0 ? 'imaging' : 'writing',
    }
    sandbox.manifest.pipelineTracker = tracker
  } else {
    // 动态融合磁盘真实状态，防止因重启丢失
    tracker.writtenIndexes = Array.from(new Set([...tracker.writtenIndexes, ...writtenFromDisk])).sort((a, b) => a - b)
    tracker.imagedIndexes = Array.from(new Set([...tracker.imagedIndexes, ...imagedFromDisk])).sort((a, b) => a - b)
    if (expectedTotalArticles > tracker.totalArticles) {
      tracker.totalArticles = expectedTotalArticles
    }
    if (mode && tracker.mode !== mode) {
      tracker.mode = mode
    }
    if (tracker.writtenIndexes.length >= tracker.totalArticles && tracker.phase === 'writing') {
      tracker.phase = 'imaging'
    }
  }

  return tracker
}

/**
 * 生文前置流水线顺序门禁校验
 * 违背顺序时物理抛出错误硬拦截，并给出下一步唯一正确操作
 */
export function assertBuildArticleOrder(params: {
  sandbox: TaskSandboxContext
  index: number
  totalArticles: number
  mode?: PipelineMode
  isBatch?: boolean
}): void {
  const { sandbox, index, totalArticles, isBatch } = params
  if (totalArticles <= 1 || isBatch) {
    // 单篇长文任务或原生批处理模式无跨篇时序冲突，直接放行
    return
  }

  const tracker = ensurePipelineTracker(sandbox, totalArticles, params.mode)
  const currentMode = tracker.mode

  if (currentMode === 'batch_phase') {
    // 先生文后统一生图模式
    if ((tracker.phase === 'imaging' || tracker.phase === 'reviewing') && tracker.imagedIndexes.length > 0) {
      throw new Error(
        `❌ 【流水线阶段拦截】：当前沙箱 [${sandbox.taskId}] 处于「先生文后统一生图」模式，且已进入批量配图阶段（已为篇目 ${tracker.imagedIndexes.join('、')} 配图）！\n` +
        '严禁在配图阶段乱序反向调用 gzh_build_article 修改或追加正文！\n' +
        '【下一步操作】：请继续完成剩余配图，或在最终审校预览卡片中进行微调。',
      )
    }

    // 检查篇序是否跳号递增：如已完成 [1]，欲写第 3 篇（漏了 2）
    if (index > 1) {
      const missingBefore: number[] = []
      for (let i = 1; i < index; i++) {
        if (!tracker.writtenIndexes.includes(i)) {
          missingBefore.push(i)
        }
      }
      if (missingBefore.length > 0) {
        const nextReq = missingBefore[0]
        throw new Error(
          '❌ 【流水线顺序拦截】：当前处于「先生文后统一生图」模式！多篇文案必须按篇序单调递增构建！\n' +
          `试图构建第 ${index} 篇，但前序第 ${missingBefore.join('、')} 篇正文尚未构建落盘！\n` +
          `👉 【下一步唯一正确操作】：请先调用 gzh_build_article(index: ${nextReq}) 撰写并构建第 ${nextReq} 篇文案。`,
        )
      }
    }
  } else if (currentMode === 'per_article') {
    // 逐一生文生图模式
    if (index > 1) {
      const prev = index - 1
      const prevWritten = tracker.writtenIndexes.includes(prev)
      const prevImaged = tracker.imagedIndexes.includes(prev)

      if (!prevWritten) {
        throw new Error(
          `❌ 【流水线顺序拦截】：当前处于「逐一生文生图」模式！第 ${prev} 篇文案尚未构建！\n` +
          `👉 【下一步唯一正确操作】：请先调用 gzh_build_article(index: ${prev}) 构建第 ${prev} 篇文案。`,
        )
      }
      if (!prevImaged) {
        throw new Error(
          `❌ 【流水线顺序拦截】：当前处于「逐一生文生图」模式！第 ${prev} 篇稿件尚未完成封面与插图配图，严禁跳跃至第 ${index} 篇生文！\n` +
          `👉 【下一步唯一正确操作】：请立即调用 gzh_generate_images 为第 ${prev} 篇完成配图闭环后，再开启第 ${index} 篇文案撰写。`,
        )
      }
    }
  }
}

/**
 * 生图前置流水线阶段与顺序门禁校验
 * 违背阶段依赖或跨篇乱序时物理抛出错误硬拦截，并给出下一步唯一正确操作
 */
export function assertGenerateImagesOrder(params: {
  sandbox: TaskSandboxContext
  targetIndexes: number[]
  totalArticles: number
  mode?: PipelineMode
}): void {
  const { sandbox, targetIndexes, totalArticles } = params
  if (totalArticles <= 1 && targetIndexes.length <= 1) {
    // 单篇长文任务直接放行
    return
  }

  const tracker = ensurePipelineTracker(sandbox, totalArticles, params.mode)
  const currentMode = tracker.mode

  if (currentMode === 'batch_phase') {
    // 先生文后统一生图模式：必须等到 1..totalArticles 全部文案物理落盘后，才允许开启生图！
    const missingArticles: number[] = []
    for (let i = 1; i <= totalArticles; i++) {
      if (!tracker.writtenIndexes.includes(i)) {
        missingArticles.push(i)
      }
    }

    if (missingArticles.length > 0) {
      const nextArticle = missingArticles[0]
      throw new Error(
        '❌ 【流水线阶段拦截】：当前处于「先生文后统一生图」模式！文案创作阶段尚未全部完成！\n' +
        `计划生产 ${totalArticles} 篇图文，当前仅完成 ${tracker.writtenIndexes.length} 篇正文，尚有第 ${missingArticles.join('、')} 篇未撰写！\n` +
        '严禁在文案未齐时提前偷跑调用生图工具！\n' +
        `👉 【下一步唯一正确操作】：请立即调用 gzh_build_article(index: ${nextArticle}) 撰写第 ${nextArticle} 篇文案，待全部 ${totalArticles} 篇正文落盘后再统一执行批量生图。`,
      )
    }

    // 此时文案已全量就绪，推进至 imaging 阶段
    tracker.phase = 'imaging'
  } else if (currentMode === 'per_article') {
    // 逐一生文生图模式：传入的配图目标必须仅针对单篇，且该篇正文必须已落盘
    const uniqueTargets = Array.from(new Set(targetIndexes))
    if (uniqueTargets.length > 1) {
      throw new Error(
        `❌ 【流水线阶段拦截】：当前处于「逐一生文生图」模式！严禁跨多篇混发配图任务（传入了篇目: ${uniqueTargets.join('、')}）！\n` +
        '👉 【下一步唯一正确操作】：请按单篇闭环，每次仅为当前处理的单篇文章调用生图。',
      )
    }

    const cur = uniqueTargets[0]
    if (!tracker.writtenIndexes.includes(cur)) {
      throw new Error(
        `❌ 【流水线顺序拦截】：当前处于「逐一生文生图」模式！第 ${cur} 篇正文尚未构建落盘，严禁提前生图！\n` +
        `👉 【下一步唯一正确操作】：请先调用 gzh_build_article(index: ${cur}) 构建第 ${cur} 篇文案。`,
      )
    }

    // 检查前序篇目是否均已完成生图
    if (cur > 1) {
      for (let p = 1; p < cur; p++) {
        if (!tracker.imagedIndexes.includes(p)) {
          throw new Error(
            `❌ 【流水线顺序拦截】：当前处于「逐一生文生图」模式！第 ${p} 篇配图尚未完成，严禁跳跃为第 ${cur} 篇配图！\n` +
            `👉 【下一步唯一正确操作】：请先调用 gzh_generate_images 为第 ${p} 篇完成配图。`,
          )
        }
      }
    }
  }
}

/**
 * 登记文案成功落盘，更新流水线状态
 */
export function recordArticleWritten(sandbox: TaskSandboxContext, index: number, cfg?: Config): void {
  const tracker = ensurePipelineTracker(sandbox, sandbox.manifest.pipelineTracker?.totalArticles || 1)
  if (!tracker.writtenIndexes.includes(index)) {
    tracker.writtenIndexes.push(index)
    tracker.writtenIndexes.sort((a, b) => a - b)
  }
  if (tracker.writtenIndexes.length >= tracker.totalArticles && tracker.phase === 'writing') {
    tracker.phase = 'imaging'
  }
  persistManifest(sandbox)
}

/**
 * 登记配图成功完成，更新流水线状态
 */
export function recordImagesGenerated(sandbox: TaskSandboxContext, indexes: number[], cfg?: Config): void {
  const tracker = ensurePipelineTracker(sandbox, sandbox.manifest.pipelineTracker?.totalArticles || 1)
  for (const idx of indexes) {
    if (!tracker.imagedIndexes.includes(idx)) {
      tracker.imagedIndexes.push(idx)
    }
  }
  tracker.imagedIndexes.sort((a, b) => a - b)
  if (tracker.imagedIndexes.length >= tracker.totalArticles) {
    tracker.phase = 'reviewing'
  }
  persistManifest(sandbox)
}
