interface WechatEditableNodeProps {
    nodeId: string;
    rawHtml: string;
    isSelected: boolean;
    onContentChange: (nodeId: string, newHtml: string) => void;
    onSelect: () => void;
    onImageClick?: (src: string) => void;
}
/**
 * 微信公众号专业排版画布 - 原位可编辑节点容器
 * 支持所见即所得光标打字、实时单行清洗、纯文本粘贴，彻底避免输入时光标跳动
 */
export declare function WechatEditableNode({ nodeId, rawHtml, isSelected, onContentChange, onSelect, onImageClick, }: WechatEditableNodeProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=WechatEditableNode.d.ts.map