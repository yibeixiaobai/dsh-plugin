import { useEffect } from "react";
import css from "./SocialPublisherSettings.module.css";
import { SocialPublisherAccountRail } from "./SocialPublisherAccountRail.js";
import { SocialPublisherAccountDetailView } from "./SocialPublisherAccountDetailView.js";
import { SocialPublisherRuntimeTab } from "./SocialPublisherRuntimeTab.js";
import { SocialPublisherBackupTab } from "./SocialPublisherBackupTab.js";
import { useOptionalServices } from "../compat/hooks/useServices.js";
import {
  socialPublisherConfigStore,
  useSocialPublisherStore,
} from "./SocialPublisherConfigStore.js";
import { normalizeAccountsList } from "./SocialPublisherTypes.js";
import { CheckCircle2, RotateCcw, AlertCircle, RefreshCw } from "lucide-react";
import { ScopedErrorBoundary } from "../ErrorBoundary.js";

function SocialPublisherSectionInner() {
  const services = useOptionalServices();
  const socialPublisherRpc = services?.socialPublisherService ?? null;

  const {
    config,
    activeNav,
    saveStatus,
    saveError,
    loading,
  } = useSocialPublisherStore();

  useEffect(() => {
    socialPublisherConfigStore.init(socialPublisherRpc);
    return () => {
      socialPublisherConfigStore.flushPendingSave();
    };
  }, [socialPublisherRpc]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        socialPublisherConfigStore.executeSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const accountsList = normalizeAccountsList(config?.accounts);
  const activeCount = accountsList.filter((a: any) => a.enabled !== false).length;

  return (
    <div className={css.settingsContainer} data-testid="social-publisher-section" data-full-bleed="true">
      {/* 顶部现代化控制条 */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/60 bg-surface/40 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-ui-base font-semibold text-foreground tracking-tight">社媒多平台发布设置</h1>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-border/80 bg-surface/80 text-[11px] font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>本地服务正常 · {activeCount}/{accountsList.length} 账号就绪</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* 类似 Notion / Figma 的静默落盘状态微标 */}
          <div className="flex items-center gap-1.5 text-ui-xs text-muted-foreground select-none">
            {saveStatus === "saving" && (
              <>
                <RotateCcw className="size-3.5 animate-spin text-primary" />
                <span className="text-primary font-medium">正在保存...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  所有配置已自动保存
                </span>
              </>
            )}
            {saveStatus === "error" && (
              <>
                <AlertCircle className="size-3.5 text-destructive" />
                <span className="text-destructive font-medium">{saveError || "保存失败"}</span>
              </>
            )}
            {saveStatus === "idle" && (
              <>
                <CheckCircle2 className="size-3.5 text-muted-foreground" />
                <span>就绪</span>
              </>
            )}
          </div>

          <button
            type="button"
            className="flex h-7 items-center gap-1 rounded border border-border/80 bg-background px-2 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
            onClick={() => socialPublisherConfigStore.fetchFromBackend()}
            title="从本地服务磁盘重新拉取"
            disabled={loading}
          >
            <RefreshCw className={`size-3 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 母子联动工作台 (Master-Detail) */}
      <div className={css.masterDetailLayout}>
        {/* 左侧母列表 (Master Rail) */}
        <SocialPublisherAccountRail />

        {/* 右侧详情主舞台 (Detail Stage) */}
        <main className={css.detailStage}>
          {activeNav.startsWith("acc_") && <SocialPublisherAccountDetailView />}

          {activeNav === "sys_runtime" && (
            <div className={css.stageContainer}>
              <div className="pb-5 border-b border-border/80">
                <h2 className="text-ui-lg font-bold text-foreground">全局运行环境与生图接口池</h2>
                <p className="text-ui-xs text-foreground-subtle">
                  配置 Python 解释器、Chrome 驱动路径、人机验证弹窗接管与 AI 生图 Provider 接口池
                </p>
              </div>
              <SocialPublisherRuntimeTab
                config={config}
                setConfig={(updater: any) => {
                  if (typeof updater === "function") {
                    socialPublisherConfigStore.updateConfig(updater);
                  } else {
                    socialPublisherConfigStore.updateConfig(() => updater);
                  }
                }}
              />
            </div>
          )}

          {activeNav === "sys_backup" && (
            <div className={css.stageContainer}>
              <div className="pb-5 border-b border-border/80">
                <h2 className="text-ui-lg font-bold text-foreground">配置备份、迁移与即时落地</h2>
                <p className="text-ui-xs text-foreground-subtle">
                  与 WinCode 保持一致的 JSON 备份导出、增量导入与全量覆盖，支持一键载入本机历史配置
                </p>
              </div>
              <SocialPublisherBackupTab
                config={config}
                onConfigSaved={(newCfg: any) => {
                  socialPublisherConfigStore.updateConfig(() => newCfg, true);
                }}
                setStatusMessage={(msg: any) => {
                  if (msg?.type === "error") {
                    alert(msg.text);
                  }
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export function SocialPublisherSection() {
  return (
    <ScopedErrorBoundary scope="SocialPublisherSection">
      <SocialPublisherSectionInner />
    </ScopedErrorBoundary>
  );
}
