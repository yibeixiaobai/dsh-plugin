/**
 * 双体裁配额调和与幽灵草稿剔除切片 (Dual-Format Quota Reconciler)
 * 职责：严格按账号目标体裁（长文 vs 小绿书）配额截断篇目，在审校及发布阶段物理剔除未落盘的虚假幽灵草稿
 */
/**
 * 执行双体裁配额与草稿调和
 */
export function reconcileDualFormatQuotas(options) {
    const { articles, targetArticleCount = 1, articleQuota, newspicQuota, isReviewOrLater = false, } = options;
    if (!articles || articles.length === 0)
        return [];
    const isGzh = articles.some(a => a.platform === 'gzh');
    const isXhs = articles.some(a => a.platform === 'xiaohongshu');
    // 小红书专属：全量为小红书笔记，严格按目标总数截断
    if (isXhs) {
        const validNotes = isReviewOrLater
            ? articles.filter(a => Boolean(a.filePath) || Boolean(a.coverUrl) || (a.images && a.images.length > 0))
            : articles;
        return validNotes.slice(0, targetArticleCount);
    }
    // 非公众号：按通用文章目标总数截断
    if (!isGzh) {
        return articles.slice(0, targetArticleCount);
    }
    // 微信公众号：分离长文与小绿书
    const newsArticles = articles.filter(a => a.articleType !== 'newspic');
    const newspicArticles = articles.filter(a => a.articleType === 'newspic');
    const effectiveNewsQuota = articleQuota ?? (newspicQuota !== undefined ? Math.max(0, targetArticleCount - newspicQuota) : targetArticleCount);
    const effectiveNewspicQuota = newspicQuota ?? Math.max(0, targetArticleCount - effectiveNewsQuota);
    // 1. 长文按配额截断并在审校阶段清洗幽灵次条
    let truncatedNews = newsArticles.slice(0, effectiveNewsQuota > 0 ? effectiveNewsQuota : undefined);
    if (isReviewOrLater) {
        const hasPhysicalNews = truncatedNews.some(a => Boolean(a.filePath && (a.id.startsWith('art_file_') || (!a.id.startsWith('art_auto_') && !a.id.startsWith('art_seq_')))));
        if (hasPhysicalNews) {
            truncatedNews = truncatedNews.filter(a => Boolean(a.filePath && (a.id.startsWith('art_file_') || (!a.id.startsWith('art_auto_') && !a.id.startsWith('art_seq_')))));
        }
    }
    // 2. 小绿书按配额截断并清洗幽灵草稿
    let truncatedNewspics = newspicArticles.slice(0, effectiveNewspicQuota > 0 ? effectiveNewspicQuota : undefined);
    if (isReviewOrLater) {
        truncatedNewspics = truncatedNewspics.filter(a => Boolean(a.filePath) || (Array.isArray(a.images) && a.images.length > 0));
    }
    // 3. 重新聚合合并
    return [...truncatedNews, ...truncatedNewspics];
}
//# sourceMappingURL=quotaReconciler.js.map