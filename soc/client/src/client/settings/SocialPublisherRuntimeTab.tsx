import { Switch } from "../compat/components/ui/switch.js";
import { AlertCircle } from "lucide-react";
import { SocialPublisherUnifiedModelStatusCard } from "./SocialPublisherUnifiedModelStatusCard.js";
import css from "./SocialPublisherSettings.module.css";

interface RuntimeTabProps {
  config: any;
  setConfig: React.Dispatch<React.SetStateAction<any>>;
}

export function SocialPublisherRuntimeTab({ config, setConfig }: RuntimeTabProps) {
  const runtime = config.runtime || {};

  return (
    <div className="space-y-6" data-testid="social-publisher-runtime-tab">
      {/* 演练模式实时提醒横幅 */}
      {Boolean(runtime.dry_run) && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[12px]">
          <AlertCircle className="size-4 shrink-0" />
          <span className="font-medium">
            当前处于演练模式（Dry Run）：排版流水线正常执行，但不会对外部平台产生真实发文，也不会扣除外部生图配额。
          </span>
        </div>
      )}

      {/* 1. 本地环境与执行路径 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>本地工作区与执行器路径</span>
          <span className="text-[11px] font-normal text-muted-foreground">Local Environment</span>
        </div>

        <div className={css.macosGroupCard}>
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>任务工作区路径 (Project Root)</div>
              <div className={css.macosRowHint}>生成草稿、中间图文与下载文件的本地根目录</div>
            </div>
            <div className={css.macosRowControl}>
              <input
                type="text"
                placeholder="留空使用插件内置 tasks/default"
                value={runtime.project_root || ""}
                onChange={(e) =>
                  setConfig((p: any) => ({
                    ...p,
                    runtime: { ...runtime, project_root: e.target.value },
                  }))
                }
                className="h-7 w-72 rounded border border-border/80 bg-background px-2 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>Python 解释器路径</div>
              <div className={css.macosRowHint}>本地 Python 3.10+ 环境，用于支持高级排版解析器</div>
            </div>
            <div className={css.macosRowControl}>
              <input
                type="text"
                placeholder="python 或绝对路径"
                value={runtime.python_path || "python"}
                onChange={(e) =>
                  setConfig((p: any) => ({
                    ...p,
                    runtime: { ...runtime, python_path: e.target.value },
                  }))
                }
                className="h-7 w-72 rounded border border-border/80 bg-background px-2 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>本地 Chrome / Edge 浏览器路径</div>
              <div className={css.macosRowHint}>自动化发文驱动所调用的浏览器内核，留空将自动探测</div>
            </div>
            <div className={css.macosRowControl}>
              <input
                type="text"
                placeholder="留空自动检测本机浏览器（Chrome/Edge）"
                value={runtime.chrome_path || ""}
                onChange={(e) =>
                  setConfig((p: any) => ({
                    ...p,
                    runtime: { ...runtime, chrome_path: e.target.value },
                  }))
                }
                className="h-7 w-72 rounded border border-border/80 bg-background px-2 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. 网络与执行策略 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>网络与流水线运行策略</span>
          <span className="text-[11px] font-normal text-muted-foreground">Execution Policy</span>
        </div>

        <div className={css.macosGroupCard}>
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>单次网络请求超时 (毫秒)</div>
              <div className={css.macosRowHint}>请求平台接口及下载网络配图的最长等待时限</div>
            </div>
            <div className={css.macosRowControl}>
              <input
                type="number"
                value={runtime.request_timeout_ms ?? 60000}
                onChange={(e) =>
                  setConfig((p: any) => ({
                    ...p,
                    runtime: { ...runtime, request_timeout_ms: Number(e.target.value) },
                  }))
                }
                className="h-7 w-28 rounded border border-border/80 bg-background px-2 font-mono text-[12px] text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>演练模式 (Dry Run)</div>
              <div className={css.macosRowHint}>全流程排版照常执行，但不实际联网向公网发布与扣减额度</div>
            </div>
            <div className={css.macosRowControl}>
              <Switch
                checked={Boolean(runtime.dry_run)}
                onCheckedChange={(c) =>
                  setConfig((p: any) => ({ ...p, runtime: { ...runtime, dry_run: c } }))
                }
              />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>断点续跑素材缓存 (Upload Cache)</div>
              <div className={css.macosRowHint}>记录各文章已上传图文媒体 ID，异常中断后重新发起免重复上传</div>
            </div>
            <div className={css.macosRowControl}>
              <Switch
                checked={Boolean(runtime.use_upload_cache ?? true)}
                onCheckedChange={(c) =>
                  setConfig((p: any) => ({ ...p, runtime: { ...runtime, use_upload_cache: c } }))
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3. 浏览器自动化与接管 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>自动化浏览器驱动与接管</span>
          <span className="text-[11px] font-normal text-muted-foreground">Stealth & Takeover</span>
        </div>

        <div className={css.macosGroupCard}>
          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>无头静默模式 (Headless)</div>
              <div className={css.macosRowHint}>后台发布时不弹出前台窗口，静默在后台完成排版上传</div>
            </div>
            <div className={css.macosRowControl}>
              <Switch
                checked={Boolean(runtime.headless ?? runtime.zhihu_headless ?? true)}
                onCheckedChange={(c) =>
                  setConfig((p: any) => ({
                    ...p,
                    runtime: {
                      ...runtime,
                      headless: c,
                      zhihu_headless: c,
                      gzh_headless: c,
                      xhs_headless: c,
                      baijiahao_headless: c,
                      toutiao_headless: c,
                    },
                  }))
                }
              />
            </div>
          </div>

          <div className={css.macosRow}>
            <div className={css.macosRowInfo}>
              <div className={css.macosRowLabel}>人机验证弹窗接管</div>
              <div className={css.macosRowHint}>遇到滑块、旋转或文字点选验证码时，自动唤醒前台窗口供人工交互</div>
            </div>
            <div className={css.macosRowControl}>
              <Switch
                checked={Boolean(
                  runtime.baijiahao_reveal_on_challenge ?? runtime.toutiao_reveal_on_challenge,
                )}
                onCheckedChange={(c) =>
                  setConfig((p: any) => ({
                    ...p,
                    runtime: {
                      ...runtime,
                      baijiahao_reveal_on_challenge: c,
                      toutiao_reveal_on_challenge: c,
                    },
                  }))
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* 4. AI 生图统一服务接入 (macOS Inset Group) */}
      <section className={css.macosGroup}>
        <div className={css.macosGroupHeader}>
          <span>AI 生图模型服务统一接入</span>
          <span className="text-[11px] font-normal text-muted-foreground">Image Generation Model</span>
        </div>
        <div className={css.macosGroupCard}>
          <div className="p-3.5">
            <SocialPublisherUnifiedModelStatusCard />
          </div>
        </div>
      </section>
    </div>
  );
}
