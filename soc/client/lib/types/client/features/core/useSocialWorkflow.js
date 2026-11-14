import { useState, useEffect } from 'react';
import { extractSocialWorkflow } from './socialPublisherWorkflowExtractor.js';
import { useAppWorkMode } from '../../compat/store/workModeStore.js';
import { getGlobalCtx } from '../../index.js';
import { publisherApiFetch, safeParseJson } from '../../settings/SocialPublisherTypes.js';
export function useSocialWorkflow(sessionId) {
    const mode = useAppWorkMode();
    const isSocial = mode === 'social';
    const defaultWorkflow = {
        stage: 'idle',
        platform: 'gzh',
        topics: [],
        accountTopicGroups: [],
        pipelineSteps: [],
        articles: [],
        tasks: [],
    };
    const [workflow, setWorkflow] = useState(defaultWorkflow);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const refresh = () => setRefreshTrigger(n => n + 1);
    useEffect(() => {
        if (!isSocial) {
            setWorkflow(defaultWorkflow);
            return;
        }
        let isCancelled = false;
        const ctx = getGlobalCtx();
        // 1. 尝试从当前 SessionBinding 的事件流中提取 rows
        const updateFromEvents = () => {
            if (isCancelled || !sessionId || !ctx?.sessions)
                return;
            try {
                const binding = ctx.sessions.binding?.(sessionId);
                if (binding?.eventSource) {
                    const snapshot = binding.eventSource.getSnapshot?.();
                    if (snapshot?.entries) {
                        const rows = [];
                        const toolCallMap = new Map();
                        for (const entry of snapshot.entries) {
                            if (entry.type !== 'event')
                                continue;
                            const ev = entry.event;
                            if (ev.type === 'user/message') {
                                const userMsg = ev.data?.message ?? ev.data;
                                const text = typeof userMsg?.content === 'string'
                                    ? userMsg.content
                                    : (typeof userMsg?.text === 'string' ? userMsg.text : '');
                                rows.push({
                                    kind: 'userInput',
                                    role: 'user',
                                    text,
                                    content: text,
                                });
                            }
                            else if (ev.type === 'assistant/message') {
                                const asstMsg = ev.data?.message ?? ev.data;
                                const text = typeof asstMsg?.content === 'string'
                                    ? asstMsg.content
                                    : (typeof asstMsg?.text === 'string' ? asstMsg.text : '');
                                rows.push({
                                    kind: 'assistantText',
                                    role: 'assistant',
                                    text,
                                    content: text,
                                });
                            }
                            else if (ev.type === 'tool/call') {
                                let parsedInput = undefined;
                                const rawArgs = ev.data?.arguments;
                                if (typeof rawArgs === 'string') {
                                    try {
                                        parsedInput = JSON.parse(rawArgs);
                                    }
                                    catch {
                                        parsedInput = rawArgs;
                                    }
                                }
                                else {
                                    parsedInput = ev.data?.input ?? rawArgs;
                                }
                                const callId = ev.data?.callId;
                                const toolRow = {
                                    kind: 'toolCall',
                                    toolName: ev.data?.name || '',
                                    name: ev.data?.name || '',
                                    callId,
                                    status: 'running',
                                    input: parsedInput,
                                    output: undefined,
                                };
                                if (callId) {
                                    toolCallMap.set(callId, toolRow);
                                }
                                rows.push(toolRow);
                            }
                            else if (ev.type === 'tool/result') {
                                const callId = ev.data?.message?.toolCallId ?? ev.data?.callId;
                                let rawOutput = ev.data?.message?.content ?? ev.data?.result ?? ev.data?.meta;
                                let parsedOutput = rawOutput;
                                if (typeof rawOutput === 'string') {
                                    try {
                                        parsedOutput = JSON.parse(rawOutput);
                                    }
                                    catch {
                                        parsedOutput = rawOutput;
                                    }
                                }
                                const existing = callId ? toolCallMap.get(callId) : undefined;
                                if (existing) {
                                    existing.status = 'success';
                                    existing.output = parsedOutput;
                                }
                                else {
                                    rows.push({
                                        kind: 'toolCall',
                                        callId,
                                        status: 'success',
                                        output: parsedOutput,
                                    });
                                }
                            }
                        }
                        if (rows.length > 0) {
                            const extracted = extractSocialWorkflow(rows);
                            if (extracted.articles.length > 0 || extracted.stage !== 'idle') {
                                setWorkflow(extracted);
                                return;
                            }
                        }
                    }
                }
            }
            catch (e) {
                console.warn('[useSocialWorkflow] 提取事件流状态容错:', e);
            }
        };
        updateFromEvents();
        // 订阅 binding.eventSource
        let unsubscribeEventSource;
        try {
            const binding = sessionId && ctx?.sessions ? ctx.sessions.binding?.(sessionId) : undefined;
            if (binding?.eventSource?.subscribe) {
                unsubscribeEventSource = binding.eventSource.subscribe(updateFromEvents);
            }
        }
        catch { }
        // 2. 监听全局自定义更新事件（例如中间画布或者外部工作流主动触发）
        const handleCustomUpdate = (e) => {
            const customEvent = e;
            if (customEvent.detail && Array.isArray(customEvent.detail.articles)) {
                setWorkflow(customEvent.detail);
            }
        };
        window.addEventListener('wincode:social-studio-workflow-update', handleCustomUpdate);
        // 3. 异步尝试从后端草稿列表拉取最新草稿（兜底防止刷新后会话丢失内存产物）
        const loadBackendDrafts = async () => {
            try {
                const res = await publisherApiFetch('/api/gzh-publisher/drafts/list');
                const parsed = await safeParseJson(res);
                if (!isCancelled && parsed.ok && Array.isArray(parsed.data?.drafts) && parsed.data.drafts.length > 0) {
                    const loadedArticles = [];
                    for (const draft of parsed.data.drafts) {
                        const rawArts = draft.articles || [];
                        for (let i = 0; i < rawArts.length; i++) {
                            const a = rawArts[i];
                            loadedArticles.push({
                                id: draft.draft_id ? `${draft.draft_id}_${i}` : String(i + 1),
                                index: i + 1,
                                title: a.title || '社媒草稿文章',
                                digest: a.digest || '',
                                content: a.content || '',
                                coverUrl: a.cover_url || '',
                                images: a.images || [],
                                platform: draft.platform || 'gzh',
                                articleType: draft.article_type || 'news',
                                status: 'completed',
                            });
                        }
                    }
                    if (loadedArticles.length > 0) {
                        setWorkflow((prev) => {
                            if (prev.articles.length > 0)
                                return prev;
                            return {
                                ...prev,
                                stage: 'review',
                                articles: loadedArticles,
                            };
                        });
                    }
                }
            }
            catch { }
        };
        loadBackendDrafts();
        return () => {
            isCancelled = true;
            unsubscribeEventSource?.();
            window.removeEventListener('wincode:social-studio-workflow-update', handleCustomUpdate);
        };
    }, [sessionId, isSocial, refreshTrigger]);
    return {
        workflow,
        isSocial,
        hasArticles: workflow.articles.length > 0,
        refresh,
    };
}
//# sourceMappingURL=useSocialWorkflow.js.map