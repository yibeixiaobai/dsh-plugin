import React from 'react';
import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js';
export interface WechatMultiArticleOverviewProps {
    articles: ArticleItem[];
    workspacePath?: string;
    workspaceIdentity?: string;
    sessionId?: string;
    scriptsDir?: string;
    onSelectArticle: (index: number) => void;
}
/**
 * 微信公众号「多图文群发合辑」高保真拟真排版看板
 * 完美复刻微信订阅号消息流：头条 2.35:1 大图 + 次条 1:1 方图紧凑列表 + 小绿书 3:4 竖版多图胶卷
 */
export declare function WechatMultiArticleOverview({ articles, workspacePath, workspaceIdentity, sessionId, scriptsDir: explicitScriptsDir, onSelectArticle, }: WechatMultiArticleOverviewProps): React.JSX.Element;
//# sourceMappingURL=WechatMultiArticleOverview.d.ts.map