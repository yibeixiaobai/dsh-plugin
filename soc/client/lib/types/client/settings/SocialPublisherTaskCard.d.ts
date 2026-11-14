import type { WechatScheduledTask } from "./SocialPublisherTypes.js";
interface TaskCardProps {
    task: WechatScheduledTask;
    index: number;
    syncing: boolean;
    cancelingTaskId: string | null;
    activeCancelPopoverId: string | null;
    onToggleCancelPopover: (id: string | null) => void;
    onCancelTask: (task: WechatScheduledTask) => void;
}
export declare function SocialPublisherTaskCard({ task, index, syncing, cancelingTaskId, activeCancelPopoverId, onToggleCancelPopover, onCancelTask, }: TaskCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SocialPublisherTaskCard.d.ts.map