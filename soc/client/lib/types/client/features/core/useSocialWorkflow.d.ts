import type { ExtractedSocialWorkflow } from './socialPublisherWorkflowExtractor.js';
export declare function useSocialWorkflow(sessionId?: string): {
    workflow: ExtractedSocialWorkflow;
    isSocial: boolean;
    hasArticles: boolean;
    refresh: () => void;
};
//# sourceMappingURL=useSocialWorkflow.d.ts.map