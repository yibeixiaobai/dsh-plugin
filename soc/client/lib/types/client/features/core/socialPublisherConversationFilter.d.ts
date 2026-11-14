/**
 * 严格判定助手文本是否属于日常对话答疑、技术原理阐述、错误/时序排障复盘等非文章内容
 * 只要命中问答或排障特征，一律严禁提取为排版画布文章
 */
export declare function isAssistantConversationOrExplanation(text: string): boolean;
//# sourceMappingURL=socialPublisherConversationFilter.d.ts.map