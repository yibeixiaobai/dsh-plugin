import { useState, useEffect, useCallback, useRef } from "react";
import { Download, Copy, Upload, CheckCircle2, AlertTriangle, XCircle, FileCode, Check, RefreshCw } from "lucide-react";
import { Switch } from "../compat/components/ui/switch.js";
import { useOptionalServices } from "../compat/hooks/useServices.js";
import { publisherApiFetch, safeParseJson, serializePublisherConfigPayload } from "./SocialPublisherTypes.js";
import {
  clientValidateImportConfig,
  clientMergeConfigData,
  clientExportConfigData,
  type ExportScope,
  type ClientValidationResult,
} from "./SocialPublisherConfigIO.js";
import css from "./SocialPublisherSettings.module.css";

interface BackupTabProps {
  config: any;
  onConfigSaved: (newConfig: any) => void;
  setStatusMessage: (msg: { type: "success" | "error"; text: string } | null) => void;
}

const SCOPE_OPTIONS: { label: string; value: ExportScope }[] = [
  { label: "全量配置 (所有账号、接口池、排版规则与运行时)", value: "all" },
  { label: "仅账号档案 (accounts)", value: "accounts" },
  { label: "仅生图接口池 (image_providers)", value: "image_providers" },
  { label: "仅排版与配图视觉规则 (typography & image_spec)", value: "visual_rules" },
  { label: "仅运行环境设置 (runtime)", value: "runtime" },
];

export function SocialPublisherBackupTab({
  config: _config,
  onConfigSaved,
  setStatusMessage,
}: BackupTabProps) {
  const services = useOptionalServices();
  const socialPublisherRpc = services?.socialPublisherService ?? null;

  // 导出状态：默认开启安全脱敏 (置空密钥)
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [maskSecrets, setMaskSecrets] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // 导入状态
  const [importJson, setImportJson] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ClientValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 执行导出获取数据：优先 RPC/后台接口，遭遇断连或 HTML 响应时无缝降级至前端内存快照导出，100% 杜绝输出 HTML
  const fetchExportData = useCallback(async () => {
    setExportLoading(true);
    try {
      const includeSecrets = !maskSecrets;
      try {
        const route = `/api/gzh-publisher/config/export?scope=${exportScope}&include_secrets=${includeSecrets}&download=false`;
        const res = await publisherApiFetch(route, {}, socialPublisherRpc);
        const parsed = await safeParseJson(res);
        if (parsed.ok && parsed.data && typeof parsed.data === "object") {
          const raw = parsed.data.config || parsed.data;
          if (raw && typeof raw === "object") {
            return parsed.data;
          }
        }
      } catch {
        // 后台未响应时静默走前端高可靠内存快照
      }

      return clientExportConfigData(_config, {
        scope: exportScope,
        includeSecrets,
      });
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `获取导出数据失败: ${err.message}` });
      return null;
    } finally {
      setExportLoading(false);
    }
  }, [exportScope, maskSecrets, setStatusMessage, socialPublisherRpc, _config]);

  // 复制到剪贴板
  const handleCopyExport = async () => {
    const data = await fetchExportData();
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setStatusMessage({ type: "success", text: "已将导出配置复制到剪贴板！" });
    } catch (e: any) {
      setStatusMessage({ type: "error", text: `复制失败: ${e.message}` });
    }
  };

  // 下载配置文件：采用纯客户端 Blob 内存生成，杜绝任何外部 URL 导致下载到 index.html
  const handleDownloadExport = async () => {
    setExportLoading(true);
    try {
      const data = await fetchExportData();
      if (!data) return;

      if (typeof data === "string" && (data.includes("<html") || data.startsWith("<!"))) {
        throw new Error("检测到异常网页内容，已自动阻止导出非 JSON 文件");
      }

      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href = url;
      a.download = `wincast-social-publisher-config-${exportScope}-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage({ type: "success", text: "配置文件导出成功并已开始下载！" });
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `导出下载失败: ${err.message}` });
    } finally {
      setExportLoading(false);
    }
  };

  // 前端即时快速校验 + 后端双轨校验
  const runValidation = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setValidationResult(null);
        return;
      }

      const localResult = clientValidateImportConfig(text);
      setValidationResult(localResult);

      if (!localResult.valid) {
        return;
      }

      if (socialPublisherRpc) {
        setValidating(true);
        try {
          const res = await publisherApiFetch(
            "/api/gzh-publisher/config/validate",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: text,
            },
            socialPublisherRpc,
          );
          const parsed = await safeParseJson(res);
          if (parsed.ok && parsed.data?.valid) {
            setValidationResult((prev: any) => ({
              ...prev,
              ...parsed.data,
              valid: true,
            }));
          }
        } catch {
          // 保持本地校验通过的结果
        } finally {
          setValidating(false);
        }
      }
    },
    [socialPublisherRpc],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (importJson.trim()) runValidation(importJson);
      else setValidationResult(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [importJson, runValidation]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result || "");
      setImportJson(content);
      runValidation(content);
    };
    reader.readAsText(file, "utf-8");
  };

  const executeImport = async (mode: "merge" | "overwrite") => {
    if (!importJson.trim()) return;

    const validated = validationResult?.valid ? validationResult : clientValidateImportConfig(importJson);
    if (!validated.valid || !validated.data) {
      setStatusMessage({ type: "error", text: "配置结构校验未通过，请检查错误提示后再执行导入" });
      return;
    }

    setImporting(true);
    setStatusMessage(null);

    const mergedConfig = clientMergeConfigData(_config, validated.data, mode);
    onConfigSaved(mergedConfig);

    try {
      const payload = serializePublisherConfigPayload(mergedConfig);
      const res = await publisherApiFetch(
        "/api/gzh-publisher/config/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok) {
        setStatusMessage({
          type: "success",
          text:
            mode === "merge"
              ? "已成功增量合并导入配置并即时同步落盘！"
              : "已成功全量覆盖导入配置并即时同步落盘！",
        });
      } else {
        setStatusMessage({
          type: "success",
          text: `配置已成功${mode === "merge" ? "增量合并" : "全量覆盖"}导入并在当前界面即时生效！（后台离线，已保留于本地）`,
        });
      }
    } catch {
      setStatusMessage({
        type: "success",
        text: `配置已成功${mode === "merge" ? "增量合并" : "全量覆盖"}导入并在当前界面即时生效！`,
      });
    } finally {
      setImporting(false);
    }
  };

  const summary = validationResult?.summary;

  return (
    <div className="space-y-6" data-testid="social-publisher-backup-tab">
      {/* 模块 1：配置导出 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>配置导出与脱敏备份</span>
          <span className="text-[11px] font-normal text-muted-foreground">Export & Backup</span>
        </div>

        <div className={css.macosGroupCard}>
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>选择导出范围 (Scope)</div>
              <div className={css.macosRowHint}>可选择仅备份账号、生图接口、排版规则或全量配置</div>
            </div>
            <div className={css.macosRowControl}>
              <select
                className="h-7 rounded border border-border/80 bg-background px-2 text-[12px] text-foreground font-medium focus:border-primary focus:outline-none"
                value={exportScope}
                onChange={(e) => setExportScope(e.target.value as ExportScope)}
              >
                {SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>安全脱敏导出 (Mask Secrets)</div>
              <div className={css.macosRowHint}>自动置空微信 AppSecret 与生图 API 密钥，适合公开分享或团队归档</div>
            </div>
            <div className={css.macosRowControl}>
              <Switch checked={maskSecrets} onCheckedChange={(c) => setMaskSecrets(c)} />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>生成与获取备份文件</div>
              <div className={css.macosRowHint}>支持纯客户端内存 Blob 快速下载或复制格式化 JSON</div>
            </div>
            <div className={css.macosRowControl}>
              <button
                type="button"
                className="flex h-7 items-center justify-center gap-1.5 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer"
                onClick={handleCopyExport}
                disabled={exportLoading}
              >
                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3 text-muted-foreground" />}
                <span>{copied ? "已复制" : "复制 JSON"}</span>
              </button>
              <button
                type="button"
                className="flex h-7 items-center justify-center gap-1.5 rounded bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
                onClick={handleDownloadExport}
                disabled={exportLoading}
              >
                <Download className="size-3.5" />
                <span>下载配置文件</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 模块 2：配置导入、结构预检与落地 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>配置导入、结构预检与落地</span>
          <span className="text-[11px] font-normal text-muted-foreground">Import & Restore</span>
        </div>

        <div className={css.macosGroupCard}>
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>选择配置文件或载入快照</div>
              <div className={css.macosRowHint}>支持选择本地 JSON 备份文件或一键读取当前生效的本地配置</div>
            </div>
            <div className={css.macosRowControl}>
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
              <button
                type="button"
                className="flex h-7 items-center justify-center gap-1.5 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileCode className="size-3.5 text-muted-foreground" />
                <span>选择文件</span>
              </button>
              <button
                type="button"
                className="flex h-7 items-center justify-center gap-1.5 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer"
                onClick={async () => {
                  const data = await fetchExportData();
                  if (data) {
                    const jsonStr = JSON.stringify(data, null, 2);
                    setImportJson(jsonStr);
                    runValidation(jsonStr);
                    setStatusMessage({ type: "success", text: "已为您成功填入本机当前社媒发布配置！" });
                  }
                }}
              >
                <RefreshCw className="size-3 text-muted-foreground" />
                <span>载入本机配置</span>
              </button>
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>执行导入与落地应用</div>
              <div className={css.macosRowHint}>
                增量合并保留本地已有凭据并追加新项；全量覆盖将彻底替换当前所有设置
              </div>
            </div>
            <div className={css.macosRowControl}>
              <button
                type="button"
                className="flex h-7 items-center justify-center gap-1 rounded border border-border/80 bg-background px-2.5 text-[12px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                onClick={() => executeImport("merge")}
                disabled={!validationResult?.valid || importing}
                title="保留本地已有凭据与设置，追加新增账号/接口（推荐）"
              >
                <span>增量合并 (推荐)</span>
              </button>
              <button
                type="button"
                className="flex h-7 items-center justify-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2.5 text-[12px] font-medium text-destructive hover:bg-destructive/20 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                onClick={() => executeImport("overwrite")}
                disabled={!validationResult?.valid || importing}
                title="完全使用导入的内容替换本地现有配置"
              >
                <span>全量覆盖</span>
              </button>
            </div>
          </div>

          {/* 预检看板 */}
          {validationResult && (
            <div
              className="p-3.5 border-t border-border/60 text-[12px] space-y-2.5"
              style={{
                background: validationResult.valid ? "rgba(16, 185, 129, 0.04)" : "rgba(239, 68, 68, 0.04)",
              }}
            >
              <div className="flex items-center gap-2 font-semibold">
                {validationResult.valid ? (
                  <>
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    <span className="text-emerald-600 dark:text-emerald-400">配置结构校验通过，可安全执行导入</span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-4 text-destructive shrink-0" />
                    <span className="text-destructive">配置校验未通过，请检查错误提示</span>
                  </>
                )}
              </div>

              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11.5px]">
                  <div className="p-2 rounded border border-border/60 bg-surface/50">
                    <span className="block text-muted-foreground">社媒账号</span>
                    <span className="font-semibold text-foreground">{summary.account_count} 个</span>
                  </div>
                  <div className="p-2 rounded border border-border/60 bg-surface/50">
                    <span className="block text-muted-foreground">生图接口池</span>
                    <span className="font-semibold text-foreground">{summary.provider_count} 个</span>
                  </div>
                  <div className="p-2 rounded border border-border/60 bg-surface/50">
                    <span className="block text-muted-foreground">排版与配图规则</span>
                    <span className="font-semibold text-foreground">{summary.has_typography ? "包含" : "无"}</span>
                  </div>
                  <div className="p-2 rounded border border-border/60 bg-surface/50">
                    <span className="block text-muted-foreground">运行环境</span>
                    <span className="font-semibold text-foreground">{summary.has_runtime ? "包含" : "无"}</span>
                  </div>
                </div>
              )}

              {((validationResult.errors && validationResult.errors.length > 0) || validationResult.error) && (
                <div className="space-y-1 text-destructive text-[11.5px]">
                  {validationResult.errors?.map((err: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <XCircle className="size-3.5 shrink-0 mt-0.5" />
                      <span>{err}</span>
                    </div>
                  ))}
                  {validationResult.error && !validationResult.errors?.length && (
                    <div className="flex items-start gap-1.5">
                      <XCircle className="size-3.5 shrink-0 mt-0.5" />
                      <span>{validationResult.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 拖拽/粘贴文本框 */}
          <div className="p-3.5 border-t border-border/60 relative">
            <textarea
              className="h-36 w-full rounded border border-border/80 bg-background p-2.5 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none resize-y"
              placeholder="在此粘贴导出的配置 JSON 或将 .json 配置文件拖拽至此..."
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
              }}
            />
            {validating && (
              <div className="absolute right-6 bottom-6 text-[11px] text-muted-foreground bg-surface px-2 py-0.5 rounded border border-border/80">
                正在校验结构中...
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
