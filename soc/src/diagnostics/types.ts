// 社媒发布插件现场诊断与快照类型契约
// 【设计依据】：规范自动化异常场景下的现场捕获数据模型、保留策略与元数据格式。

import type { Page } from 'puppeteer-core'

export interface FailureSnapshotOptions {
  /** Puppeteer 页面句柄（若存在） */
  page?: Page | null
  /** 发生故障的账号 ID */
  accountId: string
  /** 发生故障的社媒平台 */
  platform: string
  /** 发生故障的执行步骤（如 'navigate', 'input_title', 'click_publish', 'confirm_status'） */
  step: string
  /** 触发的异常对象或错误信息 */
  error: unknown
  /** 全局链路追踪 ID */
  traceId?: string
  /** 账号专属脚本与数据产物工作区（用于锚定 debug 目录） */
  scriptsDir: string
  /** 自定义现场附加数据（如试图填充的标题、选择器等） */
  extraContext?: Record<string, unknown>
}

export interface FailureSnapshotResult {
  /** 快照根目录绝对路径 */
  snapshotDir: string
  /** HTML 快照文件绝对路径（若成功导出） */
  htmlPath?: string
  /** 全屏截图文件绝对路径（若成功导出） */
  screenshotPath?: string
  /** 诊断元信息文件绝对路径 */
  metadataPath: string
  /** 快照创建时间戳 (ISO) */
  createdAt: string
}

export interface FailureMetadata {
  accountId: string
  platform: string
  step: string
  traceId?: string
  timestamp: string
  pageUrl?: string
  pageTitle?: string
  errorMessage: string
  errorStack?: string
  extraContext?: Record<string, unknown>
}
