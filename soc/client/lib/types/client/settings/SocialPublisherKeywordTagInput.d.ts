export interface KeywordTagInputProps {
    label: string;
    subLabel?: string;
    tags: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
    presetTags?: string[];
    emptyHint?: string;
    className?: string;
}
/**
 * 关键词胶囊标签输入组件
 * 对齐定时规则（SocialPublisherContentScheduleSubTab）交互范式：
 * 胶囊标签展示、单项点击 X 移除、回车/逗号成词、多行智能粘贴解析、常用预设一键点选。
 */
export declare function SocialPublisherKeywordTagInput({ label, subLabel, tags, onChange, placeholder, presetTags, emptyHint, className, }: KeywordTagInputProps): import("react").JSX.Element;
//# sourceMappingURL=SocialPublisherKeywordTagInput.d.ts.map