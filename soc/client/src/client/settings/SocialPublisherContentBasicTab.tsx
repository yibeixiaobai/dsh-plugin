import { Input } from "../compat/components/ui/input.js";
import { Switch } from "../compat/components/ui/switch.js";
import { NEWSPIC_RATIOS } from "./SocialPublisherTypes.js";
import { SocialPublisherKeywordTagInput } from "./SocialPublisherKeywordTagInput.js";

const PRESET_TOPIC_ANGLES = ["技术落地剖析", "方法论拆解", "前沿综述", "避坑实操指南", "核心架构演进"];
const PRESET_FORBIDDEN_WORDS = ["代写", "代发", "保过", "枪手", "黑客破解", "绝对第一"];
const PRESET_XHS_TAGS = ["干货分享", "效率工具", "自媒体运营", "程序员日常", "前沿AI"];

interface BasicTabProps {
  currentAccount: any;
  updateCurrentAccount: (patch: any) => void;
  isGzh: boolean;
  isXhs: boolean;
}

export function SocialPublisherContentBasicTab({
  currentAccount,
  updateCurrentAccount,
  isGzh,
  isXhs,
}: BasicTabProps) {
  const content = currentAccount?.content || {};

  return (
    <div className="space-y-4" data-testid="social-publisher-content-basic-tab">
      {/* 微信公众号专属形态 */}
      {isGzh && (
        <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-border/80 bg-surface/50 p-4">
          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">
              文章形态 (Article Type)
            </span>
            <select
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              value={content.article_type || "news"}
              onChange={(e) =>
                updateCurrentAccount({ content: { ...content, article_type: e.target.value } })
              }
            >
              <option value="news">公众号长文（经典多图文合辑）</option>
              <option value="newspic">小绿书图片消息（3:4 竖版轮播卡片）</option>
              <option value="both">长文 + 小绿书同步更新（一文双发）</option>
            </select>
          </label>
          <div className="flex items-center justify-between pt-4 sm:pt-6">
            <div className="space-y-0.5">
              <span className="text-ui-xs font-semibold text-foreground">一文双发同步执行</span>
              <p className="text-ui-xs text-foreground-subtle">长文生成时自动提炼小绿书卡片草稿</p>
            </div>
            <Switch
              checked={Boolean(content.sync_newspic)}
              onCheckedChange={(c) =>
                updateCurrentAccount({ content: { ...content, sync_newspic: c } })
              }
            />
          </div>
        </div>
      )}

      {/* 小红书专属参数 vs 其他平台 */}
      {isXhs ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">
              每日笔记篇数 (1~10 篇)
            </span>
            <Input
              type="number"
              value={content.articles_per_day ?? 1}
              onChange={(e) =>
                updateCurrentAccount({
                  content: { ...content, articles_per_day: Number(e.target.value) },
                })
              }
              className="h-9 text-ui-xs"
            />
          </label>
          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">
              每篇轮播配图数 (1~18 张)
            </span>
            <Input
              type="number"
              value={content.xhs_images_per_note ?? 4}
              onChange={(e) =>
                updateCurrentAccount({
                  content: { ...content, xhs_images_per_note: Number(e.target.value) },
                })
              }
              className="h-9 text-ui-xs"
            />
          </label>
          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">
              正文最低字数 (上限1000)
            </span>
            <Input
              type="number"
              value={content.xhs_min_words ?? 200}
              onChange={(e) =>
                updateCurrentAccount({
                  content: { ...content, xhs_min_words: Number(e.target.value) },
                })
              }
              className="h-9 text-ui-xs"
            />
          </label>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">每日计划发文篇数</span>
            <Input
              type="number"
              value={content.articles_per_day ?? (isGzh ? 6 : 1)}
              onChange={(e) =>
                updateCurrentAccount({
                  content: { ...content, articles_per_day: Number(e.target.value) },
                })
              }
              className="h-9 text-ui-xs"
            />
          </label>
          <label className="space-y-1.5 text-ui-sm text-foreground">
            <span className="font-medium text-ui-xs text-foreground-subtle">正文最低字数下限</span>
            <Input
              type="number"
              value={content.min_words ?? 2000}
              onChange={(e) =>
                updateCurrentAccount({ content: { ...content, min_words: Number(e.target.value) } })
              }
              className="h-9 text-ui-xs"
            />
          </label>
        </div>
      )}

      {/* 公众号小绿书特有配置 */}
      {isGzh &&
        (content.article_type === "newspic" ||
          content.article_type === "both" ||
          content.sync_newspic) && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 space-y-3">
            <div className="text-ui-xs font-semibold text-emerald-600 dark:text-emerald-400">
              小绿书图文卡片专属参数
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <label className="space-y-1.5 text-ui-xs text-foreground">
                <span className="font-medium text-foreground-subtle">每日小绿书篇数 (1~20)</span>
                <Input
                  type="number"
                  value={content.newspic_articles_per_day ?? 1}
                  onChange={(e) =>
                    updateCurrentAccount({
                      content: { ...content, newspic_articles_per_day: Number(e.target.value) },
                    })
                  }
                  className="h-9 text-ui-xs"
                />
              </label>
              <label className="space-y-1.5 text-ui-xs text-foreground">
                <span className="font-medium text-foreground-subtle">每篇卡片张数 (1~20)</span>
                <Input
                  type="number"
                  value={content.newspic_images_per_article ?? 4}
                  onChange={(e) =>
                    updateCurrentAccount({
                      content: { ...content, newspic_images_per_article: Number(e.target.value) },
                    })
                  }
                  className="h-9 text-ui-xs"
                />
              </label>
              <label className="space-y-1.5 text-ui-xs text-foreground">
                <span className="font-medium text-foreground-subtle">卡片宽高比</span>
                <select
                  className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-ui-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                  value={content.newspic_image_ratio || "3:4"}
                  onChange={(e) =>
                    updateCurrentAccount({
                      content: { ...content, newspic_image_ratio: e.target.value },
                    })
                  }
                >
                  {NEWSPIC_RATIOS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-ui-xs text-foreground">
                <span className="font-medium text-foreground-subtle">文案最低字数 (默认100)</span>
                <Input
                  type="number"
                  value={content.newspic_min_words ?? 100}
                  onChange={(e) =>
                    updateCurrentAccount({
                      content: { ...content, newspic_min_words: Number(e.target.value) },
                    })
                  }
                  className="h-9 text-ui-xs"
                />
              </label>
            </div>
          </div>
        )}

      {/* [中文修复依据]：全面重构为胶囊标签输入组件，对齐定时规则交互范式，支持回车/逗号成词、多行智能粘贴解析与单项删除 */}
      {/* 小红书专属话题标签 */}
      {isXhs && (
        <SocialPublisherKeywordTagInput
          label="小红书专属话题标签"
          subLabel="笔记末尾自动追加对应 #话题 标签（无需手动输入#号，支持回车、逗号添加）"
          tags={Array.isArray(content.xhs_tags) ? content.xhs_tags : []}
          onChange={(next) => updateCurrentAccount({ content: { ...content, xhs_tags: next } })}
          placeholder="输入话题标签后按回车添加..."
          presetTags={PRESET_XHS_TAGS}
          emptyHint="暂未配置专属话题标签（建议至少添加 2-3 个标签）"
        />
      )}

      {/* 核心选题关键词 */}
      <SocialPublisherKeywordTagInput
        label="核心业务关键词"
        subLabel="用于检索关联选题，禁止作为标题开头词；支持直接粘贴多行或逗号分隔文本批量添加"
        tags={Array.isArray(content.topics) ? content.topics : []}
        onChange={(next) => updateCurrentAccount({ content: { ...content, topics: next } })}
        placeholder="输入业务关键词按回车添加..."
        presetTags={["人工智能", "开源生态", "大模型演进", "计算架构", "研发提效"]}
        emptyHint="暂未配置核心业务关键词（系统将采用平台通用选题）"
      />

      {/* 偏好选题切入角度 */}
      <SocialPublisherKeywordTagInput
        label="偏好选题切入角度"
        subLabel="指导选题创作偏向与行文逻辑结构（如“技术落地剖析”、“方法论拆解”等）"
        tags={Array.isArray(content.preferred_topic_angles) ? content.preferred_topic_angles : []}
        onChange={(next) =>
          updateCurrentAccount({ content: { ...content, preferred_topic_angles: next } })
        }
        placeholder="输入切入角度按回车添加..."
        presetTags={PRESET_TOPIC_ANGLES}
        emptyHint="暂无切入偏好（AI 将自由发散行文角度）"
      />

      {/* 违禁词表 */}
      <SocialPublisherKeywordTagInput
        label="内容违禁词过滤库"
        subLabel="任何一篇文章若命中违禁词库即刻停止发布，严格保障平台账号安全合规"
        tags={Array.isArray(content.forbidden_words) ? content.forbidden_words : []}
        onChange={(next) =>
          updateCurrentAccount({ content: { ...content, forbidden_words: next } })
        }
        placeholder="输入违禁词后按回车添加..."
        presetTags={PRESET_FORBIDDEN_WORDS}
        emptyHint="暂未配置违禁词过滤项（建议配置行业敏感词防风控）"
      />

      {/* 开关选项 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface/50 p-3">
          <div className="space-y-0.5">
            <div className="text-ui-xs font-semibold text-foreground">热点追踪</div>
            <div className="text-ui-xs text-foreground-subtle">
              结合近期科技前沿与技术热点智能切入选题
            </div>
          </div>
          <Switch
            checked={Boolean(content.enable_hot_tracking ?? true)}
            onCheckedChange={(c) =>
              updateCurrentAccount({ content: { ...content, enable_hot_tracking: c } })
            }
          />
        </div>

        {!isXhs && (
          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface/50 p-3">
            <div className="space-y-0.5">
              <div className="text-ui-xs font-semibold text-foreground">结尾品牌引导</div>
              <div className="text-ui-xs text-foreground-subtle">
                结尾自然引导关注品牌「{currentAccount.brand_name || "前沿科技视界"}」
              </div>
            </div>
            <Switch
              checked={Boolean(content.ending_guide_required ?? true)}
              onCheckedChange={(c) =>
                updateCurrentAccount({ content: { ...content, ending_guide_required: c } })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
