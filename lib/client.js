window.__ModuleLoader__.load({
  id: "dsh-gzh-publisher",
  factory: (require) => {
    const React = require("react")
    const UI = require("@deepseek-ai/dsh-client-ui-primitives")

    const NS = "gzh-publisher"
    const BRAND_ROUTE = "/api/gzh-publisher/brand-image"
    const CSS_ID = "dsh-gzh-publisher/settings.css"
    const ACCOUNT_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    const PROVIDER_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    const PLUGIN_DEFAULT_WORKSPACE = "D:\\666\\gzh\\dsh-plugin\\tasks\\default"
    const LEGACY_DEFAULT_WORKSPACE = "d:/666/gzh/文映千秋学术网"

    if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) === null) {
      const style = document.createElement("style")
      style.dataset.plugin = "dsh-gzh-publisher"
      style.dataset.pluginCss = CSS_ID
      style.textContent = `
        .gzhPage{box-sizing:border-box;display:flex;flex-direction:column;gap:18px;max-width:1080px;margin:0 auto;color:var(--dsw-alias-label-primary)}
        .gzhPageHeader{display:flex;align-items:flex-start;gap:12px;min-width:0}
        .gzhPageHeading{flex:1;min-width:0}
        .gzhPageTitle{margin:0;font-size:18px;font-weight:600;line-height:1.4}
        .gzhPageDescription{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
        .gzhTabs{display:flex;gap:4px;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);overflow-x:auto;scrollbar-width:none}
        .gzhTabs::-webkit-scrollbar{display:none}
        .gzhTab{appearance:none;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;white-space:nowrap;cursor:pointer;padding:8px 12px;border-radius:8px}
        .gzhTab:hover{color:var(--dsw-alias-label-primary)}
        .gzhTab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
        .gzhTabActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);box-shadow:0 1px 3px rgba(0,0,0,.08);font-weight:600}
        .gzhPanel{display:flex;flex-direction:column;gap:16px;min-width:0}
        .gzhToolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
        .gzhSelectSmall{height:34px;min-width:190px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:13px}
        .gzhButton{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);border-radius:8px;padding:6px 11px;font:inherit;font-size:12px;cursor:pointer}
        .gzhButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
        .gzhButton:disabled{opacity:.4;cursor:default}
        .gzhButtonPrimary{border-color:transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
        .gzhAddRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .gzhAddInput{height:32px;min-width:170px;padding:0 9px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:12px}
        .gzhSectionBar{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
        .gzhSectionBarBody{min-width:0}
        .gzhSurface{display:flex;flex-direction:column;gap:14px;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-3);box-shadow:0 1px 2px rgba(0,0,0,.03)}
        .gzhSurfaceSoft{background:var(--dsw-alias-bg-layer-2)}
        .gzhSurfaceHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
        .gzhSurfaceHeaderBody{min-width:0}
        .gzhAccountList{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden;background:var(--dsw-alias-bg-layer-3)}
        .gzhAccountRow{display:grid;grid-template-columns:minmax(180px,1fr) minmax(130px,.7fr) auto;align-items:center;gap:16px;padding:14px 16px;border:0;border-bottom:.5px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;text-align:left;transition:background .15s}
        .gzhAccountRow:last-child{border-bottom:0}
        .gzhAccountRow:hover{background:var(--dsw-alias-bg-layer-2)}
        .gzhAccountRowActive{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}
        .gzhAccountMain{min-width:0;cursor:pointer}
        .gzhAccountName{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;font-weight:600}
        .gzhAccountNameText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .gzhAccountId{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:11px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .gzhAccountStatus{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px}
        .gzhStatusDot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
        .gzhStatusDotOn{background:var(--dsw-alias-brand-primary)}
        .gzhBadge{display:inline-flex;align-items:center;border-radius:999px;padding:2px 7px;background:var(--dsw-alias-bg-layer-4);color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:500;white-space:nowrap}
        .gzhAccountActions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}
        .gzhConfigList{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden;background:var(--dsw-alias-bg-layer-3)}
        .gzhConfigRow{display:grid;grid-template-columns:minmax(180px,1fr) minmax(160px,.8fr) auto;align-items:center;gap:16px;padding:14px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2);transition:background .15s}
        .gzhConfigRow:last-child{border-bottom:0}
        .gzhConfigRow:hover{background:var(--dsw-alias-bg-layer-2)}
        .gzhConfigRowActive{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}
        .gzhConfigMain{min-width:0;cursor:pointer}
        .gzhConfigTitle{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;font-weight:600}
        .gzhConfigTitleText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .gzhConfigMeta{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .gzhConfigStatus{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px}
        .gzhConfigActions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}
        .gzhProviderTest{grid-column:1/-1;display:flex;align-items:flex-start;gap:12px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l2)}
        .gzhProviderTestPreview{width:180px;height:76px;object-fit:contain;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-4)}
        .gzhProviderTestInfo{min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
        .gzhProviderTestSuccess{color:var(--dsw-alias-label-success)}
        .gzhProviderTestError{color:var(--dsw-alias-label-error)}
        .gzhPanelHeader{padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
        .gzhSectionTitle{margin:0;font-size:15px;font-weight:600;line-height:1.5}
        .gzhSectionHint{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
        .gzhGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
        .gzhField{display:flex;flex-direction:column;gap:5px;min-width:0}
        .gzhFieldWide{grid-column:1/-1}
        .gzhLabel{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;line-height:1.5}
        .gzhOverride{color:var(--dsw-alias-brand-primary);font-size:11px}
        .gzhReset{margin-left:auto;appearance:none;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;padding:0}
        .gzhReset:hover{color:var(--dsw-alias-label-primary)}
        .gzhInput,.gzhSelect,.gzhTextarea{box-sizing:border-box;width:100%;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:13px}
        .gzhInput,.gzhSelect{height:34px;padding:0 10px}
        .gzhTextarea{min-height:68px;resize:vertical;padding:8px 10px}
        .gzhInput:focus-visible,.gzhSelect:focus-visible,.gzhTextarea:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
        .gzhInputInvalid{border-color:var(--dsw-alias-label-error)}
        .gzhHint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
        .gzhInvalid{margin:0;color:var(--dsw-alias-label-error);font-size:12px;line-height:1.5}
        .gzhToggleRow{display:flex;align-items:center;gap:10px;min-height:34px}
        .gzhSwitch{appearance:none;width:34px;height:20px;border-radius:999px;background:var(--dsw-alias-bg-layer-4);position:relative;cursor:pointer;flex:none;border:.5px solid var(--dsw-alias-border-l4)}
        .gzhSwitch::after{content:"";position:absolute;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-primary);top:2px;left:2px;transition:transform .16s}
        .gzhSwitch:checked{background:var(--dsw-alias-brand-primary)}
        .gzhSwitch:checked::after{transform:translateX(14px);background:var(--dsw-alias-bg-layer-3)}
        .gzhUpload{display:flex;align-items:center;gap:14px;padding:13px;border:1px dashed var(--dsw-alias-border-l4);border-radius:12px;background:var(--dsw-alias-bg-layer-3);min-width:0}
        .gzhUploadActive{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
        .gzhPreview{width:148px;height:88px;flex:none;border-radius:8px;background:var(--dsw-alias-bg-layer-4);object-fit:contain;border:.5px solid var(--dsw-alias-border-l2)}
        .gzhPreviewMissing{display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
        .gzhUploadBody{display:flex;flex:1;flex-direction:column;gap:7px;min-width:0}
        .gzhUploadActions{display:flex;gap:8px;flex-wrap:wrap}
        .gzhProgress{height:5px;border-radius:999px;background:var(--dsw-alias-bg-layer-4);overflow:hidden}
        .gzhProgressBar{height:100%;background:var(--dsw-alias-brand-primary);transition:width .15s}
        .gzhUploadError{color:var(--dsw-alias-label-error);font-size:12px;line-height:1.5}
        .gzhFooter{position:sticky;bottom:0;z-index:1;border:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 92%,transparent);backdrop-filter:blur(12px);justify-content:flex-end;align-items:center;gap:8px;padding:10px 12px;display:flex;border-radius:12px;box-shadow:0 -2px 12px rgba(0,0,0,.05)}
        .gzhFailed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}
        .gzhDiscard,.gzhSave{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px}
        .gzhDiscard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
        .gzhSave{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
        .gzhDiscard:disabled,.gzhSave:disabled{opacity:.4;cursor:default}
        @media (max-width:620px){.gzhPage{gap:14px}.gzhGrid{grid-template-columns:1fr}.gzhFieldWide{grid-column:auto}.gzhUpload{align-items:flex-start;flex-direction:column}.gzhPreview{width:100%;height:140px}.gzhSectionBar,.gzhSurfaceHeader{align-items:stretch;flex-direction:column}.gzhAccountRow,.gzhConfigRow{grid-template-columns:1fr}.gzhAccountStatus,.gzhConfigStatus{grid-column:1}.gzhAccountActions,.gzhConfigActions{grid-column:1;grid-row:auto;justify-content:flex-start}.gzhSurface{padding:14px}}
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
    const COVER_PIXELS = { "2.35:1": "3520×1498", "21:9": "3520×1500", "16:9": "3024×1701", "1:1": "1920×1920" }
    const RATIOS = Object.entries(COVER_PIXELS).map(([value, pixels]) => [value, value + "（" + pixels + "）"])
    const SECONDARY_RATIOS = RATIOS.filter(([value]) => value !== "2.35:1")
    const IMAGE_FITS = [["contain", "完整显示"], ["cover", "裁切铺满"], ["fill", "拉伸填满"]]
    const IMAGE_POSITIONS = [["top", "顶部"], ["center", "居中"], ["bottom", "底部"]]
    const DEFAULT_TOPICS = ["期刊发表", "专著出版", "论文发表", "专利申办", "国际刊", "SCI", "EI", "职称评审"]
    const DEFAULT_FORBIDDEN = ["查重", "降重", "检测", "论文检测中心", "AIGC查降重", "撤稿", "学术不端", "倒查", "论文工厂", "学术打假"]
    const DEFAULT_BRAND_HEADER = {
      enabled: true, file: "brand_top.jpg", width: 100, height: 0,
      fit: "contain", position: "center", radius: 0,
      margin_top: 0, margin_bottom: 0, frame: false,
    }
    const DEFAULT_BRAND_FOOTER = {
      enabled: true, file: "brand_bot.jpg", width: 60, height: 0,
      fit: "contain", position: "center", radius: 0,
      margin_top: 20, margin_bottom: 0, frame: false,
    }
    const DEFAULT_ACCOUNT = {
      name: "默认账号",
      enabled: true,
      appid: "",
      app_secret: "",
      author_name: "文映学术win00.cn",
      brand_name: "文映千秋学术网",
      content: {
        articles_per_day: 6,
        min_words: 2000,
        topics: DEFAULT_TOPICS,
        forbidden_words: DEFAULT_FORBIDDEN,
        ending_guide_required: true,
      },
      brand_images: {
        header: DEFAULT_BRAND_HEADER,
        footer: DEFAULT_BRAND_FOOTER,
      },
    }
    const DEFAULT_PROVIDER = {
      enabled: true,
      name: "默认生图接口",
      base_url: "https://api.a6api.com",
      api_key: "",
      model: "gpt-image-2",
      priority: 0,
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value))
    }

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
      return Number.isFinite(value) ? { value } : { invalid: true }
    }

    function linesText(value) {
      return Array.isArray(value) ? value.join("\n") : ""
    }

    function parseLines(text) {
      return text.split(/[\n,，]+/).map((item) => item.trim()).filter(Boolean)
    }

    function normalizeValue(raw) {
      const value = raw && typeof raw === "object" ? clone(raw) : {}
      value.runtime = { ...(value.runtime ?? {}) }
      const projectRoot = String(value.runtime.project_root ?? "").trim().replace(/\\/g, "/").replace(/\/$/, "").toLowerCase()
      if (projectRoot === LEGACY_DEFAULT_WORKSPACE) value.runtime.project_root = ""
      const accounts = value.accounts && typeof value.accounts === "object" && !Array.isArray(value.accounts)
        ? value.accounts
        : {}
      if (Object.keys(accounts).length === 0) {
        const legacy = value.wechat ?? {}
        accounts.default = {
          ...clone(DEFAULT_ACCOUNT),
          name: "默认账号",
          appid: legacy.appid ?? "",
          app_secret: legacy.app_secret ?? "",
          author_name: legacy.author_name ?? DEFAULT_ACCOUNT.author_name,
          brand_name: legacy.brand_name ?? DEFAULT_ACCOUNT.brand_name,
          content: { ...clone(DEFAULT_ACCOUNT.content), ...(value.content ?? {}) },
          brand_images: {
            header: { ...clone(DEFAULT_BRAND_HEADER), ...(value.brand_images?.header ?? {}) },
            footer: { ...clone(DEFAULT_BRAND_FOOTER), ...(value.brand_images?.footer ?? {}) },
          },
        }
      }
      const providers = value.image_providers && typeof value.image_providers === "object" && !Array.isArray(value.image_providers)
        ? value.image_providers
        : {}
      if (Object.keys(providers).length === 0) {
        providers.default = {
          ...clone(DEFAULT_PROVIDER),
          base_url: value.image_api?.base_url ?? DEFAULT_PROVIDER.base_url,
          api_key: value.image_api?.api_key ?? "",
          model: value.image_api?.model ?? DEFAULT_PROVIDER.model,
        }
      }
      if (!accounts[value.default_account]) {
        value.default_account = Object.keys(accounts).find((id) => accounts[id].enabled) ?? Object.keys(accounts)[0] ?? "default"
      }
      return { ...value, accounts, image_providers: providers }
    }

    function pathKey(path) {
      return path.join(".")
    }

    function apply(ctx) {
      const scope = ctx.settingsScope.bind({ namespace: NS })

      function GzhPublisherSection() {
        const [snapshot, setSnapshot] = React.useState(() => scope.getSnapshot())
        const [activeTab, setActiveTab] = React.useState("公众号账号")
        const [selectedAccountId, setSelectedAccountId] = React.useState("")
        const [selectedProviderId, setSelectedProviderId] = React.useState("")
        const [editingAccount, setEditingAccount] = React.useState(false)
        const [editingProvider, setEditingProvider] = React.useState(false)
        const [editingContentAccount, setEditingContentAccount] = React.useState(false)
        const [addingAccount, setAddingAccount] = React.useState(false)
        const [addingProvider, setAddingProvider] = React.useState(false)
        const [drafts, setDrafts] = React.useState({})
        const [saving, setSaving] = React.useState(false)
        const [failed, setFailed] = React.useState(false)
        const [testingProviderId, setTestingProviderId] = React.useState("")
        const [providerTests, setProviderTests] = React.useState({})
        const [accountDraft, setAccountDraft] = React.useState({ id: "", name: "" })
        const [providerDraft, setProviderDraft] = React.useState({ id: "", name: "" })
        const [copyingAccountId, setCopyingAccountId] = React.useState("")
        const [copyDraft, setCopyDraft] = React.useState({ id: "", name: "" })
        const [uploads, setUploads] = React.useState({})
        const [missingPreviews, setMissingPreviews] = React.useState({})
        const [dragging, setDragging] = React.useState("")
        const revisionRef = React.useRef(snapshot.revision)
        const newUploadsRef = React.useRef(new Map())
        const uploadsRef = React.useRef({})

        React.useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [])
        React.useEffect(() => {
          if (revisionRef.current === snapshot.revision) return
          revisionRef.current = snapshot.revision
          setDrafts({})
          setFailed(false)
          newUploadsRef.current.clear()
        }, [snapshot.revision])
        React.useEffect(() => {
          uploadsRef.current = uploads
        }, [uploads])
        React.useEffect(() => () => {
          for (const upload of Object.values(uploadsRef.current)) {
            if (upload?.preview?.startsWith("blob:")) URL.revokeObjectURL(upload.preview)
          }
          for (const file of newUploadsRef.current.values()) void deleteRemoteUpload(file)
        }, [])

        if (snapshot.status === "unavailable") return null

        const value = normalizeValue(snapshot.value ?? {})
        const accounts = clone(value.accounts)
        const providers = clone(value.image_providers)

        for (const [key, draft] of Object.entries(drafts)) {
          const parts = key.split(".")
          if (parts.length === 2 && parts[0] === "accounts") {
            if (draft?.reset) delete accounts[parts[1]]
            else if (draft?.object) accounts[parts[1]] = clone(draft.value)
          }
          if (parts.length === 2 && parts[0] === "image_providers") {
            if (draft?.reset) delete providers[parts[1]]
            else if (draft?.object) providers[parts[1]] = clone(draft.value)
          }
        }

        const accountIds = Object.keys(accounts)
        const defaultAccountId = typeof drafts.default_account?.value === "string"
          ? drafts.default_account.value
          : value.default_account
        const activeAccountId = accounts[selectedAccountId]
          ? selectedAccountId
          : accounts[defaultAccountId] ? defaultAccountId : accountIds[0] ?? ""
        const providerIds = Object.keys(providers).sort((a, b) => providers[a].priority - providers[b].priority || a.localeCompare(b))
        const activeProviderId = providers[selectedProviderId] ? selectedProviderId : providerIds[0] ?? ""
        const draftEntries = Object.entries(drafts)
        const invalid = draftEntries.some(([, draft]) => draft?.invalid === true)
        const dirty = draftEntries.length > 0
        const writable = snapshot.writable && snapshot.status === "ready"

        const edit = (path, draft, text) => {
          const normalized = draft && typeof draft === "object" && "object" in draft
            ? draft
            : { ...draft, text: text ?? (draft?.value === undefined ? "" : String(draft.value)) }
          setDrafts((current) => ({ ...current, [pathKey(path)]: normalized }))
          setFailed(false)
        }
        const reset = (path) => {
          setDrafts((current) => ({ ...current, [pathKey(path)]: { reset: true } }))
          setFailed(false)
        }
        const removeDrafts = (prefix) => {
          setDrafts((current) => Object.fromEntries(
            Object.entries(current).filter(([key]) => key !== prefix && !key.startsWith(prefix + ".")),
          ))
        }
        const removeAllDrafts = () => {
          setDrafts({})
          setFailed(false)
        }

        const currentValue = (path) => {
          const draft = drafts[pathKey(path)]
          if (draft && draft.reset !== true && draft.object !== true) return draft.value
          return getAt(value, path)
        }
        const overridden = (path) => {
          const draft = drafts[pathKey(path)]
          if (draft) return draft.reset !== true
          return hasAt(snapshot.user, path)
        }
        const fieldState = (field) => {
          const raw = currentValue(field.path)
          const draft = drafts[pathKey(field.path)]
          return {
            text: field.kind === "lines" ? linesText(raw) : raw === undefined || raw === null ? "" : String(raw),
            boolean: Boolean(raw),
            overridden: overridden(field.path),
            invalid: draft?.invalid === true,
          }
        }

        const fieldNode = (field) => {
          const key = pathKey(field.path)
          const id = "gzh-" + key.replace(/[^a-zA-Z0-9_-]/g, "-")
          const state = fieldState(field)
          const disabled = !writable || saving
          const label = React.createElement(
            "div",
            { className: "gzhLabel" },
            React.createElement("label", { htmlFor: id }, field.label),
            state.overridden ? React.createElement("span", { className: "gzhOverride" }, "已覆盖") : null,
            state.overridden
              ? React.createElement("button", {
                  type: "button", className: "gzhReset", disabled,
                  onClick: () => reset(field.path),
                }, "恢复默认")
              : null,
          )

          let control
          if (field.kind === "boolean") {
            control = React.createElement(
              "div",
              { className: "gzhToggleRow" },
              React.createElement("input", {
                id, type: "checkbox", className: "gzhSwitch", checked: state.boolean, disabled,
                onChange: (event) => edit(field.path, { value: event.target.checked }),
              }),
              React.createElement("span", { className: "gzhHint" }, state.boolean ? "已开启" : "已关闭"),
            )
          } else if (field.kind === "select") {
            control = React.createElement(
              "select",
              {
                id, className: "gzhSelect", value: state.text, disabled,
                onChange: (event) => edit(field.path, { value: event.target.value }),
              },
              ...field.options.map(([value, text]) => React.createElement("option", { key: value, value }, text)),
            )
          } else if (field.kind === "lines") {
            control = React.createElement("textarea", {
              id, className: "gzhTextarea", value: state.text, disabled, placeholder: "每行一项",
              onChange: (event) => {
                const text = event.target.value
                edit(field.path, { value: parseLines(text), text }, text)
              },
            })
          } else {
            control = React.createElement("input", {
              id,
              className: "gzhInput" + (state.invalid ? " gzhInputInvalid" : ""),
              type: field.kind === "number" ? "number" : "text",
              value: state.text,
              disabled,
              autoComplete: "off",
              placeholder: field.kind === "secret" ? "留空保持不变" : field.placeholder,
              onChange: (event) => {
                const text = event.target.value
                const workspaceValid = text.trim() === ""
                  || ["default", "plugin-default"].includes(text.trim().toLowerCase())
                  || /^[a-zA-Z]:[\\/]/.test(text.trim()) || /^\\\\/.test(text.trim())
                const parsed = field.kind === "number" ? parseNumber(text)
                  : field.kind === "workspace" ? { value: text, invalid: !workspaceValid }
                  : { value: text }
                edit(field.path, { ...parsed, text }, text)
              },
            })
          }

          return React.createElement(
            "div",
            { className: "gzhField" + (field.wide ? " gzhFieldWide" : ""), key },
            label,
            control,
            state.invalid
              ? React.createElement("p", { className: "gzhInvalid" }, field.invalidHint || "请输入有效数值")
              : React.createElement("p", { className: "gzhHint" }, field.hint),
          )
        }

        const deleteRemoteUpload = (file) => fetch(
          `${BRAND_ROUTE}?file=${encodeURIComponent(file)}`,
          { method: "DELETE", headers: { "x-dsh-gzh-upload": "brand-image" } },
        ).catch(() => undefined)

        const cleanupUpload = (accountId, slot) => {
          const key = accountId + ":" + slot
          const previous = newUploadsRef.current.get(key)
          if (previous) {
            void deleteRemoteUpload(previous)
            newUploadsRef.current.delete(key)
          }
          setUploads((current) => {
            const next = { ...current }
            const upload = next[key]
            if (upload?.preview?.startsWith("blob:")) URL.revokeObjectURL(upload.preview)
            delete next[key]
            return next
          })
        }

        const uploadBrandFile = (accountId, slot, file) => {
          if (!file) return
          const key = accountId + ":" + slot
          cleanupUpload(accountId, slot)
          const preview = URL.createObjectURL(file)
          setUploads((current) => ({ ...current, [key]: { preview, progress: 0 } }))
          const xhr = new XMLHttpRequest()
          xhr.open("POST", `${BRAND_ROUTE}?account=${encodeURIComponent(accountId)}&slot=${slot}`)
          xhr.setRequestHeader("x-dsh-gzh-upload", "brand-image")
          xhr.setRequestHeader("x-dsh-filename", encodeURIComponent(file.name))
          xhr.setRequestHeader("content-type", file.type || "application/octet-stream")
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return
            const progress = Math.round(event.loaded / event.total * 100)
            setUploads((current) => ({ ...current, [key]: { ...current[key], progress } }))
          }
          xhr.onload = () => {
            let result = {}
            try { result = JSON.parse(xhr.responseText) } catch {}
            if (xhr.status < 200 || xhr.status >= 300 || !result.file) {
              setUploads((current) => ({
                ...current,
                [key]: { preview, progress: 100, error: result.error || "上传失败" },
              }))
              return
            }
            newUploadsRef.current.set(key, result.file)
            edit(["accounts", accountId, "brand_images", slot, "file"], { value: result.file }, result.file)
            setUploads((current) => ({
              ...current,
              [key]: { preview, progress: 100, remoteFile: result.file },
            }))
            setMissingPreviews((current) => ({ ...current, [key]: false }))
          }
          xhr.onerror = () => {
            setUploads((current) => ({
              ...current,
              [key]: { preview, progress: 100, error: "网络错误，上传失败" },
            }))
          }
          xhr.send(file)
        }

        const discard = () => {
          for (const file of newUploadsRef.current.values()) void deleteRemoteUpload(file)
          newUploadsRef.current.clear()
          setUploads({})
          removeAllDrafts()
        }

        const save = async () => {
          if (!dirty || invalid || saving || !writable) return
          const ops = []
          for (const [key, draft] of Object.entries(drafts)) {
            if (!draft) continue
            const path = key.split(".")
            if (draft.object === true) {
              ops.push({ op: "set", path, value: draft.value })
            } else if (draft.reset === true) {
              ops.push({ op: "unset", path })
            } else if (draft.invalid !== true) {
              ops.push({ op: "set", path, value: draft.value })
            }
          }
          if (ops.length === 0) {
            removeAllDrafts()
            return
          }
          setSaving(true)
          setFailed(false)
          try {
            await scope.mutate(ops)
            newUploadsRef.current.clear()
            setUploads({})
            removeAllDrafts()
          } catch {
            setFailed(true)
          } finally {
            setSaving(false)
          }
        }

        const accountFields = [
          { path: ["name"], label: "显示名称", hint: "账号备注名", kind: "text" },
          { path: ["enabled"], label: "启用账号", hint: "关闭后不能用于构建或发布", kind: "boolean" },
          { path: ["appid"], label: "AppID", hint: "微信公众号 AppID（wx 开头）", kind: "text" },
          { path: ["app_secret"], label: "AppSecret", hint: "留空不修改；可恢复默认", kind: "secret" },
          { path: ["author_name"], label: "作者名", hint: "文章固定署名", kind: "text" },
          { path: ["brand_name"], label: "品牌名", hint: "结尾引导语中的品牌名", kind: "text" },
        ].map((field) => ({ ...field, path: ["accounts", activeAccountId, ...field.path] }))

        const providerFields = [
          { path: ["name"], label: "接口名称", hint: "用于识别接口来源", kind: "text" },
          { path: ["enabled"], label: "启用接口", hint: "停用后不参与轮换", kind: "boolean" },
          { path: ["base_url"], label: "接口地址", hint: "OpenAI 兼容 API 根地址", kind: "text", wide: true },
          { path: ["api_key"], label: "API Key", hint: "留空不修改；可恢复默认", kind: "secret" },
          { path: ["model"], label: "生图模型", hint: "例如 gpt-image-2", kind: "text" },
          { path: ["priority"], label: "优先级", hint: "数值越小越先使用", kind: "number" },
        ].map((field) => ({ ...field, path: ["image_providers", activeProviderId, ...field.path] }))

        const contentFields = [
          { path: ["articles_per_day"], label: "每日文章数", hint: "1–10 篇", kind: "number" },
          { path: ["min_words"], label: "最低字数", hint: "每篇纯文字下限", kind: "number" },
          { path: ["topics"], label: "选题方向", hint: "每行或逗号分隔", kind: "lines", wide: true },
          { path: ["forbidden_words"], label: "禁词表", hint: "每行或逗号分隔", kind: "lines", wide: true },
          { path: ["ending_guide_required"], label: "结尾品牌引导", hint: "结尾必须自然引导关注品牌", kind: "boolean" },
        ].map((field) => ({ ...field, path: ["accounts", activeAccountId, "content", ...field.path] }))

        const brandFields = (slot) => [
          { path: ["enabled"], label: "启用该品牌图", hint: slot === "header" ? "关闭后文章不从头部品牌图开始" : "关闭后不插入尾部品牌图", kind: "boolean" },
          { path: ["frame"], label: "卡片边框", hint: "白色卡片边框与阴影", kind: "boolean" },
          { path: ["file"], label: "图片路径", hint: "brand_assets 内相对路径；也可直接上传", kind: "text", wide: true },
          { path: ["width"], label: "显示宽度", hint: "文章宽度百分比 10–100", kind: "number" },
          { path: ["height"], label: "固定高度", hint: "px；0 表示按原图比例", kind: "number" },
          { path: ["fit"], label: "适配方式", hint: "固定高度时决定显示方式", kind: "select", options: IMAGE_FITS },
          { path: ["position"], label: "对齐位置", hint: "裁切或留白时的垂直位置", kind: "select", options: IMAGE_POSITIONS },
          { path: ["radius"], label: "图片圆角", hint: "px", kind: "number" },
          { path: ["margin_top"], label: "上方间距", hint: "px", kind: "number" },
          { path: ["margin_bottom"], label: "下方间距", hint: "px", kind: "number" },
        ].map((field) => ({ ...field, path: ["accounts", activeAccountId, "brand_images", slot, ...field.path] }))

        const typographyFields = [
          { path: ["typography", "headline_theme"], label: "头条主题", hint: "头条文章视觉主题", kind: "select", options: THEMES },
          { path: ["typography", "secondary_theme"], label: "次条主题", hint: "rotate 表示自动轮换", kind: "select", options: [["rotate", "自动轮换"], ...THEMES] },
          { path: ["typography", "font_size"], label: "正文字号", hint: "默认 13px", kind: "text" },
          { path: ["typography", "line_height"], label: "正文行高", hint: "默认 20px", kind: "text" },
          { path: ["typography", "paragraph_margin"], label: "段落间距", hint: "默认 25px", kind: "text" },
          { path: ["typography", "text_indent"], label: "首行缩进", hint: "默认 2em", kind: "text" },
        ]

        const imageApiFields = [
          { path: ["image_api", "headline_cover_ratio"], label: "头条封面比例", hint: "头条封面生成尺寸见上方说明", kind: "select", options: RATIOS },
          { path: ["image_api", "secondary_cover_ratio"], label: "次条封面比例", hint: "次条不支持 2.35:1", kind: "select", options: SECONDARY_RATIOS },
          { path: ["image_api", "content_images_per_article"], label: "每篇正文配图数", hint: "0–4 张；第 1 张 AI 信息图、第 2 张真实图", kind: "number" },
          { path: ["image_api", "image_lang_zh_only"], label: "图中文字仅中文", hint: "生图提示词自动附加中文文字约束", kind: "boolean" },
        ]

        const runtimeFields = [
          { path: ["runtime", "project_root"], label: "任务工作区", hint: "留空使用插件专用目录；也可填写其它绝对路径", invalidHint: "请输入 Windows 绝对路径，或留空使用默认工作区", kind: "workspace", wide: true },
          { path: ["runtime", "python_path"], label: "Python 解释器", hint: "Python 3.12 + requests + Pillow", kind: "text" },
          { path: ["runtime", "request_timeout_ms"], label: "请求超时", hint: "单位毫秒", kind: "number" },
          { path: ["runtime", "dry_run"], label: "演练模式", hint: "不联网生图、不发布", kind: "boolean" },
          { path: ["runtime", "verify_after_publish"], label: "发布后核验", hint: "自动 draft/get 核验", kind: "boolean" },
          { path: ["runtime", "use_upload_cache"], label: "上传缓存", hint: "断点续跑素材上传", kind: "boolean" },
          { path: ["runtime", "need_open_comment"], label: "开启留言", hint: "草稿开启留言", kind: "boolean" },
        ]

        const createAccount = () => {
          const id = accountDraft.id.trim()
          const name = accountDraft.name.trim() || id
          if (!ACCOUNT_ID_RE.test(id) || accounts[id]) return
          const template = clone(accounts[activeAccountId] ?? DEFAULT_ACCOUNT)
          template.name = name
          template.appid = ""
          template.app_secret = ""
          edit(["accounts", id], { object: true, value: template }, JSON.stringify(template))
          setSelectedAccountId(id)
          setEditingAccount(true)
          setAddingAccount(false)
          setAccountDraft({ id: "", name: "" })
        }

        const openCopyAccount = (accountId) => {
          const profile = accounts[accountId]
          if (!profile) return
          const base = accountId + "-copy"
          let candidate = base
          for (let n = 2; accounts[candidate]; n++) candidate = base + "-" + n
          setCopyingAccountId(accountId)
          setCopyDraft({ id: candidate, name: (profile.name || accountId) + " 副本" })
        }

        const createAccountCopy = () => {
          const source = copyingAccountId ? accounts[copyingAccountId] : null
          const id = copyDraft.id.trim()
          if (!source || !ACCOUNT_ID_RE.test(id) || accounts[id]) return
          const copy = clone(source)
          copy.name = copyDraft.name.trim() || source.name || id
          edit(["accounts", id], { object: true, value: copy }, JSON.stringify(copy))
          setSelectedAccountId(id)
          setEditingAccount(true)
          setCopyingAccountId("")
          setCopyDraft({ id: "", name: "" })
        }

        const deleteAccount = (accountId = activeAccountId) => {
          if (!accountId || accountIds.length <= 1 || accountId === defaultAccountId) return
          if (drafts["accounts." + accountId]?.object) removeDrafts("accounts." + accountId)
          else edit(["accounts", accountId], { reset: true })
          if (accountId === activeAccountId) {
            setSelectedAccountId(accountIds.find((id) => id !== accountId) ?? "")
          }
        }

        const createProvider = () => {
          const id = providerDraft.id.trim()
          const name = providerDraft.name.trim() || id
          if (!PROVIDER_ID_RE.test(id) || providers[id]) return
          const template = clone(providers[activeProviderId] ?? DEFAULT_PROVIDER)
          template.name = name
          template.api_key = ""
          template.priority = providerIds.length
          edit(["image_providers", id], { object: true, value: template }, JSON.stringify(template))
          setSelectedProviderId(id)
          setEditingProvider(true)
          setAddingProvider(false)
          setProviderDraft({ id: "", name: "" })
        }

        const deleteProvider = (providerId = activeProviderId) => {
          if (!providerId || providerIds.length <= 1) return
          if (drafts["image_providers." + providerId]?.object) removeDrafts("image_providers." + providerId)
          else edit(["image_providers", providerId], { reset: true })
          if (providerId === activeProviderId) setSelectedProviderId(providerIds.find((id) => id !== providerId) ?? "")
        }

        const testProvider = async (providerId) => {
          if (!providerId || testingProviderId) return
          setTestingProviderId(providerId)
          setProviderTests((current) => ({ ...current, [providerId]: { status: "testing" } }))
          try {
            const response = await fetch("/api/gzh-publisher/test-image", {
              method: "POST",
              headers: { "content-type": "application/json", "x-dsh-gzh-test": "image-test" },
              body: JSON.stringify({ provider_id: providerId }),
            })
            const result = await response.json().catch(() => ({}))
            if (!response.ok || result.error) throw new Error(result.error || "接口测试失败")
            setProviderTests((current) => ({ ...current, [providerId]: { status: "success", ...result } }))
          } catch (error) {
            setProviderTests((current) => ({ ...current, [providerId]: { status: "error", error: error?.message || String(error) } }))
          } finally {
            setTestingProviderId("")
          }
        }

        const accountSelector = (label, value, onChange) => React.createElement(
          "label",
          { className: "gzhToolbar" },
          React.createElement("span", { className: "gzhSectionTitle" }, label),
          React.createElement(
            "select",
            { className: "gzhSelectSmall", value, onChange: (event) => onChange(event.target.value) },
            ...accountIds.map((id) => React.createElement("option", { key: id, value: id }, accounts[id].name + "（" + id + "）")),
          ),
        )

        const providerSelector = () => React.createElement(
          "label",
          { className: "gzhToolbar" },
          React.createElement("span", { className: "gzhSectionTitle" }, "选择接口"),
          React.createElement(
            "select",
            { className: "gzhSelectSmall", value: activeProviderId, onChange: (event) => setSelectedProviderId(event.target.value) },
            ...providerIds.map((id) => React.createElement(
              "option", { key: id, value: id },
              (providers[id].name || id) + "（优先级 " + String(providers[id].priority ?? 0) + "）",
            )),
          ),
        )

        const accountList = () => React.createElement(
          "div",
          { className: "gzhAccountList" },
          ...accountIds
            .slice()
            .sort((left, right) => Number(right === defaultAccountId) - Number(left === defaultAccountId) || left.localeCompare(right))
            .map((id) => {
              const profile = accounts[id]
              const selected = id === activeAccountId
              const isDefault = id === defaultAccountId
              return React.createElement(
                "div",
                { key: id, className: "gzhAccountRow" + (selected ? " gzhAccountRowActive" : "") },
                React.createElement(
                  "div",
                  { className: "gzhAccountMain", role: "button", tabIndex: 0,
                    onClick: () => setSelectedAccountId(id),
                    onKeyDown: (event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedAccountId(id)
                    },
                  },
                  React.createElement(
                    "div", { className: "gzhAccountName" },
                    React.createElement("span", { className: "gzhAccountNameText" }, profile.name || id),
                    isDefault ? React.createElement("span", { className: "gzhBadge" }, "默认") : null,
                  ),
                  React.createElement("div", { className: "gzhAccountId" }, id),
                ),
                React.createElement(
                  "div", { className: "gzhAccountStatus" },
                  React.createElement("span", { className: "gzhStatusDot" + (profile.enabled ? " gzhStatusDotOn" : "") }),
                  profile.enabled ? "已启用" : "已停用",
                ),
                React.createElement(
                  "div", { className: "gzhAccountActions" },
                  React.createElement("button", {
                    type: "button", className: "gzhButton", disabled: selected && editingAccount,
                    onClick: () => { setSelectedAccountId(id); setEditingAccount(true) },
                  }, selected && editingAccount ? "编辑中" : "编辑"),
                  React.createElement("button", {
                    type: "button", className: "gzhButton", disabled: !writable || saving,
                    onClick: () => openCopyAccount(id),
                  }, "复制"),
                  React.createElement("button", {
                    type: "button", className: "gzhButton", disabled: isDefault || !writable || saving,
                    onClick: () => edit(["default_account"], { value: id }),
                  }, isDefault ? "当前默认" : "设为默认"),
                  React.createElement("button", {
                    type: "button", className: "gzhButton",
                    disabled: accountIds.length <= 1 || isDefault || !writable || saving,
                    onClick: () => deleteAccount(id),
                  }, "删除"),
                ),
              )
            }),
        )

        const contentList = () => React.createElement(
          "div",
          { className: "gzhConfigList" },
          ...accountIds.map((id) => {
            const profile = accounts[id]
            const selected = id === activeAccountId
            const content = profile.content || {}
            return React.createElement(
              "div", { key: id, className: "gzhConfigRow" + (selected && editingContentAccount ? " gzhConfigRowActive" : "") },
              React.createElement(
                "div", { className: "gzhConfigMain", role: "button", tabIndex: 0,
                  onClick: () => setSelectedAccountId(id),
                  onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") setSelectedAccountId(id) },
                },
                React.createElement("div", { className: "gzhConfigTitle" }, React.createElement("span", { className: "gzhConfigTitleText" }, profile.name || id)),
                React.createElement("div", { className: "gzhConfigMeta" }, id),
              ),
              React.createElement("div", { className: "gzhConfigStatus" }, String(content.articles_per_day ?? 0) + " 篇/日 · 最低 " + String(content.min_words ?? 0) + " 字"),
              React.createElement("div", { className: "gzhConfigActions" }, React.createElement("button", {
                type: "button", className: "gzhButton", onClick: () => { setSelectedAccountId(id); setEditingContentAccount(true) },
              }, selected && editingContentAccount ? "编辑中" : "编辑规则")),
            )
          }),
        )

        const providerList = () => React.createElement(
          "div",
          { className: "gzhConfigList" },
          ...providerIds.map((id) => {
            const provider = providers[id]
            const selected = id === activeProviderId
            return React.createElement(
              "div", { key: id, className: "gzhConfigRow" + (selected && editingProvider ? " gzhConfigRowActive" : "") },
              React.createElement(
                "div", { className: "gzhConfigMain", role: "button", tabIndex: 0,
                  onClick: () => setSelectedProviderId(id),
                  onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") setSelectedProviderId(id) },
                },
                React.createElement("div", { className: "gzhConfigTitle" }, React.createElement("span", { className: "gzhConfigTitleText" }, provider.name || id)),
                React.createElement("div", { className: "gzhConfigMeta" }, id + " · " + String(provider.base_url || "未配置")),
              ),
              React.createElement("div", { className: "gzhConfigStatus" },
                React.createElement("span", { className: "gzhStatusDot" + (provider.enabled ? " gzhStatusDotOn" : "") }),
                (provider.enabled ? "已启用" : "已停用") + " · 优先级 " + String(provider.priority ?? 0),
              ),
              React.createElement("div", { className: "gzhConfigActions" },
                React.createElement("button", { type: "button", className: "gzhButton", disabled: testingProviderId !== "" || !provider.enabled, onClick: () => testProvider(id) }, testingProviderId === id ? "测试中…" : "测试接口"),
                React.createElement("button", { type: "button", className: "gzhButton", onClick: () => { setSelectedProviderId(id); setEditingProvider(true) } }, selected && editingProvider ? "编辑中" : "编辑接口"),
                React.createElement("button", { type: "button", className: "gzhButton", disabled: providerIds.length <= 1 || !writable || saving, onClick: () => deleteProvider(id) }, "删除"),
              ),
              providerTests[id] ? React.createElement(
                "div", { className: "gzhProviderTest" },
                providerTests[id].status === "testing" ? React.createElement("div", { className: "gzhProviderTestInfo" }, "正在请求接口并生成测试图…") : null,
                providerTests[id].status === "error" ? React.createElement("div", { className: "gzhProviderTestInfo gzhProviderTestError" }, "测试失败：" + providerTests[id].error) : null,
                providerTests[id].status === "success" ? React.createElement(React.Fragment, null,
                  providerTests[id].preview_url ? React.createElement("img", { className: "gzhProviderTestPreview", src: providerTests[id].preview_url, alt: "生图接口测试预览" }) : null,
                  React.createElement("div", { className: "gzhProviderTestInfo gzhProviderTestSuccess" }, providerTests[id].dry_run ? providerTests[id].message : "测试成功 · " + String(providerTests[id].model || provider.model || "")),
                ) : null,
              ) : null,
            )
          }),
        )

        const brandEditor = (slot) => {
          const key = activeAccountId + ":" + slot
          const upload = uploads[key]
          const savedAccount = hasAt(value.accounts, [activeAccountId])
          const savedUrl = savedAccount
            ? `${BRAND_ROUTE}?account=${encodeURIComponent(activeAccountId)}&slot=${slot}&rev=${snapshot.revision ?? 0}`
            : ""
          const preview = upload?.preview || savedUrl
          const missing = missingPreviews[key] === true || (!preview && !upload?.error)
          const chooseFile = (file) => uploadBrandFile(activeAccountId, slot, file)
          return React.createElement(
            "div",
            { className: "gzhUpload" + (dragging === key ? " gzhUploadActive" : "") },
            preview && !missing
              ? React.createElement("img", {
                  className: "gzhPreview",
                  src: preview,
                  alt: slot === "header" ? "头部品牌图预览" : "尾部品牌图预览",
                  onError: () => setMissingPreviews((current) => ({ ...current, [key]: true })),
                })
              : React.createElement(
                  "div",
                  { className: "gzhPreview gzhPreviewMissing" },
                  upload?.error ? "上传失败" : savedAccount ? "暂无图片" : "保存账号后预览",
                ),
            React.createElement(
              "div",
              {
                className: "gzhUploadBody",
                onDragOver: (event) => { event.preventDefault(); setDragging(key) },
                onDragLeave: () => setDragging(""),
                onDrop: (event) => {
                  event.preventDefault()
                  setDragging("")
                  chooseFile(event.dataTransfer?.files?.[0])
                },
              },
              React.createElement("strong", { className: "gzhSectionTitle" }, slot === "header" ? "上传头部品牌图" : "上传尾部品牌图"),
              React.createElement("p", { className: "gzhHint" }, "支持 JPEG、PNG、WebP，最大 10 MB；上传后立即写入 brand_assets/uploads。"),
              React.createElement(
                "div",
                { className: "gzhUploadActions" },
                React.createElement(
                  "label",
                  { className: "gzhButton" },
                  "选择文件",
                  React.createElement("input", {
                    type: "file",
                    accept: "image/jpeg,image/png,image/webp",
                    hidden: true,
                    disabled: !writable || saving,
                    onChange: (event) => {
                      chooseFile(event.target.files?.[0])
                      event.target.value = ""
                    },
                  }),
                ),
                React.createElement("button", {
                  type: "button",
                  className: "gzhButton",
                  disabled: !writable || saving || !currentValue(["accounts", activeAccountId, "brand_images", slot, "file"]),
                  onClick: () => {
                    cleanupUpload(activeAccountId, slot)
                    edit(["accounts", activeAccountId, "brand_images", slot, "file"], { value: "" }, "")
                  },
                }, "移除"),
              ),
              upload && upload.progress < 100
                ? React.createElement(
                    "div",
                    { className: "gzhProgress" },
                    React.createElement("div", { className: "gzhProgressBar", style: { width: String(upload.progress) + "%" } }),
                  )
                : null,
              upload?.error ? React.createElement("p", { className: "gzhUploadError" }, upload.error) : null,
            ),
          )
        }

        const tabContent = () => {
          if (activeTab === "公众号账号") {
            return React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div", { className: "gzhSectionBar" },
                React.createElement("div", { className: "gzhSectionBarBody" },
                  React.createElement("h3", { className: "gzhSectionTitle" }, "公众号账号"),
                  React.createElement("p", { className: "gzhSectionHint" }, accountIds.length + " 个账号 · 默认账号置顶，详情按需展开。"),
                ),
                React.createElement("button", { type: "button", className: "gzhButton gzhButtonPrimary", onClick: () => setAddingAccount((value) => !value) }, addingAccount ? "取消添加" : "添加账号"),
              ),
              accountList(),
              addingAccount ? React.createElement(
                "div", { className: "gzhSurface gzhSurfaceSoft" },
                React.createElement("div", { className: "gzhSurfaceHeader" }, React.createElement("div", { className: "gzhSurfaceHeaderBody" },
                  React.createElement("h3", { className: "gzhSectionTitle" }, "添加公众号账号"),
                  React.createElement("p", { className: "gzhSectionHint" }, "账号 ID 仅支持小写字母、数字和连字符，创建后不可修改。"),
                )),
                React.createElement("div", { className: "gzhAddRow" },
                  React.createElement("input", { className: "gzhAddInput", placeholder: "账号 ID，如 wenying", value: accountDraft.id, onChange: (event) => setAccountDraft((current) => ({ ...current, id: event.target.value })) }),
                  React.createElement("input", { className: "gzhAddInput", placeholder: "显示名称", value: accountDraft.name, onChange: (event) => setAccountDraft((current) => ({ ...current, name: event.target.value })) }),
                  React.createElement("button", { type: "button", className: "gzhButton gzhButtonPrimary", disabled: !ACCOUNT_ID_RE.test(accountDraft.id.trim()) || Boolean(accounts[accountDraft.id.trim()]), onClick: createAccount }, "创建并编辑"),
                ),
              ) : null,
              copyingAccountId && accounts[copyingAccountId] ? React.createElement(
                "div", { className: "gzhSurface gzhSurfaceSoft" },
                React.createElement("div", { className: "gzhSurfaceHeader" }, React.createElement("div", { className: "gzhSurfaceHeaderBody" },
                  React.createElement("h3", { className: "gzhSectionTitle" }, "复制账号：" + (accounts[copyingAccountId].name || copyingAccountId)),
                  React.createElement("p", { className: "gzhSectionHint" }, "完整复制该账号全部配置（含 AppID/AppSecret）；点击右下角「保存」后生效。"),
                )),
                React.createElement("div", { className: "gzhAddRow" },
                  React.createElement("input", { className: "gzhAddInput", placeholder: "新账号 ID，如 " + copyingAccountId + "-copy", value: copyDraft.id, onChange: (event) => setCopyDraft((current) => ({ ...current, id: event.target.value })) }),
                  React.createElement("input", { className: "gzhAddInput", placeholder: "显示名称", value: copyDraft.name, onChange: (event) => setCopyDraft((current) => ({ ...current, name: event.target.value })) }),
                  React.createElement("button", { type: "button", className: "gzhButton gzhButtonPrimary", disabled: !ACCOUNT_ID_RE.test(copyDraft.id.trim()) || Boolean(accounts[copyDraft.id.trim()]) || !copyingAccountId, onClick: createAccountCopy }, "创建副本"),
                  React.createElement("button", { type: "button", className: "gzhButton", onClick: () => { setCopyingAccountId(""); setCopyDraft({ id: "", name: "" }) } }, "取消"),
                ),
              ) : null,
              editingAccount
                ? React.createElement(
                    "div", { className: "gzhSurface" },
                    React.createElement("div", { className: "gzhSurfaceHeader" },
                      React.createElement("div", { className: "gzhSurfaceHeaderBody" }, React.createElement("h3", { className: "gzhSectionTitle" }, accounts[activeAccountId]?.name || activeAccountId), React.createElement("p", { className: "gzhSectionHint" }, "账号 ID：" + activeAccountId)),
                      React.createElement("button", { type: "button", className: "gzhButton", onClick: () => setEditingAccount(false) }, "收起"),
                    ),
                    React.createElement("div", { className: "gzhGrid" }, ...accountFields.map(fieldNode)),
                  )
                : null,
            )
          }

          if (activeTab === "内容规则") {
            return React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div", { className: "gzhSectionBar" },
                React.createElement("div", { className: "gzhSectionBarBody" }, React.createElement("h3", { className: "gzhSectionTitle" }, "内容规则"), React.createElement("p", { className: "gzhSectionHint" }, "按账号管理文章数量、字数、选题方向和禁词。")),
              ),
              contentList(),
              editingContentAccount
                ? React.createElement(
                    "div", { className: "gzhSurface" },
                    React.createElement("div", { className: "gzhSurfaceHeader" }, React.createElement("div", { className: "gzhSurfaceHeaderBody" }, React.createElement("h3", { className: "gzhSectionTitle" }, accounts[activeAccountId]?.name || activeAccountId), React.createElement("p", { className: "gzhSectionHint" }, "该账号专属内容规则")), React.createElement("button", { type: "button", className: "gzhButton", onClick: () => setEditingContentAccount(false) }, "收起")),
                    React.createElement("div", { className: "gzhGrid" }, ...contentFields.map(fieldNode)),
                  )
                : null,
            )
          }

          if (activeTab === "生图接口") {
            return React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div", { className: "gzhSectionBar" },
                React.createElement("div", { className: "gzhSectionBarBody" }, React.createElement("h3", { className: "gzhSectionTitle" }, "生图接口"), React.createElement("p", { className: "gzhSectionHint" }, providerIds.length + " 个接口 · 数字越小越优先，失败时自动轮换。")),
                React.createElement("button", { type: "button", className: "gzhButton gzhButtonPrimary", onClick: () => setAddingProvider((value) => !value) }, addingProvider ? "取消添加" : "添加接口"),
              ),
              providerList(),
              addingProvider ? React.createElement("div", { className: "gzhSurface gzhSurfaceSoft" },
                React.createElement("div", { className: "gzhSurfaceHeader" }, React.createElement("div", { className: "gzhSurfaceHeaderBody" }, React.createElement("h3", { className: "gzhSectionTitle" }, "添加生图接口"), React.createElement("p", { className: "gzhSectionHint" }, "创建后继续填写接口地址、API Key、模型和优先级。"))),
                React.createElement("div", { className: "gzhAddRow" }, React.createElement("input", { className: "gzhAddInput", placeholder: "接口 ID，如 relay-a", value: providerDraft.id, onChange: (event) => setProviderDraft((current) => ({ ...current, id: event.target.value })) }), React.createElement("input", { className: "gzhAddInput", placeholder: "接口名称", value: providerDraft.name, onChange: (event) => setProviderDraft((current) => ({ ...current, name: event.target.value })) }), React.createElement("button", { type: "button", className: "gzhButton gzhButtonPrimary", disabled: !PROVIDER_ID_RE.test(providerDraft.id.trim()) || Boolean(providers[providerDraft.id.trim()]), onClick: createProvider }, "创建并编辑")),
              ) : null,
              editingProvider
                ? React.createElement(
                    "div", { className: "gzhSurface" },
                    React.createElement("div", { className: "gzhSurfaceHeader" }, React.createElement("div", { className: "gzhSurfaceHeaderBody" }, React.createElement("h3", { className: "gzhSectionTitle" }, providers[activeProviderId]?.name || activeProviderId), React.createElement("p", { className: "gzhSectionHint" }, "接口 ID：" + activeProviderId)), React.createElement("button", { type: "button", className: "gzhButton", onClick: () => setEditingProvider(false) }, "收起")),
                    React.createElement("div", { className: "gzhGrid" }, ...providerFields.map(fieldNode)),
                  )
                : null,
            )
          }

          if (activeTab === "头部品牌图" || activeTab === "尾部品牌图") {
            const slot = activeTab === "头部品牌图" ? "header" : "footer"
            return React.createElement(
              React.Fragment,
              null,
              accountSelector("品牌图所属账号", activeAccountId, setSelectedAccountId),
              React.createElement("div", { className: "gzhSurface" }, brandEditor(slot), React.createElement("div", { className: "gzhGrid" }, ...brandFields(slot).map(fieldNode))),
            )
          }

          if (activeTab === "排版") {
            return React.createElement("div", { className: "gzhSurface" }, React.createElement("div", { className: "gzhGrid" }, ...typographyFields.map(fieldNode)))
          }

          if (activeTab === "AI 配图") {
            const headlineRatio = String(currentValue(["image_api", "headline_cover_ratio"]) ?? "2.35:1")
            const secondaryRatio = String(currentValue(["image_api", "secondary_cover_ratio"]) ?? "1:1")
            return React.createElement(
              "div",
              { className: "gzhSurface" },
              React.createElement(
                "div",
                { className: "gzhSurfaceHeader" },
                React.createElement("div", { className: "gzhSurfaceHeaderBody" },
                  React.createElement("h3", { className: "gzhSectionTitle" }, "当前封面生成尺寸"),
                  React.createElement("p", { className: "gzhSectionHint" },
                    "头条 " + headlineRatio + " → " + (COVER_PIXELS[headlineRatio] ?? headlineRatio) + " px · 次条 "
                    + secondaryRatio + " → " + (COVER_PIXELS[secondaryRatio] ?? secondaryRatio) + " px；修改比例并保存后，下一次生图生效。"),
                ),
              ),
              React.createElement("div", { className: "gzhGrid" }, ...imageApiFields.map(fieldNode)),
            )
          }

          const configuredWorkspace = String(currentValue(["runtime", "project_root"]) ?? "").trim()
          const actualWorkspace = !configuredWorkspace || ["default", "plugin-default"].includes(configuredWorkspace.toLowerCase())
            ? PLUGIN_DEFAULT_WORKSPACE : configuredWorkspace
          return React.createElement("div", { className: "gzhSurface" },
            React.createElement("div", { className: "gzhSurfaceHeader" }, React.createElement("div", { className: "gzhSurfaceHeaderBody" },
              React.createElement("h3", { className: "gzhSectionTitle" }, "当前任务工作区"),
              React.createElement("p", { className: "gzhSectionHint" }, actualWorkspace),
            )),
            React.createElement("div", { className: "gzhGrid" }, ...runtimeFields.map(fieldNode)),
          )
        }

        const tabs = ["公众号账号", "内容规则", "生图接口", "头部品牌图", "尾部品牌图", "排版", "AI 配图", "运行"]

        return React.createElement(
          "div",
          { className: "gzhPage" },
          React.createElement(
            "header",
            { className: "gzhPageHeader" },
            React.createElement(
              "div",
              { className: "gzhPageHeading" },
              React.createElement("h3", { className: "gzhPageTitle" }, "文映千秋公众号流水线"),
              React.createElement("p", { className: "gzhPageDescription" }, "多账号凭据、内容规则、品牌图、生图接口与封面配图配置"),
            ),
            dirty ? React.createElement(UI.Tag, { tone: "neutral" }, "未保存") : null,
          ),
          React.createElement(
            "div",
            { className: "gzhTabs", role: "tablist", "aria-label": "公众号配置分类" },
            ...tabs.map((tab, index) => React.createElement(
              "button",
              {
                type: "button",
                role: "tab",
                id: "gzh-tab-" + String(index),
                className: "gzhTab" + (tab === activeTab ? " gzhTabActive" : ""),
                "aria-selected": tab === activeTab,
                "aria-controls": "gzh-panel-" + String(index),
                tabIndex: tab === activeTab ? 0 : -1,
                key: tab,
                onClick: () => {
                  setActiveTab(tab)
                  setEditingAccount(false)
                  setEditingContentAccount(false)
                  setEditingProvider(false)
                  setAddingAccount(false)
                  setAddingProvider(false)
                  setCopyingAccountId("")
                  setCopyDraft({ id: "", name: "" })
                },
              },
              tab,
            )),
          ),
          React.createElement(
            "section",
            {
              className: "gzhPanel",
              role: "tabpanel",
              id: "gzh-panel-" + String(tabs.indexOf(activeTab)),
              "aria-labelledby": "gzh-tab-" + String(tabs.indexOf(activeTab)),
            },
            !["公众号账号", "内容规则", "生图接口"].includes(activeTab) ? React.createElement(
              "div",
              { className: "gzhPanelHeader" },
              React.createElement("h4", { className: "gzhSectionTitle" }, activeTab),
              React.createElement("p", { className: "gzhSectionHint" },
                activeTab === "公众号账号" ? "每个账号独立保存凭据；账号 ID 创建后不可修改。" :
                activeTab === "内容规则" ? "当前账号的文章数、字数、选题和禁词规则。" :
                activeTab === "生图接口" ? "按优先级排序；可重试错误会自动切换并保持成功接口。" :
                activeTab === "头部品牌图" ? "上传并预览当前账号的文章头部品牌图。" :
                activeTab === "尾部品牌图" ? "上传并预览当前账号的文章尾部品牌图。" :
                activeTab === "排版" ? "全局共用的正文排版规则。" :
                activeTab === "AI 配图" ? "封面比例、每篇配图数量与图中文字语言。" :
                "全局运行时与发布参数。"),
            ) : null,
            tabContent(),
          ),
          dirty || saving || failed ? React.createElement(
            "div",
            { className: "gzhFooter" },
            failed ? React.createElement("p", { className: "gzhFailed" }, "保存失败，请检查配置或稍后重试。") : null,
            React.createElement("button", {
              type: "button", className: "gzhDiscard", disabled: !dirty || saving, onClick: discard,
            }, "放弃修改"),
            React.createElement("button", {
              type: "button", className: "gzhSave", disabled: !dirty || invalid || saving || !writable, onClick: save,
            }, saving ? "保存中…" : "保存"),
          ) : null,
        )
      }

      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "gzh-publisher",
        order: 18,
        label: () => "公众号",
      }, GzhPublisherSection))
    }

    return {
      name: "dsh-gzh-publisher",
      inject: ["slots", "settingsScope"],
      apply,
    }
  },
})
