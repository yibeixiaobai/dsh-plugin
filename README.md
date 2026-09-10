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
   文映千秋学术网/scripts/（gzh_components 排版库、publish_template 发布函数、validate 校验器）
```

- Python 侧只做计算与联网，**文件落盘全部由 TS 侧完成**（文章 HTML、上传缓存、发布结果）
- job 参数走 argv 内联 JSON（`--doc-json` / `--job-json`），无临时文件
- 凭据的单一事实来源是 **dsh 设置界面**：每次加载/热重载自动同步到 `scripts/wx_config.json`
  （留空的设置项沿用文件现状，不覆盖）

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

安装后打开 dsh web 工作台 → 设置 → 插件 `dsh-gzh-publisher`，
即可看到 5 组快捷设置；修改后热重载自动生效。

## 快捷设置（Config schema）

| 分组 | 配置项 |
|---|---|
| ① 公众号凭据 | `appid`、`app_secret`（secret 脱敏显示）、`author_name`、`brand_name` |
| ② 内容规则 | `articles_per_day`(6)、`min_words`(2000)、`topics`（选题方向表）、`forbidden_words`（禁词表）、`ending_guide_required` |
| ③ 排版 | `headline_theme`（6 主题下拉）、`secondary_theme`（rotate=轮换）、`font_size`(13px)、`line_height`(20px)、`paragraph_margin`(25px)、`text_indent`(2em) |
| ④ AI 配图 | `base_url`、`api_key`（secret）、`model`(gpt-image-2)、`headline_cover_ratio`(21:9)、`secondary_cover_ratio`(1:1)、`content_images_per_article`(2)、`image_lang_zh_only` |
| ⑤ 运行 | `project_root`、`python_path`、`request_timeout_ms`、`dry_run`（演练：只校验不联网）、`verify_after_publish`、`use_upload_cache`、`need_open_comment` |

## 工具（7 个）

| 工具 | 作用 |
|---|---|
| `gzh_check_topics` | 选题查重：候选选题 vs 110+ 次历史标题，返回 high/medium/low 风险 |
| `gzh_get_style_guide` | 写作规范：主题色板、doc_spec 格式、13px 铁律、禁词、硬性规则 |
| `gzh_build_article` | 按 doc spec 构建单行 HTML（引言卡/目录/徽章/下划线/卡片图），断言 + lint，落盘 `article_v2_{i}.html` |
| `gzh_generate_images` | AI 生图：封面（比例按设置）+ 正文信息图，自动缩放 |
| `gzh_validate_html` | 发布前机器校验：换行/字数/禁词/占位符/图片数/CDN + gzh-design lint |
| `gzh_publish_draft` | 上传素材（缓存续跑）→ 替换占位符 → draft/add 组合 1 个多图文草稿 |
| `gzh_verify_draft` | draft/get（POST）逐篇核验草稿 |

### 每日流程示例（Agent 视角）

1. `gzh_check_topics` 查重选题（高风险则换）
2. `gzh_get_style_guide` 取规范 → 撰写 6 篇内容 → 逐篇 `gzh_build_article`
3. `gzh_generate_images` 生成 6 张封面 + 12 张正文图
4. `gzh_validate_html` 全量校验
5. `gzh_publish_draft`（titles/digests）→ 草稿箱
6. `gzh_verify_draft` 核验 → 人工确认后群发

## 自测（零写盘、零联网）

```bash
python pipeline/selftest.py --scripts-dir "D:/666/gzh/文映千秋学术网/scripts"
```

覆盖：选题查重、文章构建（断言字数/图片数/品牌语）、HTML 校验（含 gzh-design lint）、
生图演练、发布演练（复用现成文章）。

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
- **凭据**：按你的选择存于插件设置（Schemastery secret 字段）。请勿把填了密钥的
  `cordis.yml` 提交到公开仓库；`wx_config.json` 由插件同步维护，同样注意保密
- **演练模式**：设置 `dry_run: true` 后，生图与发布工具只跑校验不联网，适合先演练后正式
