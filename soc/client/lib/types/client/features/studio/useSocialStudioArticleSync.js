import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "../../compat/components/ui/toast.js";
import { useOptionalServices } from "../../compat/hooks/useServices.js";
import { publisherApiFetch, safeParseJson } from "../../settings/SocialPublisherTypes.js";
/**
 * 社媒文章 Studio 画布就地编辑与沙箱物理同步 Hook (所见即所得核心闭环)
 */
export function useSocialStudioArticleSync({ workflow, workspacePath, currentIndex, localArticles: _localArticles, setLocalArticles, triggerAutoSave, currentArticle, draftMapRef, }) {
    const services = useOptionalServices();
    const socialPublisherRpc = services?.socialPublisherService ?? null;
    const [currentSignedHash, setCurrentSignedHash] = useState(workflow.manifestFingerprint || "");
    const [physicalSaveStatus, setPhysicalSaveStatus] = useState("idle");
    const [isResigning, setIsResigning] = useState(false);
    const syncTimerRef = useRef(null);
    useEffect(() => {
        if (workflow.manifestFingerprint) {
            setCurrentSignedHash(workflow.manifestFingerprint);
        }
    }, [workflow.manifestFingerprint]);
    // 所见即所得物理落盘——将用户就地修改的正文/标题/摘要防抖写回沙箱真实磁盘文件，并实时刷新 SHA-256 与签名指纹
    const syncPhysicalArticle = useCallback((index, contentToSync, titleToSync, digestToSync, targetArticle) => {
        const targetTaskId = workflow.taskId || workflow.activeTaskId;
        if (!targetTaskId)
            return;
        if (syncTimerRef.current) {
            clearTimeout(syncTimerRef.current);
        }
        setPhysicalSaveStatus("saving");
        syncTimerRef.current = setTimeout(async () => {
            try {
                const effArt = targetArticle ?? currentArticle;
                const targetKey = effArt?.accountId
                    ? `${effArt.platform}_${effArt.accountId}`
                    : undefined;
                const res = await publisherApiFetch("/api/gzh-publisher/article/update", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        taskId: targetTaskId,
                        articleIndex: effArt?.index || index,
                        title: titleToSync,
                        digest: digestToSync,
                        content: contentToSync,
                        workspacePath,
                        targetKey,
                        platform: effArt?.platform,
                        articleType: effArt?.articleType,
                        filePath: effArt?.filePath,
                    }),
                }, socialPublisherRpc);
                const parsed = await safeParseJson(res);
                if (parsed.ok && parsed.data?.ok) {
                    if (parsed.data.manifestFingerprint) {
                        setCurrentSignedHash(parsed.data.manifestFingerprint);
                    }
                    setPhysicalSaveStatus("synced");
                }
                else {
                    setPhysicalSaveStatus("error");
                }
            }
            catch {
                setPhysicalSaveStatus("error");
            }
            finally {
                syncTimerRef.current = null;
            }
        }, 350);
    }, [workflow.taskId, workflow.activeTaskId, workspacePath, socialPublisherRpc, currentArticle]);
    // 一键核验签名自愈——重新校验沙箱物理文件并刷新签名，解除防错版拦截
    const handleResignManifest = useCallback(async () => {
        const targetTaskId = workflow.taskId || workflow.activeTaskId;
        if (!targetTaskId) {
            toast("未检测到有效任务 ID，无法重新核验");
            return;
        }
        setIsResigning(true);
        try {
            const res = await publisherApiFetch("/api/gzh-publisher/sandbox/resign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: targetTaskId, workspacePath }),
            }, socialPublisherRpc);
            const parsed = await safeParseJson(res);
            if (parsed.ok && parsed.data?.ok && parsed.data.manifestFingerprint) {
                setCurrentSignedHash(parsed.data.manifestFingerprint);
                setPhysicalSaveStatus("synced");
                toast(`已核验磁盘物理文件并刷新签名指纹（${parsed.data.manifestFingerprint.slice(0, 8)}...）`);
            }
            else {
                toast(parsed.data?.error || "核验签名失败");
            }
        }
        catch (err) {
            toast(`核验异常: ${err.message || String(err)}`);
        }
        finally {
            setIsResigning(false);
        }
    }, [workflow.taskId, workflow.activeTaskId, workspacePath, socialPublisherRpc]);
    const handleTitleChange = useCallback((newTitle) => {
        const art = currentArticle;
        const key = art?.filePath || art?.id || String(art?.index ?? currentIndex);
        if (draftMapRef?.current) {
            draftMapRef.current.set(key, {
                ...draftMapRef.current.get(key),
                title: newTitle,
            });
        }
        setLocalArticles((prev) => prev.map((a, idx) => (idx === currentIndex ? { ...a, title: newTitle } : a)));
        syncPhysicalArticle(art?.index || currentIndex + 1, undefined, newTitle, undefined, art);
    }, [currentIndex, currentArticle, draftMapRef, setLocalArticles, syncPhysicalArticle]);
    const handleDigestChange = useCallback((newDigest) => {
        const art = currentArticle;
        const key = art?.filePath || art?.id || String(art?.index ?? currentIndex);
        if (draftMapRef?.current) {
            draftMapRef.current.set(key, {
                ...draftMapRef.current.get(key),
                digest: newDigest,
            });
        }
        setLocalArticles((prev) => prev.map((a, idx) => (idx === currentIndex ? { ...a, digest: newDigest } : a)));
        syncPhysicalArticle(art?.index || currentIndex + 1, undefined, undefined, newDigest, art);
    }, [currentIndex, currentArticle, draftMapRef, setLocalArticles, syncPhysicalArticle]);
    const handleContentChange = useCallback((newContent) => {
        const art = currentArticle;
        const key = art?.filePath || art?.id || String(art?.index ?? currentIndex);
        if (draftMapRef?.current) {
            draftMapRef.current.set(key, {
                ...draftMapRef.current.get(key),
                content: newContent,
            });
        }
        setLocalArticles((prev) => prev.map((a, idx) => (idx === currentIndex ? { ...a, content: newContent } : a)));
        const targetKey = art?.filePath || art?.id;
        if (targetKey) {
            triggerAutoSave(newContent, targetKey);
        }
        syncPhysicalArticle(art?.index || currentIndex + 1, newContent, undefined, undefined, art);
    }, [currentIndex, currentArticle, draftMapRef, triggerAutoSave, setLocalArticles, syncPhysicalArticle]);
    return {
        currentSignedHash,
        physicalSaveStatus,
        isResigning,
        handleResignManifest,
        handleTitleChange,
        handleDigestChange,
        handleContentChange,
    };
}
//# sourceMappingURL=useSocialStudioArticleSync.js.map