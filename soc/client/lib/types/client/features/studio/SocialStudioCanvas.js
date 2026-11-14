import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { toast } from "../../compat/components/ui/toast.js";
import { SocialArticlePlatformPreview } from "../core/components/SocialArticlePlatformPreview.js";
import { WechatMultiArticleOverview } from "../core/components/WechatMultiArticleOverview.js";
import { invalidateMediaCache } from "../core/useResolvedMediaUrls.js";
import { SocialArticleBottomActionBar } from "../core/components/SocialArticleBottomActionBar.js";
import { copySocialArticleContent } from "../core/utils/socialClipboard.js";
import { putPersistentArticleContent, getPersistentArticleContent } from "../core/socialPublisherPersistentStorage.js";
import { cacheArticleContent } from "../core/mediaCacheManager.js";
import { StudioHeader } from "./components/StudioHeader.js";
import { StudioTabNav } from "./components/StudioTabNav.js";
import { XhsInteractiveCanvas } from "./components/XhsInteractiveCanvas.js";
import { useSocialStudioArticleSync } from "./useSocialStudioArticleSync.js";
import css from "./SocialStudioCanvas.module.css";
/**
 * 社媒发布任务可视化执行画布 (Social Studio Canvas)
 * 【中文修复依据】：依循极简出版画纸（Editorial Studio Paper）规范，彻底消除双层嵌套底栏与 AI 俗套装饰，提供单层清晰高集成度交互
 */
export const SocialStudioCanvas = memo(function SocialStudioCanvas({ workflow, workspacePath, workspaceIdentity, sessionId, }) {
    const articles = useMemo(() => (Array.isArray(workflow.articles) ? workflow.articles : []), [workflow.articles]);
    const hasGzh = articles.some((a) => a.platform === "gzh");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showOverview, setShowOverview] = useState(false);
    const [localArticles, setLocalArticles] = useState(articles);
    const [copied, setCopied] = useState(false);
    const [userManuallySelectedTab, setUserManuallySelectedTab] = useState(false);
    // 画布实时防抖自动保存状态与未完成排队数据引用
    const [saveStatus, setSaveStatus] = useState("idle");
    const saveDebounceTimerRef = useRef(null);
    const pendingSaveRef = useRef(null);
    // 维护用户就地编辑的草稿保护池，避免上游 workflow.articles 刷新（如生图进度事件、外部流式轮次）冲刷掉用户的修改
    const draftMapRef = useRef(new Map());
    const taskScope = workflow.taskId || workflow.activeTaskId || sessionId || "task";
    // 【中文修复依据】：统一构造带任务沙箱作用域的草稿保护与持久化唯一键，杜绝跨任务同名 ID 导致历史草稿穿透
    const getArticleKey = useCallback((art, fallbackIdx) => {
        if (art.filePath)
            return art.filePath;
        if (art.id)
            return `${taskScope}::${art.id}`;
        return `${taskScope}::${art.index ?? fallbackIdx}`;
    }, [taskScope]);
    useEffect(() => {
        if (!Array.isArray(workflow.articles) || workflow.articles.length === 0)
            return;
        let isCancelled = false;
        Promise.all(workflow.articles.map(async (art, idx) => {
            const storageKey = getArticleKey(art, idx);
            let persistentContent;
            if (storageKey) {
                try {
                    const saved = await getPersistentArticleContent(storageKey);
                    if (saved && saved.trim()) {
                        persistentContent = saved;
                    }
                }
                catch {
                    // 静默容错
                }
            }
            const key = getArticleKey(art, idx);
            const draft = draftMapRef.current.get(key);
            let merged = { ...art };
            if (persistentContent) {
                merged.content = persistentContent;
            }
            if (draft) {
                merged = { ...merged, ...draft };
            }
            return merged;
        })).then((hydrated) => {
            if (!isCancelled) {
                setLocalArticles(hydrated);
            }
        });
        return () => {
            isCancelled = true;
        };
    }, [workflow.articles, getArticleKey]);
    useEffect(() => {
        if (currentIndex >= localArticles.length) {
            const maxIdx = localArticles.length - 1;
            setCurrentIndex(maxIdx >= 0 ? maxIdx : 0);
        }
    }, [localArticles.length, currentIndex]);
    useEffect(() => {
        if (userManuallySelectedTab)
            return;
        const streamIdx = workflow.activeStreamingIndex;
        if (typeof streamIdx === "number" && streamIdx > 0 && localArticles.length > 0) {
            const targetIdx = localArticles.findIndex((a) => a.index === streamIdx);
            if (targetIdx !== -1 && targetIdx !== currentIndex) {
                setCurrentIndex(targetIdx);
                setShowOverview(false);
            }
        }
    }, [workflow.activeStreamingIndex, userManuallySelectedTab, localArticles, currentIndex]);
    const imgCurrent = workflow.imageProgress?.current;
    const imgTotal = workflow.imageProgress?.total;
    const imgPercentage = workflow.imageProgress?.percentage;
    const imgIsGenerating = workflow.imageProgress?.isGenerating;
    const articlesImagesKey = (workflow.articles || [])
        .map((a) => `${a.id || a.index}:${(a.images || []).join(",")}|${a.coverUrl || ""}`)
        .join(";");
    const isInitialMountRef = useRef(true);
    const prevProgressKeyRef = useRef("");
    useEffect(() => {
        const currentKey = `${imgCurrent ?? 0}-${imgPercentage ?? 0}-${imgIsGenerating ? 1 : 0}-${articlesImagesKey}`;
        if (isInitialMountRef.current) {
            isInitialMountRef.current = false;
            prevProgressKeyRef.current = currentKey;
            return;
        }
        if (prevProgressKeyRef.current !== currentKey) {
            prevProgressKeyRef.current = currentKey;
            invalidateMediaCache();
        }
    }, [imgCurrent, imgTotal, imgPercentage, imgIsGenerating, articlesImagesKey]);
    const currentArticle = localArticles[currentIndex] ?? localArticles[0] ?? null;
    const flushPendingSave = useCallback(async (pending) => {
        if (!pending.key || !pending.content)
            return;
        await putPersistentArticleContent(pending.key, pending.content);
        cacheArticleContent(pending.key, pending.content);
        setSaveStatus("saved");
    }, []);
    useEffect(() => {
        return () => {
            if (saveDebounceTimerRef.current) {
                clearTimeout(saveDebounceTimerRef.current);
                saveDebounceTimerRef.current = null;
            }
            if (pendingSaveRef.current) {
                void flushPendingSave(pendingSaveRef.current);
                pendingSaveRef.current = null;
            }
        };
    }, [flushPendingSave]);
    const triggerAutoSave = useCallback((contentToSave, targetKey) => {
        if (!targetKey || !contentToSave)
            return;
        pendingSaveRef.current = { key: targetKey, content: contentToSave };
        if (saveDebounceTimerRef.current) {
            clearTimeout(saveDebounceTimerRef.current);
        }
        setSaveStatus("saving");
        saveDebounceTimerRef.current = setTimeout(async () => {
            if (pendingSaveRef.current) {
                await flushPendingSave(pendingSaveRef.current);
                pendingSaveRef.current = null;
            }
            saveDebounceTimerRef.current = null;
        }, 250);
    }, [flushPendingSave]);
    // 接入沙箱物理落盘与指纹自愈 Hook
    const { currentSignedHash, physicalSaveStatus, isResigning, handleResignManifest, handleTitleChange, handleDigestChange, handleContentChange, } = useSocialStudioArticleSync({
        workflow,
        workspacePath,
        currentIndex,
        localArticles,
        setLocalArticles,
        triggerAutoSave,
        currentArticle,
        draftMapRef,
    });
    // 配图替换回调 (换)
    const handleImageChanged = useCallback((slotIndex, newImageUrl) => {
        if (!currentArticle)
            return;
        const updatedImages = [...(currentArticle.images || [])];
        while (updatedImages.length < slotIndex)
            updatedImages.push("");
        updatedImages[slotIndex - 1] = newImageUrl;
        const key = getArticleKey(currentArticle, currentIndex);
        const updatedArticle = { ...currentArticle, images: updatedImages };
        draftMapRef.current.set(key, { ...draftMapRef.current.get(key), images: updatedImages });
        setLocalArticles((prev) => prev.map((art, idx) => (idx === currentIndex ? updatedArticle : art)));
    }, [currentArticle, currentIndex]);
    // 增加卡片槽位 (增)
    const handleAddCard = useCallback(() => {
        if (!currentArticle)
            return;
        const currentQuota = currentArticle.targetCardImageCount || 4;
        const maxLimit = currentArticle.platform === "xiaohongshu" ? 18 : 20;
        if (currentQuota >= maxLimit) {
            toast(`卡片数量已达上限 (${maxLimit} 张)`);
            return;
        }
        const newQuota = currentQuota + 1;
        const key = getArticleKey(currentArticle, currentIndex);
        const updatedArticle = { ...currentArticle, targetCardImageCount: newQuota };
        draftMapRef.current.set(key, { ...draftMapRef.current.get(key), targetCardImageCount: newQuota });
        setLocalArticles((prev) => prev.map((art, idx) => (idx === currentIndex ? updatedArticle : art)));
        toast(`已增加第 #${newQuota} 张视觉卡片槽位`);
    }, [currentArticle, currentIndex]);
    // 删除卡片槽位 (删)
    const handleDeleteCard = useCallback((slotIndex) => {
        if (!currentArticle)
            return;
        const currentQuota = currentArticle.targetCardImageCount || 4;
        if (currentQuota <= 1) {
            toast("至少保留 1 张视觉卡片");
            return;
        }
        const newQuota = currentQuota - 1;
        const updatedImages = (currentArticle.images || []).filter((_, idx) => idx !== slotIndex - 1);
        const key = getArticleKey(currentArticle, currentIndex);
        const updatedArticle = { ...currentArticle, targetCardImageCount: newQuota, images: updatedImages };
        draftMapRef.current.set(key, { ...draftMapRef.current.get(key), targetCardImageCount: newQuota, images: updatedImages });
        setLocalArticles((prev) => prev.map((art, idx) => (idx === currentIndex ? updatedArticle : art)));
        toast(`已移除第 #${slotIndex} 张卡片`);
    }, [currentArticle, currentIndex]);
    // 整篇属性变更回调 (综合更新)
    const handleArticleChange = useCallback((updatedArticle) => {
        const key = getArticleKey(updatedArticle, currentIndex);
        draftMapRef.current.set(key, { ...draftMapRef.current.get(key), ...updatedArticle });
        setLocalArticles((prev) => prev.map((art, idx) => (idx === currentIndex ? updatedArticle : art)));
    }, [currentIndex]);
    const handleCopyCurrentArticle = async () => {
        if (!currentArticle)
            return;
        const ok = await copySocialArticleContent(currentArticle);
        if (ok) {
            setCopied(true);
            toast("已复制文章文案至剪贴板");
            setTimeout(() => setCopied(false), 2000);
        }
        else {
            toast("写入剪贴板失败，请重试");
        }
    };
    const handlePublishCurrentOnly = (action, scheduleTime) => {
        if (!currentArticle)
            return;
        const pName = currentArticle.platformName ?? currentArticle.platform ?? "微信公众号";
        const targetTaskId = workflow.taskId || workflow.activeTaskId || "";
        const signedHash = currentSignedHash || workflow.manifestFingerprint || "";
        const sigMeta = (targetTaskId || signedHash) ? ` (taskId: ${targetTaskId || "auto"}, articleIndex: ${currentIndex + 1}${signedHash ? `, signedHash: ${signedHash}` : ""})` : "";
        // 【中文修复依据】：严禁动作与 Prompt 语义分裂，明确传递 publish_action 与参数
        let singleActionDesc;
        let toastDesc;
        if (action === "schedule") {
            const schedText = scheduleTime ? `在 [${scheduleTime}] 定时排期发布` : "自动排期发布";
            singleActionDesc = `定时排期发布至【${pName}】（调用 gzh_publish_draft，明确传入 publish_action: "schedule", schedule_time: "${scheduleTime || "auto"}", article_index: ${currentIndex + 1}）`;
            toastDesc = `${schedText}至【${pName}】`;
        }
        else if (action === "publish_now") {
            singleActionDesc = `公开发布至【${pName}】（调用 gzh_publish_draft，明确传入 publish_action: "publish_now", article_index: ${currentIndex + 1}）`;
            toastDesc = `公开发布至【${pName}】`;
        }
        else {
            singleActionDesc = `存入【${pName}】官方草稿箱（调用 gzh_publish_draft，明确传入 publish_action: "draft", article_index: ${currentIndex + 1}）`;
            toastDesc = `存入【${pName}】官方草稿箱`;
        }
        const promptText = `【单篇发布确认·版本已终局锁定】已审校确认第 ${currentIndex + 1} 篇《${currentArticle.title}》内容无误${sigMeta}；当前稿件已锁定严禁二次修改，请立即单独执行【${singleActionDesc}】并核验状态。`;
        window.dispatchEvent(new CustomEvent("wincode:social-publisher-send-prompt", { detail: { text: promptText, workspacePath, workspaceIdentity, sessionId } }));
        toast(`已发送单篇发布指令：《${currentArticle.title}》→ ${toastDesc}`);
    };
    const handleConfirmPublishAll = (action, scheduleTime) => {
        const totalCount = localArticles.length;
        const targetTaskId = workflow.taskId || workflow.activeTaskId || "";
        const signedHash = currentSignedHash || workflow.manifestFingerprint || "";
        const sigMeta = (targetTaskId || signedHash) ? ` (taskId: ${targetTaskId || "auto"}${signedHash ? `, signedHash: ${signedHash}` : ""})` : "";
        // 【中文修复依据】：彻底修复定时排期写死为草稿箱的严重缺陷，根据 action 动态构造真实命令与参数
        let actionDesc;
        let toastDesc;
        if (action === "schedule") {
            const schedText = scheduleTime ? `在 [${scheduleTime}] 定时排期发布` : "自动排期发布";
            actionDesc = `微信公众号多图文组合定时排期发布（调用 gzh_publish_draft，明确传入 publish_action: "schedule", schedule_time: "${scheduleTime || "auto"}"）`;
            toastDesc = `一键${schedText} (共 ${totalCount} 篇)`;
        }
        else if (action === "publish_now") {
            actionDesc = `多图文组合公开发布（调用 gzh_publish_draft，明确传入 publish_action: "publish_now"）`;
            toastDesc = `一键公开发布至各平台 (共 ${totalCount} 篇)`;
        }
        else {
            actionDesc = `多图文组合发布至微信官方草稿箱（调用 gzh_publish_draft，明确传入 publish_action: "draft"）`;
            toastDesc = `一键存入各平台官方草稿箱 (共 ${totalCount} 篇)`;
        }
        const promptText = `【多图文组合发布·版本已终局锁定】已审校确认当前任务全部 ${totalCount} 篇图文内容无误${sigMeta}；当前稿件已锁定严禁二次修改，请立即一次性执行【${actionDesc}】，严禁拆分成单篇上传，并核验发布状态。`;
        window.dispatchEvent(new CustomEvent("wincode:social-publisher-send-prompt", { detail: { text: promptText, workspacePath, workspaceIdentity, sessionId } }));
        toast(`已向会话发送发布确认指令：${toastDesc}`);
    };
    const isReviewOrLater = ["review", "publishing", "published"].includes(workflow.stage) || Boolean(workflow.isContentFullyProduced);
    return (_jsxs("div", { "data-testid": "social-studio-canvas", className: css.canvasRoot, children: [_jsx(StudioHeader, { workflow: workflow, physicalSaveStatus: physicalSaveStatus }), localArticles.length > 0 && (_jsx(StudioTabNav, { articles: localArticles, currentIndex: currentIndex, showOverview: showOverview, hasGzh: hasGzh, imageProgress: workflow.imageProgress, onSelectIndex: (idx) => { setCurrentIndex(idx); setShowOverview(false); setUserManuallySelectedTab(true); window.dispatchEvent(new CustomEvent("wincode:social-studio-current-article", { detail: { index: idx, article: localArticles[idx], isOverview: false } })); }, onSelectOverview: () => { setShowOverview(true); setUserManuallySelectedTab(true); window.dispatchEvent(new CustomEvent("wincode:social-studio-current-article", { detail: { index: -1, article: null, isOverview: true } })); } })), _jsxs("div", { className: css.scrollArea, children: [localArticles.length === 0 && (_jsxs("div", { className: css.emptyState, children: [_jsx("div", { className: css.emptyIconBox, children: _jsx("span", { className: css.emptyDot }) }), _jsx("p", { className: css.emptyTitle, children: "\u6B63\u6587\u6392\u7248\u7F16\u8BD1\u51C6\u5907\u4E2D" }), _jsx("p", { className: css.emptySubtitle, children: "\u4EFB\u52A1\u6267\u884C\u5C31\u7EEA\u540E\u5C06\u5728\u6B64\u5904\u81EA\u52A8\u52A0\u8F7D\u9AD8\u4FDD\u771F\u753B\u7EB8" })] })), showOverview && hasGzh && localArticles.length > 0 && (_jsx("div", { className: css.contentContainer, children: _jsx(WechatMultiArticleOverview, { articles: localArticles, workspacePath: workspacePath, workspaceIdentity: workspaceIdentity, sessionId: sessionId, scriptsDir: workflow.scriptsDir || localArticles.find((a) => a.scriptsDir)?.scriptsDir, onSelectArticle: (idx) => {
                                setCurrentIndex(idx);
                                setShowOverview(false);
                            } }) })), !showOverview && currentArticle && (_jsx("div", { className: css.contentContainer, children: currentArticle.platform === "xiaohongshu" ? (_jsx(XhsInteractiveCanvas, { article: currentArticle, workspacePath: workspacePath, workspaceIdentity: workspaceIdentity, sessionId: sessionId, taskId: workflow.taskId, onUpdateArticle: handleArticleChange })) : (_jsx(SocialArticlePlatformPreview, { article: currentArticle, workspacePath: workspacePath, workspaceIdentity: workspaceIdentity, sessionId: sessionId, taskId: workflow.taskId, editable: isReviewOrLater || Boolean(currentArticle && !currentArticle.isStreaming && currentArticle.status === "completed"), onTitleChange: handleTitleChange, onDigestChange: handleDigestChange, onContentChange: handleContentChange, onImageChanged: handleImageChanged, onAddCard: handleAddCard, onDeleteCard: handleDeleteCard, onArticleChange: handleArticleChange })) }))] }), (isReviewOrLater || Boolean(currentArticle && !currentArticle.isStreaming && currentArticle.status === "completed")) && currentArticle && localArticles.length > 0 && (_jsx(SocialArticleBottomActionBar, { currentArticle: currentArticle, currentIndex: currentIndex, totalArticlesCount: localArticles.length, primeTimeSuggestions: [], copied: copied, copyConfig: { buttonLabel: "复制当前篇", toastTip: "已复制" }, saveStatus: saveStatus, onOpenTypography: () => {
                    window.dispatchEvent(new CustomEvent("wincode:social-open-typography"));
                }, onCopyContent: handleCopyCurrentArticle, onPublishCurrentOnly: handlePublishCurrentOnly, onConfirmPublishAll: handleConfirmPublishAll, onResignManifest: handleResignManifest, isResigning: isResigning, showPublishActions: false }))] }));
});
//# sourceMappingURL=SocialStudioCanvas.js.map