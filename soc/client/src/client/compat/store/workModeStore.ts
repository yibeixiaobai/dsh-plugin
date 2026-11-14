import { useState, useEffect } from 'react'

export type AppWorkMode = 'general' | 'social'

const STORAGE_KEY = 'dsh.app_work_mode'

let currentMode: AppWorkMode = (() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'social' || saved === 'general') return saved
    } catch { }
  }
  return 'social'
})()

function syncBodyAttribute(mode: AppWorkMode) {
  if (typeof document !== 'undefined') {
    if (document.body) {
      document.body.setAttribute('data-app-work-mode', mode)
    } else {
      window.addEventListener('DOMContentLoaded', () => {
        document.body?.setAttribute('data-app-work-mode', mode)
      }, { once: true })
    }
  }
}

// 初始化时立即同步 body 模式属性
syncBodyAttribute(currentMode)

const listeners = new Set<(mode: AppWorkMode) => void>()
const sessionModes = new Map<string, AppWorkMode>()

export function getCurrentAppWorkMode(): AppWorkMode {
  return currentMode
}

export function setAppWorkMode(mode: AppWorkMode): void {
  if (currentMode === mode) return
  currentMode = mode
  syncBodyAttribute(mode)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode)
    } catch { }
  }
  listeners.forEach(fn => fn(mode))
}

export function setSessionWorkMode(sessionId: string, mode: AppWorkMode): void {
  sessionModes.set(sessionId, mode)
}

export function getSessionWorkMode(sessionId: string): AppWorkMode | undefined {
  return sessionModes.get(sessionId)
}

/**
 * 智能自动识别：切换会话时，若会话中存在社媒发布产物或工单，自动切至社媒发布模式；普通对话则保持通用模式。
 */
export function resolveSessionMode(sessionId: string, hasSocialContent: boolean): AppWorkMode {
  const existing = sessionModes.get(sessionId)
  if (existing) return existing
  const inferred: AppWorkMode = hasSocialContent ? 'social' : 'general'
  sessionModes.set(sessionId, inferred)
  return inferred
}

/**
 * React Hook 获取当前应用工作模式 ('general' | 'social')
 */
export function useAppWorkMode(): AppWorkMode {
  const [mode, setMode] = useState<AppWorkMode>(currentMode)

  useEffect(() => {
    syncBodyAttribute(currentMode)
    const handler = (newMode: AppWorkMode) => {
      setMode(newMode)
      syncBodyAttribute(newMode)
    }
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  return mode
}

/**
 * React Hook 设置当前应用工作模式
 */
export function useSetAppWorkMode(): (mode: AppWorkMode) => void {
  return setAppWorkMode
}
