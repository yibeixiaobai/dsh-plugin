import type { ExtractedSocialWorkflow } from "../../core/socialPublisherWorkflowExtractor.js";
export interface StudioHeaderProps {
    workflow: ExtractedSocialWorkflow;
    physicalSaveStatus?: "idle" | "saving" | "synced" | "error";
}
/**
 * 顶部标题栏（工作台标识、阶段微指示器、正式/演练模式、落盘同步状态）
 */
export declare function StudioHeader({ workflow, physicalSaveStatus }: StudioHeaderProps): import("react").JSX.Element;
//# sourceMappingURL=StudioHeader.d.ts.map