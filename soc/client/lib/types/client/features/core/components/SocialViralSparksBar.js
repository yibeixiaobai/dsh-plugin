import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo } from 'react';
import { Sparkles } from 'lucide-react';
import css from '../SocialPublisherComposerCard.module.css';
export const SOCIAL_VIRAL_SPARKS = [
    { label: '🔥 行业深度综述', prompt: '围绕本周最新行业前沿热点写一篇深度综述，包含事件回顾、行业影响与独家观点洞察。' },
    { label: '💡 步骤实操拆解', prompt: '将复杂操作整理为手把手实操干货指南，条理清晰，分为 4 个步骤，小红书配 4 张 3:4 竖版多图。' },
    { label: '✨ 爆款故事种草', prompt: '以第一视角故事化分享体验心得，语气亲切真诚，小红书网感风格，提炼 3 个核心优势。' },
    { label: '📊 观点对比测评', prompt: '从功能、体验、性价比多维度进行客观深度对比测评，给出明确选购与使用建议。' },
];
export const SocialViralSparksBar = memo(function SocialViralSparksBar({ onSelectPrompt, }) {
    return (_jsxs("div", { className: css.sparksBar, children: [_jsxs("span", { className: css.sparksLabel, children: [_jsx(Sparkles, { size: 12, style: { color: '#10b981' } }), "\u7206\u6B3E\u7075\u611F:"] }), SOCIAL_VIRAL_SPARKS.map(spark => (_jsx("button", { type: "button", onClick: () => onSelectPrompt(spark.prompt), className: css.sparkChip, children: spark.label }, spark.label)))] }));
});
//# sourceMappingURL=SocialViralSparksBar.js.map