/**
 * 构造跨工作区、用户持久化数据目录及插件规范任务目录的多级候选绝对路径探针
 * 【核心规约】：
 * 1. 严格账号隔离：指定 accountId 时仅探测当前账号，禁止向其它账号扩散；
 * 2. 沙箱物理闭环：位于 tasks/active/ 或 tasks/archive/ 的任务沙箱严禁向全局 ~/.wincode 或其它任务目录 fallback 旧图；
 * 3. 别名互探：支持 pic_1 <-> pic_1_1, cover_1.png <-> cover_1.jpg 等规范别名；
 * 4. 品牌图严格独立：账号品牌图仅探测当前账号专属 brand_assets，账号未配置时绝不 fallback 到历史公共黑框 IT 模板图。
 */
export declare function resolveCandidatePaths(inputPath: string, workspacePath?: string, accountId?: string, scriptsDir?: string): string[];
//# sourceMappingURL=resolveCandidatePaths.d.ts.map