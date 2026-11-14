export function buildSocialComposerPrompts(params) {
    const { platformsToSubmit, accountsToUse, selectAll, notesToSubmit, isDryRun, platformsMeta, sessionId, workspacePath, } = params;
    const platformNames = platformsToSubmit
        .map(p => platformsMeta.find(item => item.key === p)?.label ?? p)
        .join('、');
    const accountNames = accountsToUse
        .map(a => a.name || a.id)
        .join('、');
    const accountNotice = selectAll
        ? `所选平台下全部已启用账号（共 ${accountsToUse.length} 个账号：${accountNames}）`
        : `指定账号（共 ${accountsToUse.length} 个账号：${accountNames}）`;
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rand = Math.random().toString(36).slice(2, 6);
    const sShort = sessionId ? `_s_${sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}` : '';
    const singlePlatform = platformsToSubmit.length === 1 ? platformsToSubmit[0] : null;
    const singleAcc = accountsToUse.length === 1 ? accountsToUse[0] : null;
    const singleTaskId = singleAcc
        ? `task_${dateStr}${sShort}_${singleAcc.platform === 'xhs' ? 'xiaohongshu' : (singleAcc.platform || singlePlatform || 'gzh')}_${singleAcc.id}_${rand}`
        : undefined;
    const wsArg = workspacePath ? ` --workspace "${workspacePath.replace(/\\/g, '/')}"` : '';
    const taskArg = singleTaskId ? ` --task-id ${singleTaskId}` : '';
    const cmdFirstLine = singlePlatform
        ? (selectAll ? `/publish ${singlePlatform} all` : `/publish ${singlePlatform} ${accountsToUse.map(a => a.id).join(' ')}${taskArg}${wsArg}`)
        : (selectAll ? '/publish all' : `/publish ${accountsToUse.map(a => a.id).join(' ')}${taskArg}${wsArg}`);
    const dryRunNotice = isDryRun
        ? '【执行模式】演练模式（Dry Run：全流程模拟推演，不调用真实扣费生图与官方发布接口）'
        : '【执行模式】真实发布模式（严格执行选题与发布确认门禁）';
    const matrixNotice = accountsToUse.length > 1
        ? `【社媒矩阵任务】本次任务包含 ${accountsToUse.length} 个独立账号并发执行（${accountNames}），启用主总控看板与会话隔离调度。`
        : '';
    // 中文修复依据：遵循社媒发布模式脱敏规范，会话明面提示词仅保留纯净业务意图与定制要求，彻底剥离底层代码保密、工具调用纪律与技术限制
    const formattedPrompt = [
        cmdFirstLine,
        dryRunNotice,
        matrixNotice,
        `【发布平台】${platformNames}`,
        `【执行账号】${accountNotice}`,
        notesToSubmit.trim() ? `【定制要求与备注】${notesToSubmit.trim()}` : '',
        '请启动社媒流水线：执行前置预检与热点选题雷达，生成排版规范图文并等待我确认审核。',
    ]
        .filter(Boolean)
        .join('\n');
    const matrixBatchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const accountsPlan = accountsToUse.map((acc) => {
        const rawPlatform = acc.platform === 'xhs' ? 'xiaohongshu' : acc.platform;
        const pKey = (rawPlatform || 'gzh');
        const pLabel = platformsMeta.find(p => p.key === pKey)?.label || pKey;
        // 【中文修复依据】：基于当前 sessionId 自动生成独立专属任务 ID，彻底杜绝大模型复用旧沙箱
        const rand = Math.random().toString(36).slice(2, 6);
        const sShort = sessionId ? `_s_${sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}` : '';
        const taskId = `task_${dateStr}${sShort}_${pKey}_${acc.id}_${rand}`;
        const wsArg = workspacePath ? ` --workspace "${workspacePath.replace(/\\/g, '/')}"` : '';
        const singleCmd = `/publish ${pKey} ${acc.id} --task-id ${taskId}${wsArg}`;
        // 中文修复依据：遵循脱敏规范，单账号会话 Prompt 彻底剥离沙箱物理路径警告与底层散装脚本禁用喊话，硬性限制下沉至插件
        const singlePrompt = [
            singleCmd,
            `【社媒矩阵任务 · ${pLabel} · ${acc.name || acc.id}】`,
            dryRunNotice,
            '【单账号专属执行】当前会话为该账号专属的一级会话，流程针对本账号端到端推进。',
            `【发布平台】${pLabel}`,
            `【执行账号】${acc.name || acc.id} (ID: ${acc.id})`,
            notesToSubmit.trim() ? `【定制要求与备注】${notesToSubmit.trim()}` : '',
            '请启动社媒流水线：预检登录态与规范，严格按平台规则生成排版稿件并呈现审校卡片等待确认。',
        ]
            .filter(Boolean)
            .join('\n');
        return {
            accountId: acc.id,
            accountName: acc.name || acc.id,
            platform: pKey,
            platformLabel: pLabel,
            singlePrompt,
            taskId,
            matrixBatchId,
        };
    });
    return { formattedPrompt, accountsPlan };
}
/**
 * 解析并继承用于派生子会话的模型、思考深度与推理选项（多级回退机制）
 * 中文修复原因：推理模型（如 new-provider-2/gemini-3.8-flash, o1 等）需要明确的 reasoningLevel / thought，
 * 否则 CLI 在 model_creation 时会报 ModelProtocolError: Reasoning level is required 导致子账号会话直接崩溃。
 */
export function resolveDerivedSessionModelAndThought(params) {
    const { unifiedModel, draftConfig, snapshotConfig } = params;
    const effectiveModelSelection = unifiedModel
        ? { provider: unifiedModel.provider, model: unifiedModel.model }
        : draftConfig?.modelSelection?.providerId && draftConfig?.modelSelection?.modelId
            ? { provider: draftConfig.modelSelection.providerId, model: draftConfig.modelSelection.modelId }
            : snapshotConfig?.modelSelection?.providerId && snapshotConfig?.modelSelection?.modelId
                ? { provider: snapshotConfig.modelSelection.providerId, model: snapshotConfig.modelSelection.modelId }
                : snapshotConfig?.provider && snapshotConfig?.model
                    ? { provider: snapshotConfig.provider, model: snapshotConfig.model }
                    : undefined;
    const effectiveReasoningLevel = draftConfig?.modelSelection?.options?.reasoningLevel ??
        snapshotConfig?.modelSelection?.options?.reasoningLevel ??
        draftConfig?.thought ??
        snapshotConfig?.thought ??
        undefined;
    const effectiveOptions = effectiveReasoningLevel
        ? {
            ...(draftConfig?.modelSelection?.options ?? snapshotConfig?.modelSelection?.options),
            reasoningLevel: effectiveReasoningLevel,
        }
        : draftConfig?.modelSelection?.options ??
            snapshotConfig?.modelSelection?.options ??
            undefined;
    const effectiveThought = draftConfig?.thought ??
        snapshotConfig?.thought ??
        effectiveReasoningLevel ??
        undefined;
    return {
        effectiveModelSelection,
        effectiveOptions,
        effectiveThought,
    };
}
//# sourceMappingURL=socialComposerPromptBuilder.js.map