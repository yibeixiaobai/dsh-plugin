import { AlertTriangle, QrCode } from 'lucide-react'
import { Button } from '../../../compat/components/ui/button.js'

export interface SocialPreflightGateModalProps {
  open: boolean
  unreadyAccounts: any[]
  onClose: () => void
  onOpenLoginModal: (account: any) => void
  onContinueWithReadyOnly: () => void
}

/**
 * 社媒账号登录态前置预检门禁弹窗
 *
 * 【安全与意图规范】：
 * 演练模式意图严格受全局设置（runtime.dry_run）管控，绝不允许在弹窗中随意篡改系统运行模式；
 * 遇到未就绪账号时，用户可选择立即扫码授权，或仅执行已就绪账号。
 */
export function SocialPreflightGateModal({
  open,
  unreadyAccounts,
  onClose,
  onOpenLoginModal,
  onContinueWithReadyOnly,
}: SocialPreflightGateModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="flex flex-col gap-3 max-w-md w-full rounded-2xl border border-amber-500/40 bg-card p-4 shadow-xl">
        <div className="flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h4 className="text-ui-sm font-bold text-foreground">
              社媒账号登录态预检提醒
            </h4>
            <p className="text-ui-2xs text-foreground-muted">
              检测到以下选中账号尚未登录或会话凭据已失效，实盘发布时可能会遭遇拦截：
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-border/40 bg-surface/40 p-2.5 max-h-36 overflow-y-auto">
          {unreadyAccounts.map(acc => (
            <div
              key={acc.id}
              className="flex items-center justify-between text-ui-xs py-0.5"
            >
              <span className="font-medium text-foreground">
                {acc.name || acc.id} ({acc.platform})
              </span>
              <button
                type="button"
                onClick={() => onOpenLoginModal(acc)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
              >
                <QrCode className="size-2.5" />
                <span>立即扫码</span>
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 text-ui-2xs cursor-pointer"
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onContinueWithReadyOnly}
            className="h-7 text-ui-2xs cursor-pointer"
          >
            仅发布已就绪账号
          </Button>
        </div>
      </div>
    </div>
  )
}
