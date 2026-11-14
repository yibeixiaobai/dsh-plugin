import path from 'node:path'

export interface ImageFailureItem {
  out?: string
  reason?: string
  guidance?: string
  [key: string]: any
}

/**
 * [中文修复依据]：构建结构化配图失败诊断报告与用户配置引导
 * 彻底禁止 Agent 擅自编写脚本自救，强制输出问题与指引交还用户
 */
export function assertImageGenerationOutcome(params: {
  remainingCount: number
  generated: any[]
  failed: ImageFailureItem[]
  dryRun: boolean
}): void {
  const { remainingCount, generated, failed, dryRun } = params
  if (dryRun) return

  const generatedCount = Array.isArray(generated) ? generated.length : 0
  if (remainingCount > 0 && generatedCount === 0) {
    const errorDetails = Array.isArray(failed) && failed.length > 0
      ? failed.map((f) => {
        const fname = f.out ? path.basename(f.out) : '未知图片'
        return `- **文件**：\`${fname}\`\n  **诊断**：${f.reason || '网络超时或接口异常'}`
      }).join('\n')
      : '- 线上所有生图模型端点均超时、挂死或未返回合法图像数据'

    const message = [
      '❌ 【社媒发布配图失败，任务已安全暂停】',
      '',
      '### 遇到什么问题：',
      `本次任务共需绘制 ${remainingCount} 张图片，实际线上成功 0 张。具体诊断信息：`,
      errorDetails,
      '',
      '### 👉 如何修复：',
      '1. **检查模型设置**：请点击界面左下角【设置 -> 模型设置】；',
      '2. **配置可用生图端点**：不要将仅支持对话的本地中转代理作为生图模型，请为支持图像生成的供应商（如 OpenAI DALL-E 3、通义万相、FLUX 等）勾选【生图】输出模态，并填写真实有效的 API Key 及官方接口地址；',
      '3. **测试排版流程**：若当前仅需体验文章撰写与排版发布流程，可在设置中开启【演练模式 (Dry Run)】；',
      '4. **重试任务**：配置保存后，请直接在对话中回复“继续配图”重新触发。',
      '',
      '⚠️ 【系统底层安全红线】：当前任务已安全暂停！严禁自作聪明调用 dry_run: true 伪造占位文件绕过底层物料检查，严禁自行编写脚本自救，必须且只能将上述问题如实呈现给用户，交还控制权等待用户配置。',
    ].join('\n')

    throw new Error(message)
  }
}
