window.__ModuleLoader__.load({
  id: "dsh-gzh-publisher",
  factory: (require) => {
    const React = require("react")
    const UI = require("@deepseek-ai/dsh-client-ui-primitives")

    const NS = "gzh-publisher"
    const CSS_ID = "dsh-gzh-publisher/card.css"

    if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) === null) {
      const style = document.createElement("style")
      style.dataset.plugin = "dsh-gzh-publisher"
      style.dataset.pluginCss = CSS_ID
      style.textContent = `
        .gzhPage{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;min-height:100%;color:var(--dsw-alias-label-primary)}
        .gzhPageHeader{display:flex;align-items:flex-start;gap:12px;min-width:0}
        .gzhPageHeading{flex:1;min-width:0}
        .gzhPageTitle{margin:0;color:var(--dsw-alias-label-primary);font-size:18px;font-weight:600;line-height:1.4}
        .gzhPageDescription{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
        .gzhPageStatus{flex:none;margin-top:2px}
        .gzhTabs{display:flex;gap:2px;border-bottom:.5px solid var(--dsw-alias-border-l2);overflow-x:auto;scrollbar-width:none}
        .gzhTabs::-webkit-scrollbar{display:none}
        .gzhTab{appearance:none;border:0;border-bottom:2px solid transparent;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:1.5;white-space:nowrap;cursor:pointer;padding:9px 12px;transition:color .16s,border-color .16s}
        .gzhTab:hover{color:var(--dsw-alias-label-primary)}
        .gzhTab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
        .gzhTabActive{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}
        .gzhPanel{display:flex;flex:1;flex-direction:column;gap:14px;min-width:0;padding:4px 0 0}
        .gzhPanelHeader{padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
        .gzhSectionTitle{margin:0;color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.5}
        .gzhSectionHint{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
        .gzhGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
        .gzhField{display:flex;flex-direction:column;gap:5px;min-width:0}
        .gzhFieldWide{grid-column:1/-1}
        .gzhLabel{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}
        .gzhOverride{color:var(--dsw-alias-brand-primary);font-size:11px;font-weight:500}
        .gzhReset{margin-left:auto;appearance:none;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;padding:0}
        .gzhReset:hover{color:var(--dsw-alias-label-primary)}
        .gzhInput,.gzhSelect,.gzhTextarea{box-sizing:border-box;width:100%;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:13px;line-height:1.5}
        .gzhInput,.gzhSelect{height:34px;padding:0 10px}
        .gzhTextarea{min-height:68px;resize:vertical;padding:8px 10px}
        .gzhInput:focus-visible,.gzhSelect:focus-visible,.gzhTextarea:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
        .gzhInput:disabled,.gzhSelect:disabled,.gzhTextarea:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
        .gzhInputInvalid{border-color:var(--dsw-alias-label-error)}
        .gzhHint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
        .gzhInvalid{margin:0;color:var(--dsw-alias-label-error);font-size:12px;line-height:1.5}
        .gzhToggleRow{display:flex;align-items:center;gap:10px;min-height:34px}
        .gzhSwitch{appearance:none;width:34px;height:20px;border-radius:999px;background:var(--dsw-alias-bg-layer-4);position:relative;cursor:pointer;flex:none;transition:background .16s;border:.5px solid var(--dsw-alias-border-l4)}
        .gzhSwitch::after{content:"";position:absolute;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-primary);top:2px;left:2px;transition:transform .16s}
        .gzhSwitch:checked{background:var(--dsw-alias-brand-primary)}
        .gzhSwitch:checked::after{transform:translateX(14px);background:var(--dsw-alias-bg-layer-3)}
        .gzhFooter{position:sticky;bottom:0;z-index:1;border-top:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 6px;display:flex}
        .gzhFailed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}
        .gzhDiscard,.gzhSave{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
        .gzhDiscard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
        .gzhDiscard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
        .gzhSave{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
        .gzhDiscard:disabled,.gzhSave:disabled{opacity:.4;cursor:default}
        @media (max-width:620px){.gzhGrid{grid-template-columns:1fr}.gzhFieldWide{grid-column:auto}}
      `
      document.head.appendChild(style)
    }

    const THEMES = [
      ["wenying", "文映学术（品牌专属）"],
      ["olive", "橄榄手记"],
      ["graphite", "石墨极简"],
      ["moyu", "摸鱼绿"],
      ["redwhite", "红白色系"],
      ["zen", "留白禅意"],
    ]
    const RATIOS = [
      ["21:9", "21:9"],
      ["16:9", "16:9"],
      ["1:1", "1:1"],
    ]

    const GROUPS = [
      {
        title: "公众号凭据",
        hint: "留空保存时不会覆盖现有值。",
        fields: [
          { path: ["wechat", "appid"], label: "AppID", hint: "微信公众号 AppID（wx 开头）", kind: "text" },
          { path: ["wechat", "app_secret"], label: "AppSecret", hint: "留空不修改；可重置恢复下层配置", kind: "secret" },
          { path: ["wechat", "author_name"], label: "作者名", hint: "文章固定署名", kind: "text" },
          { path: ["wechat", "brand_name"], label: "品牌名", hint: "结尾引导语使用的品牌名", kind: "text" },
        ],
      },
      {
        title: "内容规则",
        hint: "每篇内容在构建阶段按这里校验。",
        fields: [
          { path: ["content", "articles_per_day"], label: "每日文章数", hint: "1–10 篇，组合为 1 个多图文草稿", kind: "number" },
          { path: ["content", "min_words"], label: "最低字数", hint: "每篇纯文字下限", kind: "number" },
          { path: ["content", "topics"], label: "选题方向", hint: "每行或逗号分隔一个方向", kind: "lines", wide: true },
          { path: ["content", "forbidden_words"], label: "禁词表", hint: "每行或逗号分隔一个禁词", kind: "lines", wide: true },
          { path: ["content", "ending_guide_required"], label: "结尾品牌引导", hint: "结尾必须自然引导关注品牌", kind: "boolean" },
        ],
      },
      {
        title: "排版",
        hint: "文映学术公众号正文使用 13px / 20px 的硬规则。",
        fields: [
          { path: ["typography", "headline_theme"], label: "头条主题", hint: "头条文章的视觉主题", kind: "select", options: THEMES },
          { path: ["typography", "secondary_theme"], label: "次条主题", hint: "rotate 表示按题材轮换", kind: "select", options: [["rotate", "自动轮换"], ...THEMES] },
          { path: ["typography", "font_size"], label: "正文字号", hint: "默认 13px", kind: "text" },
          { path: ["typography", "line_height"], label: "正文行高", hint: "默认 20px", kind: "text" },
          { path: ["typography", "paragraph_margin"], label: "段落间距", hint: "默认 25px", kind: "text" },
          { path: ["typography", "text_indent"], label: "首行缩进", hint: "默认 2em", kind: "text" },
        ],
      },
      {
        title: "AI 配图",
        hint: "OpenAI 兼容 /v1/images/generations 接口。",
        fields: [
          { path: ["image_api", "base_url"], label: "接口地址", hint: "例如 https://api.a6api.com", kind: "text", wide: true },
          { path: ["image_api", "api_key"], label: "API Key", hint: "留空不修改；可重置恢复下层配置", kind: "secret" },
          { path: ["image_api", "model"], label: "生图模型", hint: "例如 gpt-image-2", kind: "text" },
          { path: ["image_api", "headline_cover_ratio"], label: "头条封面比例", hint: "头条文章封面", kind: "select", options: RATIOS },
          { path: ["image_api", "secondary_cover_ratio"], label: "次条封面比例", hint: "次条文章封面", kind: "select", options: RATIOS },
          { path: ["image_api", "content_images_per_article"], label: "正文配图数", hint: "每篇 0–4 张", kind: "number" },
          { path: ["image_api", "image_lang_zh_only"], label: "图中文字仅中文", hint: "提示词自动附加约束", kind: "boolean" },
        ],
      },
      {
        title: "运行",
        hint: "任务包路径、Python 环境与发布行为。",
        fields: [
          { path: ["runtime", "project_root"], label: "任务包根目录", hint: "公众号项目根目录", kind: "text", wide: true },
          { path: ["runtime", "python_path"], label: "Python 解释器", hint: "需要 Python 3.12 + requests + Pillow", kind: "text" },
          { path: ["runtime", "request_timeout_ms"], label: "请求超时", hint: "单位毫秒", kind: "number" },
          { path: ["runtime", "dry_run"], label: "演练模式", hint: "不联网生图、不发布", kind: "boolean" },
          { path: ["runtime", "verify_after_publish"], label: "发布后核验", hint: "自动 draft/get 核验", kind: "boolean" },
          { path: ["runtime", "use_upload_cache"], label: "上传缓存", hint: "断点续跑素材上传", kind: "boolean" },
          { path: ["runtime", "need_open_comment"], label: "开启留言", hint: "草稿开启留言", kind: "boolean" },
        ],
      },
    ]

    const FIELDS = GROUPS.flatMap((group) => group.fields)
    const FIELD_BY_KEY = new Map(FIELDS.map((field) => [field.path.join("."), field]))

    function getAt(value, path) {
      let current = value
      for (const key of path) {
        if (current === null || typeof current !== "object") return undefined
        current = current[key]
      }
      return current
    }

    function hasAt(value, path) {
      let current = value
      for (const key of path) {
        if (current === null || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, key)) return false
        current = current[key]
      }
      return true
    }

    function parseNumber(text) {
      const trimmed = text.trim()
      if (trimmed === "") return { reset: true }
      const value = Number(trimmed)
      if (!Number.isFinite(value)) return { invalid: true }
      return { value }
    }

    function linesText(value) {
      return Array.isArray(value) ? value.join("\n") : ""
    }

    function parseLines(text) {
      const items = text.split(/[\n,，]+/).map((item) => item.trim()).filter(Boolean)
      return { value: items }
    }

    function apply(ctx) {
      const scope = ctx.settingsScope.bind({ namespace: NS })

      function GzhPublisherSection() {
        const [snapshot, setSnapshot] = React.useState(() => scope.getSnapshot())
        const [activeTab, setActiveTab] = React.useState(GROUPS[0].title)
        const [drafts, setDrafts] = React.useState({})
        const [saving, setSaving] = React.useState(false)
        const [failed, setFailed] = React.useState(false)
        const revisionRef = React.useRef(snapshot.revision)

        React.useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [])

        React.useEffect(() => {
          if (revisionRef.current === snapshot.revision) return
          revisionRef.current = snapshot.revision
          setDrafts({})
          setFailed(false)
        }, [snapshot.revision])

        if (snapshot.status === "unavailable") return null

        const value = snapshot.value ?? {}
        const writable = snapshot.writable && snapshot.status === "ready"
        const draftEntries = Object.entries(drafts)
        const invalid = draftEntries.some(([, draft]) => draft && draft.invalid === true)
        const dirty = draftEntries.length > 0
        const activeGroup = GROUPS.find((group) => group.title === activeTab) ?? GROUPS[0]

        const edit = (field, draft) => {
          const key = field.path.join(".")
          setDrafts((current) => ({ ...current, [key]: draft }))
          setFailed(false)
        }
        const reset = (field) => {
          const key = field.path.join(".")
          setDrafts((current) => ({ ...current, [key]: { reset: true } }))
          setFailed(false)
        }
        const discard = () => {
          setDrafts({})
          setFailed(false)
        }
        const save = async () => {
          if (!dirty || invalid || saving || !writable) return
          const ops = []
          for (const [key, draft] of Object.entries(drafts)) {
            const field = FIELD_BY_KEY.get(key)
            if (!field) continue
            if (draft && draft.reset === true) {
              ops.push({ op: "unset", path: field.path })
            } else if (!(field.kind === "secret" && draft && draft.value === "")) {
              ops.push({ op: "set", path: field.path, value: draft.value })
            }
          }
          if (ops.length === 0) {
            setDrafts({})
            return
          }
          setSaving(true)
          setFailed(false)
          try {
            await scope.mutate(ops)
            setDrafts({})
          } catch {
            setFailed(true)
          } finally {
            setSaving(false)
          }
        }

        const stateFor = (field) => {
          const key = field.path.join(".")
          const draft = drafts[key]
          const overridden = draft ? draft.reset !== true : hasAt(snapshot.user, field.path)
          if (!draft) {
            const current = getAt(value, field.path)
            return {
              text: field.kind === "lines" ? linesText(current) : current === undefined || current === null ? "" : String(current),
              boolean: Boolean(current),
              overridden,
              invalid: false,
            }
          }
          if (draft.reset === true) {
            const current = getAt(value, field.path)
            return {
              text: field.kind === "lines" ? linesText(current) : current === undefined || current === null ? "" : String(current),
              boolean: Boolean(current),
              overridden: false,
              invalid: false,
            }
          }
          return {
            text: String(draft.text ?? ""),
            boolean: Boolean(draft.value),
            overridden,
            invalid: draft.invalid === true,
          }
        }

        const fieldNode = (field) => {
          const key = field.path.join(".")
          const id = `gzh-${key.replace(/\./g, "-")}`
          const state = stateFor(field)
          const disabled = !writable || saving
          const label = React.createElement(
            "div",
            { className: "gzhLabel" },
            React.createElement("label", { htmlFor: id }, field.label),
            state.overridden ? React.createElement("span", { className: "gzhOverride" }, "已覆盖") : null,
            state.overridden
              ? React.createElement("button", {
                  type: "button",
                  className: "gzhReset",
                  disabled,
                  onClick: () => reset(field),
                }, "恢复默认")
              : null,
          )

          let control
          if (field.kind === "boolean") {
            control = React.createElement(
              "div",
              { className: "gzhToggleRow" },
              React.createElement("input", {
                id,
                type: "checkbox",
                className: "gzhSwitch",
                checked: state.boolean,
                disabled,
                onChange: (event) => edit(field, { value: event.target.checked }),
              }),
              React.createElement("span", { className: "gzhHint" }, state.boolean ? "已开启" : "已关闭"),
            )
          } else if (field.kind === "select") {
            control = React.createElement(
              "select",
              {
                id,
                className: "gzhSelect",
                value: state.text,
                disabled,
                onChange: (event) => edit(field, { value: event.target.value }),
              },
              ...field.options.map(([value, text]) => React.createElement("option", { key: value, value }, text)),
            )
          } else if (field.kind === "lines") {
            control = React.createElement("textarea", {
              id,
              className: "gzhTextarea",
              value: state.text,
              disabled,
              placeholder: "每行一项",
              onChange: (event) => {
                const text = event.target.value
                edit(field, { ...parseLines(text), text })
              },
            })
          } else {
            const onChange = (text) => {
              if (field.kind === "number") {
                const parsed = parseNumber(text)
                edit(field, { ...parsed, text })
              } else {
                edit(field, field.kind === "secret" ? { value: text, text } : { value: text, text })
              }
            }
            control = React.createElement("input", {
              id,
              className: "gzhInput" + (state.invalid ? " gzhInputInvalid" : ""),
              type: field.kind === "number" ? "number" : "text",
              value: state.text,
              disabled,
              autoComplete: "off",
              placeholder: field.kind === "secret" ? "留空保持不变" : undefined,
              onChange: (event) => onChange(event.target.value),
            })
          }

          return React.createElement(
            "div",
            { className: "gzhField" + (field.wide ? " gzhFieldWide" : ""), key },
            label,
            control,
            state.invalid
              ? React.createElement("p", { className: "gzhInvalid" }, "请输入有效数值")
              : React.createElement("p", { className: "gzhHint" }, field.hint),
          )
        }

        return React.createElement(
          "li",
          { className: "gzhCard" + (open ? " gzhCardOpen" : "") },
          React.createElement(
            "button",
            {
              type: "button",
              className: "gzhHeader",
              "aria-expanded": open,
              onClick: () => setOpen((current) => !current),
            },
            React.createElement(
              "span",
              { className: "gzhHeadText" },
              React.createElement("span", { className: "gzhName" }, "文映千秋公众号流水线"),
              React.createElement("span", { className: "gzhDescription" }, "选题查重、写文排版、AI 配图与公众号草稿发布"),
            ),
            dirty ? React.createElement(UI.Tag, { tone: "neutral" }, "未保存") : null,
            React.createElement(UI.IconChevronDownOutline14, {
              className: "gzhChevron" + (open ? " gzhChevronOpen" : ""),
            }),
          ),
          open
            ? React.createElement(
                "div",
                { className: "gzhBody" },
                ...GROUPS.map((group) =>
                  React.createElement(
                    "section",
                    { className: "gzhSection", key: group.title },
                    React.createElement("h4", { className: "gzhSectionTitle" }, group.title),
                    React.createElement("p", { className: "gzhSectionHint" }, group.hint),
                    React.createElement("div", { className: "gzhGrid" }, ...group.fields.map(fieldNode)),
                  ),
                ),
                React.createElement(
                  "div",
                  { className: "gzhFooter" },
                  failed ? React.createElement("p", { className: "gzhFailed" }, "保存失败，请检查配置或稍后重试。") : null,
                  React.createElement("button", {
                    type: "button",
                    className: "gzhDiscard",
                    disabled: !dirty || saving,
                    onClick: discard,
                  }, "放弃修改"),
                  React.createElement("button", {
                    type: "button",
                    className: "gzhSave",
                    disabled: !dirty || invalid || saving || !writable,
                    onClick: save,
                  }, saving ? "保存中…" : "保存"),
                ),
              )
            : null,
        )
      }

      ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
        name: "settings.plugin.item",
        key: NS,
      }, GzhPublisherCard))
    }

    return {
      name: "dsh-gzh-publisher",
      inject: ["slots", "settingsScope"],
      apply,
    }
  },
})
