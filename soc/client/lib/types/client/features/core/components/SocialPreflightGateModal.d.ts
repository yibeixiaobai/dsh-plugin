export interface SocialPreflightGateModalProps {
    open: boolean;
    unreadyAccounts: any[];
    onClose: () => void;
    onOpenLoginModal: (account: any) => void;
    onContinueWithReadyOnly: () => void;
}
/**
 * 社媒账号登录态前置预检门禁弹窗
 *
 * 【安全与意图规范】：
 * 演练模式意图严格受全局设置（runtime.dry_run）管控，绝不允许在弹窗中随意篡改系统运行模式；
 * 遇到未就绪账号时，用户可选择立即扫码授权，或仅执行已就绪账号。
 */
export declare function SocialPreflightGateModal({ open, unreadyAccounts, onClose, onOpenLoginModal, onContinueWithReadyOnly, }: SocialPreflightGateModalProps): import("react").JSX.Element;
//# sourceMappingURL=SocialPreflightGateModal.d.ts.map