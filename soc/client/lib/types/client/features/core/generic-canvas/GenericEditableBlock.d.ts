import type { GenericSectionBlock } from './genericCanvasTypes.js';
interface GenericEditableBlockProps {
    block: GenericSectionBlock;
    platform?: string;
    isSelected?: boolean;
    onSelect?: () => void;
    onContentChange: (blockId: string, newText: string) => void;
}
/**
 * 通用专栏长图文（知乎、今日头条、百家号）原位所见即所得编辑节点
 * 100% 对齐微信公众号 WechatEditableNode 交互体验：
 * 绝不切换为 textarea，排版样式就地保留，支持中文输入法 (IME) 防频闪与纯文本安全粘贴
 */
export declare function GenericEditableBlock({ block, platform, isSelected, onSelect, onContentChange, }: GenericEditableBlockProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=GenericEditableBlock.d.ts.map