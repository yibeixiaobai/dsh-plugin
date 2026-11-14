import { type ReactNode } from 'react';
export interface WorkModeTaskSwitcherProps {
    readonly wide: boolean;
    readonly startSession: (workspaceId?: string) => void;
    readonly canStartSession?: boolean;
    readonly shortcutKeys?: readonly string[] | undefined;
}
/**
 * 任务模式切换与新建控制器 (WorkModeTaskSwitcher)
 * 1:1 对标 wincode 的 WorkModeTaskSwitcher 交互与液态玻璃质感设计：
 * - 通用任务模式：常规对话状态，支持通用自由交互与常规开发
 * - 社媒发布模式：社媒矩阵专属模式，自动展开社媒创作配置卡片
 * - 折叠导轨模式：自适应呈现当前活跃模式图标，点击一键新建对应模式会话
 */
export declare const WorkModeTaskSwitcher: import("react").MemoExoticComponent<({ wide, startSession, canStartSession, shortcutKeys, }: WorkModeTaskSwitcherProps) => ReactNode>;
//# sourceMappingURL=WorkModeTaskSwitcher.d.ts.map