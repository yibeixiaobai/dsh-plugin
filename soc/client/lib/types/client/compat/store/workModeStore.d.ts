export type AppWorkMode = 'general' | 'social';
export declare function getCurrentAppWorkMode(): AppWorkMode;
export declare function setAppWorkMode(mode: AppWorkMode): void;
export declare function setSessionWorkMode(sessionId: string, mode: AppWorkMode): void;
export declare function getSessionWorkMode(sessionId: string): AppWorkMode | undefined;
/**
 * 智能自动识别：切换会话时，若会话中存在社媒发布产物或工单，自动切至社媒发布模式；普通对话则保持通用模式。
 */
export declare function resolveSessionMode(sessionId: string, hasSocialContent: boolean): AppWorkMode;
/**
 * React Hook 获取当前应用工作模式 ('general' | 'social')
 */
export declare function useAppWorkMode(): AppWorkMode;
/**
 * React Hook 设置当前应用工作模式
 */
export declare function useSetAppWorkMode(): (mode: AppWorkMode) => void;
//# sourceMappingURL=workModeStore.d.ts.map