import type { WechatSectionNode } from "./wechatCanvasTypes.js";
interface UseWechatCanvasHistoryOptions {
    nodes: WechatSectionNode[];
    selectedNodeId: string | null;
    onApplyNodes: (newNodes: WechatSectionNode[]) => void;
    onSelectNode: (nodeId: string | null) => void;
    onSaveRequested: () => void;
    onDeleteSelected: () => void;
    onDuplicateSelected: () => void;
}
/**
 * 微信公众号专业排版画布 - 历史快照栈与全局快捷键 Hook
 * 支持：Ctrl+Z (撤回)、Ctrl+Y / Ctrl+Shift+Z (重做)、Ctrl+S (立即保存)、Delete (删除容器)、Esc (取消选中)、Ctrl+D (复制副本)
 */
export declare function useWechatCanvasHistory({ nodes, selectedNodeId, onApplyNodes, onSelectNode, onSaveRequested, onDeleteSelected, onDuplicateSelected, }: UseWechatCanvasHistoryOptions): {
    pushSnapshot: (_newNodes?: WechatSectionNode[]) => void;
    undo: () => boolean;
    redo: () => boolean;
    canUndo: boolean;
    canRedo: boolean;
};
export {};
//# sourceMappingURL=useWechatCanvasHistory.d.ts.map