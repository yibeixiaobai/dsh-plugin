# 小红书「假成功」缺陷修复说明

日期：2026-09-28
影响范围：`xhs` 账号（小红书）发布链路

## 现象

`gzh_publish_draft(account_id="xhs")` 返回 `status: success`、`published: true`，
但草稿从未真正进入小红书：

- `publish_result.json` / `publish_history.json` 中 `note_id` 为占位符 `pending_1` / `pending_2`，`url` 为空
- `draft_urls.txt` 为空
- `gzh_verify_draft` 报 `found=false`、`article_count=0`
- 调试截图 `*_published.png` 为 1440×900、97.9% 纯白空白页
  （自 12:47 起每次运行 MD5 完全一致：`65D8AACC49D254DFE35A2F1688E7B997`）

对照：12:07 的 `upload_count_mismatch.png` 为 2561×1314、61446 色的**真实页面**，
说明浏览器可用，是**编辑器环节未渲染**，而非整体不可达。

## 根因

主因在 `src/xiaohongshu.ts` 的发布成功判定过于宽松（原第 588 行）：

```ts
const published = Boolean(liveUrl) || sawPublishedFlag
  || /发布成功|已发布|审核中/.test(document.body?.innerText || '')
```

小红书创作者后台的**静态文案**（侧边栏、说明文字）本身就含「已发布」「审核中」，
该正则因此**恒为真**；即使 `_onPublish()` 未生效、页面空白，也被判定为成功。

随后第 596 行又以 `note_id: liveUrl || 'pending_' + index` 兜底，
调用层 `src/tools/publish.ts` 更是**硬编码** `status: 'success'`，
于是「空跑」被完整地记录成一次成功发布。

诱因：反爬 cookie `acw_tc` 于 **2026-09-28 02:10 过期**；
自 **02:51** 起连续 5 个批次全部落入此陷阱，与失效起点吻合。
登录 token 本身有效（`access-token` / `galaxy_creator_session_id` 至 2026-10-28），
`user_name=文映千秋学术`，**不是登录问题**。

## 修复内容

### 1. `src/xiaohongshu.ts` — 收紧成功判定（主修复）

- 删除 `已发布|审核中` 这一恒真文本判据；文本命中仅保留为「继续等待」的弱信号，**不参与最终判定**
- 最终判定改为必须拿到**真实 note id**（`/explore/<id>` 或 `note_id=<id>`）才算成功
- 未取得 id 时抛出异常，并附带当前 URL、是否观察到成功文案、截图路径
- 移除 `note_id: liveUrl || 'pending_' + index` 兜底占位，`url` 直接由真实 id 拼装

### 2. `src/tools/publish.ts` — 调用层防呆（纵深防御）

写入 `publish_result.json` 前先校验：任一篇的 `note_id` 为空或匹配 `^pending_`，即视为整批失败，
写出 `status: 'failed'` 并抛出明确异常，**绝不再上报 `status: 'success'`**。

### 3. 历史记录更正

`tasks/default/accounts/xhs/scripts/publish_history.json` 中 5 个批次原先均为假成功，
已将其 `status` 更正为 `failed`、`published` 置为 `false` 并附 `failure_reason`。
原文件备份为 `publish_history.json.bak-falsefix`。

### 4. 回归测试

新增 `tests/test_xhs_publish_confirm.ts`（8 项断言，全部通过），覆盖：

- 旧逻辑确实会把空白页误判为成功（固化缺陷特征）
- 新逻辑：无真实 note id → 失败；有真实 id → 成功
- 调用层对 `pending_N` / 空 id / 混合场景的拦截
- 历史失效批次在新逻辑下全部判为失败

已并入 `npm test`。

## 验证结果

| 检查项 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0（全项目类型检查通过） |
| `tests/test_xhs_config.ts` | ALL TESTS PASSED |
| `tests/test_xhs_publish_confirm.ts` | ALL TESTS PASSED (8 checks) |
| 源文件断言 | 旧宽松判定已移除 / 新严格判定已就位 / publish 分支无 pending 兜底 |

## 遗留事项（需人工决策）

1. **修复需重启 DSH 宿主才生效**。插件由宿主进程加载 `src/*.ts`，当前进程仍持有旧模块缓存，
   故编辑后立即重跑仍返回 `pending_N`。重启 DSH 后新逻辑即生效。
2. **`acw_tc` 反爬 cookie 已过期**，建议重启后先执行一次扫码登录刷新会话再发布。
3. **小红书编辑器未渲染**的深层原因尚未定位（`_onPublish()` 组件可能已随小红书前端改版失效）。
   修复后此类情况会**明确报错**而非假成功，但真正发布成功仍需人工在创作者后台确认或
   由具备 browser 工具的会话交互式排查。
4. 账号 5 的两篇笔记正文与 8 张 3:4 图已就绪，可直接重发。
