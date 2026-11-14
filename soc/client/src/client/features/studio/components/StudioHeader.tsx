import { LayoutPanelLeft, Loader2, Check } from "lucide-react";
import type { ExtractedSocialWorkflow } from "../../core/socialPublisherWorkflowExtractor.js";
import css from "./StudioHeader.module.css";

export interface StudioHeaderProps {
  workflow: ExtractedSocialWorkflow;
  physicalSaveStatus?: "idle" | "saving" | "synced" | "error";
}

interface StageInfo {
  text: string;
  dotClass: string;
}

const DEFAULT_STAGE: StageInfo = { text: "准备就绪", dotClass: css.dotIdle };

/**
 * 阶段状态克制映射
 * 【中文修复依据】：依循极简出版画纸规范，提供低噪点微标与稳定状态指示
 */
const STAGE_LABELS: Record<string, StageInfo> = {
  idle: DEFAULT_STAGE,
  topics: { text: "选题构思", dotClass: css.dotAmber },
  generating: { text: "正文排版构建中", dotClass: css.dotPulsePrimary },
  review: { text: "待审校确认", dotClass: css.dotAmber },
  publishing: { text: "发布中", dotClass: css.dotPulsePrimary },
  published: { text: "已完成发布", dotClass: css.dotSuccess },
};

/**
 * 顶部标题栏（工作台标识、阶段微指示器、正式/演练模式、落盘同步状态）
 */
export function StudioHeader({ workflow, physicalSaveStatus = "idle" }: StudioHeaderProps) {
  const stage = (workflow.stage ? STAGE_LABELS[workflow.stage] : undefined) ?? DEFAULT_STAGE;
  const isDryRun = Boolean(workflow.isDryRun);
  const showModeBadge = workflow.stage === "review" || workflow.stage === "publishing" || workflow.stage === "published";

  return (
    <div
      data-testid="studio-header"
      className={css.header}
    >
      {/* 左侧：工作台标识、阶段微点指示器与发文模式 */}
      <div className={css.left}>
        <div className={css.brand}>
          <LayoutPanelLeft className={css.brandIcon} />
          <span>社媒发布工作台</span>
        </div>

        <span className={css.divider} />

        {/* 阶段微指示器（低噪极简点状） */}
        <div className={css.stage}>
          <span className={`${css.dot} ${stage.dotClass}`} />
          <span>{stage.text}</span>
        </div>

        {/* 离线演练 vs 正式发布 极简徽标 */}
        {showModeBadge && (
          isDryRun ? (
            <span
              className={`${css.modeBadge} ${css.modeDryRun}`}
              title="当前处于离线演练模式，仅生成模拟回执，不调用真实浏览器向线上平台发布"
            >
              离线演练
            </span>
          ) : (
            <span
              className={`${css.modeBadge} ${css.modeOfficial}`}
              title="当前处于真实线上发布模式，确认后将直接推送到对应平台官方后台"
            >
              正式发布
            </span>
          )
        )}
      </div>

      {/* 右侧：沙箱物理落盘同步状态指示 */}
      <div className={css.right}>
        {physicalSaveStatus === "saving" && (
          <div className={`${css.syncState} ${css.syncLoading}`}>
            <Loader2 className={`${css.syncIcon} ${css.syncSpin}`} />
            <span>沙箱物理同步中</span>
          </div>
        )}
        {physicalSaveStatus === "synced" && (
          <div className={`${css.syncState} ${css.syncSuccess}`}>
            <Check className={css.syncIcon} />
            <span>沙箱物理已同步</span>
          </div>
        )}
        {physicalSaveStatus === "error" && (
          <span className={css.syncError}>物理落盘失败</span>
        )}
      </div>
    </div>
  );
}
