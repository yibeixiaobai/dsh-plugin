/**
 * 双体裁配额调和与幽灵草稿剔除切片 (Dual-Format Quota Reconciler)
 * 职责：严格按账号目标体裁（长文 vs 小绿书）配额截断篇目，在审校及发布阶段物理剔除未落盘的虚假幽灵草稿
 */
import type { ArticleItem } from '../socialPublisherWorkflowExtractor.js';
export interface QuotaReconciliationOptions {
    articles: ArticleItem[];
    targetArticleCount?: number;
    articleQuota?: number;
    newspicQuota?: number;
    isReviewOrLater?: boolean;
}
/**
 * 执行双体裁配额与草稿调和
 */
export declare function reconcileDualFormatQuotas(options: QuotaReconciliationOptions): ArticleItem[];
//# sourceMappingURL=quotaReconciler.d.ts.map