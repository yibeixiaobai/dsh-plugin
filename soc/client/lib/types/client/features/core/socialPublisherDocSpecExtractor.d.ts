/**
 * 社媒发布工作台 - 结构化 DocSpec 正文还原与 HTML 深度清洗器
 * 负责从 doc_spec 骨架（intro, sections, blocks, sign_off）还原可读文本，
 * 并提供严格的对象类型保护与反转义，彻底消灭 [object Object] 与元数据泄露。
 */
/**
 * 【中文修复依据】：安全递归解包对象字段，彻底根治 [object Object] 类型泄露
 * 兼容处理 {text, content, title, desc, value, item, label} 等字段，
 * 数组递归拼接，非有效文本自动过滤，绝对禁止输出 [object Object]
 */
export declare function safeExtractText(val: unknown): string;
/**
 * 稳健清洗与反转义正文内容
 * 修复从 JSON 输出、工具调用结果或双重序列化中提取时残留的 \"、\\n、多重反斜杠等转义缺陷
 * 【中文修复依据】：拦截纯工具执行元数据 JSON 字符串，物理剔除 [object Object] 坏字符串
 */
export declare function cleanAndUnescapeHtmlContent(raw: string): string;
/**
 * 递归从 doc_spec 结构化骨架（intro, sections, blocks, sign_off）还原出完整可读的文章正文
 * 【中文修复依据】：全面采用 safeExtractText 递归解包，支持图文与多媒体组件完整还原，绝对杜绝 [object Object] 泄露
 */
export declare function extractContentFromDocSpec(doc: Record<string, unknown>): string;
//# sourceMappingURL=socialPublisherDocSpecExtractor.d.ts.map