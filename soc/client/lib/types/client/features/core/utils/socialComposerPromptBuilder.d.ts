import type { SocialPlatformKey, SocialAccountTaskPlan } from './socialPlatformsMeta.js';
export declare function buildSocialComposerPrompts(params: {
    platformsToSubmit: SocialPlatformKey[];
    accountsToUse: any[];
    selectAll: boolean;
    notesToSubmit: string;
    isDryRun: boolean;
    platformsMeta: Array<{
        key: SocialPlatformKey;
        label: string;
    }>;
    sessionId?: string;
    workspacePath?: string;
}): {
    formattedPrompt: string;
    accountsPlan: SocialAccountTaskPlan[];
};
/**
 * 解析并继承用于派生子会话的模型、思考深度与推理选项（多级回退机制）
 * 中文修复原因：推理模型（如 new-provider-2/gemini-3.8-flash, o1 等）需要明确的 reasoningLevel / thought，
 * 否则 CLI 在 model_creation 时会报 ModelProtocolError: Reasoning level is required 导致子账号会话直接崩溃。
 */
export declare function resolveDerivedSessionModelAndThought(params: {
    unifiedModel?: {
        provider: string;
        model: string;
        displayName?: string;
    };
    draftConfig?: {
        modelSelection?: {
            providerId: string;
            modelId: string;
            options?: {
                reasoningLevel?: string;
            };
        };
        thought?: string;
    };
    snapshotConfig?: {
        modelSelection?: {
            providerId: string;
            modelId: string;
            options?: {
                reasoningLevel?: string;
            };
        };
        provider?: string;
        model?: string;
        thought?: string;
    };
}): {
    effectiveModelSelection?: {
        provider: string;
        model: string;
    };
    effectiveOptions?: {
        reasoningLevel?: string;
    };
    effectiveThought?: string;
};
//# sourceMappingURL=socialComposerPromptBuilder.d.ts.map