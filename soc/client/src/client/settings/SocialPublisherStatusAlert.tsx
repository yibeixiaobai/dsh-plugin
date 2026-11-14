import { CheckCircle2, AlertCircle, X } from "lucide-react";

interface SocialPublisherStatusAlertProps {
  statusMessage: { type: "success" | "error"; text: string } | null;
  onClose: () => void;
}

export function SocialPublisherStatusAlert({
  statusMessage,
  onClose,
}: SocialPublisherStatusAlertProps) {
  if (!statusMessage) return null;

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 text-ui-xs transition-all ${
        statusMessage.type === "success"
          ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300"
          : "border-destructive/25 bg-destructive/[0.08] text-destructive"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {statusMessage.type === "success" ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
        ) : (
          <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
        )}
        <span className="leading-relaxed font-medium">{statusMessage.text}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-foreground-subtle hover:text-foreground p-0.5 rounded transition-colors"
        title="关闭提示"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
