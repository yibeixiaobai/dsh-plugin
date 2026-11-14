# dsh-social-publisher

通用**多平台社媒自动化内容生产与发布插件**（公众号/知乎等多平台）：
写文选题查重 → 智能撰写排版 → AI 配图 → 草稿发布 → 自动核验。
支持同一套工具链按账号平台智能分发——
微信公众号（单行 HTML + draft/add 草稿箱 / 小绿书图片卡片）与知乎专栏（标准 Markdown + 浏览器自动化发布到草稿箱）。
遵循 dsh 开发者预览版的 Cordis 插件约定：
`export name / inject / Config（Schemastery schema）/ apply(ctx, config)`。

## 架构

```
dsh Agent ──调用──▶ 7 个工具（TypeScript，本插件；按账号 platform 内部分发）
                        │ 公众号：spawn python（###RESULT### JSON 协议）     知乎：puppeteer-core + 本机浏览器
                        ▼                                                   ▼
              pipeline/*.py 参数化入口（纯计算 + 网络，零写盘）      src/zhihu.ts 浏览器自动化
                        │ import / runpy 复用                               （登录态在账号独立 userDataDir）
                        ▼
   插件 runtime/（gzh_components、zhihu_components、publish_template、HTML 校验器与默认品牌图）
```

- Python 侧只做计算与联网，**文件落盘全部由 TS 侧完成**（文章 HTML/Markdown、上传缓存、发布结果）
- job 参数走 argv 内联 JSON（`--doc-json` / `--job-json`），无临时文件
- 插件运行代码与资源全部位于本插件目录，不依赖其它公众号项目包
- 任务工作区留空时使用 `D:/666/gzh/dsh-plugin/tasks/default`；也可在设置中填写其它绝对路径
- **任务产物按账号隔离**：每个账号的写作、配图、缓存与发布记录都写入
  `<工作区>/accounts/<账号ID>/scripts/`，多账号互不覆盖；知乎账号另有
  `accounts/<账号ID>/zhihu_profile/`（浏览器登录态）；品牌图 `brand_assets/` 与测试图
  `gzh_test_images/` 仍为工作区共享
- 凭据的单一事实来源是 **dsh 设置界面**：每次加载/热重载自动同步到共享 `scripts/wx_config.json`
  并逐账号下发一份到各账号目录（Python 从账号自己的目录读取）；留空的设置项沿用文件现状，不覆盖

## 平台：知乎专栏

知乎没有官方发布 API，HTTP 逆向因 `x-zse-96` 签名频繁变动不可持续；本插件采用**浏览器自动化**
（`puppeteer-core` 复用本机 Chrome/Edge，不下载浏览器）。接入步骤：

1. 设置 → 账号：新建账号并把「发布平台」切到 `zhihu`，**先保存**
2. 在该账号卡片点「扫码登录知乎」：弹出本机浏览器扫码，登录态（`z_c0`）保存在账号独立目录，长期有效
3. 照常走 `gzh_check_topics → gzh_get_style_guide → gzh_build_article（产出 .md）→
   gzh_generate_images → gzh_validate_html → gzh_publish_draft` 全流程

支持的平台与文章形态差异（全部机器强制，不靠提示词）：

| 维度 | 公众号长文 (`news`) | 公众号小绿书 (`newspic`) | 知乎专栏 (`zhihu`) |
|---|---|---|---|
| 文章产物 | 单行 HTML（13px 排版/品牌头尾图） | 结构化文案（`article_v2_{i}_pic.json`） | 标准 Markdown（`article_v2_{i}.md`） |
| 视觉核心 | 封面 + 正文插图 | 3:4 竖版多图轮播卡片（1~20张） | 16:9 封面 + 插图 |
| 发布方式 | draft/add 合并多图文草稿 | draft/add 图片消息（首图为封面） | 浏览器自动化逐篇草稿 |
| 封面来源 | material/add_material 上传返回 media_id | **首张卡片图自动作为封面**（无需额外封面） | 编辑器由插图自动提取/设置 |
| 封面/图片比例 | 头条 2.35:1 / 次条 1:1 | 统一 3:4 竖版（可配置 1:1） | 统一 16:9 |
| 标题上限 | 64 字 | **32 字**（微信官方强制） | 100 字 |
| 正文字数 | ≥2000 字深度长文 | 80~600 字纯文本（支持换行/emoji/#标签） | ≥2000 字 Markdown |
| 校验规则 | 换行/占位符/品牌/mmbiz CDN + lint | 标题≤32字/纯文字/禁词/卡片图齐全 | 字数/禁词/图片占位符 |

发布过程逐篇截图存 `accounts/<id>/scripts/zhihu_debug/` 供审计；检测到知乎风控/验证页会
**立即停止并截图报错，绝不自动打码**。`runtime.chrome_path` 可指定浏览器；`zhihu_headless`
默认开（排障时可关闭观察自动化过程）。

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

安装后打开 dsh web 工作台 → 设置 → **社媒发布**，
即可通过 9 个 Tab 配置多平台社媒账号、账号绑定内容规则、全局 AI 生图接口池、头尾品牌图、排版、封面配图、运行参数以及配置备份导入导出；
修改后热重载自动生效。

## 快捷设置（Config schema）

| 分组 | 配置项 |
|---|---|
| ① 账号 | 多账号新增、一键复制（含凭据克隆配置快速新建）、启停、删除、设为默认；每个账号可选发布平台 `platform`（gzh=公众号 / zhihu=知乎），公众号独立保存 `appid`、`app_secret` 与 `auto_enable_original`（草稿创建后自动通过浏览器打开并批量开启原创并保存），知乎账号扫码登录并有 `publish_immediately` 直发开关；`author_name`、`brand_name` 平台通用 |
| ② 内容规则 | 按账号编辑 `articles_per_day`(6)、`min_words`(2000)、`topics`、`forbidden_words`、`ending_guide_required` |
| ③ 排版 | `headline_theme`（6 主题下拉）、`secondary_theme`（rotate=按篇顺序轮换各主题）、`font_size`(13px)、`line_height`(20px)、`paragraph_margin`(25px)、`text_indent`(2em)；仅公众号账号使用 |
| ④ 生图接口 | 全局接口池：`base_url`、`api_key`、`model`、`priority`；任何接口级失败（网络/超时/任意 HTTP 错误/返回格式异常）自动切换下一个接口，成功后保持；每个接口可单独测试并预览结果 |
| ⑤ 头部品牌图 | 按账号上传或拖放 JPEG/PNG/WebP（≤10 MB），即时预览，并配置尺寸、裁切、位置、圆角与边框；仅公众号账号使用 |
| ⑥ 尾部品牌图 | 同头部字段，可按账号独立上传、预览、启用和变换 |
| ⑦ AI 配图 | `headline_cover_ratio`（头条封面比例，默认 2.35:1=3520×1498）、`secondary_cover_ratio`（次条，默认 1:1=1920×1920）、`content_images_per_article`(2)、`image_lang_zh_only`(true)；知乎账号封面统一 16:9 |
| ⑧ 运行 | `project_root`（留空使用插件内 `tasks/default`）、`python_path`、`request_timeout_ms`、`dry_run`、`verify_after_publish`、`use_upload_cache`、`need_open_comment`、`chrome_path`（浏览器自动化用，留空自动探测 Chrome/Edge）、`zhihu_headless`（知乎无头模式）、`gzh_headless`（微信公众号自动化无头模式，默认开） |
| ⑨ 配置备份 | 支持全量或按范围（账号/接口池/排版规则/运行时）导出为 `.json` 文件或复制到剪贴板，支持密钥一键安全脱敏；支持文件拖拽与文本粘贴导入、实时语法结构预检看板，提供「增量合并（推荐，保护已有有效密码）」与「完全覆盖」双模式 |

旧版 `wechat`、`content`、`brand_images`、`image_api` 配置会自动归入 `default` 账号和默认接口；首次保存后优先使用新模型，同时保留旧字段兼容现有脚本。

## 工具（9 个）

### 快捷指令（基于空格识别符）

插件提供全新的以**空格为唯一参数识别符**的多平台通用发布指令，在任意 dsh 会话中均可直接调用：

```text
# 通用主指令格式：/publish [社媒类型|账号名|账号ID] [账号名/ID] [选题与补充要求...]
/publish 探讨前沿人工智能的发展轨迹                 # 【默认全量】自动执行全平台全部已启用的社媒账号
/publish gzh 2026年学术期刊发表政策综述             # 【指定社媒】仅执行公众号下全部已启用账号（知乎不跑）
/publish zhihu 深度解析大语言模型                   # 【指定社媒】仅执行知乎下全部已启用账号（公众号不跑）
/publish 文映学术2 今日学术热点盘点                 # 【指定单账号】通过中文账号名称精准锁定单账号
/publish default-copy 今日学术热点盘点              # 【指定单账号】通过账号 ID 精准锁定单账号
/publish gzh 文映学术2 深度学术专著指南             # 【指定社媒+账号】指定公众号社媒类型 + 指定账号

# 快捷别名与平台专属直达指令：
/post 深度解析大模型                                # /publish 简写别名（默认执行全部已启用）
/zhihu [账号名|账号ID] [选题要求]                   # 知乎专栏直达（默认知乎全部已启用，指定账号则跑单账号）
/gzh [账号名|账号ID] [选题要求]                     # 公众号直达（默认公众号全部已启用，指定账号则跑单账号）
```

- **空格分词与精准调度原则**：
  - **默认全量执行**：输入 `/publish [选题]` 默认执行全平台全部已启用账号；输入 `/publish gzh [选题]` 或 `/gzh [选题]` 默认执行公众号全部已启用账号；输入 `/publish zhihu [选题]` 或 `/zhihu [选题]` 默认执行知乎全部已启用账号；
  - **支持指定单独社媒类型**：首词指定平台词（`gzh`、`zhihu` 等）时，严格仅在对应社媒平台下调度执行，绝不跨平台干扰；
  - **支持指定单独账号**：支持直接输入账号 ID（如 `default-copy`）或账号中文显示名称（如 `文映学术2`、`百家号`），一旦指定账号，系统严格仅针对该单独账号执行生成与发布；
  - **其余内容为选题要求**：空格之后的全部文字均作为第一最高优先级的任务补充要求；
- **支持上传参考附件与补充要求第一优先级**：指令开启了 `attachments: true` 附件上传支持，用户在输入指令时可直接拖拽或上传参考文档、大纲材料、指定图片等附件；附件与文字补充要求均享有第一最高优先级，任务提示词将引导 Agent 深度参考附件材料进行选题与撰写。未冲突的基础排版规范与平台限制（单行 HTML 零换行、禁词表、防重复发布、封面比例等）继续由后端强制守护。
- **调度执行纪律**（内置在任务提示词）：多账号任务自动声明多 Agent 并行或隔离独立推进；指定单账号任务时严格声明单账号隔离、切勿涉及其它无关账号；`gzh_get_style_guide` 返回值自包含；构建/校验/发布只走专用工具，不在回复中复述文章全文、不回读已构建文件；查重与生图按账号批量一次提交。

| 工具 | 作用 |
|---|---|
| `gzh_discover_topics` | 动态热点选题雷达与搜索聚合：结合多源搜索引擎实时资讯、知乎/百度/360高频搜索联想、行业时令日历与5大原生爆款切角矩阵，生成高点击率候选选题池 |
| `gzh_check_topics` | 选题查重：候选选题（围绕核心关键词关联拓展，禁止作为开头词） vs 本账号 + 其它账号历史标题，返回 high/medium/low 风险与来源 |
| `gzh_get_style_guide` | 写作规范（按账号平台返回）：公众号=主题色板/doc_spec/13px 铁律/theme_plan；知乎=Markdown doc_spec 与硬性规则 |
| `gzh_build_article` | 按 doc spec 构建并落盘：公众号单行 HTML（`article_v2_{i}.html`，断言 + lint）；知乎标准 Markdown（`article_v2_{i}.md`） |
| `gzh_generate_images` | AI 生图：封面（公众号头条默认 `2.35:1`，知乎统一 16:9）+ 正文信息图，自动缩放 |
| `gzh_validate_html` | 发布前机器校验：公众号=换行/字数/禁词/占位符/图片数/CDN + lint；知乎=字数/禁词/图片占位符 |
| `gzh_publish_draft` | 公众号：上传素材（缓存续跑）→ 替换占位符 → draft/add 组合 1 个多图文草稿；知乎：浏览器自动化逐篇发布（默认存草稿箱） |
| `gzh_verify_draft` | 公众号：draft/get（POST）逐篇核验；知乎：打开草稿箱逐条核对标题 |
| `gzh_enable_original` | 公众号：浏览器自动化进入草稿编辑页，批量开启文字原创并保存草稿（基于油猴脚本） |

除 `gzh_generate_images` 的账号用于读取每日文章数外，全部内容与发布工具都接受可选 `account_id`；未传时使用默认账号，返回结果会标明实际账号 ID。

### 每日流程示例（Agent 视角）

1. `gzh_discover_topics` 嗅探全网最新搜索热点、时令风向与行业动态，确立高点击率爆款候选选题
2. `gzh_check_topics` 查重防重（高风险则换；多账号时跨账号互斥）
3. `gzh_get_style_guide` 取规范（文章数/配图数/theme_plan 以返回值为准）→ 逐篇 `gzh_build_article`
4. `gzh_generate_images` 生成封面 + 正文图
5. `gzh_validate_html` 全量校验
6. `gzh_publish_draft`（titles/digests）→ 草稿箱
6. `gzh_verify_draft` 核验 → 人工确认后群发

## 自测（零写盘、零联网）

```bash
python pipeline/selftest.py
```

覆盖：选题查重（含跨账号历史聚合）、文章构建（断言字数/图片数/品牌语）、HTML 校验（含 gzh-design lint）、
知乎 Markdown 构建 + 校验（多行/无品牌图/占位符数量）、生图演练、401/429/5xx 与 400 等任意接口失败均自动轮换
（全部失败才报错）、多账号凭据解析、内容 hash 上传缓存键、发布演练（复用现成文章）。

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
