import { jsx as _jsx } from "react/jsx-runtime";
import { memo } from "react";
import { SocialStudioCanvas } from "./SocialStudioCanvas.js";
/**
 * 社媒发布任务中央主视口画布容器 (Social Studio Layout)
 *
 * 【中文架构规范】：
 * 1. 中央主视口 100% 满宽呈现无限画布与多平台文章排版，不再在主视口内部硬切出 40% 的独立对话区域；
 * 2. 右侧伴随对话流全面借用系统原侧边面板（AnimatedSidePanePanel 中的 social-chat Tab）承载；
 * 3. 支持用户随时折叠侧面板享受 100% 沉浸式编辑审校。
 */
export const SocialStudioLayout = memo(function SocialStudioLayout({ workflow, workspacePath, workspaceIdentity, sessionId, }) {
    return (_jsx("div", { "data-testid": "social-studio-layout", style: {
            display: "flex",
            height: "100%",
            minHeight: 0,
            width: "100%",
            overflow: "hidden",
            position: "relative",
        }, children: _jsx("div", { "data-testid": "studio-canvas-panel", style: {
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                height: "100%",
                width: "100%",
                flex: 1,
                overflow: "hidden",
            }, children: _jsx(SocialStudioCanvas, { workflow: workflow, workspacePath: workspacePath, workspaceIdentity: workspaceIdentity, sessionId: sessionId }) }) }));
});
//# sourceMappingURL=SocialStudioLayout.js.map