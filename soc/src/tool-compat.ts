// 兼容层：解耦外部依赖，提供统一的工具定义与上下文结构
import type { Context as CordisContext } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export type Context = CordisContext
export default Schema

export interface ToolPropertySchema {
  type: string
  description?: string
  required?: boolean
  items?: { type: string; [key: string]: any }
  default?: any
  [key: string]: any
}

export interface ToolOutputSpec<TArgs = any, TOutput = any> {
  schema: Record<string, any>
  render: (args: TArgs, value: TOutput) => ToolContentBlock[]
  presentationMeta?: (args: TArgs, value: TOutput) => any
}

export interface ToolDefinition<TArgs = any, TOutput = any> {
  name: string
  description: string
  parameters: Record<string, any>
  output?: ToolOutputSpec<TArgs, TOutput> | any
  execute: (args: TArgs, context?: any) => Promise<TOutput>
}

/**
 * 将裸的工具参数字典自动规整为标准合规的根 JSON Schema 对象：
 * 保证 OpenAI / DeepSeek 等 LLM Provider 序列化为 function parameters 时具有合法的 {"type":"object","properties":{...}}
 * 根绝 API 校验因缺少 properties 将参数字段误判为顶层 Schema 关键字（如 title）而抛出 400 异常。
 */
export function normalizeToolParameters(params: any): Record<string, any> {
  if (params && typeof params === 'object' && params.type === 'object' && params.properties && typeof params.properties === 'object') {
    return params
  }

  const rawProps = params && typeof params === 'object' ? params : {}
  const properties: Record<string, any> = {}
  const required: string[] = []

  for (const [key, rawProp] of Object.entries(rawProps)) {
    if (!rawProp || typeof rawProp !== 'object') continue
    const prop: any = { ...(rawProp as any) }
    if (prop.required === true) {
      required.push(key)
      delete prop.required
    }
    properties[key] = prop
  }

  const result: Record<string, any> = {
    type: 'object',
    properties,
  }
  if (required.length > 0) {
    result.required = required
  }
  return result
}

/**
 * 清理对象中的 undefined 字段并确保其完全符合无损 JSON（lossless JSON）规范：
 * 杜绝 DSH 工具流水线因对象包含 undefined 属性而抛出 "invalid output: value is not lossless JSON" 异常。
 */
export function sanitizeLosslessJson<T>(value: T): T {
  if (value === undefined || value === null) return null as any
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  try {
    const jsonStr = JSON.stringify(value)
    if (jsonStr === undefined) return null as any
    return JSON.parse(jsonStr)
  } catch {
    return { ok: false, error: 'Serialization failed' } as any
  }
}

export function defineTool<TArgs = any, TOutput = any>(
  def: ToolDefinition<TArgs, TOutput>,
): ToolDefinition<TArgs, TOutput> {
  let output = def.output
  if (!output || typeof output !== 'object' || typeof output.render !== 'function' || output.schema?.type === 'json' || !output.schema?.type) {
    output = {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: (output && typeof output.render === 'function')
        ? output.render
        : (_args: TArgs, value: TOutput) => [{
            type: 'text',
            text: typeof value === 'string' ? value : JSON.stringify(value ?? null),
          }],
    }
  }

  const parameters = normalizeToolParameters(def.parameters)
  const userExecute = def.execute
  const execute = async (args: TArgs, context?: any): Promise<TOutput> => {
    const rawResult = await userExecute(args, context)
    return sanitizeLosslessJson(rawResult)
  }

  return {
    ...def,
    parameters,
    output,
    execute,
  }
}

export type ToolContentBlock = {
  type: string
  [key: string]: any
}

export function createUserMessage<T = any>(message: T): T {
  return message
}
