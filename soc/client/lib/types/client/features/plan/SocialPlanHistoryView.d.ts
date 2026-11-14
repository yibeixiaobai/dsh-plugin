interface SocialPlanHistoryViewProps {
    allAccounts: any[];
    socialPublisherRpc?: any;
    onSummaryChange?: (summary: {
        totalBatches: number;
        totalArticles: number;
        scheduledCount: number;
        draftSavedCount: number;
    }) => void;
}
export declare function SocialPlanHistoryView({ allAccounts, socialPublisherRpc, onSummaryChange, }: SocialPlanHistoryViewProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPlanHistoryView.d.ts.map