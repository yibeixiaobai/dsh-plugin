// dsh / Cordis 环境的本地最小类型声明。
// dsh 以 TS 直载插件（宿主自带转译），这里只为本地 tsc 检查提供签名，
// 运行时解析到宿主提供的 @deepseek-ai/* 包（见 package.json peerDependencies）。
// API 形状依据 dsh 开发者预览版公开教程：export name/inject/Config/apply、
// defineTool({ name, description, parameters, output, execute })。

declare module '@deepseek-ai/cordis' {
  export interface Logger {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
  }
  export interface Context {
    tools: { register(tool: unknown): void }
    logger: Logger
    effect(...args: unknown[]): unknown
    inject(services: string[], callback: (ctx: Context) => void): void
    settings?: {
      installSection(owner: Context, namespace: string, schema: unknown, entry: unknown, hooks: {
        setSource(next: () => unknown): void
        onChange(): void
      }): void
      update(namespace: string, patch: object): Promise<void>
    }
    webServer?: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (
          req: import('node:http').IncomingMessage,
          res: import('node:http').ServerResponse,
        ) => void | Promise<void>
      }): () => void
    }
  }
}

declare module '@deepseek-ai/dsh-settings' {
  export interface SettingsScope<T> {
    get(): T
  }
}

declare module '@deepseek-ai/schemastery' {
  export interface Schema<T = unknown> {
    (value: unknown): T
    default(value: T): Schema<T>
    required(): Schema<T>
    role(role: string): Schema<T>
    min(n: number): Schema<T>
    max(n: number): Schema<T>
    step(n: number): Schema<T>
    description(text: string): Schema<T>
  }
  export const Schema: {
    object<T>(dict: { [K in keyof T]: Schema<T[K]> }): Schema<T>
    string(): Schema<string>
    number(): Schema<number>
    boolean(): Schema<boolean>
    natural(): Schema<number>
    array<T>(item: Schema<T>): Schema<T[]>
    dict<T>(item: Schema<T>): Schema<Record<string, T>>
    union<T extends Array<string | number>>(values: [...T]): Schema<T[number]>
    any(): Schema<unknown>
  }
  export default Schema
}

declare module '@deepseek-ai/dsh-tools' {
  export interface ToolParameter {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object'
    required?: boolean
    description?: string
    items?: ToolParameter
    enum?: Array<string | number>
  }
  export interface ToolContentBlock {
    type: string
    text?: string
  }
  export interface ToolDefinition<TArgs, TResult> {
    name: string
    description: string
    parameters: Record<string, ToolParameter>
    output: {
      schema: unknown
      render?: (args: TArgs, value: TResult) => ToolContentBlock[]
    }
    execute: (args: TArgs) => Promise<TResult> | TResult
  }
  export function defineTool<TArgs, TResult>(
    def: ToolDefinition<TArgs, TResult>,
  ): ToolDefinition<TArgs, TResult>
}
