import { useState, useEffect } from 'react';
const STORAGE_KEY = 'dsh.app_work_mode';
let currentMode = (() => {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            if (saved === 'social' || saved === 'general')
                return saved;
        }
        catch { }
    }
    return 'social';
})();
function syncBodyAttribute(mode) {
    if (typeof document !== 'undefined') {
        if (document.body) {
            document.body.setAttribute('data-app-work-mode', mode);
        }
        else {
            window.addEventListener('DOMContentLoaded', () => {
                document.body?.setAttribute('data-app-work-mode', mode);
            }, { once: true });
        }
    }
}
// 初始化时立即同步 body 模式属性
syncBodyAttribute(currentMode);
const listeners = new Set();
const sessionModes = new Map();
export function getCurrentAppWorkMode() {
    return currentMode;
}
export function setAppWorkMode(mode) {
    if (currentMode === mode)
        return;
    currentMode = mode;
    syncBodyAttribute(mode);
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            window.localStorage.setItem(STORAGE_KEY, mode);
        }
        catch { }
    }
    listeners.forEach(fn => fn(mode));
}
export function setSessionWorkMode(sessionId, mode) {
    sessionModes.set(sessionId, mode);
}
export function getSessionWorkMode(sessionId) {
    return sessionModes.get(sessionId);
}
/**
 * 智能自动识别：切换会话时，若会话中存在社媒发布产物或工单，自动切至社媒发布模式；普通对话则保持通用模式。
 */
export function resolveSessionMode(sessionId, hasSocialContent) {
    const existing = sessionModes.get(sessionId);
    if (existing)
        return existing;
    const inferred = hasSocialContent ? 'social' : 'general';
    sessionModes.set(sessionId, inferred);
    return inferred;
}
/**
 * React Hook 获取当前应用工作模式 ('general' | 'social')
 */
export function useAppWorkMode() {
    const [mode, setMode] = useState(currentMode);
    useEffect(() => {
        syncBodyAttribute(currentMode);
        const handler = (newMode) => {
            setMode(newMode);
            syncBodyAttribute(newMode);
        };
        listeners.add(handler);
        return () => {
            listeners.delete(handler);
        };
    }, []);
    return mode;
}
/**
 * React Hook 设置当前应用工作模式
 */
export function useSetAppWorkMode() {
    return setAppWorkMode;
}
//# sourceMappingURL=workModeStore.js.map