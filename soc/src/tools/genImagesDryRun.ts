/**
 * 演练模式图片生成与沙箱登记执行器 (Dry Run Image Executor)
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Config } from '../config.ts'
import type { CoverRatio } from '../types.ts'
import {
  XHS_COVER_RATIO,
  ZHIHU_COVER_RATIO,
  BAIJIAHAO_COVER_RATIO,
  TOUTIAO_COVER_RATIO,
} from '../config.ts'
import { accountScriptsDir, resolveCoverRatio } from './shared.ts'
import {
  calculateManifestFingerprint,
  registerSandboxedImage,
  type TaskSandboxContext,
} from '../sandbox/taskSandbox.ts'
import { generateMockPlaceholderPng } from '../mock-image-generator.ts'

export interface DryRunGenItem {
  kind: 'cover' | 'content' | 'pic'
  index: number
  sub?: number
  prompt: string
  out: string
  size: [number, number]
  zh_only?: boolean
}

export function executeDryRunGenImages(params: {
  cfg: Config
  account: { id: string; profile: any }
  sandbox: TaskSandboxContext
  items: DryRunGenItem[]
  titles: string[]
}) {
  const { cfg, account, sandbox, items, titles } = params
  const genDir = sandbox.targetGroup.imagesDir
  const legacyDir = accountScriptsDir(cfg, account.id)

  fs.mkdirSync(legacyDir, { recursive: true })
  fs.mkdirSync(genDir, { recursive: true })

  const generated = items.map((it) => {
    const targetPath = path.isAbsolute(it.out) ? it.out : path.join(genDir, it.out)
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      const ratio =
        it.kind === 'content'
          ? (((it as any).ratio || account.profile.content?.content_image_ratio || '16:9') as CoverRatio)
          : it.kind === 'pic'
            ? ((account.profile.content?.newspic_image_ratio || '3:4') as CoverRatio)
            : account.profile.platform === 'zhihu'
              ? ZHIHU_COVER_RATIO
              : account.profile.platform === 'xiaohongshu'
                ? XHS_COVER_RATIO
                : account.profile.platform === 'baijiahao'
                  ? BAIJIAHAO_COVER_RATIO
                  : account.profile.platform === 'toutiao'
                    ? TOUTIAO_COVER_RATIO
                    : resolveCoverRatio(cfg, it.index, account.profile)

      const targetWidth = it.size[0] || (ratio === '16:9' ? 3024 : 1080)
      const targetHeight = it.size[1] || (ratio === '16:9' ? 1701 : 1080)

      // 生成符合平台真实比例的高保真本地 PNG 占位图，解决拟真预览破图变形
      const mockPngBuffer = generateMockPlaceholderPng({
        width: targetWidth,
        height: targetHeight,
        kind: it.kind,
        ratio,
        index: it.index,
        sub: it.sub,
        title: titles[it.index - 1],
      })

      fs.writeFileSync(targetPath, mockPngBuffer)
      registerSandboxedImage(
        sandbox,
        it.kind,
        it.index,
        it.sub,
        targetPath,
        ratio,
        it.kind === 'content' ? `IMG_A${it.index}_${it.sub || 1}` : undefined,
      )
      // 彻底切断全局旧目录同步，物料 100% 封闭在当前沙箱
    } catch {
      /* 忽略写入测试占位图异常 */
    }
    const targetW = it.size[0] || (it.kind === 'content' ? 3024 : 1080)
    const targetH = it.size[1] || (it.kind === 'content' ? 1701 : 1080)
    return {
      out: targetPath,
      w: targetW,
      h: targetH,
      dry_run: true,
      prompt: it.prompt,
      zh_only: it.zh_only,
    }
  })

  return {
    account_id: account.id,
    task_id: sandbox.taskId,
    manifest_fingerprint: calculateManifestFingerprint(sandbox.manifest),
    generated,
    failed: [],
    dry_run: true,
    provider_used: 'dry_run_mock',
    provider_attempts: [],
  }
}
