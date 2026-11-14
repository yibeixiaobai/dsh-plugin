import React, { useState, useEffect } from "react";
import { Image as ImageIcon, Loader2, Check, X } from "lucide-react";
import { Button } from "../../../compat/components/ui/button.js";
import { toast } from "../../../compat/components/ui/toast.js";
import { useOptionalServices } from "../../../compat/hooks/useServices.js";
import { publisherApiFetch, safeParseJson } from "../../../settings/SocialPublisherTypes.js";
import { invalidateMediaCache } from "../useResolvedMediaUrls.js";
import css from "./WechatImageRegenerateModal.module.css";

export interface WechatImageRegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  subIndex: number;
  initialPrompt: string;
  intentDescription?: string;
  searchKeywords?: string[];
  articleIndex?: number;
  accountId?: string;
  platform?: string;
  scriptsDir?: string;
  workspacePath?: string;
  onImageRegenerated: (dataUrl: string) => void;
}

export function WechatImageRegenerateModal({
  isOpen,
  onClose,
  subIndex,
  initialPrompt,
  intentDescription,
  searchKeywords = [],
  articleIndex = 1,
  accountId,
  platform,
  scriptsDir,
  workspacePath,
  onImageRegenerated,
}: WechatImageRegenerateModalProps) {
  const services = useOptionalServices();
  const socialPublisherRpc = services?.socialPublisherService ?? null;

  const [promptText, setPromptText] = useState(initialPrompt);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPromptText(initialPrompt);
    }
  }, [isOpen, initialPrompt]);

  if (!isOpen) return null;

  const handleStartRegenerate = async () => {
    if (!promptText.trim()) {
      toast("生图提示词不能为空");
      return;
    }
    setIsGenerating(true);
    try {
      const targetFileName = `content_${articleIndex}_${subIndex}.png`;
      const res = await publisherApiFetch(
        "/api/gzh-publisher/regenerate-image",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: targetFileName,
            kind: "content",
            index: articleIndex,
            sub: subIndex,
            prompt: promptText.trim(),
            accountId,
            platform,
            scriptsDir,
            workspace: workspacePath,
          }),
        },
        socialPublisherRpc,
      );

      const parsed = await safeParseJson(res);
      if (parsed.ok && parsed.data?.ok) {
        const dataUrl = parsed.data.data_url;
        const targetPath = parsed.data.path || targetFileName;
        if (dataUrl) {
          invalidateMediaCache(targetPath, dataUrl);
          invalidateMediaCache(targetFileName, dataUrl);
          onImageRegenerated(dataUrl);
        }
        toast(`已成功重新生成第 ${subIndex} 张正文插图`);
        onClose();
      } else {
        toast(parsed.data?.error || "重新生成插图失败，请检查模型接口配置");
      }
    } catch (err: any) {
      toast(`生图异常: ${err.message || String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className={css.backdrop}
      onClick={() => !isGenerating && onClose()}
    >
      <div
        className={css.modalContainer}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={css.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ImageIcon size={16} />
            </div>
            <div>
              <h3 className={css.headerTitle}>重新生成：正文插图 #{subIndex}</h3>
              <p className={css.headerSubtitle}>微调画面 Prompt 描述，AI 将就地重绘并更新画纸</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            className={css.closeBtn}
            aria-label="关闭窗口"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: 'var(--dsw-alias-label-primary, #111827)' }}>
              生图提示词（Prompt）
            </span>
            <span style={{ fontSize: 10, color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }}>
              全中文描述，突出结构与信息对比
            </span>
          </div>

          {intentDescription && (
            <div className={css.intentBox}>
              <strong style={{ color: '#059669', marginRight: 4 }}>💡 原配图意图:</strong>
              <span>{intentDescription}</span>
            </div>
          )}

          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            disabled={isGenerating}
            rows={4}
            className={css.textarea}
            placeholder="描述你想要的画面，例如：六大选刊工具横向对比看板、深蓝色模块化数据流程图..."
          />

          {Array.isArray(searchKeywords) && searchKeywords.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }}>
                推荐关键词:
              </span>
              {searchKeywords.map((kw, kwIdx) => (
                <button
                  key={kwIdx}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => {
                    const trimmed = kw.trim();
                    if (trimmed && !promptText.includes(trimmed)) {
                      setPromptText((prev) => (prev ? `${prev}，${trimmed}` : trimmed));
                    }
                  }}
                  className={css.keywordPill}
                  title="点击追加到提示词"
                >
                  + {kw}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={css.footer}>
          <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }}>
            规格：正文插图 (16:9 / 1080px 高保真)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isGenerating}
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isGenerating}
              onClick={handleStartRegenerate}
              style={{
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>AI 生图中...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>开始重新生成</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
