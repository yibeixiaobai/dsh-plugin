import { memo, useMemo } from "react";
import { Sparkles, AlertCircle, ArrowUpRight } from "lucide-react";
import { Button } from "../compat/components/ui/button.js";
import { useModelProviders } from "../compat/hooks/useModelProviders.js";
import { useTabStore } from "../compat/store/TabStoreProvider.js";
import { setPendingSettingsSectionIntent } from "../compat/lib/settingsNavigation.js";
import { getProviderFormLabel } from "../compat/lib/providerSettingsFormTypes.js";

export const SocialPublisherUnifiedModelStatusCard = memo(
  function SocialPublisherUnifiedModelStatusCard() {
    const openSettingsTab = useTabStore((state) => state.openSettingsTab);
    const { modelProviders } = useModelProviders({ workspacePath: "" });

    const activeModel = useMemo(() => {
      for (const p of modelProviders || []) {
        if (!p.enabled) continue;
        for (const m of p.models || []) {
          const isImage =
            m.config?.properties?.outputFormat?.supportsImage === true ||
            m.personalConfig?.properties?.outputFormat?.supportsImage === true;
          if (isImage && (m.config as any)?.enabled !== false) {
            return {
              providerName: getProviderFormLabel(p),
              modelId: m.modelId,
            };
          }
        }
      }
      return null;
    }, [modelProviders]);

    const handleGoToModelSettings = () => {
      setPendingSettingsSectionIntent("modelProvider");
      openSettingsTab();
    };

    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] dark:bg-primary/[0.06] p-3.5 text-ui-xs">
        <div className="flex items-start gap-2.5">
          {activeModel ? (
            <Sparkles className="size-4 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">AI 生图模型服务</span>
              {activeModel ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium text-[11px] border border-emerald-500/20">
                  当前生效：{activeModel.providerName} / {activeModel.modelId}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium text-[11px] border border-amber-500/20">
                  未配置生图模型
                </span>
              )}
            </div>
            <p className="text-foreground-subtle text-ui-2xs leading-relaxed">
              社媒发布模式生图模型现已统一采用【模型设置】中勾选了生图输出类型的模型，不再使用社媒私有接口池。
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGoToModelSettings}
          className="h-7 text-ui-xs gap-1 shrink-0 self-start sm:self-center"
        >
          <span>模型设置</span>
          <ArrowUpRight className="size-3" />
        </Button>
      </div>
    );
  },
);
