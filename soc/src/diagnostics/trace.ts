// 社媒全链路统一 Trace 追踪生成与上下文传递工具
// 【设计依据】：统一 UI、服务层、MCP 工具与底层自动化脚本的调用链路标记，消除跨进程排查断层。

import crypto from 'node:crypto'

/**
 * 生成全链路全局唯一 Trace ID
 * 格式：sp_trace_<毫秒时间戳>_<8位随机Hex>
 */
export function generateTraceId(prefix = 'sp_trace'): string {
  const timestamp = Date.now()
  const randomSuffix = crypto.randomBytes(4).toString('hex')
  return `${prefix}_${timestamp}_${randomSuffix}`
}

/**
 * 从多源上下文自适应提取有效 Trace ID，若无则自动生成保底
 */
export function resolveTraceId(candidate?: unknown): string {
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim()
  }
  if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>
    if (typeof obj.traceId === 'string' && obj.traceId.trim().length > 0) {
      return obj.traceId.trim()
    }
    if (typeof obj.trace_id === 'string' && obj.trace_id.trim().length > 0) {
      return obj.trace_id.trim()
    }
    if (typeof obj.ownerTaskId === 'string' && obj.ownerTaskId.trim().length > 0) {
      return obj.ownerTaskId.trim()
    }
    if (typeof obj.owner_task_id === 'string' && obj.owner_task_id.trim().length > 0) {
      return obj.owner_task_id.trim()
    }
  }
  return generateTraceId()
}
