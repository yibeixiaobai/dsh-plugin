import { useState, useEffect, useCallback } from "react";
import type { WechatDraftCard, DuplicateScanResult } from "./SocialPublisherTypes.js";
import { publisherApiFetch, safeParseJson } from "./SocialPublisherTypes.js";

export function useSocialPublisherDrafts(selectedAccountId: string, socialPublisherRpc?: any) {
  const [drafts, setDrafts] = useState<WechatDraftCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"keep_latest" | "keep_complete" | "keep_oldest">("keep_latest");
  const [duplicateScanResult, setDuplicateScanResult] = useState<DuplicateScanResult | null>(null);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);

  const fetchDrafts = useCallback(async (accountId: string) => {
    if (!accountId) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await publisherApiFetch(
        `/api/gzh-publisher/drafts/list?account_id=${encodeURIComponent(accountId)}`,
        {},
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok) {
        const loadedDrafts: WechatDraftCard[] = Array.isArray(parsed.data.drafts) ? parsed.data.drafts : [];
        setDrafts(loadedDrafts);
      }
    } catch (err: any) {
      console.warn("[useSocialPublisherDrafts] 加载草稿失败:", err);
    } finally {
      setLoading(false);
    }
  }, [socialPublisherRpc]);

  useEffect(() => {
    fetchDrafts(selectedAccountId);
  }, [fetchDrafts, selectedAccountId]);

  const triggerSync = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);
    setStatusMessage(null);
    try {
      const res = await publisherApiFetch(
        "/api/gzh-publisher/drafts/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: selectedAccountId }),
        },
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok && parsed.data?.ok) {
        const syncedDrafts = parsed.data.drafts || [];
        setDrafts(syncedDrafts);
        setStatusMessage({
          type: "success",
          text: `同步成功！已获取 ${syncedDrafts.length} 篇最新草稿。`,
        });
      } else {
        const errText = String(parsed.error || parsed.data?.error || "");
        const displayErr =
          errText && !errText.includes("fetch failed")
            ? errText
            : "微信公众号草稿同步响应超时，请稍后重试";
        setStatusMessage({
          type: "error",
          text: `同步失败: ${displayErr}`,
        });
      }
    } catch (e: any) {
      const errText = String(e?.message || "");
      const displayErr =
        errText && !errText.includes("fetch failed")
          ? errText
          : "微信后台同步服务连接超时，请重试";
      setStatusMessage({
        type: "error",
        text: `同步异常: ${displayErr}`,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteDraft = async (draftId: string, appmsgid: string, articleType?: "news" | "newspic") => {
    setDeletingId(draftId);
    const prevDrafts = [...drafts];
    setDrafts((prev) => prev.filter((d) => d.id !== draftId && d.appmsgid !== appmsgid));

    try {
      const res = await publisherApiFetch(
        "/api/gzh-publisher/drafts/delete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: selectedAccountId,
            appmsgid,
            article_type: articleType,
          }),
        },
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok && parsed.data?.ok) {
        setStatusMessage({
          type: "success",
          text: "草稿已成功删除（不会影响已发表内容）。",
        });
      } else {
        setDrafts(prevDrafts);
        setStatusMessage({
          type: "error",
          text: `删除失败: ${parsed.data?.error || "网络或登录态异常"}`,
        });
      }
    } catch (err: any) {
      setDrafts(prevDrafts);
      setStatusMessage({
        type: "error",
        text: `删除异常: ${err.message}`,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenDuplicateModal = async () => {
    setShowDuplicateModal(true);
    setScanningDuplicates(true);
    try {
      const res = await publisherApiFetch(
        "/api/gzh-publisher/drafts/duplicates/scan",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: selectedAccountId,
            strategy: duplicateStrategy,
          }),
        },
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok && parsed.data) {
        const result: DuplicateScanResult = parsed.data;
        setDuplicateScanResult(result);

        const defaultSelected = new Set<string>();
        for (const g of result.groups || []) {
          for (const item of g.items) {
            if (item.selected_for_delete) defaultSelected.add(item.appmsgid);
          }
        }
        setSelectedDeleteIds(defaultSelected);
      }
    } catch (err: any) {
      console.warn("[useSocialPublisherDrafts] 重复扫描异常:", err);
    } finally {
      setScanningDuplicates(false);
    }
  };

  const handleStrategyChange = (newStrategy: "keep_latest" | "keep_complete" | "keep_oldest") => {
    setDuplicateStrategy(newStrategy);
    if (!duplicateScanResult) return;

    const updatedGroups = duplicateScanResult.groups.map((group) => {
      const sorted = [...group.items].sort((a, b) => {
        if (newStrategy === "keep_complete" || newStrategy === "keep_latest") {
          if (a.is_complete !== b.is_complete) return a.is_complete ? -1 : 1;
        }
        if (newStrategy === "keep_oldest") {
          return (a.updated_at || 0) - (b.updated_at || 0);
        }
        return (b.updated_at || 0) - (a.updated_at || 0);
      });

      const items = sorted.map((item, idx) => ({
        ...item,
        is_recommended_keep: idx === 0,
        selected_for_delete: idx > 0,
      }));

      return { ...group, items };
    });

    const newSelected = new Set<string>();
    for (const g of updatedGroups) {
      for (const item of g.items) {
        if (item.selected_for_delete) newSelected.add(item.appmsgid);
      }
    }

    setDuplicateScanResult({ ...duplicateScanResult, groups: updatedGroups });
    setSelectedDeleteIds(newSelected);
  };

  const handleBatchCleanDuplicates = async () => {
    if (selectedDeleteIds.size === 0) return;
    setCleaningDuplicates(true);
    const toDeleteList = Array.from(selectedDeleteIds);

    try {
      const res = await publisherApiFetch(
        "/api/gzh-publisher/drafts/duplicates/clean",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: selectedAccountId,
            appmsgids: toDeleteList,
          }),
        },
        socialPublisherRpc,
      );
      const parsed = await safeParseJson(res);
      if (parsed.ok && parsed.data?.ok) {
        setStatusMessage({
          type: "success",
          text: `批量清理成功！已清理 ${parsed.data.deleted_count || toDeleteList.length} 篇重复草稿。`,
        });
        setShowDuplicateModal(false);
        fetchDrafts(selectedAccountId);
      } else {
        setStatusMessage({
          type: "error",
          text: `清理失败: ${parsed.data?.error || "部分草稿未能注销"}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `清理异常: ${err.message}`,
      });
    } finally {
      setCleaningDuplicates(false);
    }
  };

  return {
    drafts,
    loading,
    syncing,
    statusMessage,
    setStatusMessage,
    deletingId,
    triggerSync,
    handleDeleteDraft,
    showDuplicateModal,
    setShowDuplicateModal,
    scanningDuplicates,
    duplicateStrategy,
    duplicateScanResult,
    selectedDeleteIds,
    setSelectedDeleteIds,
    cleaningDuplicates,
    handleOpenDuplicateModal,
    handleStrategyChange,
    handleBatchCleanDuplicates,
  };
}
