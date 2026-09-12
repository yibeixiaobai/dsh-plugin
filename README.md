# dsh-gzh-publisher

把「文映千秋学术网」公众号自动化流水线（写文 → 排版 → AI 配图 → 草稿发布 → 核验）封装为
**DeepSeek Harness (dsh)** 插件。遵循 dsh 开发者预览版的 Cordis 插件约定：
`export name / inject / Config（Schemastery schema）/ apply(ctx, config)`。

## 架构

```
dsh Agent ──调用──▶ 7 个工具（TypeScript，本插件）
                        │ spawn python（###RESULT### JSON 协议）
                        ▼
              pipeline/*.py 参数化入口（纯计算 + 网络，零写盘）
                        │ import / runpy 复用
                        ▼
   插件 runtime/（gzh_components、publish_template、HTML 校验器与默认品牌图）
```

- Python 侧只做计算与联网，**文件落盘全部由 TS 侧完成**（文章 HTML、上传缓存、发布结果）
- job 参数走 argv 内联 JSON（`--doc-json` / `--job-json`），无临时文件
- 插件运行代码与资源全部位于本插件目录，不依赖其它公众号项目包
- 任务工作区留空时使用 `D:/666/gzh/dsh-plugin/tasks/default`；也可在设置中填写其它绝对路径
- **任务产物按账号隔离**：每个账号的写作、配图、缓存与发布记录都写入
  `<工作区>/accounts/<账号ID>/scripts/`，多账号互不覆盖；品牌图 `brand_assets/` 与测试图
  `gzh_test_images/` 仍为工作区共享
- 凭据的单一事实来源是 **dsh 设置界面**：每次加载/热重载自动同步到共享 `scripts/wx_config.json`
  并逐账号下发一份到各账号目录（Python 从账号自己的目录读取）；留空的设置项沿用文件现状，不覆盖

## 前置条件

- Node.js ≥ 22.19（dsh 要求）
- Python 3.12 + `requests` + `Pillow`（项目现有环境）
- dsh（`npx @deepseek-ai/dsh web`）

## 安装

本包声明了 `dsh.bundle.patch`（`cordis.patch.yml`），因此可以作为 profile 组合包层安装：

```bash
# 方式一：本地路径安装（把 <profile> 换成要安装到的 profile，本机 Desktop 为 desktop）
dsh plugin --profile desktop add link:D:/666/gzh/dsh-plugin

# 方式二：cordis.yml patch 挂载（开发迭代用，hot reload；id 为 gzh-publisher-dev，不写盘安装）
dsh --profile desktop --patch D:/666/gzh/dsh-plugin/cordis.yml

# 方式三：发布到 GitHub 后
dsh plugin --profile desktop add github:<user>/<repo>
```

Desktop 版 dsh 不在 PATH 上时，用自带的 CLI 入口：

```powershell
node "D:\DeepSeek Harness Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\dsh\lib\bin.js" `
  plugin --profile desktop add link:D:/666/gzh/dsh-plugin
```

`dsh plugin add` 会写入 profile 的 `package.json`（`link:` 依赖 + `dsh.profile.bundles` 条目）并在
`profiles/desktop/node_modules/` 建符号链接；**组合包层只在启动时读取，重启 dsh 后本插件才生效**
（Desktop 版重启 DeepSeek Harness Desktop；CLI 版重启 `dsh web`）。

安装后打开 dsh web 工作台 → 设置 → **公众号**，
即可通过 8 个 Tab 配置多公众号账号、账号绑定内容规则、全局 AI 生图接口池、头尾品牌图、排版、封面配图与运行参数；
修改后热重载自动生效。

## 快捷设置（Config schema）

| 分组 | 配置项 |
|---|---|
| ① 公众号账号 | 多账号新增、一键复制（含凭据克隆配置快速新建）、启停、删除、设为默认；每个账号独立保存 `appid`、`app_secret`、`author_name`、`brand_name` |
| ② 内容规则 | 按账号编辑 `articles_per_day`(6)、`min_words`(2000)、`topics`、`forbidden_words`、`ending_guide_required` |
| ③ 排版 | `headline_theme`（6 主题下拉）、`secondary_theme`（rotate=按篇顺序轮换各主题）、`font_size`(13px)、`line_height`(20px)、`paragraph_margin`(25px)、`text_indent`(2em) |
| ④ 生图接口 | 全局接口池：`base_url`、`api_key`、`model`、`priority`；任何接口级失败（网络/超时/任意 HTTP 错误/返回格式异常）自动切换下一个接口，成功后保持；每个接口可单独测试并预览结果 |
| ⑤ 头部品牌图 | 按账号上传或拖放 JPEG/PNG/WebP（≤10 MB），即时预览，并配置尺寸、裁切、位置、圆角与边框 |
| ⑥ 尾部品牌图 | 同头部字段，可按账号独立上传、预览、启用和变换 |
| ⑦ AI 配图 | `headline_cover_ratio`（头条封面比例，默认 2.35:1=3520×1498）、`secondary_cover_ratio`（次条，默认 1:1=1920×1920）、`content_images_per_article`(2)、`image_lang_zh_only`(true) |
| ⑧ 运行 | `project_root`（留空使用插件内 `tasks/default`）、`python_path`、`request_timeout_ms`、`dry_run`、`verify_after_publish`、`use_upload_cache`、`need_open_comment` |

旧版 `wechat`、`content`、`brand_images`、`image_api` 配置会自动归入 `default` 账号和默认接口；首次保存后优先使用新模型，同时保留旧字段兼容现有脚本。

## 工具（7 个）

### 快捷指令

在任意 dsh 会话输入以下指令即可直接启动任务：

```text
/gzh
/gzh account-id
/gzh account-id 本次重点关注职称评审政策
/gzh account-a,account-b 两个账号本周错开选题
```

- `/gzh`：**遍历全部启用账号**逐个执行完整流程（默认账号排最前），自动选题并执行查重、写作、排版、生图、校验、草稿发布和核验；每个账号的文章数、字数、选题方向、封面比例、配图数等配置直接注入任务提示词。
- 指定账号：首词支持逗号分隔多个 `account-id`，只跑这些账号。
- 账号 ID 后的文字作为本次任务补充要求；首词不是账号 ID 时，整段文字作为补充要求。
- **多账号互斥**：任务要求候选选题不得与任一账号的历史、以及同批次其它账号已确定的选题重复；`gzh_check_topics` 查重时自动聚合其它账号目录与旧共享目录的历史标题（来源标注账号 ID）。
- **严格按设置执行**：文章数、每篇配图数、主题（theme_plan）、封面比例由后端强制校验——`gzh_build_article` 按设置解析主题（doc 内 theme 字段被忽略），`gzh_generate_images` 拒绝超出设置的正文配图请求；任务提示词明确选题只能取自配置的「选题方向」（补充要求显式指定除外），禁止自由发挥。

| 工具 | 作用 |
|---|---|
| `gzh_check_topics` | 选题查重：候选选题 vs 本账号 + 其它账号历史标题，返回 high/medium/low 风险与来源 |
| `gzh_get_style_guide` | 写作规范：主题色板、doc_spec 格式、13px 铁律、禁词、硬性规则；返回每日文章数、选题方向、配图数与逐篇主题计划 theme_plan |
| `gzh_build_article` | 按 doc spec 构建单行 HTML（引言卡/目录/徽章/下划线/卡片图），断言 + lint，落盘 `article_v2_{i}.html` |
| `gzh_generate_images` | AI 生图：封面（头条默认 `2.35:1`）+ 正文信息图，自动缩放 |
| `gzh_validate_html` | 发布前机器校验：换行/字数/禁词/占位符/图片数/CDN + gzh-design lint |
| `gzh_publish_draft` | 上传素材（缓存续跑）→ 替换占位符 → draft/add 组合 1 个多图文草稿 |
| `gzh_verify_draft` | draft/get（POST）逐篇核验草稿 |

除 `gzh_generate_images` 的账号用于读取每日文章数外，全部内容与发布工具都接受可选 `account_id`；未传时使用默认账号，返回结果会标明实际账号 ID。

### 每日流程示例（Agent 视角）

1. `gzh_check_topics` 查重选题（高风险则换；多账号时跨账号互斥）
2. `gzh_get_style_guide` 取规范（文章数/配图数/theme_plan 以返回值为准）→ 逐篇 `gzh_build_article`
3. `gzh_generate_images` 生成封面 + 正文图
4. `gzh_validate_html` 全量校验
5. `gzh_publish_draft`（titles/digests）→ 草稿箱
6. `gzh_verify_draft` 核验 → 人工确认后群发

## 自测（零写盘、零联网）

```bash
python pipeline/selftest.py
```

覆盖：选题查重（含跨账号历史聚合）、文章构建（断言字数/图片数/品牌语）、HTML 校验（含 gzh-design lint）、
生图演练、401/429/5xx 与 400 等任意接口失败均自动轮换（全部失败才报错）、多账号凭据解析、内容 hash 上传缓存键、发布演练（复用现成文章）。

## 类型检查

```bash
npm install && npx tsc   # dsh 宿主直载 TS，本地 tsc 仅做签名检查
```

`src/dsh-env.d.ts` 是 `@deepseek-ai/*` 的本地最小类型声明；dsh 版本升级后如有 API 变更，以官方文档为准（预览版存在破坏性变更风险）。

## 兼容性与安全说明

- **宿主直载 TS**：宿主以 Node 的 TS 类型擦除直接 import `src/index.ts`，因此所有相对导入必须带
  `.ts` 扩展名（ESM 不做扩展名补全），`tsconfig` 需 `allowImportingTsExtensions`；`name` 里的
  Windows 绝对路径必须写成 `file:///` URL
- **工具 output schema**：`@deepseek-ai/dsh-tools` 要求对象型 schema 显式声明 `additionalProperties`，
  Python 返回的自由结构报告统一用 `{ type: 'json' }`（渲染仍走 `renderJson`）
- **占位符两代格式均兼容**：正文图 `IMG_A{i}_{j}`（publish_template 一系）与
  `__IMG_{i}_{j}__`（v116 现行）在构建白名单、发布替换、校验中都可识别
- **路径安全**：Python 侧所有文件读写做 normpath + 目录边界守卫；下载 URL 强制 http(s)
  且 DNS 解析后阻断私网/环回地址（防 SSRF）；无 shell 子进程
- **工作区隔离**：默认任务文件写入插件内 `tasks/default`（按账号再分到 `accounts/<id>/scripts/`）。
  填写外部工作区后，只把任务产物写入该目录，
  排版、发布与校验代码仍从插件 `runtime` 读取。旧的 `D:/666/gzh/文映千秋学术网` 不会自动迁移或读取；
  升级前写在共享 `scripts/` 的历史文章不会被移动，但 `gzh_check_topics` 仍会读取其标题用于查重
- **凭据**：按你的选择存于插件设置（Schemastery secret 字段）。请勿把填了密钥的
  `cordis.yml` 提交到公开仓库；`wx_config.json` 由插件同步维护，同样注意保密
- **演练模式**：设置 `dry_run: true` 后，生图与发布工具只跑校验不联网，适合先演练后正式
