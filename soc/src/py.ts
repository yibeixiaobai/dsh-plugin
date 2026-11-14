// Python 子进程调用封装。
// 结果协议：Python 侧最后向 stdout 打印一行 "###RESULT### {json}"（{ok, data|error}），
// 之前的内容视为人类可读日志；非零退出码时取 stderr 尾部作为错误信息。
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RESULT_MARKER = '###RESULT### '

export interface PyResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  logs: string[]
}

export interface RunOptions {
  pythonPath: string
  script: string
  args?: string[]
  cwd: string
  timeoutMs?: number
}

/** 插件 src/ 目录（dsh 以 TS 直载，import.meta.url 可用） */
export function pluginDir(): string {
  return fileURLToPath(new URL('.', import.meta.url))
}

/** 参数化 Python 入口所在目录 */
export function pipelineDir(): string {
  return path.resolve(pluginDir(), '..', 'pipeline')
}

/** 插件随包携带的排版、发布、校验与默认素材。 */
export function runtimeResourceDir(): string {
  return path.resolve(pluginDir(), '..', 'runtime')
}

export async function runPython<T = unknown>(opts: RunOptions): Promise<PyResult<T>> {
  const { pythonPath, script, args = [], cwd, timeoutMs = 120000 } = opts
  return new Promise<PyResult<T>>((resolve) => {
    const child = spawn(pythonPath, [script, ...args], {
      cwd,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    const stdout: string[] = []
    const stderr: string[] = []
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => stdout.push(chunk))
    child.stderr.on('data', (chunk: string) => stderr.push(chunk))

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        ok: false,
        error: `无法启动 Python（${pythonPath}）：${err.message}。请检查设置中的 python_path。`,
        logs: [],
      })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      const allOut = stdout.join('')
      const lines = allOut.split(/\r?\n/).filter((l) => l.trim() !== '')
      const markerIdx = lines.findIndex((l) => l.startsWith(RESULT_MARKER))
      const logs = markerIdx >= 0 ? lines.slice(0, markerIdx) : lines
      if (timedOut) {
        resolve({ ok: false, error: `执行超时（${timeoutMs}ms）：${script}`, logs })
        return
      }
      if (markerIdx >= 0) {
        try {
          const parsed = JSON.parse(lines[markerIdx].slice(RESULT_MARKER.length)) as PyResult<T>
          resolve({ ...parsed, logs: [...logs, ...(parsed.logs ?? [])] })
          return
        } catch {
          resolve({ ok: false, error: 'Python 结果 JSON 解析失败', logs: [...logs, ...stderr] })
          return
        }
      }
      const errTail = stderr.join('').split(/\r?\n/).filter(Boolean).slice(-30).join('\n')
      const missing = errTail.match(/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/)?.[1]
      resolve({
        ok: false,
        error: missing
          ? `缺少 Python 依赖 ${missing}。请为设置中的 python_path 安装 requests 与 Pillow。\n${errTail}`
          : errTail || (allOut.trim() ? `Python 未知输出：${allOut.trim().slice(-500)}` : `Python 退出码 ${code}（无标准输出与错误输出）`),
        logs,
      })
    })
  })
}
