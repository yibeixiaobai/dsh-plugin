import type { WechatSectionNode } from "./wechatCanvasTypes.js";
export interface UseWechatCanvasNodeActionsOptions {
    nodes: WechatSectionNode[];
    selectedNodeId: string | null;
    history: any;
    updateNodesAndEmit: (newNodes: WechatSectionNode[]) => void;
    setSelectedNodeId: (id: string | null) => void;
    setJustAddedNodeId: (id: string | null) => void;
}
/**
 * 微信公众号专业排版画纸 - 节点增删改移与模板交互核心 Hook
 * 【中文依据】：将容器移动、主题切换、复制删除及素材库监听抽离为独立模块，保持画纸主组件在 400 行以内
 */
export declare function useWechatCanvasNodeActions({ nodes, selectedNodeId, history, updateNodesAndEmit, setSelectedNodeId, setJustAddedNodeId, }: UseWechatCanvasNodeActionsOptions): {
    handleDeleteSelected: () => void;
    handleDuplicateSelected: () => void;
    handleInsertBlankParagraphAt: (targetIndex: number) => void;
    handleMoveNode: (index: number, dir: -1 | 1) => void;
    handleChangeNodeTheme: (index: number, themeKey: string) => void;
};
//# sourceMappingURL=useWechatCanvasNodeActions.d.ts.map