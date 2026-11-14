export interface UnifiedImageModelItem {
    providerId: string;
    providerName: string;
    modelId: string;
    modelName: string;
}
export interface SocialPublisherImageModelIndicatorProps {
    workspacePath?: string;
    disabled?: boolean;
    onModelSelect?: (model: UnifiedImageModelItem | null) => void;
    selectedModelId?: string;
}
export declare const SocialPublisherImageModelIndicator: import("react").MemoExoticComponent<({ workspacePath, disabled, }: SocialPublisherImageModelIndicatorProps) => import("react").JSX.Element>;
//# sourceMappingURL=SocialPublisherImageModelIndicator.d.ts.map