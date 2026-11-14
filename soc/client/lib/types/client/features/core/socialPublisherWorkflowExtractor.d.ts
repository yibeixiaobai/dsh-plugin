import type { ConversationRow } from '../../compat/types.js';
export interface CandidateTopic {
    id: string;
    platform?: 'gzh' | 'xiaohongshu' | 'zhihu' | 'baijiahao' | 'toutiao';
    platformName?: string;
    accountId?: string;
    accountName?: string;
    title: string;
    hookAngle: string;
    genreBadge?: string;
    similarityScore: number;
    viralScore: number;
    selected?: boolean;
    isStar?: boolean;
    isExcluded?: boolean;
    excludeReason?: string;
    sources?: string[];
    crossPlatformCount?: number;
    evidencePreview?: string;
    assignedSlot?: number;
    articleType?: 'article' | 'newspic';
    suggestedFormat?: '长文' | '小绿书';
}
export interface AccountTopicGroup {
    groupKey: string;
    platform: 'gzh' | 'xiaohongshu' | 'zhihu' | 'baijiahao' | 'toutiao';
    platformName: string;
    accountId: string;
    accountName: string;
    targetArticleCount: number;
    articleQuota?: number;
    newspicQuota?: number;
    hasNewspic?: boolean;
    topics: CandidateTopic[];
}
export interface ArticleItem {
    id: string;
    index?: number;
    platform: 'gzh' | 'xiaohongshu' | 'zhihu' | 'baijiahao' | 'toutiao';
    platformName?: string;
    accountId?: string;
    accountName?: string;
    title: string;
    digest?: string;
    content: string;
    coverUrl?: string;
    images?: string[];
    contentImages?: string[];
    targetContentImageCount?: number;
    targetCardImageCount?: number;
    articleType?: 'news' | 'newspic';
    tags?: string[];
    filePath?: string;
    scriptsDir?: string;
    locked?: boolean;
    /** 篇目实时生成生命周期状态：pending 等待撰写 | streaming 正在实时流式打字输出 | completed 已落盘构建就绪 */
    status?: 'pending' | 'streaming' | 'completed';
    /** 当前篇目是否正处于流式生成中（用于画布高保真打字机排版与呼吸光标渲染） */
    isStreaming?: boolean;
    /** 【中文修复依据】：视觉蓝图与槽位精准生图 Prompt 列表，供前端画纸与重新生成弹窗预填 */
    visualSlots?: Array<{
        slotId: string;
        index?: number;
        sub?: number;
        kind: string;
        ratio?: string;
        contextText?: string;
        intentDescription?: string;
        generationPrompt?: string;
        searchKeywords?: string[];
    }>;
}
export type PipelineStepStatus = 'pending' | 'running' | 'completed' | 'error';
export interface PipelineStep {
    id: string;
    name: string;
    desc: string;
    status: PipelineStepStatus;
    detail?: string;
}
export type SocialWorkflowStage = 'idle' | 'topics' | 'generating' | 'review' | 'publishing' | 'published';
/**
 * 单个平台/账号维度的独立并行任务执行模型
 * 每个平台拥有完全解耦的生命周期状态、专属流水线和专属文章，互不踩踏
 */
export interface SocialPlatformTask {
    id: string;
    platform: 'gzh' | 'xiaohongshu' | 'zhihu' | 'baijiahao' | 'toutiao';
    platformName?: string;
    accountId?: string;
    accountName?: string;
    stage: SocialWorkflowStage;
    topics?: CandidateTopic[];
    articles: ArticleItem[];
    allPrePublishTasksCompleted?: boolean;
    taskId?: string;
    manifestFingerprint?: string;
    pipelineSteps: PipelineStep[];
    publishedInfo?: {
        mediaId?: string;
        draftId?: string;
        scheduledTime?: string;
        isVerified?: boolean;
        receiptScreenshot?: string;
        qrScreenshot?: string;
    };
}
export interface ExtractedSocialWorkflow {
    stage: SocialWorkflowStage;
    platform: string;
    accountName?: string;
    accountId?: string;
    scriptsDir?: string;
    topicTheme?: string;
    topics: CandidateTopic[];
    accountTopicGroups: AccountTopicGroup[];
    pipelineSteps: PipelineStep[];
    articles: ArticleItem[];
    allPrePublishTasksCompleted?: boolean;
    researchEvidence?: Record<string, unknown>;
    publishedInfo?: {
        mediaId?: string;
        draftId?: string;
        scheduledTime?: string;
        isVerified?: boolean;
        receiptScreenshot?: string;
        qrScreenshot?: string;
    };
    /** 用户是否已正式下达发布或排期发布意图指令 */
    publishIntentIssued?: boolean;
    tasks: SocialPlatformTask[];
    taskId?: string;
    manifestFingerprint?: string;
    activeTaskId?: string;
    /** 是否所有计划文章的正文已全部落盘生产完毕（即使配图尚在绘制，即可提前呈现预览入口） */
    isContentFullyProduced?: boolean;
    /** AI 生图实时进度信息（用于可视化进度条与篇目追踪） */
    imageProgress?: {
        current: number;
        total: number;
        percentage: number;
        currentArticleIndex: number;
        isGenerating: boolean;
    };
    /** 当前正在流式打字输出的篇目序号 (如 1, 2, 3...)，用于画布自动对焦与流式跟手 */
    activeStreamingIndex?: number;
    isSocialTask?: boolean;
    /** 是否显式由社媒发布模式创建/提交的任务（用于严格限制画布排布仅对社媒发布模式任务生效） */
    isExplicitSocialModeTask?: boolean;
    isDryRun?: boolean;
}
import { safeExtractText, cleanAndUnescapeHtmlContent, extractContentFromDocSpec } from './socialPublisherDocSpecExtractor.js';
export { safeExtractText, cleanAndUnescapeHtmlContent, extractContentFromDocSpec, };
/**
 * 严格控制每个账号分组的候选选题数量：
 * 1. 待选选题数量至多为【所需篇数 + 3】（过滤多余冗余项，优先保留星标与高爆款分项）；
 * 2. 零遗漏保障：若某个账号或某种体裁（如小绿书）候选数量为 0，自动基于会话核心主题补齐合格候选。
 */
export declare function pruneAndEnsureGroupTopics(group: AccountTopicGroup, themeTitle?: string): CandidateTopic[];
/**
 * 规范化图片地址：将本地路径转换为安全加载的 wincode-media 协议 URL
 */
/**
 * 校验给定的 URL 是否为可在 HTML <img> 标签中直接渲染的真实有效图片地址（Data URL 或 HTTP(S) 网络地址）
 * 仅且只允许：data:、http://、https://、blob:
 * 严禁：wincode-media://、file://、裸物理路径或纯文件名（未经转码直接喂给 <img> 会导致 net::ERR 破图）
 */
export declare function isRenderableImageUrl(url?: string | null): boolean;
/**
 * 校验给定的 URL 是否为安全且可在 <img> 标签中直接渲染的媒体协议
 * 支持 data:、http://、https://、blob: 以及桌面环境本地转码协议 wincode-media://
 */
export declare function isSafeMediaUrl(url?: string | null): boolean;
export declare function normalizeLocalImageUrl(pathOrUrl: string): string;
/**
 * 从 URL 或 wincode-media 协议中还原物理磁盘真实路径
 */
export declare function extractLocalDiskPathFromUrl(pathOrUrl: string): string;
/**
 * 从任意本地路径、网络地址或 wincode-media 协议 URL 中精准提取物理纯文件名（如 cover_1.png、content_1_1.png）
 * 【中文修复依据】：先通过 extractLocalDiskPathFromUrl 解码与还原物理磁盘真实路径，
 * 彻底消除 URL query 编码（如 %5C）对文件名截取的干扰（彻底解决图 2 与图 3 产物无法显影问题）
 */
export declare function extractFileName(pathOrUrl: string): string;
/**
 * 在 WinCode Protocol v4 中，toolCall 的返回结果结构化序列化在 output.text 中。
 * 兼容解析 text 内部 JSON 及原有顶层对象字段，确保 tool output 真实载荷不被遗漏。
 */
export declare function parseToolOutputPayload(output: unknown): Record<string, unknown>;
/**
 * 校验文本是否属于工具执行完成返回的元数据 JSON 字符串（例如包含 account_id, file, theme, plain_chars 等）
 * 此类元数据绝不能被误当作文章正文或段落内容。
 */
export declare function isToolMetadataJson(str: unknown): boolean;
/**
 * 校验文本是否属于 MCP/工具报错或程序崩溃/未解析代码输出
 * 杜绝将 "MCP tool returned an error...", "doc_json 不是合法 JSON", Python Traceback 或未解析原始代码作为文章正文展示
 */
/**
 * 判断文章正文是否尚在排版构建/落盘生成阶段
 * 核心铁律：若当前篇目处于流式打字输出中，绝对不遮蔽为 pending 骨架屏，必须直接放行流式实时排版！
 */
export declare function isArticleContentPending(content?: string, filePath?: string, isStreaming?: boolean): boolean;
export declare function isToolErrorOrCrashContent(str: unknown): boolean;
/**
 * 从 Assistant 消息文本中全景解析多图文拟发布序列与同步小绿书
 * 兼容多篇长文排版清单表格（头条、次条、第3~7篇）及独立小绿书卡片
 */
export declare function parsePublishedSequenceFromAssistantText(text: string, options?: {
    platform?: string;
    accountId?: string;
    accountName?: string;
    scriptsDir?: string;
    maxArticles?: number;
}): ArticleItem[];
/**
 * 尝试从 Assistant 消息文本中回退提取文案/文章
 * 常见场景：当工具报错或未正常返回正文时，Agent 在文本回复中输出了完整的文案预览
 */
/**
 * 严格判定助手文本是否属于日常对话答疑、技术原理阐述、错误/时序排障复盘等非文章内容
 * 只要命中问答或排障特征，一律严禁提取为排版画布文章
 */
import { isAssistantConversationOrExplanation } from './socialPublisherConversationFilter.js';
export { isAssistantConversationOrExplanation };
export declare function parseArticleFromAssistantText(text: string, options?: {
    platform?: string;
    accountId?: string;
}): Partial<ArticleItem> | null;
export interface StreamingArticleParsed {
    index: number;
    title: string;
    digest?: string;
    content: string;
    isStreaming?: boolean;
    articleType?: 'news' | 'newspic';
    platform?: string;
    accountId?: string;
}
/**
 * 从 Assistant 流式增量文本中解析多篇/单篇正在生成的文章
 * 支持识别大模型按顺序正在输出的【第 N 篇】或文案预览，并在末尾段落标记 isStreaming
 */
export declare function parseStreamingArticlesFromAssistantText(text: string, options?: {
    platform?: string;
    accountId?: string;
    accountName?: string;
    isLastRow?: boolean;
}): StreamingArticleParsed[];
/**
 * 从 Assistant 消息文本中解析配图文件列表与落盘路径前缀
 */
export declare function parseImagesFromMarkdownText(text: string, options?: {
    accountId?: string;
    scriptsDir?: string;
}): string[];
/**
 * 标准化平台标识符为合法 Platform 类型
 */
export declare function normalizePlatformName(raw?: string): 'gzh' | 'xiaohongshu' | 'zhihu' | 'baijiahao' | 'toutiao' | null;
/**
 * 从多维会话信号中精准推断目标社媒平台（彻底消除硬编码小红书的问题）
 */
/**
 * 判定当前会话是否属于社媒发布任务
 * 全生命周期强感知：不仅仅在调用工具时生效，
 * 用户输入包含社媒指令/意图（公众号/小红书/知乎/社媒等）即在第一秒常驻激活
 */
export declare function isSocialPublisherSession(rows: readonly ConversationRow[]): boolean;
export declare function detectPlatformFromRows(rows: readonly ConversationRow[]): 'gzh' | 'xiaohongshu' | 'zhihu' | 'baijiahao' | 'toutiao';
/**
 * 将正文中的图片占位符（如 IMG_A1_1, IMG_1_1, ![...](IMG_A1_1)）精确映射替换为落盘的真实安全图片 URL
 * 确保富文本渲染与复制导出时图文 100% 严密贴合，消灭孤立字符串
 */
export declare function inlineInjectImagesIntoContent(content: string, images: string[], coverUrl?: string): string;
export interface ParsedImageMeta {
    url: string;
    kind: 'cover' | 'content' | 'pic';
    articleIndex: number;
    subIndex: number;
    platform?: string;
    accountId?: string;
    taskId?: string;
}
/**
 * 从图片 URL、文件名及生图参数中解析位置感知元数据
 */
export declare function parseImageMeta(rawUrlOrPath: string, hint?: {
    kind?: string;
    index?: number;
    sub?: number;
    platform?: string;
    accountId?: string;
    taskId?: string;
}): ParsedImageMeta;
/**
 * 从会话的真实 ConversationRow[] 中纯函数式提取社媒发布状态与全阶段数据
 */
export declare function extractSocialWorkflow(rows: readonly ConversationRow[]): ExtractedSocialWorkflow;
/**
 * 确定文章的目标卡片总数（小绿书 / 小红书画廊）
 * 【中文规范依据】：遵循四级事实源锁定，绝不允许因生图未完成而反向截断为 images.length
 */
/**
 * 确定文章的目标卡片总数（小绿书 / 小红书画廊）
 * 【中文规范依据】：契约四级事实源锁定，卡片总数由选题与规格权威决定，绝对禁止被 images.length 脏数据反向放大
 */
export declare function resolveTargetCardCount(article: ArticleItem): number;
//# sourceMappingURL=socialPublisherWorkflowExtractor.d.ts.map