window.__ModuleLoader__.load({
  id: "dsh-social-publisher",
  factory: (require) => {
    const React = require("react")
    const UI = (() => {
      try { return require("@deepseek-ai/dsh-client-ui-primitives") } catch { return {} }
    })()

    const NS = "social-publisher"
    const BRAND_ROUTE = "/api/gzh-publisher/brand-image"
    const ZHIHU_LOGIN_ROUTE = "/api/gzh-publisher/zhihu-login"
    const WECHAT_LOGIN_ROUTE = "/api/gzh-publisher/wechat-login"
    const PUBLISH_HISTORY_ROUTE = "/api/gzh-publisher/publish-history"
    const CONFIG_EXPORT_ROUTE = "/api/gzh-publisher/config/export"
    const CONFIG_VALIDATE_ROUTE = "/api/gzh-publisher/config/validate"
    const CONFIG_IMPORT_ROUTE = "/api/gzh-publisher/config/import"
    const CSS_ID = "dsh-social-publisher/settings.css"
    const ACCOUNT_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    const PROVIDER_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    const PLUGIN_DEFAULT_WORKSPACE = "D:\\666\\gzh\\dsh-plugin\\tasks\\default"
    const LEGACY_DEFAULT_WORKSPACE = "d:/666/gzh/文映千秋学术网"
    const PLATFORM_OPTIONS = [["gzh", "公众号"], ["zhihu", "知乎专栏"]]
    const PUBLISH_MODE_OPTIONS = [
      ["api", "官方 API 接口模式（需 AppID / Secret / IP 白名单）"],
      ["browser", "免 API 浏览器模式（扫码登录，后台自动创建草稿）"],
    ]
    const EXPORT_SCOPE_OPTIONS = [
      ["all", "全量配置（含账号、接口、排版、配图与运行设置）"],
      ["accounts", "仅社媒账号档案（含各账号内容规则与品牌图）"],
      ["image_providers", "仅 AI 生图接口池"],
      ["visual_rules", "仅排版与配图视觉规范"],
      ["runtime", "仅运行环境设置"],
    ]

    const Icons = {
      feed: (size = 16, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
        React.createElement("line", { x1: 7, y1: 8, x2: 17, y2: 8 }),
        React.createElement("line", { x1: 7, y1: 12, x2: 14, y2: 12 }),
        React.createElement("line", { x1: 7, y1: 16, x2: 11, y2: 16 }),
      ),
      history: (size = 14, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("circle", { cx: 12, cy: 12, r: 9 }),
        React.createElement("polyline", { points: "12 7 12 12 15 15" }),
      ),
      users: (size = 14, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }),
        React.createElement("circle", { cx: 9, cy: 7, r: 4 }),
        React.createElement("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" }),
        React.createElement("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }),
      ),
      rules: (size = 14, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("line", { x1: 4, y1: 21, x2: 4, y2: 14 }),
        React.createElement("line", { x1: 4, y1: 10, x2: 4, y2: 3 }),
        React.createElement("line", { x1: 12, y1: 21, x2: 12, y2: 12 }),
        React.createElement("line", { x1: 12, y1: 8, x2: 12, y2: 3 }),
        React.createElement("line", { x1: 20, y1: 21, x2: 20, y2: 16 }),
        React.createElement("line", { x1: 20, y1: 12, x2: 20, y2: 3 }),
        React.createElement("line", { x1: 1, y1: 14, x2: 7, y2: 14 }),
        React.createElement("line", { x1: 9, y1: 8, x2: 15, y2: 8 }),
        React.createElement("line", { x1: 17, y1: 16, x2: 23, y2: 16 }),
      ),
      image: (size = 14, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
        React.createElement("circle", { cx: 8.5, cy: 8.5, r: 1.5 }),
        React.createElement("polyline", { points: "21 15 16 10 5 21" }),
      ),
      settings: (size = 14, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("circle", { cx: 12, cy: 12, r: 3 }),
        React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" }),
      ),
      backup: (size = 14, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("polyline", { points: "21 8 21 21 3 21 3 8" }),
        React.createElement("rect", { x: 1, y: 3, width: 22, height: 5 }),
        React.createElement("line", { x1: 10, y1: 12, x2: 14, y2: 12 }),
      ),
      refresh: (size = 13, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("polyline", { points: "23 4 23 10 17 10" }),
        React.createElement("polyline", { points: "1 20 1 14 7 14" }),
        React.createElement("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" }),
      ),
      close: (size = 14, stroke = 2) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("line", { x1: 18, y1: 6, x2: 6, y2: 18 }),
        React.createElement("line", { x1: 6, y1: 6, x2: 18, y2: 18 }),
      ),
      folder: (size = 13, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }),
      ),
      search: (size = 13, stroke = 1.75) => React.createElement("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        React.createElement("circle", { cx: 11, cy: 11, r: 8 }),
        React.createElement("line", { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
      ),
    }

    if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) === null) {
      const style = document.createElement("style")
      style.dataset.plugin = "dsh-social-publisher"
      style.dataset.pluginCss = CSS_ID
      style.textContent = `
        .gzhPage{box-sizing:border-box;display:flex;flex-direction:column;gap:18px;max-width:1080px;margin:0 auto;color:var(--dsw-alias-label-primary)}
        .gzhPageHeader{display:flex;align-items:flex-start;gap:12px;min-width:0}
        .gzhPageHeading{flex:1;min-width:0}
        .gzhPageTitle{margin:0;font-size:18px;font-weight:600;line-height:1.4}
        .gzhPageDescription{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
        .gzhTabs{display:inline-flex;align-items:center;gap:3px;padding:3px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:10px;background:var(--dsw-alias-bg-layer-2,#18181b);width:fit-content;max-width:100%;overflow-x:auto}
        .gzhTab{appearance:none;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#a1a1aa);font:inherit;font-size:12.5px;font-weight:500;white-space:nowrap;cursor:pointer;padding:6px 12px;border-radius:7px;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
        .gzhTab:hover{color:var(--dsw-alias-label-primary,#f4f4f5);background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.04))}
        .gzhTab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
        .gzhTabActive{color:var(--dsw-alias-label-primary,#ffffff);background:var(--dsw-alias-bg-layer-3,#27272a);border-color:var(--dsw-alias-border-l3,rgba(255,255,255,.12));box-shadow:0 1px 2px rgba(0,0,0,.15);font-weight:600}
        .gzhSubTabs{display:inline-flex;gap:3px;padding:3px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:9px;background:var(--dsw-alias-bg-layer-2);width:fit-content;margin-bottom:8px}
        .gzhSubTab{appearance:none;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;white-space:nowrap;cursor:pointer;padding:5px 12px;border-radius:6px;transition:all .15s}
        .gzhSubTab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}
        .gzhSubTabActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);box-shadow:0 1px 2px rgba(0,0,0,.08);font-weight:600}
        .gzhPanel{display:flex;flex-direction:column;gap:16px;min-width:0}
        .gzhToolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
        .gzhSelectSmall{height:34px;min-width:190px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:13px}
        .gzhButton{appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.03));color:var(--dsw-alias-label-secondary,#d4d4d8);border-radius:7px;padding:6px 12px;font:inherit;font-size:12px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
        .gzhButton:hover:not(:disabled){color:var(--dsw-alias-label-primary,#ffffff);background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.07));border-color:var(--dsw-alias-border-l4,rgba(255,255,255,.2))}
        .gzhButton:disabled{opacity:.4;cursor:default}
        .gzhButtonPrimary{border-color:transparent;background:var(--dsw-alias-label-primary,#f4f4f5);color:var(--dsw-alias-bg-layer-1,#18181b);font-weight:600}
        .gzhButtonPrimary:hover:not(:disabled){background:#ffffff;color:#000000}
        .gzhAddRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .gzhAddInput{height:32px;min-width:170px;padding:0 9px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:12px}
        .gzhSectionBar{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
        .gzhSectionBarBody{min-width:0}
        .gzhSurface{display:flex;flex-direction:column;gap:14px;padding:16px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:12px;background:var(--dsw-alias-bg-layer-3);box-shadow:0 1px 2px rgba(0,0,0,.03)}
        .gzhSurfaceSoft{background:var(--dsw-alias-bg-layer-2)}
        .gzhSurfaceHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
        .gzhSurfaceHeaderBody{min-width:0}
        .gzhAccountList{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-3)}
        .gzhAccountRow{display:grid;grid-template-columns:minmax(180px,1fr) minmax(130px,.7fr) auto;align-items:center;gap:16px;padding:12px 16px;border:0;border-bottom:.5px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;text-align:left;transition:background .15s}
        .gzhAccountRow:last-child{border-bottom:0}
        .gzhAccountRow:hover{background:var(--dsw-alias-bg-layer-2)}
        .gzhAccountRowActive{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}
        .gzhAccountMain{min-width:0;cursor:pointer}
        .gzhAccountName{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px;font-weight:600}
        .gzhAccountNameText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .gzhAccountId{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:11px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .gzhAccountStatus{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px}
        .gzhAccountSwitch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;padding:4px 8px;margin:-4px -8px;border-radius:8px;transition:background .15s}
        .gzhAccountSwitch:hover{background:var(--dsw-alias-bg-layer-2)}
        .gzhAccountSwitchDisabled{opacity:.5;cursor:not-allowed;pointer-events:none}
        .gzhAccountSwitchLabel{font-size:12px;color:var(--dsw-alias-label-secondary);transition:color .15s}
        .gzhAccountSwitchLabelActive{color:var(--dsw-alias-brand-primary);font-weight:500}
        .gzhStatusDot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary);display:inline-block;flex:none}
        .gzhStatusDotOn{background:#10b981}
        .gzhStatusDotWarn{background:#f59e0b}
        .gzhBadge{display:inline-flex;align-items:center;border-radius:6px;padding:2px 6px;background:var(--dsw-alias-bg-layer-4);color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:500;white-space:nowrap}
        .gzhAccountActions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}
        .gzhConfigList{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-3)}
        .gzhConfigRow{display:grid;grid-template-columns:minmax(180px,1fr) minmax(160px,.8fr) auto;align-items:center;gap:16px;padding:12px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2);transition:background .15s}
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
        .gzhSectionTitle{margin:0;font-size:14px;font-weight:600;line-height:1.5;letter-spacing:-0.01em}
        .gzhSectionHint{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
        .gzhGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
        .gzhField{display:flex;flex-direction:column;gap:5px;min-width:0}
        .gzhFieldWide{grid-column:1/-1}
        .gzhLabel{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:500;line-height:1.5}
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
        .gzhSwitch:disabled{cursor:not-allowed;opacity:.5}
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
        .gzhFooter{position:sticky;bottom:0;z-index:10;border-top:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#18181b) 95%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);justify-content:space-between;align-items:center;padding:10px 18px;display:flex;border-bottom-left-radius:16px;border-bottom-right-radius:16px}
        .gzhFailed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}
        .gzhDiscard,.gzhSave{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:7px;padding:5px 14px;font-size:12.5px;font-weight:500;transition:all .15s}
        .gzhDiscard{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary);background:transparent}
        .gzhDiscard:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3)}
        .gzhSave{background:var(--dsw-alias-label-primary,#f4f4f5);color:var(--dsw-alias-bg-layer-1,#18181b);font-weight:600}
        .gzhSave:hover:not(:disabled){background:#ffffff;color:#000000}
        .gzhDiscard:disabled,.gzhSave:disabled{opacity:.4;cursor:default}
        .gzhStatGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .gzhStatCard{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
        .gzhStatNumber{font-size:20px;font-weight:700;line-height:1.2;color:var(--dsw-alias-brand-primary)}
        .gzhStatLabel{font-size:12px;color:var(--dsw-alias-label-tertiary)}
        .gzhHistoryToolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-bottom:12px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
        .gzhHistoryToolbarLeft{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1}
        .gzhSearchInput{height:34px;flex:1;min-width:180px;max-width:300px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:13px}
        .gzhBatchList{display:flex;flex-direction:column;gap:14px}
        .gzhBatchCard{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.03)}
        .gzhBatchHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px;background:var(--dsw-alias-bg-layer-2);border-bottom:.5px solid var(--dsw-alias-border-l2)}
        .gzhBatchHeaderLeft{display:flex;flex-direction:column;gap:5px;min-width:0}
        .gzhBatchTitleRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .gzhBatchAccountName{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
        .gzhBatchTime{font-size:12px;color:var(--dsw-alias-label-tertiary)}
        .gzhBatchMediaId{font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}
        .gzhBatchArticleList{display:flex;flex-direction:column}
        .gzhArticleRow{display:flex;flex-direction:column;gap:6px;padding:12px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
        .gzhArticleRow:last-child{border-bottom:0}
        .gzhArticleTop{display:flex;align-items:flex-start;gap:10px;justify-content:space-between}
        .gzhArticleTitleWrap{display:flex;align-items:flex-start;gap:8px;min-width:0;flex:1}
        .gzhArticleSeq{flex:none;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--dsw-alias-bg-layer-4);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;margin-top:1px}
        .gzhArticleTitleText{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}
        .gzhArticleDigest{margin:0;padding:8px 12px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6}
        .gzhArticleLink{color:var(--dsw-alias-brand-primary);text-decoration:none;font-size:12px;white-space:nowrap;margin-left:auto}
        .gzhArticleLink:hover{text-decoration:underline}
        .gzhEmptyState{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 16px;color:var(--dsw-alias-label-tertiary);text-align:center;gap:8px}
        .gzhEmptyTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-secondary)}
        .gzhExportSummary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:var(--dsw-alias-bg-layer-2);border-radius:10px;border:1px solid var(--dsw-alias-border-l2);font-size:12px;color:var(--dsw-alias-label-secondary)}
        .gzhSecurityCard{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2)}
        .gzhStrategyGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .gzhStrategyCard{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border:1.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;transition:border-color .15s,background .15s;text-align:left}
        .gzhStrategyCard:hover{border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-4)}
        .gzhStrategyCardActive{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 6%,var(--dsw-alias-bg-layer-3));box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}
        .gzhStrategyTitleRow{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .gzhStrategyTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}
        .gzhStrategyDesc{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5;margin:0}
        .gzhModeTabs{display:inline-flex;gap:4px;padding:3px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);width:fit-content}
        .gzhModeTab{appearance:none;border:0;background:transparent;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:all .15s}
        .gzhModeTab:hover{color:var(--dsw-alias-label-primary)}
        .gzhModeTabActive{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px rgba(0,0,0,.08);font-weight:600}
        .gzhDropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:32px 16px;border:1.5px dashed var(--dsw-alias-border-l4);border-radius:12px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;transition:border-color .15s,background .15s;text-align:center}
        .gzhDropzone:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-4)}
        .gzhDropzoneActive{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 6%,var(--dsw-alias-bg-layer-3))}
        .gzhDropzoneText{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
        .gzhDropzoneSub{font-size:12px;color:var(--dsw-alias-label-tertiary)}
        .gzhFilePill{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
        .gzhFilePillInfo{display:flex;align-items:center;gap:10px;min-width:0}
        .gzhFileName{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .gzhFileSize{font-size:11px;color:var(--dsw-alias-label-tertiary)}
        .gzhPreviewArea{display:flex;flex-direction:column;gap:12px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
        .gzhPreviewSummaryGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .gzhPreviewSummaryItem{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-3);padding:8px 12px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2)}
        .gzhCodePreview{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;line-height:1.5;background:var(--dsw-alias-bg-layer-2);padding:14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);max-height:260px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
        .gzhNoticeBox{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:8px;background:var(--dsw-alias-bg-layer-4);border:1px solid var(--dsw-alias-border-l2);font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
        .gzhSuccessBox{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-success) 10%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-label-success) 35%,transparent);color:var(--dsw-alias-label-success);font-size:12px;line-height:1.6}
        @media (max-width:620px){.gzhPage{gap:14px}.gzhGrid{grid-template-columns:1fr}.gzhStrategyGrid{grid-template-columns:1fr}.gzhPreviewSummaryGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.gzhFieldWide{grid-column:auto}.gzhUpload{align-items:flex-start;flex-direction:column}.gzhPreview{width:100%;height:140px}.gzhSectionBar,.gzhSurfaceHeader{align-items:stretch;flex-direction:column}.gzhAccountRow,.gzhConfigRow{grid-template-columns:1fr}.gzhAccountStatus,.gzhConfigStatus{grid-column:1}.gzhAccountActions,.gzhConfigActions{grid-column:1;grid-row:auto;justify-content:flex-start}.gzhSurface{padding:14px}.gzhStatGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.gzhBatchHeader{flex-direction:column}.gzhHistoryToolbar{flex-direction:column;align-items:stretch}}
        .gzhCardModalBackdrop{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:24px;animation:gzhFadeIn .18s cubic-bezier(.16,1,.3,1)}
        .gzhCardModalContainer{box-sizing:border-box;background:var(--dsw-alias-bg-layer-1,#18181b);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));border-radius:16px;box-shadow:0 24px 64px -12px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.05);width:100%;max-width:1140px;height:88vh;max-height:900px;display:flex;flex-direction:column;overflow:hidden;animation:gzhScaleIn .2s cubic-bezier(.16,1,.3,1)}
        .gzhCardPage{box-sizing:border-box;background:var(--dsw-alias-bg-layer-1,#18181b);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);width:100%;max-width:1140px;margin:0 auto;display:flex;flex-direction:column;overflow:hidden}
        .gzhCardEmbed{box-sizing:border-box;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
        @keyframes gzhFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes gzhScaleIn{from{opacity:0;transform:scale(.97) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .gzhCardHeader{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 20px;background:var(--dsw-alias-bg-layer-2,#1f1f23);border-bottom:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));flex-wrap:wrap}
        .gzhCardHeaderMain{display:flex;align-items:center;gap:12px;min-width:0;flex:1}
        .gzhCardIcon{width:36px;height:36px;border-radius:8px;background:var(--dsw-alias-bg-layer-3,#27272a);border:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.1));display:flex;align-items:center;justify-content:center;flex:none;color:var(--dsw-alias-label-primary,#f4f4f5)}
        .gzhCardHeading{display:flex;flex-direction:column;gap:3px;min-width:0}
        .gzhCardTitleRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .gzhCardTitle{margin:0;font-size:15px;font-weight:600;letter-spacing:-0.01em;line-height:1.3;color:var(--dsw-alias-label-primary)}
        .gzhCardVersion{font-size:11px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;padding:1px 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.06));color:var(--dsw-alias-label-tertiary,#a1a1aa);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.06))}
        .gzhDirtyTag{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:5px;font-size:11px;font-weight:500;background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.25)}
        .gzhCardDescription{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary,#71717a);line-height:1.4}
        .gzhCardHeaderActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .gzhCardStatusCluster{display:inline-flex;align-items:center;border-radius:7px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.04));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));overflow:hidden;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
        .gzhCardStatusItem{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;white-space:nowrap}
        .gzhCardStatusItem+.gzhCardStatusItem{border-left:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08))}
        .gzhCardCloseBtn{appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
        .gzhCardCloseBtn:hover{background:var(--dsw-alias-bg-layer-4,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
        .gzhCardBody{flex:1;min-height:0;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:16px}
        .gzhFooterStatus{display:flex;align-items:center;gap:12px;flex:1;min-width:0;flex-wrap:wrap}
        .gzhFooterTag{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:480px}
        .gzhSidebarFooterBtn{appearance:none;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;font:inherit;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;width:100%}
        .gzhSidebarFooterBtn:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
        .gzhSidebarFooterBtnActive{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
        .gzhSidebarFooterLabel{flex:1;text-align:left}
        .gzhSessionHeaderBtn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:7px;padding:4px 10px;font:inherit;font-size:12px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
        .gzhSessionHeaderBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-border-l4)}
        .gzhSessionHeaderBtnActive{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4)}
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
    const COVER_PIXELS = { "2.35:1": "3520×1498", "21:9": "3520×1500", "16:9": "3024×1701", "1:1": "1920×1920", "3:4": "1080×1440" }
    const RATIOS = Object.entries(COVER_PIXELS).map(([value, pixels]) => [value, value + "（" + pixels + "）"])
    const SECONDARY_RATIOS = RATIOS.filter(([value]) => value !== "2.35:1")
    const ARTICLE_TYPE_OPTIONS = [
      ["news", "公众号长文（经典多图文合辑）"],
      ["newspic", "小绿书图片消息（3:4 竖版轮播卡片）"],
      ["both", "长文 + 小绿书同步更新（一文双发）"],
    ]
    const NEWSPIC_RATIOS = [
      ["3:4", "3:4（1080×1440 竖版卡片·推荐）"],
      ["1:1", "1:1（1920×1920 方图）"],
      ["16:9", "16:9（3024×1701 横版）"],
    ]
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
      platform: "gzh",
      publish_mode: "api",
      name: "默认账号",
      enabled: true,
      appid: "",
      app_secret: "",
      author_name: "文映学术win00.cn",
      brand_name: "文映千秋学术网",
      publish_immediately: false,
      auto_enable_original: false,
      content: {
        article_type: "news",
        sync_newspic: false,
        articles_per_day: 6,
        newspic_articles_per_day: 1,
        min_words: 2000,
        topics: DEFAULT_TOPICS,
        forbidden_words: DEFAULT_FORBIDDEN,
        ending_guide_required: true,
        newspic_images_per_article: 4,
        newspic_image_ratio: "3:4",
        newspic_min_words: 100,
        headline_theme: "wenying",
        secondary_theme: "rotate",
        font_size: "13px",
        line_height: "20px",
        paragraph_margin: "25px",
        text_indent: "2em",
        headline_cover_ratio: "2.35:1",
        secondary_cover_ratio: "1:1",
        content_images_per_article: 2,
        image_lang_zh_only: true,
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
      if (value === null || typeof value !== "object") return value
      try {
        return JSON.parse(JSON.stringify(value))
      } catch {
        return Object.assign({}, value)
      }
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
      if (!value || typeof value !== "object") return false
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
      const accounts = (value.accounts && typeof value.accounts === "object" && !Array.isArray(value.accounts))
        ? { ...value.accounts }
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
      const providers = (value.image_providers && typeof value.image_providers === "object" && !Array.isArray(value.image_providers))
        ? { ...value.image_providers }
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
        value.default_account = Object.keys(accounts).find((id) => accounts[id]?.enabled) ?? Object.keys(accounts)[0] ?? "default"
      }
      for (const [id, acc] of Object.entries(accounts)) {
        if (!acc || typeof acc !== "object") continue
        acc.publish_mode = acc.publish_mode === "browser" ? "browser" : "api"
        acc.auto_enable_original = acc.auto_enable_original === true || (acc.auto_enable_original === undefined && value.wechat?.auto_enable_original === true)
        acc.content = {
          ...clone(DEFAULT_ACCOUNT.content),
          ...(value.content ?? {}),
          ...(acc.content ?? {}),
          headline_theme: acc.content?.headline_theme ?? value.typography?.headline_theme ?? "wenying",
          secondary_theme: acc.content?.secondary_theme ?? value.typography?.secondary_theme ?? "rotate",
          font_size: acc.content?.font_size ?? value.typography?.font_size ?? "13px",
          line_height: acc.content?.line_height ?? value.typography?.line_height ?? "20px",
          paragraph_margin: acc.content?.paragraph_margin ?? value.typography?.paragraph_margin ?? "25px",
          text_indent: acc.content?.text_indent ?? value.typography?.text_indent ?? "2em",
          headline_cover_ratio: acc.content?.headline_cover_ratio ?? value.image_api?.headline_cover_ratio ?? "2.35:1",
          secondary_cover_ratio: acc.content?.secondary_cover_ratio ?? value.image_api?.secondary_cover_ratio ?? "1:1",
          content_images_per_article: Number.isFinite(acc.content?.content_images_per_article)
            ? Number(acc.content.content_images_per_article)
            : (Number.isFinite(value.image_api?.content_images_per_article) ? Number(value.image_api.content_images_per_article) : 2),
          image_lang_zh_only: acc.content?.image_lang_zh_only ?? value.image_api?.image_lang_zh_only ?? true,
        }
        acc.brand_images = {
          header: { ...clone(DEFAULT_BRAND_HEADER), ...(value.brand_images?.header ?? {}), ...(acc.brand_images?.header ?? {}) },
          footer: { ...clone(DEFAULT_BRAND_FOOTER), ...(value.brand_images?.footer ?? {}), ...(acc.brand_images?.footer ?? {}) },
        }
      }
      return { ...value, accounts, image_providers: providers }
    }

    function pathKey(path) {
      return path.join(".")
    }

    function apply(ctx) {
      let scope = null
      try {
        if (ctx && ctx.settingsScope && typeof ctx.settingsScope.bind === "function") {
          scope = ctx.settingsScope.bind({ namespace: NS })
        }
      } catch (err) {
        console.warn("[dsh-social-publisher] Failed to bind settingsScope:", err)
      }

      function safeGetSnapshot(s) {
        try {
          if (!s || typeof s.getSnapshot !== "function") {
            return { status: "ready", value: {}, writable: false, revision: 0 }
          }
          const snap = s.getSnapshot()
          return snap || { status: "ready", value: {}, writable: false, revision: 0 }
        } catch (err) {
          console.warn("[dsh-social-publisher] Failed to get settings snapshot:", err)
          return { status: "ready", value: {}, writable: false, revision: 0, error: String(err) }
        }
      }

      function GzhPublisherCard(props = {}) {
        const { mode = "page", onClose } = props
        const [snapshot, setSnapshot] = React.useState(() => safeGetSnapshot(scope))
        const [activeTab, setActiveTab] = React.useState("账号管理")
        const [selectedAccountId, setSelectedAccountId] = React.useState("")
        const [selectedProviderId, setSelectedProviderId] = React.useState("")
        const [editingAccount, setEditingAccount] = React.useState(false)
        const [editingProvider, setEditingProvider] = React.useState(false)
        const [editingContentAccount, setEditingContentAccount] = React.useState(false)
        const [contentSubTab, setContentSubTab] = React.useState("basic")
        const [contentBrandSlot, setContentBrandSlot] = React.useState("header")
        const [addingAccount, setAddingAccount] = React.useState(false)
        const [addingProvider, setAddingProvider] = React.useState(false)
        const [drafts, setDrafts] = React.useState({})
        const [saving, setSaving] = React.useState(false)
        const [failed, setFailed] = React.useState(false)
        const [testingProviderId, setTestingProviderId] = React.useState("")
        const [providerTests, setProviderTests] = React.useState({})
        const [accountDraft, setAccountDraft] = React.useState({ id: "", name: "" })
        const [providerDraft, setProviderDraft] = React.useState({ id: "", name: "" })
        const [dshModels, setDshModels] = React.useState([])
        const [discoveringDsh, setDiscoveringDsh] = React.useState(false)
        const [dshDiscoverMsg, setDshDiscoverMsg] = React.useState("")
        const [copyingAccountId, setCopyingAccountId] = React.useState("")
        const [copyDraft, setCopyDraft] = React.useState({ id: "", name: "" })
        const [zhihuLogin, setZhihuLogin] = React.useState({ status: "idle", message: "" })
        const [wechatLogin, setWechatLogin] = React.useState({ status: "idle", message: "" })
        const [uploads, setUploads] = React.useState({})
        const [missingPreviews, setMissingPreviews] = React.useState({})
        const [dragging, setDragging] = React.useState("")
        const [historyData, setHistoryData] = React.useState({ records: [], total_batches: 0, total_articles: 0, gzh_articles: 0, zhihu_articles: 0 })
        const [historyLoading, setHistoryLoading] = React.useState(false)
        const [historyError, setHistoryError] = React.useState("")
        const [historyAccountFilter, setHistoryAccountFilter] = React.useState("")
        const [backupSubTab, setBackupSubTab] = React.useState("export")
        const [exportScope, setExportScope] = React.useState("all")
        const [exportIncludeSecrets, setExportIncludeSecrets] = React.useState(false)
        const [exportCopyStatus, setExportCopyStatus] = React.useState("")
        const [exportPreviewOpen, setExportPreviewOpen] = React.useState(false)
        const [importMode, setImportMode] = React.useState("merge")
        const [importInputMethod, setImportInputMethod] = React.useState("file")
        const [importText, setImportText] = React.useState("")
        const [importFileName, setImportFileName] = React.useState("")
        const [importFileSize, setImportFileSize] = React.useState("")
        const [importDragging, setImportDragging] = React.useState(false)
        const [importValidation, setImportValidation] = React.useState(null)
        const [importing, setImporting] = React.useState(false)
        const [importFeedback, setImportFeedback] = React.useState(null)
        const revisionRef = React.useRef(snapshot?.revision ?? 0)
        const newUploadsRef = React.useRef(new Map())
        const uploadsRef = React.useRef({})

        const fetchHistory = React.useCallback(async (accountFilter) => {
          setHistoryLoading(true)
          setHistoryError("")
          try {
            const query = accountFilter ? "?account=" + encodeURIComponent(accountFilter) + "&t=" + Date.now() : "?t=" + Date.now()
            const res = await fetch(PUBLISH_HISTORY_ROUTE + query)
            const data = await res.json().catch(() => ({}))
            if (!res.ok || data.error) throw new Error(data.error || "获取发表记录失败")
            setHistoryData(data)
          } catch (err) {
            setHistoryError(err?.message || String(err))
          } finally {
            setHistoryLoading(false)
          }
        }, [])

        React.useEffect(() => {
          if (activeTab === "发表记录") {
            fetchHistory(historyAccountFilter)
          }
        }, [activeTab, historyAccountFilter, fetchHistory])

        React.useEffect(() => {
          if (!scope || typeof scope.subscribe !== "function") return
          return scope.subscribe(() => {
            setSnapshot(safeGetSnapshot(scope))
          })
        }, [scope])

        React.useEffect(() => {
          const currentRev = snapshot?.revision ?? 0
          if (revisionRef.current === currentRev) return
          revisionRef.current = currentRev
          setDrafts({})
          setFailed(false)
          newUploadsRef.current.clear()
        }, [snapshot?.revision])

        React.useEffect(() => {
          uploadsRef.current = uploads
        }, [uploads])

        React.useEffect(() => () => {
          for (const upload of Object.values(uploadsRef.current)) {
            if (upload?.preview?.startsWith("blob:")) URL.revokeObjectURL(upload.preview)
          }
          for (const file of newUploadsRef.current.values()) void deleteRemoteUpload(file)
        }, [])

        React.useEffect(() => {
          if (snapshot && snapshot.status === "loading") {
            const timer = setTimeout(() => {
              setSnapshot((cur) => (cur && cur.status === "loading" ? { ...cur, status: "ready" } : cur))
            }, 1200)
            return () => clearTimeout(timer)
          }
        }, [snapshot?.status])

        if (!snapshot || snapshot.status === "loading") {
          return React.createElement(
            "div",
            { className: mode === "modal" ? "gzhCardModalContainer" : (mode === "card" ? "gzhCardEmbed" : "gzhCardPage"), style: { padding: "48px 24px", textAlign: "center", color: "var(--dsw-alias-label-secondary)" } },
            React.createElement("div", { style: { display: "inline-flex", marginBottom: "12px", color: "var(--dsw-alias-label-tertiary)" } }, Icons.feed(28)),
            React.createElement("div", { style: { fontSize: "13px" } }, "正在载入社媒发布工作台…"),
          )
        }
        if (snapshot.status === "unavailable") {
          return React.createElement(
            "div",
            { className: mode === "modal" ? "gzhCardModalContainer" : (mode === "card" ? "gzhCardEmbed" : "gzhCardPage"), style: { padding: "24px" } },
            React.createElement(
              "div",
              { className: "gzhSurface", style: { border: "1px solid var(--dsw-alias-label-error)", padding: "18px" } },
              React.createElement("h3", { className: "gzhSectionTitle", style: { color: "var(--dsw-alias-label-error)" } }, "社媒发布工作台卡片连接未就绪"),
              React.createElement("p", { className: "gzhHint" }, "插件配置服务暂不可用或正在热重载中。请稍候或检查后台日志。" + (snapshot.error ? (" (" + snapshot.error + ")") : "")),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "gzhButton",
                  style: { marginTop: "12px" },
                  onClick: () => setSnapshot(safeGetSnapshot(scope)),
                },
                "重新尝试连接",
              ),
            ),
          )
        }

        const value = normalizeValue(snapshot?.value ?? {})
        const accounts = clone(value.accounts || {})
        const providers = clone(value.image_providers || {})

        for (const [key, draft] of Object.entries(drafts)) {
          const parts = key.split(".")
          if (parts[0] === "accounts") {
            if (parts.length === 2) {
              if (draft?.reset) delete accounts[parts[1]]
              else if (draft?.object) accounts[parts[1]] = clone(draft.value)
            } else if (parts.length > 2 && accounts[parts[1]]) {
              let target = accounts[parts[1]]
              for (let i = 2; i < parts.length - 1; i++) {
                if (!target[parts[i]] || typeof target[parts[i]] !== "object") target[parts[i]] = {}
                target = target[parts[i]]
              }
              if (draft?.reset) delete target[parts[parts.length - 1]]
              else if (draft && !draft.invalid) target[parts[parts.length - 1]] = draft.value
            }
          }
          if (parts[0] === "image_providers") {
            if (parts.length === 2) {
              if (draft?.reset) delete providers[parts[1]]
              else if (draft?.object) providers[parts[1]] = clone(draft.value)
            } else if (parts.length > 2 && providers[parts[1]]) {
              let target = providers[parts[1]]
              for (let i = 2; i < parts.length - 1; i++) {
                if (!target[parts[i]] || typeof target[parts[i]] !== "object") target[parts[i]] = {}
                target = target[parts[i]]
              }
              if (draft?.reset) delete target[parts[parts.length - 1]]
              else if (draft && !draft.invalid) target[parts[parts.length - 1]] = draft.value
            }
          }
        }

        const accountIds = Object.keys(accounts)
        const defaultAccountId = (typeof drafts.default_account?.value === "string"
          ? drafts.default_account.value
          : value.default_account) || accountIds[0] || "default"
        const activeAccountId = accounts[selectedAccountId]
          ? selectedAccountId
          : (accounts[defaultAccountId] ? defaultAccountId : (accountIds[0] || ""))
        const providerIds = Object.keys(providers).sort((a, b) => (providers[a]?.priority ?? 0) - (providers[b]?.priority ?? 0) || a.localeCompare(b))
        const activeProviderId = providers[selectedProviderId] ? selectedProviderId : (providerIds[0] || "")
        const draftEntries = Object.entries(drafts)
        const invalid = draftEntries.some(([, draft]) => draft?.invalid === true)
        const dirty = draftEntries.length > 0
        const writable = Boolean(snapshot?.writable && snapshot?.status === "ready")

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
          return hasAt(snapshot?.user, path)
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
          const entries = Object.entries(drafts)
          const unsetKeys = new Set(entries.filter(([, draft]) => draft?.reset === true).map(([key]) => key))
          const ops = []
          for (const [key, draft] of entries) {
            if (!draft) continue
            const path = key.split(".")
            // 父级条目被删除时丢弃其子字段的残留草稿，避免 set 把已删除的账号/接口写回
            if (path.length > 1 && path.slice(0, -1).some((_, depth) => unsetKeys.has(path.slice(0, depth + 1).join(".")))) continue
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

        const activePlatform = String(currentValue(["accounts", activeAccountId, "platform"]) ?? "gzh")
        const activePublishMode = String(currentValue(["accounts", activeAccountId, "publish_mode"]) ?? "api")
        const accountFields = [
          { path: ["platform"], label: "发布平台", hint: "gzh=公众号（凭据或扫码登录）；zhihu=知乎专栏（扫码登录，Markdown 形态）", kind: "select", options: PLATFORM_OPTIONS },
          { path: ["name"], label: "显示名称", hint: "账号备注名", kind: "text" },
          { path: ["enabled"], label: "启用账号", hint: "关闭后不能用于构建或发布", kind: "boolean" },
          ...(activePlatform === "zhihu" ? [
            { path: ["publish_immediately"], label: "保存后直接发布", hint: "知乎账号：开启后自动直接发布；默认只存知乎草稿箱", kind: "boolean" },
          ] : [
            { path: ["publish_mode"], label: "更新方案", hint: "api=微信官方接口模式（需固定 IP 白名单）；browser=免 API 浏览器模式（扫码登录，后台自动创建草稿）", kind: "select", options: PUBLISH_MODE_OPTIONS },
            ...(activePublishMode === "browser" ? [
              { path: ["appid"], label: "AppID（可选）", hint: "免 API 浏览器模式下可留空；填写后可用于凭据备份", kind: "text" },
              { path: ["app_secret"], label: "AppSecret（可选）", hint: "免 API 浏览器模式下可留空", kind: "secret" },
            ] : [
              { path: ["appid"], label: "AppID", hint: "微信公众号 AppID（wx 开头，API 模式必填）", kind: "text" },
              { path: ["app_secret"], label: "AppSecret", hint: "API 模式必填；留空不修改", kind: "secret" },
            ]),
            { path: ["auto_enable_original"], label: "开启原创声明", hint: "公众号：草稿创建后自动通过浏览器模拟打开草稿箱批量开启文字原创并保存草稿", kind: "boolean" },
          ]),
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

        const currentArticleType = String(currentValue(["accounts", activeAccountId, "content", "article_type"]) ?? "news")
        const isSyncNewspic = Boolean(currentValue(["accounts", activeAccountId, "content", "sync_newspic"]) ?? false)
        const isZhihu = activePlatform === "zhihu"
        const isBoth = !isZhihu && (currentArticleType === "both" || isSyncNewspic)
        const isNewspicOnly = !isZhihu && currentArticleType === "newspic"
        const showNews = isZhihu || currentArticleType === "news" || isBoth
        const showNewspic = !isZhihu && (isNewspicOnly || isBoth)

        const contentFields = [
          ...(!isZhihu ? [
            { path: ["article_type"], label: "文章形态", hint: "news=仅长文，newspic=仅小绿书图片消息，both=长文与小绿书同步更新（一文双发）", kind: "select", options: ARTICLE_TYPE_OPTIONS, wide: true },
            { path: ["sync_newspic"], label: "小绿书同步草稿", hint: "公众号更新时长文与小绿书同步执行（一文双发：长文草稿 + 对应提炼的小绿书卡片草稿）", kind: "boolean" },
          ] : []),
          ...(showNews ? [
            { path: ["articles_per_day"], label: isBoth ? "长文每日篇数" : (isZhihu ? "知乎每日篇数" : "每日文章数"), hint: isZhihu ? "知乎专栏篇数（1–10 篇，独立草稿）" : (isBoth ? "长文每日篇数（1–10 篇，公众号长文组合为 1 个多图文草稿包）" : "每日文章数（1–10 篇，公众号长文组合为 1 个多图文草稿包）"), kind: "number" },
            { path: ["min_words"], label: isBoth ? "长文最低字数" : (isZhihu ? "正文最低字数" : "长文最低字数"), hint: "每篇纯文字下限（字，推荐 ≥2000）", kind: "number" },
          ] : []),
          ...(showNewspic ? [
            { path: ["newspic_articles_per_day"], label: "小绿书每日篇数", hint: "小绿书每日独立草稿篇数（1–20 篇，单篇独立发布草稿，不合并）", kind: "number" },
            { path: ["newspic_images_per_article"], label: "小绿书卡片张数", hint: "小绿书：每篇轮播卡片图片张数（1–20 张，默认 4 张）", kind: "number" },
            { path: ["newspic_image_ratio"], label: "小绿书卡片比例", hint: "小绿书：卡片图片宽高比（默认 3:4 竖版，首张卡片图自动作为封面）", kind: "select", options: NEWSPIC_RATIOS },
            { path: ["newspic_min_words"], label: "小绿书文案最低字数", hint: "小绿书：纯文字文案下限（字，推荐 80–300 字，默认 100）", kind: "number" },
          ] : []),
          { path: ["topics"], label: "核心业务关键词", hint: "用于检索关联选题，禁止作为标题开头词；每行或逗号分隔", kind: "lines", wide: true },
          { path: ["forbidden_words"], label: "禁词表", hint: "每行或逗号分隔，任何一篇出现即校验失败", kind: "lines", wide: true },
          { path: ["ending_guide_required"], label: "结尾品牌引导", hint: "结尾必须自然引导关注品牌「" + (accounts[activeAccountId]?.brand_name || "文映千秋学术网") + "」", kind: "boolean" },
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

        const accountTypographyFields = [
          { path: ["headline_theme"], label: "头条主题", hint: "该账号头条文章视觉主题（独享品牌风格）", kind: "select", options: THEMES },
          { path: ["secondary_theme"], label: "次条主题", hint: "rotate 表示自动轮换各主题", kind: "select", options: [["rotate", "自动轮换"], ...THEMES] },
          { path: ["font_size"], label: "正文字号", hint: "默认 13px（公众号铁律）", kind: "text" },
          { path: ["line_height"], label: "正文行高", hint: "默认 20px（公众号铁律）", kind: "text" },
          { path: ["paragraph_margin"], label: "段落间距", hint: "默认 25px", kind: "text" },
          { path: ["text_indent"], label: "首行缩进", hint: "默认 2em", kind: "text" },
        ].map((field) => ({ ...field, path: ["accounts", activeAccountId, "content", ...field.path] }))

        const accountImageFields = [
          { path: ["headline_cover_ratio"], label: "头条封面比例", hint: "该账号头条封面尺寸（默认 2.35:1）", kind: "select", options: RATIOS },
          { path: ["secondary_cover_ratio"], label: "次条封面比例", hint: "该账号次条封面尺寸（次条不支持 2.35:1）", kind: "select", options: SECONDARY_RATIOS },
          { path: ["content_images_per_article"], label: "每篇正文配图数", hint: "0–4 张；第 1 张 AI 信息图、第 2 张真实图", kind: "number" },
          { path: ["image_lang_zh_only"], label: "图中文字仅中文", hint: "生图提示词自动附加中文文字约束", kind: "boolean" },
        ].map((field) => ({ ...field, path: ["accounts", activeAccountId, "content", ...field.path] }))

        const globalImageFields = [
          { path: ["image_api", "concurrency"], label: "生图并发数", hint: "多线程同时并发请求生图（默认 3，大幅缩短总耗时）", kind: "number" },
          { path: ["image_api", "enable_local_fallback"], label: "本地保底兜底", hint: "全网生图接口失效时自动生成本地学术卡片保底图，保证流水线不中断", kind: "boolean" },
        ]

        const runtimeFields = [
          { path: ["runtime", "project_root"], label: "任务工作区", hint: "留空使用插件专用目录；也可填写其它绝对路径", invalidHint: "请输入 Windows 绝对路径，或留空使用默认工作区", kind: "workspace", wide: true },
          { path: ["runtime", "python_path"], label: "Python 解释器", hint: "Python 3.12 + requests + Pillow", kind: "text" },
          { path: ["runtime", "request_timeout_ms"], label: "请求超时", hint: "单位毫秒", kind: "number" },
          { path: ["runtime", "chrome_path"], label: "浏览器路径", hint: "Chrome/Edge 绝对路径；留空自动探测本机浏览器（知乎自动化用）", kind: "text", wide: true },
          { path: ["runtime", "zhihu_headless"], label: "知乎无头模式", hint: "默认开启（后台静默运行）；排障时可关闭以观察浏览器自动化操作", kind: "boolean" },
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
          else {
            // 先清掉该账号下已编辑字段的残留草稿，再整体标记删除
            removeDrafts("accounts." + accountId)
            edit(["accounts", accountId], { reset: true })
          }
          if (accountId === activeAccountId) {
            setSelectedAccountId(accountIds.find((id) => id !== accountId) ?? "")
          }
        }

        const toggleAccount = async (accountId, nextEnabled) => {
          if (!accountId || !writable || saving) return
          edit(["accounts", accountId, "enabled"], { value: nextEnabled })
          const otherDraftKeys = Object.keys(drafts).filter((k) => k !== "accounts." + accountId + ".enabled")
          if (otherDraftKeys.length === 0) {
            setSaving(true)
            setFailed(false)
            try {
              await scope.mutate([{ op: "set", path: ["accounts", accountId, "enabled"], value: nextEnabled }])
              removeAllDrafts()
            } catch {
              setFailed(true)
            } finally {
              setSaving(false)
            }
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
          else {
            // 先清掉该接口下已编辑字段的残留草稿，再整体标记删除
            removeDrafts("image_providers." + providerId)
            edit(["image_providers", providerId], { reset: true })
          }
          if (providerId === activeProviderId) setSelectedProviderId(providerIds.find((id) => id !== providerId) ?? "")
        }

        const toggleProvider = async (providerId, nextEnabled) => {
          if (!providerId || !writable || saving) return
          edit(["image_providers", providerId, "enabled"], { value: nextEnabled })
          const otherDraftKeys = Object.keys(drafts).filter((k) => k !== "image_providers." + providerId + ".enabled")
          if (otherDraftKeys.length === 0) {
            setSaving(true)
            setFailed(false)
            try {
              await scope.mutate([{ op: "set", path: ["image_providers", providerId, "enabled"], value: nextEnabled }])
              removeAllDrafts()
            } catch {
              setFailed(true)
            } finally {
              setSaving(false)
            }
          }
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

        const discoverDsh = async () => {
          setDiscoveringDsh(true)
          setDshDiscoverMsg("")
          try {
            const response = await fetch("/api/gzh-publisher/dsh-image-models")
            const result = await response.json().catch(() => ({}))
            if (result.ok && Array.isArray(result.models)) {
              setDshModels(result.models)
              if (result.models.length === 0) {
                setDshDiscoverMsg("主 dsh 中暂未发现包含 image/dall-e/flux 等生图特征的模型")
              }
            } else {
              setDshDiscoverMsg(result.error || "获取主 dsh 模型失败")
            }
          } catch (err) {
            setDshDiscoverMsg(String(err))
          } finally {
            setDiscoveringDsh(false)
          }
        }

        const importDshModel = (m) => {
          const cleanId = ("dsh-" + m.provider + "-" + m.model_id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
          const template = clone(DEFAULT_PROVIDER)
          template.name = (m.provider_name || m.provider) + " · " + (m.model_name || m.model_id)
          template.base_url = m.base_url || DEFAULT_PROVIDER.base_url
          template.api_key = m.api_key || ""
          template.model = m.model_id
          template.priority = providerIds.length
          edit(["image_providers", cleanId], { object: true, value: template }, JSON.stringify(template))
          setSelectedProviderId(cleanId)
          setEditingProvider(true)
        }

        const accountSaved = hasAt(value.accounts, [activeAccountId])
        const zhihuLoginAction = async (action) => {
          if (zhihuLogin.status === "checking" || zhihuLogin.status === "logging") return
          setZhihuLogin({
            status: action === "check" ? "checking" : "logging",
            message: action === "check"
              ? "正在启动浏览器检查登录态…"
              : "已打开知乎登录窗口：请扫码完成登录（最长等待 4 分钟），成功后窗口自动关闭。",
          })
          try {
            const response = await fetch(ZHIHU_LOGIN_ROUTE, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ account_id: activeAccountId, action }),
            })
            const result = await response.json().catch(() => ({}))
            if (!response.ok || result.error) throw new Error(result.error || "请求失败")
            setZhihuLogin({
              status: "idle",
              message: result.logged_in
                ? (action === "check" ? "登录态有效（检测到 z_c0）" : "登录成功，登录态已保存到该账号目录")
                : (action === "check" ? "未登录：请点击「扫码登录知乎」" : "未检测到登录成功，请重试"),
            })
          } catch (error) {
            setZhihuLogin({ status: "idle", message: error?.message || String(error) })
          }
        }
        const zhihuLoginPanel = () => React.createElement(
          "div",
          { className: "gzhUpload" },
          React.createElement(
            "div", { className: "gzhUploadBody" },
            React.createElement("strong", { className: "gzhSectionTitle" }, "知乎登录"),
            React.createElement("p", { className: "gzhHint" },
              zhihuLogin.message || (accountSaved
                ? "扫码一次长期有效：登录态保存在该账号独立的浏览器目录（accounts/" + activeAccountId + "/zhihu_profile）。"
                : "账号尚未保存：先点击右下角「保存」写入账号，再扫码登录。")),
            React.createElement(
              "div", { className: "gzhUploadActions" },
              React.createElement("button", {
                type: "button", className: "gzhButton",
                disabled: !accountSaved || zhihuLogin.status === "checking" || zhihuLogin.status === "logging",
                onClick: () => zhihuLoginAction("check"),
              }, zhihuLogin.status === "checking" ? "检查中…" : "检查登录态"),
              React.createElement("button", {
                type: "button", className: "gzhButton gzhButtonPrimary",
                disabled: !accountSaved || zhihuLogin.status === "checking" || zhihuLogin.status === "logging",
                onClick: () => zhihuLoginAction("login"),
              }, zhihuLogin.status === "logging" ? "等待扫码…" : "扫码登录知乎"),
            ),
          ),
        )

        const wechatLoginAction = async (action) => {
          if (wechatLogin.status === "checking" || wechatLogin.status === "logging") return
          setWechatLogin({
            status: action === "check" ? "checking" : "logging",
            message: action === "check"
              ? "正在启动浏览器检查公众号后台登录态…"
              : "已打开微信公众号登录窗口：请使用管理员或运营者微信扫码登录（最长等待 4 分钟），扫码成功后窗口自动关闭。",
          })
          try {
            const response = await fetch(WECHAT_LOGIN_ROUTE, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ account_id: activeAccountId, action }),
            })
            const result = await response.json().catch(() => ({}))
            if (!response.ok || result.error) throw new Error(result.error || "请求失败")
            setWechatLogin({
              status: "idle",
              message: result.logged_in
                ? (action === "check" ? "微信公众号后台登录态有效（已检测到后台 session token）" : "登录成功，登录态已持久化保存（可自动开启原创并保存草稿）")
                : (action === "check" ? "未登录：请点击「扫码登录微信公众号」" : "未检测到扫码成功，请重试"),
            })
          } catch (error) {
            setWechatLogin({ status: "idle", message: error?.message || String(error) })
          }
        }
        const wechatLoginPanel = () => React.createElement(
          "div",
          { className: "gzhUpload" },
          React.createElement(
            "div", { className: "gzhUploadBody" },
            React.createElement("strong", { className: "gzhSectionTitle" }, "微信公众平台登录态（免 API 发布与自动开启原创专用）"),
            React.createElement("p", { className: "gzhHint" },
              wechatLogin.message || (accountSaved
                ? "扫码一次长期有效：登录态保存在该账号独立的浏览器目录（accounts/" + activeAccountId + "/wechat_profile），用于免 API 模式下直接创建草稿，以及草稿生成后自动通过浏览器模拟打开草稿箱开启文字原创并保存草稿。"
                : "账号尚未保存：先点击右下角「保存」写入账号，再扫码登录。")),
            React.createElement(
              "div", { className: "gzhUploadActions" },
              React.createElement("button", {
                type: "button", className: "gzhButton",
                disabled: !accountSaved || wechatLogin.status === "checking" || wechatLogin.status === "logging",
                onClick: () => wechatLoginAction("check"),
              }, wechatLogin.status === "checking" ? "检查中…" : "检查登录态"),
              React.createElement("button", {
                type: "button", className: "gzhButton gzhButtonPrimary",
                disabled: !accountSaved || wechatLogin.status === "checking" || wechatLogin.status === "logging",
                onClick: () => wechatLoginAction("login"),
              }, wechatLogin.status === "logging" ? "等待扫码…" : "扫码登录微信公众号"),
            ),
          ),
        )

        const accountSelector = (label, value, onChange) => React.createElement(
          "label",
          { className: "gzhToolbar" },
          React.createElement("span", { className: "gzhSectionTitle" }, label),
          React.createElement(
            "select",
            { className: "gzhSelectSmall", value, onChange: (event) => onChange(event.target.value) },
            ...accountIds.map((id) => React.createElement("option", { key: id, value: id }, (accounts[id]?.name || id) + "（" + id + "）")),
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
              (providers[id]?.name || id) + "（优先级 " + String(providers[id]?.priority ?? 0) + "）",
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
              if (!profile) return null
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
                    React.createElement("span", { className: "gzhBadge" }, profile.platform === "zhihu" ? "知乎" : "公众号"),
                    profile.platform !== "zhihu" && React.createElement("span", { className: "gzhBadge", title: profile.publish_mode === "browser" ? "免 API 浏览器自动化模式" : "官方 API 接口模式" }, profile.publish_mode === "browser" ? "免 API" : "API 接口"),
                    profile.platform !== "zhihu" && (profile.content?.article_type === "newspic" ? React.createElement("span", { className: "gzhBadge" }, "小绿书") : (profile.content?.article_type === "both" || profile.content?.sync_newspic) ? React.createElement("span", { className: "gzhBadge" }, "双发") : null),
                    profile.auto_enable_original ? React.createElement("span", { className: "gzhBadge", title: "草稿创建后自动通过浏览器模拟打开草稿箱开启文字原创" }, "自动原创") : null,
                  ),
                  React.createElement("div", { className: "gzhAccountId" }, id),
                ),
                React.createElement(
                  "div", { className: "gzhAccountStatus" },
                  React.createElement(
                    "label",
                    {
                      className: "gzhAccountSwitch" + (!writable || saving ? " gzhAccountSwitchDisabled" : ""),
                      title: profile.enabled ? "点击停用该账号" : "点击启用该账号",
                      onClick: (event) => event.stopPropagation(),
                    },
                    React.createElement("input", {
                      type: "checkbox",
                      className: "gzhSwitch",
                      checked: Boolean(profile.enabled),
                      disabled: !writable || saving,
                      onChange: (event) => toggleAccount(id, event.target.checked),
                    }),
                    React.createElement(
                      "span",
                      { className: "gzhAccountSwitchLabel" + (profile.enabled ? " gzhAccountSwitchLabelActive" : "") },
                      profile.enabled ? "已启用" : "已停用",
                    ),
                  ),
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
            if (!profile) return null
            const selected = id === activeAccountId
            const content = profile.content || {}
            const isZhihu = profile.platform === "zhihu"
            const articleType = content.article_type || "news"
            const syncNewspic = content.sync_newspic === true
            const isBoth = articleType === "both" || syncNewspic
            let typeLabel = "长文"
            if (isZhihu) {
              typeLabel = "知乎专栏"
            } else if (articleType === "newspic") {
              typeLabel = "小绿书卡片"
            } else if (isBoth) {
              typeLabel = "长文+小绿书双发"
            }
            const themeName = (THEMES.find(([k]) => k === content.headline_theme)?.[1] || content.headline_theme || "文映学术").replace(/（.*）/, "")
            const coverRatioInfo = isZhihu ? "16:9" : `${content.headline_cover_ratio || "2.35:1"}/${content.secondary_cover_ratio || "1:1"}`
            const statusSummary = isZhihu
              ? `${typeLabel} · ${content.articles_per_day ?? 0} 篇/日 · 最低 ${content.min_words ?? 0} 字 · 封面 ${coverRatioInfo}`
              : articleType === "newspic"
                ? `${typeLabel} · ${content.newspic_articles_per_day ?? 1} 篇/日 · ${content.newspic_images_per_article ?? 4} 张卡片 · 比例 ${content.newspic_image_ratio ?? "3:4"}`
                : isBoth
                  ? `${typeLabel} · 长文 ${content.articles_per_day ?? 6} 篇 · 小绿书 ${content.newspic_articles_per_day ?? 1} 篇 · 主题 ${themeName} · 封面 ${coverRatioInfo}`
                  : `${typeLabel} · ${content.articles_per_day ?? 6} 篇/日 · 最低 ${content.min_words ?? 2000} 字 · 主题 ${themeName} · 封面 ${coverRatioInfo}`

            return React.createElement(
              "div", { key: id, className: "gzhConfigRow" + (selected && editingContentAccount ? " gzhConfigRowActive" : "") },
              React.createElement(
                "div", { className: "gzhConfigMain", role: "button", tabIndex: 0,
                  onClick: () => setSelectedAccountId(id),
                  onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") setSelectedAccountId(id) },
                },
                React.createElement("div", { className: "gzhConfigTitle" }, React.createElement("span", { className: "gzhConfigTitleText" }, profile.name || id)),
                React.createElement("div", { className: "gzhConfigMeta" }, id + " · " + (profile.platform === "zhihu" ? "知乎" : "公众号")),
              ),
              React.createElement("div", { className: "gzhConfigStatus" }, statusSummary),
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
            if (!provider) return null
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
                React.createElement(
                  "label",
                  {
                    className: "gzhAccountSwitch" + (!writable || saving ? " gzhAccountSwitchDisabled" : ""),
                    title: provider.enabled ? "点击停用该生图接口" : "点击启用该生图接口",
                    onClick: (event) => event.stopPropagation(),
                  },
                  React.createElement("input", {
                    type: "checkbox",
                    className: "gzhSwitch",
                    checked: Boolean(provider.enabled),
                    disabled: !writable || saving,
                    onChange: (event) => toggleProvider(id, event.target.checked),
                  }),
                  React.createElement(
                    "span",
                    { className: "gzhAccountSwitchLabel" + (provider.enabled ? " gzhAccountSwitchLabelActive" : "") },
                    provider.enabled ? "已启用" : "已停用",
                  ),
                ),
                React.createElement("span", { className: "gzhBadge" }, "优先级 " + String(provider.priority ?? 0)),
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

        const historyView = () => {
          const records = Array.isArray(historyData.records) ? historyData.records : []
          const keyword = historySearch.trim().toLowerCase()
          const filteredRecords = keyword
            ? records.map((rec) => {
                const matchedItems = (rec.items || []).filter((item) => (item.title || "").toLowerCase().includes(keyword))
                if (matchedItems.length > 0 || (rec.account_name || "").toLowerCase().includes(keyword) || (rec.author || "").toLowerCase().includes(keyword)) {
                  return { ...rec, items: matchedItems.length > 0 ? matchedItems : rec.items }
                }
                return null
              }).filter(Boolean)
            : records

          return React.createElement(
            "div",
            { className: "gzhPanel" },
            React.createElement(
              "div",
              { className: "gzhStatGrid" },
              React.createElement("div", { className: "gzhStatCard" },
                React.createElement("span", { className: "gzhStatNumber" }, String(historyData.total_batches ?? 0)),
                React.createElement("span", { className: "gzhStatLabel" }, "累计发布批次"),
              ),
              React.createElement("div", { className: "gzhStatCard" },
                React.createElement("span", { className: "gzhStatNumber" }, String(historyData.total_articles ?? 0)),
                React.createElement("span", { className: "gzhStatLabel" }, "历史文章总数"),
              ),
              React.createElement("div", { className: "gzhStatCard" },
                React.createElement("span", { className: "gzhStatNumber" }, String(historyData.gzh_articles ?? 0)),
                React.createElement("span", { className: "gzhStatLabel" }, "公众号长文/小绿书"),
              ),
              React.createElement("div", { className: "gzhStatCard" },
                React.createElement("span", { className: "gzhStatNumber" }, String(historyData.zhihu_articles ?? 0)),
                React.createElement("span", { className: "gzhStatLabel" }, "知乎专栏草稿"),
              ),
            ),
            React.createElement(
              "div",
              { className: "gzhHistoryToolbar" },
              React.createElement(
                "div",
                { className: "gzhHistoryToolbarLeft" },
                React.createElement(
                  "select",
                  {
                    className: "gzhSelectSmall",
                    value: historyAccountFilter,
                    onChange: (e) => setHistoryAccountFilter(e.target.value),
                  },
                  React.createElement("option", { value: "" }, "全部账号（" + String(accountIds.length) + " 个）"),
                  ...accountIds.map((id) => React.createElement("option", { key: id, value: id }, (accounts[id]?.name || id) + "（" + id + "）")),
                ),
                React.createElement("input", {
                  className: "gzhSearchInput",
                  placeholder: "按文章标题或账号搜索...",
                  value: historySearch,
                  onChange: (e) => setHistorySearch(e.target.value),
                }),
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "gzhButton",
                  disabled: historyLoading,
                  onClick: () => fetchHistory(historyAccountFilter),
                },
                historyLoading ? "加载中…" : "刷新记录",
              ),
            ),
            historyError ? React.createElement("p", { className: "gzhInvalid" }, "加载失败：" + historyError) : null,
            filteredRecords.length === 0 ? React.createElement(
              "div",
              { className: "gzhEmptyState" },
              React.createElement("div", { className: "gzhEmptyTitle" }, historyLoading ? "正在读取历史发表记录…" : (keyword ? "未搜索到匹配的历史文章" : "暂无历史发表文章")),
              React.createElement("p", { className: "gzhHint" }, keyword ? "请尝试更换关键词或清除搜索条件" : "已发布的公众号多图文草稿或知乎专栏文章将自动记录并归档在此处。"),
            ) : React.createElement(
              "div",
              { className: "gzhBatchList" },
              ...filteredRecords.map((batch) => {
                const isZhihu = batch.platform === "zhihu"
                const isPic = batch.article_type === "newspic"
                const platformLabel = isZhihu ? "知乎专栏" : (isPic ? "小绿书图片消息" : "公众号多图文")
                const items = Array.isArray(batch.items) ? batch.items : []
                return React.createElement(
                  "div",
                  { key: batch.id, className: "gzhBatchCard" },
                  React.createElement(
                    "div",
                    { className: "gzhBatchHeader" },
                    React.createElement(
                      "div",
                      { className: "gzhBatchHeaderLeft" },
                      React.createElement(
                        "div",
                        { className: "gzhBatchTitleRow" },
                        React.createElement("span", { className: "gzhBatchAccountName" }, batch.account_name || batch.account_id),
                        React.createElement("span", { className: "gzhBadge" }, platformLabel),
                        React.createElement("span", { className: "gzhBadge" }, String(batch.article_count || items.length) + " 篇"),
                        batch.author ? React.createElement("span", { className: "gzhBadge" }, "作者: " + batch.author) : null,
                      ),
                      React.createElement("span", { className: "gzhBatchTime" }, "发布时间：" + (batch.timestamp || "未知时间")),
                      batch.draft_media_id ? React.createElement("span", { className: "gzhBatchMediaId", title: batch.draft_media_id }, "草稿 Media ID: " + batch.draft_media_id) : null,
                    ),
                    React.createElement("span", { className: "gzhBadge" }, isZhihu ? "已同步至知乎" : "已同步至草稿箱"),
                  ),
                  React.createElement(
                    "div",
                    { className: "gzhBatchArticleList" },
                    ...items.map((item, idx) => {
                      const itemKey = batch.id + ":" + String(idx)
                      const isExpanded = Boolean(expandedDigests[itemKey])
                      return React.createElement(
                        "div",
                        { key: itemKey, className: "gzhArticleRow" },
                        React.createElement(
                          "div",
                          { className: "gzhArticleTop" },
                          React.createElement(
                            "div",
                            { className: "gzhArticleTitleWrap" },
                            React.createElement("span", { className: "gzhArticleSeq" }, String(item.index || idx + 1)),
                            React.createElement("span", { className: "gzhArticleTitleText" }, item.title),
                          ),
                          item.url ? React.createElement(
                            "a",
                            { className: "gzhArticleLink", href: item.url, target: "_blank", rel: "noreferrer" },
                            "查看知乎专栏 ↗",
                          ) : null,
                          item.digest ? React.createElement(
                            "button",
                            {
                              type: "button",
                              className: "gzhButton",
                              style: { padding: "2px 8px", fontSize: "11px" },
                              onClick: () => setExpandedDigests((curr) => ({ ...curr, [itemKey]: !isExpanded })),
                            },
                            isExpanded ? "收起摘要" : "查看摘要",
                          ) : null,
                        ),
                        isExpanded && item.digest ? React.createElement("p", { className: "gzhArticleDigest" }, item.digest) : null,
                      )
                    }),
                  ),
                )
              }),
            ),
          )
        }

        const buildExportPayload = (scope, includeSecrets) => {
          const partial = {}
          if (scope === "all" || scope === "accounts") {
            const accs = clone(value.accounts || {})
            for (const acc of Object.values(accs)) {
              if (!includeSecrets) acc.app_secret = ""
            }
            partial.accounts = accs
            partial.default_account = value.default_account
          }
          if (scope === "all" || scope === "image_providers") {
            const provs = clone(value.image_providers || {})
            for (const p of Object.values(provs)) {
              if (!includeSecrets) p.api_key = ""
            }
            partial.image_providers = provs
          }
          if (scope === "all" || scope === "visual_rules") {
            partial.typography = clone(value.typography || {})
            partial.image_api = clone(value.image_api || {})
            if (!includeSecrets && partial.image_api) partial.image_api.api_key = ""
          }
          if (scope === "all" || scope === "runtime") {
            partial.runtime = clone(value.runtime || {})
          }
          if (scope === "all") {
            partial.wechat = clone(value.wechat || {})
            if (!includeSecrets && partial.wechat) partial.wechat.app_secret = ""
            partial.content = clone(value.content || {})
            partial.brand_images = clone(value.brand_images || {})
          }
          return {
            $schema: "https://deepseek.com/schemas/dsh-social-publisher-config.json",
            meta: {
              version: "0.2.0",
              exported_at: new Date().toISOString(),
              plugin: "dsh-social-publisher",
              include_secrets: Boolean(includeSecrets),
              scope: scope,
              account_count: partial.accounts ? Object.keys(partial.accounts).length : undefined,
              provider_count: partial.image_providers ? Object.keys(partial.image_providers).length : undefined,
            },
            config: partial,
          }
        }

        const handleExportDownload = () => {
          const payload = buildExportPayload(exportScope, exportIncludeSecrets)
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" })
          const url = URL.createObjectURL(blob)
          const link = document.createElement("a")
          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
          link.href = url
          link.download = `dsh-social-publisher-config-${exportScope}-${dateStr}.json`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
        }

        const handleExportCopy = async () => {
          const payload = buildExportPayload(exportScope, exportIncludeSecrets)
          const jsonText = JSON.stringify(payload, null, 2)
          try {
            await navigator.clipboard.writeText(jsonText)
            setExportCopyStatus("已成功复制到剪贴板！")
            setTimeout(() => setExportCopyStatus(""), 3000)
          } catch {
            setExportCopyStatus("复制失败，请尝试下载文件")
          }
        }

        const validateConfigInput = (text) => {
          const trimmed = (text || "").trim()
          if (!trimmed) {
            setImportValidation(null)
            return
          }
          let parsed
          try {
            parsed = JSON.parse(trimmed)
          } catch (e) {
            setImportValidation({
              valid: false,
              errors: ["JSON 语法解析错误：" + (e?.message || String(e))],
              warnings: [],
            })
            return
          }
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            setImportValidation({
              valid: false,
              errors: ["导入的配置必须是有效的 JSON 键值对对象"],
              warnings: [],
            })
            return
          }
          const candidate = (parsed.meta && parsed.config && typeof parsed.config === "object") ? parsed.config : parsed
          const errors = []
          const warnings = []
          const accs = candidate.accounts && typeof candidate.accounts === "object" && !Array.isArray(candidate.accounts) ? candidate.accounts : null
          const provs = candidate.image_providers && typeof candidate.image_providers === "object" && !Array.isArray(candidate.image_providers) ? candidate.image_providers : null

          let gzhCount = 0
          let zhihuCount = 0
          let overlapCount = 0
          let newAccCount = 0
          if (accs) {
            for (const [id, acc] of Object.entries(accs)) {
              if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
                errors.push("账号 ID「" + id + "」包含不支持的非法字符（仅限字母、数字、下划线与连字符）")
              }
              if (acc?.platform === "zhihu") zhihuCount++
              else gzhCount++
              if (value.accounts && value.accounts[id]) overlapCount++
              else newAccCount++
            }
          }
          if (provs) {
            for (const [id] of Object.entries(provs)) {
              if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
                errors.push("生图接口 ID「" + id + "」包含不支持的非法字符")
              }
            }
          }
          const hasAny = Boolean(accs || provs || candidate.typography || candidate.image_api || candidate.runtime || candidate.content)
          if (!hasAny) {
            errors.push("未在数据中检测到有效配置项（如 accounts、image_providers、typography 等）")
          }

          setImportValidation({
            valid: errors.length === 0,
            errors,
            warnings,
            summary: {
              account_count: accs ? Object.keys(accs).length : 0,
              gzh_accounts: gzhCount,
              zhihu_accounts: zhihuCount,
              overlap_accounts: overlapCount,
              new_accounts: newAccCount,
              account_ids: accs ? Object.keys(accs) : [],
              provider_count: provs ? Object.keys(provs).length : 0,
              provider_ids: provs ? Object.keys(provs) : [],
              has_typography: Boolean(candidate.typography),
              has_image_api: Boolean(candidate.image_api),
              has_runtime: Boolean(candidate.runtime),
            },
            data: candidate,
            meta: parsed.meta || null,
          })
        }

        const handleImportFile = (file) => {
          if (!file) return
          setImportFileName(file.name)
          const sizeKb = (file.size / 1024).toFixed(1)
          setImportFileSize(sizeKb + " KB")
          setImportFeedback(null)
          const reader = new FileReader()
          reader.onload = (e) => {
            const content = String(e.target?.result || "")
            setImportText(content)
            validateConfigInput(content)
          }
          reader.readAsText(file, "utf-8")
        }

        const handleClearImport = () => {
          setImportText("")
          setImportFileName("")
          setImportFileSize("")
          setImportValidation(null)
          setImportFeedback(null)
        }

        const handleApplyImport = async () => {
          if (!importValidation || !importValidation.valid || !importValidation.data || importing) return
          setImporting(true)
          setImportFeedback(null)
          try {
            const importedData = importValidation.data
            const ops = []

            if (importMode === "overwrite") {
              if (importedData.accounts) ops.push({ op: "set", path: ["accounts"], value: importedData.accounts })
              if (importedData.default_account) ops.push({ op: "set", path: ["default_account"], value: importedData.default_account })
              if (importedData.image_providers) ops.push({ op: "set", path: ["image_providers"], value: importedData.image_providers })
              if (importedData.typography) ops.push({ op: "set", path: ["typography"], value: importedData.typography })
              if (importedData.image_api) ops.push({ op: "set", path: ["image_api"], value: importedData.image_api })
              if (importedData.runtime) ops.push({ op: "set", path: ["runtime"], value: importedData.runtime })
              if (importedData.wechat) ops.push({ op: "set", path: ["wechat"], value: importedData.wechat })
              if (importedData.content) ops.push({ op: "set", path: ["content"], value: importedData.content })
              if (importedData.brand_images) ops.push({ op: "set", path: ["brand_images"], value: importedData.brand_images })
            } else {
              // merge
              if (importedData.accounts) {
                const mergedAccs = clone(value.accounts || {})
                for (const [id, acc] of Object.entries(importedData.accounts)) {
                  const existing = mergedAccs[id]
                  if (existing) {
                    const preservedSecret = (acc.app_secret && acc.app_secret.trim()) ? acc.app_secret : existing.app_secret
                    mergedAccs[id] = {
                      ...existing,
                      ...clone(acc),
                      app_secret: preservedSecret,
                      content: { ...(existing.content || {}), ...(acc.content || {}) },
                      brand_images: {
                        header: { ...(existing.brand_images?.header || {}), ...(acc.brand_images?.header || {}) },
                        footer: { ...(existing.brand_images?.footer || {}), ...(acc.brand_images?.footer || {}) },
                      },
                    }
                  } else {
                    mergedAccs[id] = clone(acc)
                  }
                }
                ops.push({ op: "set", path: ["accounts"], value: mergedAccs })
                if (importedData.default_account && mergedAccs[importedData.default_account]) {
                  ops.push({ op: "set", path: ["default_account"], value: importedData.default_account })
                }
              }

              if (importedData.image_providers) {
                const mergedProvs = clone(value.image_providers || {})
                for (const [id, prov] of Object.entries(importedData.image_providers)) {
                  const existing = mergedProvs[id]
                  if (existing) {
                    const preservedKey = (prov.api_key && prov.api_key.trim()) ? prov.api_key : existing.api_key
                    mergedProvs[id] = { ...existing, ...clone(prov), api_key: preservedKey }
                  } else {
                    mergedProvs[id] = clone(prov)
                  }
                }
                ops.push({ op: "set", path: ["image_providers"], value: mergedProvs })
              }

              if (importedData.typography) {
                ops.push({ op: "set", path: ["typography"], value: { ...(value.typography || {}), ...importedData.typography } })
              }
              if (importedData.image_api) {
                const preservedKey = (importedData.image_api.api_key && importedData.image_api.api_key.trim()) ? importedData.image_api.api_key : value.image_api?.api_key
                ops.push({ op: "set", path: ["image_api"], value: { ...(value.image_api || {}), ...importedData.image_api, api_key: preservedKey || "" } })
              }
              if (importedData.runtime) {
                ops.push({ op: "set", path: ["runtime"], value: { ...(value.runtime || {}), ...importedData.runtime } })
              }
            }

            if (ops.length > 0) {
              await scope.mutate(ops)
            }

            // 同步调用后端导入 API 做持久化落盘确认
            fetch(CONFIG_IMPORT_ROUTE + "?mode=" + importMode, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(importedData),
            }).catch(() => null)

            setImportFeedback({
              type: "success",
              text: `配置已成功导入（${importMode === "merge" ? "增量合并" : "全量覆盖"}）！已同步至多平台账号与运行文件。`,
            })
          } catch (e) {
            setImportFeedback({
              type: "error",
              text: "导入应用失败：" + (e?.message || String(e)),
            })
          } finally {
            setImporting(false)
          }
        }

        const backupView = () => {
          const totalAccounts = accountIds.length
          const gzhAccountsCount = Object.values(accounts).filter((a) => a.platform !== "zhihu").length
          const zhihuAccountsCount = Object.values(accounts).filter((a) => a.platform === "zhihu").length
          const totalProvidersCount = providerIds.length
          const enabledProvidersCount = Object.values(providers).filter((p) => p.enabled).length

          const currentPayload = buildExportPayload(exportScope, exportIncludeSecrets)
          const payloadSizeKb = (new TextEncoder().encode(JSON.stringify(currentPayload)).length / 1024).toFixed(1)

          const uploadSvg = React.createElement(
            "svg",
            {
              width: 26,
              height: 26,
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.8,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              style: { color: "var(--dsw-alias-brand-primary)", opacity: 0.8 },
            },
            React.createElement("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
            React.createElement("polyline", { points: "17 8 12 3 7 8" }),
            React.createElement("line", { x1: "12", y1: "3", x2: "12", y2: "15" }),
          )

          const fileSvg = React.createElement(
            "svg",
            {
              width: 20,
              height: 20,
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.8,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              style: { color: "var(--dsw-alias-brand-primary)" },
            },
            React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
            React.createElement("polyline", { points: "14 2 14 8 20 8" }),
            React.createElement("line", { x1: "16", y1: "13", x2: "8", y2: "13" }),
            React.createElement("line", { x1: "16", y1: "17", x2: "8", y2: "17" }),
          )

          return React.createElement(
            "div",
            { className: "gzhPanel" },
            // 顶部标准工具栏与子页签
            React.createElement(
              "div",
              { className: "gzhSectionBar" },
              React.createElement(
                "div",
                { className: "gzhSectionBarBody" },
                React.createElement("h3", { className: "gzhSectionTitle" }, "配置备份与恢复"),
                React.createElement("p", { className: "gzhSectionHint" }, "支持按模块导出标准 JSON 备份包，以及带安全合规预检的增量配置恢复。"),
              ),
              React.createElement(
                "div",
                { className: "gzhSubTabs", style: { marginBottom: 0 } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "gzhSubTab" + (backupSubTab === "export" ? " gzhSubTabActive" : ""),
                    onClick: () => setBackupSubTab("export"),
                  },
                  "导出配置备份",
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "gzhSubTab" + (backupSubTab === "import" ? " gzhSubTabActive" : ""),
                    onClick: () => setBackupSubTab("import"),
                  },
                  "恢复与导入",
                ),
              ),
            ),

            // 导出面板
            backupSubTab === "export" ? React.createElement(
              "div",
              { className: "gzhSurface" },
              React.createElement(
                "div",
                { className: "gzhSurfaceHeader" },
                React.createElement(
                  "div",
                  { className: "gzhSurfaceHeaderBody" },
                  React.createElement("h3", { className: "gzhSectionTitle" }, "导出配置数据包"),
                  React.createElement("p", { className: "gzhSectionHint" }, "将社媒账号档案、AI 生图接口池、内容规则与正文排版打包导出为 JSON 文件。"),
                ),
              ),

              React.createElement(
                "div",
                { className: "gzhGrid" },
                React.createElement(
                  "div",
                  { className: "gzhField gzhFieldWide" },
                  React.createElement("label", { className: "gzhLabel" }, "导出范围选择"),
                  React.createElement(
                    "select",
                    {
                      className: "gzhSelect",
                      value: exportScope,
                      onChange: (e) => setExportScope(e.target.value),
                    },
                    ...EXPORT_SCOPE_OPTIONS.map(([val, label]) => React.createElement("option", { key: val, value: val }, label)),
                  ),
                ),
                React.createElement(
                  "div",
                  { className: "gzhField gzhFieldWide" },
                  React.createElement(
                    "div",
                    { className: "gzhSecurityCard" },
                    React.createElement(
                      "div",
                      { style: { display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 } },
                      React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "var(--dsw-alias-label-primary)" } }, "包含敏感凭据（AppSecret 与 API Key）"),
                      React.createElement(
                        "div",
                        { style: { fontSize: "12px", color: exportIncludeSecrets ? "var(--dsw-alias-label-warning)" : "var(--dsw-alias-label-tertiary)", lineHeight: 1.5 } },
                        exportIncludeSecrets
                          ? "包含明文密钥：导出的备份包将包含真实的 API Key 和密钥凭证，请妥善保管，切勿泄露至公开代码仓库。"
                          : "推荐安全脱敏：导出的 AppSecret 与 API Key 将被置空，便于安全分享或公开归档。",
                      ),
                    ),
                    React.createElement("input", {
                      type: "checkbox",
                      id: "gzh-export-secrets",
                      className: "gzhSwitch",
                      checked: exportIncludeSecrets,
                      onChange: (e) => setExportIncludeSecrets(e.target.checked),
                    }),
                  ),
                ),
              ),

              // 数据摘要条
              React.createElement(
                "div",
                { className: "gzhExportSummary" },
                React.createElement("span", { style: { fontWeight: 500 } }, "导出内容概览："),
                React.createElement("span", { className: "gzhBadge" }, `${totalAccounts} 个账号 (${gzhAccountsCount} 公众号 · ${zhihuAccountsCount} 知乎)`),
                React.createElement("span", { className: "gzhBadge" }, `${totalProvidersCount} 个生图接口 (${enabledProvidersCount} 启用)`),
                React.createElement("span", { className: "gzhBadge" }, "包含排版预设"),
                React.createElement("span", { style: { marginLeft: "auto", fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } }, `预计包大小约 ${payloadSizeKb} KB`),
              ),

              // 操作按钮栏
              React.createElement(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", paddingTop: "4px" } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "gzhButton gzhButtonPrimary",
                    onClick: handleExportDownload,
                  },
                  "下载配置备份 (.json)",
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "gzhButton",
                    onClick: handleExportCopy,
                  },
                  exportCopyStatus || "复制 JSON 文本",
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "gzhButton",
                    style: { marginLeft: "auto" },
                    onClick: () => setExportPreviewOpen((prev) => !prev),
                  },
                  exportPreviewOpen ? "收起 JSON 源码 ▴" : "查看 JSON 源码 ▾",
                ),
              ),

              // 代码预览
              exportPreviewOpen ? React.createElement(
                "pre",
                { className: "gzhCodePreview" },
                JSON.stringify(currentPayload, null, 2),
              ) : null,
            ) : null,

            // 导入面板
            backupSubTab === "import" ? React.createElement(
              "div",
              { className: "gzhSurface" },
              React.createElement(
                "div",
                { className: "gzhSurfaceHeader" },
                React.createElement(
                  "div",
                  { className: "gzhSurfaceHeaderBody" },
                  React.createElement("h3", { className: "gzhSectionTitle" }, "从备份恢复配置"),
                  React.createElement("p", { className: "gzhSectionHint" }, "支持从本地 JSON 文件或剪贴板文本恢复配置，系统在应用前自动执行合规性诊断。"),
                ),
              ),

              // 步骤 1：导入策略选择
              React.createElement(
                "div",
                { className: "gzhField" },
                React.createElement("label", { className: "gzhLabel" }, "1. 选择导入策略"),
                React.createElement(
                  "div",
                  { className: "gzhStrategyGrid" },
                  React.createElement(
                    "div",
                    {
                      className: "gzhStrategyCard" + (importMode === "merge" ? " gzhStrategyCardActive" : ""),
                      onClick: () => setImportMode("merge"),
                    },
                    React.createElement(
                      "div",
                      { className: "gzhStrategyTitleRow" },
                      React.createElement("span", { className: "gzhStrategyTitle" }, "增量合并"),
                      React.createElement("span", { className: "gzhBadge", style: { background: "color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent)", color: "var(--dsw-alias-brand-primary)" } }, "推荐"),
                    ),
                    React.createElement("p", { className: "gzhStrategyDesc" }, "保留现有账号与配置，智能追加新账号并更新同名配置。若备份中的密码为空，保留本地已有有效密钥。"),
                  ),
                  React.createElement(
                    "div",
                    {
                      className: "gzhStrategyCard" + (importMode === "overwrite" ? " gzhStrategyCardActive" : ""),
                      onClick: () => setImportMode("overwrite"),
                    },
                    React.createElement(
                      "div",
                      { className: "gzhStrategyTitleRow" },
                      React.createElement("span", { className: "gzhStrategyTitle" }, "全量覆盖"),
                      React.createElement("span", { className: "gzhBadge", style: { background: "color-mix(in srgb, var(--dsw-alias-label-warning) 15%, transparent)", color: "var(--dsw-alias-label-warning)" } }, "谨慎"),
                    ),
                    React.createElement("p", { className: "gzhStrategyDesc" }, "以备份数据为唯一基准完全重构配置。旧账号、旧生图接口将被整体替换，适用于全新设备初始化。"),
                  ),
                ),
              ),

              // 步骤 2：数据源录入
              React.createElement(
                "div",
                { className: "gzhField", style: { marginTop: "4px" } },
                React.createElement(
                  "div",
                  { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" } },
                  React.createElement("label", { className: "gzhLabel" }, "2. 提供备份数据"),
                  React.createElement(
                    "div",
                    { className: "gzhModeTabs" },
                    React.createElement("button", {
                      type: "button",
                      className: "gzhModeTab" + (importInputMethod === "file" ? " gzhModeTabActive" : ""),
                      onClick: () => setImportInputMethod("file"),
                    }, "本地文件上传"),
                    React.createElement("button", {
                      type: "button",
                      className: "gzhModeTab" + (importInputMethod === "text" ? " gzhModeTabActive" : ""),
                      onClick: () => setImportInputMethod("text"),
                    }, "粘贴 JSON 文本"),
                  ),
                ),

                importInputMethod === "file" ? (
                  importFileName ? React.createElement(
                    "div",
                    { className: "gzhFilePill" },
                    React.createElement(
                      "div",
                      { className: "gzhFilePillInfo" },
                      fileSvg,
                      React.createElement(
                        "div",
                        { style: { minWidth: 0 } },
                        React.createElement("div", { className: "gzhFileName", title: importFileName }, importFileName),
                        React.createElement("div", { className: "gzhFileSize" }, `${importFileSize || "文件已加载"} · 准备就绪`),
                      ),
                    ),
                    React.createElement(
                      "div",
                      { style: { display: "flex", gap: "6px" } },
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          className: "gzhButton",
                          style: { padding: "4px 10px", fontSize: "12px" },
                          onClick: () => {
                            const input = document.getElementById("gzh-import-file-input")
                            if (input) input.click()
                          },
                        },
                        "更换文件",
                      ),
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          className: "gzhButton",
                          style: { padding: "4px 10px", fontSize: "12px" },
                          onClick: handleClearImport,
                        },
                        "清除",
                      ),
                    ),
                  ) : React.createElement(
                    "div",
                    {
                      className: "gzhDropzone" + (importDragging ? " gzhDropzoneActive" : ""),
                      onDragOver: (e) => { e.preventDefault(); setImportDragging(true) },
                      onDragLeave: () => setImportDragging(false),
                      onDrop: (e) => {
                        e.preventDefault()
                        setImportDragging(false)
                        handleImportFile(e.dataTransfer?.files?.[0])
                      },
                      onClick: () => {
                        const input = document.getElementById("gzh-import-file-input")
                        if (input) input.click()
                      },
                    },
                    uploadSvg,
                    React.createElement("span", { className: "gzhDropzoneText" }, "点击选择文件，或将 .json 备份文件拖曳至此"),
                    React.createElement("span", { className: "gzhDropzoneSub" }, "支持由本插件导出的 JSON 配置文件，单文件大小不超过 5MB"),
                    React.createElement("input", {
                      id: "gzh-import-file-input",
                      type: "file",
                      accept: "application/json,.json",
                      hidden: true,
                      onChange: (e) => {
                        handleImportFile(e.target.files?.[0])
                        e.target.value = ""
                      },
                    }),
                  )
                ) : React.createElement(
                  "div",
                  { className: "gzhField" },
                  React.createElement("textarea", {
                    className: "gzhTextarea",
                    style: { minHeight: "120px", fontFamily: "ui-monospace,SFMono-Regular,Consolas,monospace", fontSize: "12px" },
                    placeholder: '{\n  "meta": { "version": "0.2.0" },\n  "config": { "accounts": { ... } }\n}',
                    value: importText,
                    onChange: (e) => {
                      setImportText(e.target.value)
                      validateConfigInput(e.target.value)
                    },
                  }),
                ),
              ),

              // 步骤 3：智能预检与诊断报告
              importValidation ? React.createElement(
                "div",
                { className: "gzhPreviewArea" },
                React.createElement(
                  "div",
                  { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" } },
                  React.createElement(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "6px" } },
                    React.createElement("strong", { style: { fontSize: "13px", color: importValidation.valid ? "var(--dsw-alias-label-success)" : "var(--dsw-alias-label-error)" } },
                      importValidation.valid ? "配置结构校验通过" : "配置数据未通过校验",
                    ),
                    importValidation.meta?.version ? React.createElement("span", { className: "gzhBadge" }, `备份版本 v${importValidation.meta.version}`) : null,
                  ),
                  importValidation.meta?.exported_at ? React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } },
                    "备份生成时间: " + importValidation.meta.exported_at.slice(0, 19).replace("T", " "),
                  ) : null,
                ),

                importValidation.summary ? React.createElement(
                  "div",
                  { className: "gzhPreviewSummaryGrid" },
                  React.createElement("div", { className: "gzhPreviewSummaryItem" },
                    React.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, "社媒账号:"),
                    React.createElement("strong", null, `${importValidation.summary.account_count} 个`),
                    React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } }, `(公众号 ${importValidation.summary.gzh_accounts} · 知乎 ${importValidation.summary.zhihu_accounts})`),
                  ),
                  React.createElement("div", { className: "gzhPreviewSummaryItem" },
                    React.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, "生图接口:"),
                    React.createElement("strong", null, `${importValidation.summary.provider_count} 个`),
                  ),
                  React.createElement("div", { className: "gzhPreviewSummaryItem" },
                    React.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, "排版预设:"),
                    React.createElement("span", null, importValidation.summary.has_typography ? "已包含" : "未包含"),
                  ),
                  React.createElement("div", { className: "gzhPreviewSummaryItem" },
                    React.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, "运行环境:"),
                    React.createElement("span", null, importValidation.summary.has_runtime ? "已包含" : "未包含"),
                  ),
                ) : null,

                importValidation.summary?.account_ids && importValidation.summary.account_ids.length > 0 ? React.createElement(
                  "div",
                  { style: { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" } },
                  React.createElement("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } }, "包含账号:"),
                  ...importValidation.summary.account_ids.map((id) => {
                    const acc = importValidation.data?.accounts?.[id]
                    const isZhihu = acc?.platform === "zhihu"
                    return React.createElement(
                      "span",
                      { key: id, className: "gzhBadge", title: `ID: ${id}` },
                      (acc?.name || id) + (isZhihu ? " · 知乎" : " · 公众号"),
                    )
                  }),
                ) : null,

                importMode === "merge" && importValidation.valid && importValidation.summary ? React.createElement(
                  "div",
                  { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-bg-layer-3)", padding: "8px 12px", borderRadius: "8px" } },
                  `提示：本次导入将更新 ${importValidation.summary.overlap_accounts} 个同名账号，并追加 ${importValidation.summary.new_accounts} 个全新账号；本地已存在的密码与 Secret 受到保护。`,
                ) : null,

                importValidation.errors && importValidation.errors.length > 0 ? React.createElement(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "4px" } },
                  ...importValidation.errors.map((err, i) => React.createElement("p", { key: i, className: "gzhInvalid", style: { margin: 0 } }, "• " + err)),
                ) : null,
              ) : null,

              // 反馈消息
              importFeedback ? React.createElement(
                "div",
                { className: importFeedback.type === "success" ? "gzhSuccessBox" : "gzhNoticeBox" },
                React.createElement("span", null, importFeedback.text),
              ) : null,

              // 步骤 4：确认按钮
              React.createElement(
                "div",
                { style: { paddingTop: "8px" } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "gzhButton gzhButtonPrimary",
                    disabled: !importValidation || !importValidation.valid || importing,
                    onClick: handleApplyImport,
                    style: { padding: "8px 20px", fontSize: "13px" },
                  },
                  importing ? "正在应用配置并同步落盘…" : (`确认导入并立即生效（${importMode === "merge" ? "增量合并" : "全量覆盖"}）`),
                ),
              ),
            ) : null,
          )
        }

        const tabContent = () => {
          try {
            if (activeTab === "配置备份" || activeTab === "备份" || activeTab === "导入导出") {
              return backupView()
            }
          if (activeTab === "发表记录") {
            return historyView()
          }
          if (activeTab === "账号管理" || activeTab === "公众号账号") {
            return React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div", { className: "gzhSectionBar" },
                React.createElement("div", { className: "gzhSectionBarBody" },
                  React.createElement("h3", { className: "gzhSectionTitle" }, "账号管理"),
                  React.createElement("p", { className: "gzhSectionHint" }, accountIds.length + " 个账号 · 默认账号置顶；公众号/知乎账号均支持保存后扫码登录。"),
                ),
                React.createElement(
                  "div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
                  React.createElement("button", { type: "button", className: "gzhButton", onClick: () => { setActiveTab("配置备份"); setBackupSubTab("export") } }, "备份与导入"),
                  React.createElement("button", { type: "button", className: "gzhButton gzhButtonPrimary", onClick: () => setAddingAccount((value) => !value) }, addingAccount ? "取消添加" : "添加账号"),
                ),
              ),
              accountList(),
              addingAccount ? React.createElement(
                "div", { className: "gzhSurface gzhSurfaceSoft" },
                React.createElement("div", { className: "gzhSurfaceHeader" }, React.createElement("div", { className: "gzhSurfaceHeaderBody" },
                  React.createElement("h3", { className: "gzhSectionTitle" }, "添加社媒账号"),
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
                  React.createElement("h3", { className: "gzhSectionTitle" }, "复制账号：" + (accounts[copyingAccountId]?.name || copyingAccountId)),
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
                    ...(activePlatform === "zhihu" ? [zhihuLoginPanel()] : [wechatLoginPanel()]),
                  )
                : null,
            )
          }

          if (activeTab === "内容规则") {
            const acc = accounts[activeAccountId]
            const isZhihuAcc = acc?.platform === "zhihu"
            const hRatio = String(currentValue(["accounts", activeAccountId, "content", "headline_cover_ratio"]) ?? "2.35:1")
            const sRatio = String(currentValue(["accounts", activeAccountId, "content", "secondary_cover_ratio"]) ?? "1:1")
            return React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div", { className: "gzhSectionBar" },
                React.createElement("div", { className: "gzhSectionBarBody" },
                  React.createElement("h3", { className: "gzhSectionTitle" }, "账号内容与排版规则（一号一配置）"),
                  React.createElement("p", { className: "gzhSectionHint" }, "深度融合发文形态、专属排版调性、AI 封面与配图比例、以及品牌头尾图，实现真正的一号一配置。"),
                ),
              ),
              contentList(),
              editingContentAccount && acc
                ? React.createElement(
                    "div", { className: "gzhSurface" },
                    React.createElement(
                      "div", { className: "gzhSurfaceHeader" },
                      React.createElement("div", { className: "gzhSurfaceHeaderBody" },
                        React.createElement("h3", { className: "gzhSectionTitle" }, `${acc.name || activeAccountId} · 专属内容与视觉规则`),
                        React.createElement("p", { className: "gzhSectionHint" }, `账号 ID：${activeAccountId} · 平台：${isZhihuAcc ? "知乎专栏" : "微信公众号"}`),
                      ),
                      React.createElement("button", { type: "button", className: "gzhButton", onClick: () => setEditingContentAccount(false) }, "收起"),
                    ),
                    React.createElement(
                      "div", { className: "gzhSubTabs" },
                      React.createElement("button", {
                        type: "button",
                        className: "gzhSubTab" + (contentSubTab === "basic" ? " gzhSubTabActive" : ""),
                        onClick: () => setContentSubTab("basic"),
                      }, "发文形态与篇数"),
                      React.createElement("button", {
                        type: "button",
                        className: "gzhSubTab" + (contentSubTab === "typography" ? " gzhSubTabActive" : ""),
                        onClick: () => setContentSubTab("typography"),
                      }, "正文排版（13px）"),
                      React.createElement("button", {
                        type: "button",
                        className: "gzhSubTab" + (contentSubTab === "image" ? " gzhSubTabActive" : ""),
                        onClick: () => setContentSubTab("image"),
                      }, "AI 封面与配图"),
                      React.createElement("button", {
                        type: "button",
                        className: "gzhSubTab" + (contentSubTab === "brand" ? " gzhSubTabActive" : ""),
                        onClick: () => setContentSubTab("brand"),
                      }, "品牌头尾图"),
                    ),
                    contentSubTab === "basic" ? React.createElement("div", { className: "gzhGrid" }, ...contentFields.map(fieldNode)) : null,
                    contentSubTab === "typography" ? (
                      isZhihuAcc ? React.createElement(
                        "div", { className: "gzhNoticeBox" },
                        "ℹ️ 知乎专栏账号：流水线自动输出标准 Markdown 纯文本及加粗关键词，无主题色板/引言卡/三列目录等公众号专有排版样式。",
                      ) : React.createElement("div", { className: "gzhGrid" }, ...accountTypographyFields.map(fieldNode))
                    ) : null,
                    contentSubTab === "image" ? (
                      isZhihuAcc ? React.createElement(
                        "div", { className: "gzhNoticeBox" },
                        "ℹ️ 知乎专栏封面比例机器固定统一为 16:9，系统自动适配生成。",
                      ) : React.createElement(
                        React.Fragment, null,
                        React.createElement("div", { className: "gzhNoticeBox" },
                          `当前封面尺寸：头条 ${hRatio}（${COVER_PIXELS[hRatio] || hRatio} px） · 次条 ${sRatio}（${COVER_PIXELS[sRatio] || sRatio} px）；该账号下次生图时按此比例生成。`,
                        ),
                        React.createElement("div", { className: "gzhGrid", style: { marginTop: "10px" } }, ...accountImageFields.map(fieldNode)),
                      )
                    ) : null,
                    contentSubTab === "brand" ? (
                      isZhihuAcc ? React.createElement(
                        "div", { className: "gzhNoticeBox" },
                        "ℹ️ 知乎专栏为 Markdown 纯文本形态，不插入公众号卡片式品牌头尾图。",
                      ) : React.createElement(
                        React.Fragment, null,
                        React.createElement(
                          "div", { className: "gzhSubTabs" },
                          React.createElement("button", {
                            type: "button",
                            className: "gzhSubTab" + (contentBrandSlot === "header" ? " gzhSubTabActive" : ""),
                            onClick: () => setContentBrandSlot("header"),
                          }, "头部品牌图（文章开头）"),
                          React.createElement("button", {
                            type: "button",
                            className: "gzhSubTab" + (contentBrandSlot === "footer" ? " gzhSubTabActive" : ""),
                            onClick: () => setContentBrandSlot("footer"),
                          }, "尾部品牌图（文章结尾）"),
                        ),
                        brandEditor(contentBrandSlot),
                        React.createElement("div", { className: "gzhGrid" }, ...brandFields(contentBrandSlot).map(fieldNode)),
                      )
                    ) : null,
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
                React.createElement(
                  "div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
                  React.createElement("button", { type: "button", className: "gzhButton", disabled: discoveringDsh, onClick: discoverDsh }, Icons.search(13), React.createElement("span", null, discoveringDsh ? "正在检索接口…" : "检测主 dsh 已有生图模型")),
                  React.createElement("button", { type: "button", className: "gzhButton gzhButtonPrimary", onClick: () => setAddingProvider((value) => !value) }, addingProvider ? "取消添加" : "添加接口"),
                ),
              ),
              dshModels.length > 0 || dshDiscoverMsg ? React.createElement(
                "div", { className: "gzhSurface gzhSurfaceSoft", style: { border: "1px solid var(--dsw-alias-brand-primary)" } },
                React.createElement("div", { className: "gzhSurfaceHeader" },
                  React.createElement("div", { className: "gzhSurfaceHeaderBody" },
                    React.createElement("h3", { className: "gzhSectionTitle" }, "主 dsh 发现的生图模型候选"),
                    React.createElement("p", { className: "gzhSectionHint" }, dshDiscoverMsg || ("共找到 " + dshModels.length + " 个匹配模型，可一键导入为插件生图接口：")),
                  ),
                  React.createElement("button", { type: "button", className: "gzhButton", onClick: () => { setDshModels([]); setDshDiscoverMsg("") } }, "关闭"),
                ),
                dshModels.length > 0 ? React.createElement(
                  "div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                  ...dshModels.map((m) => React.createElement(
                    "div", { key: m.provider + ":" + m.model_id, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "8px 12px", background: "var(--dsw-alias-bg-layer-3)", borderRadius: "8px", border: ".5px solid var(--dsw-alias-border-l2)" } },
                    React.createElement("div", { style: { minWidth: 0 } },
                      React.createElement("div", { style: { fontWeight: 600, fontSize: "13px" } }, m.model_name || m.model_id),
                      React.createElement("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" } }, "提供商：" + (m.provider_name || m.provider) + " · 模型 ID: " + m.model_id + (m.base_url ? " · " + m.base_url : "")),
                    ),
                    React.createElement("button", { type: "button", className: "gzhButton gzhButtonPrimary", onClick: () => importDshModel(m) }, "导入接口"),
                  ))
                ) : null,
              ) : null,
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
              React.createElement(
                "div",
                { className: "gzhSurface", style: { marginTop: "16px" } },
                React.createElement(
                  "div",
                  { className: "gzhSurfaceHeader" },
                  React.createElement(
                    "div",
                    { className: "gzhSurfaceHeaderBody" },
                    React.createElement("h3", { className: "gzhSectionTitle" }, "生图全局调度与保底"),
                    React.createElement("p", { className: "gzhSectionHint" }, "控制跨接口的并发请求速度与全部接口异常时的本地保底学术卡片兜底机制。各个账号的具体封面比例与配图数量请在「内容规则」中独立配置。"),
                  ),
                ),
                React.createElement("div", { className: "gzhGrid" }, ...globalImageFields.map(fieldNode)),
              ),
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
        } catch (tabErr) {
          console.error("[dsh-social-publisher] Tab content render error:", tabErr)
          return React.createElement(
            "div",
            { className: "gzhSurface", style: { border: "1px solid var(--dsw-alias-label-error)", padding: "16px" } },
            React.createElement("h3", { className: "gzhSectionTitle", style: { color: "var(--dsw-alias-label-error)" } }, "当前配置标签页渲染遇到异常"),
            React.createElement("p", { className: "gzhHint" }, String(tabErr?.message || tabErr)),
            React.createElement("button", {
              type: "button",
              className: "gzhButton",
              style: { marginTop: "10px" },
              onClick: () => setActiveTab("账号管理"),
            }, "返回账号管理"),
          )
        }
      }

      const TAB_ITEMS = [
        { id: "发表记录", label: "发表记录", icon: Icons.history },
        { id: "账号管理", label: "账号管理", icon: Icons.users },
        { id: "内容规则", label: "内容规则", icon: Icons.rules },
        { id: "生图接口", label: "生图接口", icon: Icons.image },
        { id: "运行设置", label: "运行设置", icon: Icons.settings },
        { id: "配置备份", label: "配置备份", icon: Icons.backup },
      ]
      const tabIds = TAB_ITEMS.map((t) => t.id)

      const gzhAccountsCount = Object.values(accounts).filter((a) => a.platform !== "zhihu").length
      const zhihuAccountsCount = Object.values(accounts).filter((a) => a.platform === "zhihu").length
      const providerCount = Object.keys(providers).length
      const isDryRun = Boolean(currentValue(["runtime", "dry_run"]))
      const configuredWorkspace = String(currentValue(["runtime", "project_root"]) ?? "").trim()
      const actualWorkspace = !configuredWorkspace || ["default", "plugin-default"].includes(configuredWorkspace.toLowerCase())
        ? PLUGIN_DEFAULT_WORKSPACE : configuredWorkspace
      const defaultAccountObj = accounts[defaultAccountId]
      const defaultAccountName = defaultAccountObj?.name || defaultAccountId || "无默认账号"

      React.useEffect(() => {
        if (mode !== "modal" || !onClose) return
        const onKeyDown = (e) => {
          if (e.key === "Escape") {
            if (!dirty || confirm("当前有未保存的修改，确定要关闭卡片吗？")) {
              onClose()
            }
          }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
      }, [mode, onClose, dirty])

      const cardHeader = React.createElement(
        "header",
        { className: "gzhCardHeader" },
        React.createElement(
          "div",
          { className: "gzhCardHeaderMain" },
          React.createElement(
            "div",
            { className: "gzhCardIcon" },
            Icons.feed(18),
          ),
          React.createElement(
            "div",
            { className: "gzhCardHeading" },
            React.createElement(
              "div",
              { className: "gzhCardTitleRow" },
              React.createElement("h3", { className: "gzhCardTitle" }, "社媒发布工作台"),
              React.createElement("span", { className: "gzhCardVersion" }, "v0.2.0"),
              dirty ? React.createElement("span", { className: "gzhDirtyTag" }, "未保存修改") : null,
            ),
            React.createElement("p", { className: "gzhCardDescription" }, "微信公众号与知乎专栏多账号管理、排版规范与自动化发布"),
          ),
        ),
        React.createElement(
          "div",
          { className: "gzhCardHeaderActions" },
          React.createElement(
            "div",
            { className: "gzhCardStatusCluster" },
            React.createElement("span", { className: "gzhCardStatusItem" }, "公众号 " + String(gzhAccountsCount)),
            React.createElement("span", { className: "gzhCardStatusItem" }, "知乎 " + String(zhihuAccountsCount)),
            React.createElement("span", { className: "gzhCardStatusItem" }, "生图 " + String(providerCount)),
            React.createElement(
              "span",
              { className: "gzhCardStatusItem" },
              React.createElement("span", { className: "gzhStatusDot " + (isDryRun ? "gzhStatusDotWarn" : "gzhStatusDotOn") }),
              isDryRun ? "演练测试" : "线上生产",
            ),
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "gzhButton",
              title: "刷新配置与发表记录",
              onClick: () => {
                setSnapshot(safeGetSnapshot(scope))
                if (activeTab === "发表记录") fetchHistory(historyAccountFilter)
              },
            },
            Icons.refresh(13),
            React.createElement("span", null, "刷新"),
          ),
          dirty ? React.createElement(
            "button",
            {
              type: "button",
              className: "gzhButton gzhButtonPrimary",
              disabled: invalid || saving || !writable,
              onClick: save,
            },
            saving ? "保存中…" : "保存修改",
          ) : null,
          onClose ? React.createElement(
            "button",
            {
              type: "button",
              className: "gzhCardCloseBtn",
              "aria-label": "关闭卡片",
              title: "关闭页面卡片",
              onClick: () => {
                if (!dirty || confirm("当前有未保存的修改，确定要关闭卡片吗？")) {
                  onClose()
                }
              },
            },
            Icons.close(14),
          ) : null,
        ),
      )

      const tabBar = React.createElement(
        "div",
        { className: "gzhTabs", role: "tablist", "aria-label": "社媒配置分类" },
        ...TAB_ITEMS.map((item, index) => {
          const isActive = item.id === activeTab ||
            (item.id === "账号管理" && activeTab === "公众号账号") ||
            (item.id === "运行设置" && activeTab === "运行") ||
            (item.id === "配置备份" && (activeTab === "备份" || activeTab === "导入导出"))
          return React.createElement(
            "button",
            {
              type: "button",
              role: "tab",
              id: "gzh-tab-" + String(index),
              className: "gzhTab" + (isActive ? " gzhTabActive" : ""),
              "aria-selected": isActive,
              "aria-controls": "gzh-panel-" + String(index),
              tabIndex: isActive ? 0 : -1,
              key: item.id,
              onClick: () => {
                setActiveTab(item.id)
                setEditingAccount(false)
                setEditingContentAccount(false)
                setEditingProvider(false)
                setAddingAccount(false)
                setAddingProvider(false)
                setCopyingAccountId("")
                setCopyDraft({ id: "", name: "" })
              },
            },
            item.icon(14),
            React.createElement("span", null, item.label),
          )
        }),
      )

      const tabPanel = React.createElement(
        "section",
        {
          className: "gzhPanel",
          role: "tabpanel",
          id: "gzh-panel-" + String(tabIds.indexOf(activeTab) >= 0 ? tabIds.indexOf(activeTab) : 0),
          "aria-labelledby": "gzh-tab-" + String(tabIds.indexOf(activeTab) >= 0 ? tabIds.indexOf(activeTab) : 0),
        },
        !["发表记录", "账号管理", "公众号账号", "内容规则", "生图接口", "配置备份"].includes(activeTab) ? React.createElement(
          "div",
          { className: "gzhPanelHeader" },
          React.createElement("h4", { className: "gzhSectionTitle" }, activeTab),
          React.createElement("p", { className: "gzhSectionHint" }, "全局运行时、浏览器路径与发布参数。"),
        ) : null,
        tabContent(),
      )

      const footer = React.createElement(
        "div",
        { className: "gzhFooter" },
        React.createElement(
          "div",
          { className: "gzhFooterStatus" },
          React.createElement(
            "span",
            { className: "gzhFooterTag" },
            Icons.folder(12),
            React.createElement("span", null, "工作区: " + actualWorkspace),
          ),
          React.createElement("span", { className: "gzhFooterTag" }, "默认账号: " + defaultAccountName),
          failed ? React.createElement("span", { className: "gzhFailed" }, "保存失败，请检查配置或稍后重试。") : null,
        ),
        dirty ? React.createElement("button", {
          type: "button", className: "gzhDiscard", disabled: !dirty || saving, onClick: discard,
        }, "放弃修改") : null,
        React.createElement("button", {
          type: "button", className: "gzhSave", disabled: !dirty || invalid || saving || !writable, onClick: save,
        }, saving ? "保存中…" : (dirty ? "保存修改" : "配置已保存")),
      )

      const isModal = mode === "modal"
      const containerClass = isModal ? "gzhCardModalContainer" : (mode === "card" ? "gzhCardEmbed" : "gzhCardPage")

      const cardElement = React.createElement(
        "div",
        { className: containerClass, onClick: (e) => e.stopPropagation() },
        cardHeader,
        React.createElement("div", { className: "gzhCardBody" }, tabBar, tabPanel),
        footer,
      )

      if (isModal) {
        return React.createElement(
          "div",
          {
            className: "gzhCardModalBackdrop",
            onClick: (e) => {
              if (e.target === e.currentTarget && onClose) {
                if (!dirty || confirm("当前有未保存的修改，确定要关闭卡片吗？")) {
                  onClose()
                }
              }
            },
          },
          cardElement,
        )
      }

      return cardElement
    }

    class GzhErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
      }

      static getDerivedStateFromError(error) {
        return { hasError: true, error }
      }

      componentDidCatch(error, errorInfo) {
        console.error("[dsh-social-publisher] Settings ErrorBoundary caught error:", error, errorInfo)
      }

      render() {
        if (this.state.hasError) {
          return React.createElement(
            "div",
            { className: "gzhCardPage", style: { padding: "24px", maxWidth: "900px", margin: "20px auto" } },
            React.createElement(
              "div",
              {
                className: "gzhSurface",
                style: {
                  border: "1px solid var(--dsw-alias-label-error)",
                  borderRadius: "12px",
                  padding: "20px",
                  background: "var(--dsw-alias-bg-layer-2)",
                },
              },
              React.createElement(
                "h3",
                { className: "gzhSectionTitle", style: { color: "var(--dsw-alias-label-error)", fontSize: "16px", marginBottom: "8px" } },
                "社媒发布卡片遇到异常",
              ),
              React.createElement(
                "p",
                { className: "gzhHint", style: { color: "var(--dsw-alias-label-secondary)", fontSize: "13px", lineHeight: "1.6" } },
                "插件卡片在渲染时发生了异常，已自动拦截保护以防止界面空白。您可以尝试重试恢复或刷新。",
              ),
              React.createElement(
                "pre",
                {
                  className: "gzhCodePreview",
                  style: { margin: "12px 0", maxHeight: "160px", color: "var(--dsw-alias-label-error)", fontSize: "12px" },
                },
                String(this.state.error?.stack || this.state.error?.message || this.state.error),
              ),
              React.createElement(
                "div",
                { style: { display: "flex", gap: "10px", marginTop: "12px" } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "gzhButton gzhButtonPrimary",
                    onClick: () => this.setState({ hasError: false, error: null }),
                  },
                  "重试恢复",
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "gzhButton",
                    onClick: () => { if (typeof window !== "undefined") window.location.reload() },
                  },
                  "刷新页面",
                ),
              ),
            ),
          )
        }
        return this.props.children
      }
    }

    function SafeGzhPublisherCard(props) {
      return React.createElement(GzhErrorBoundary, null, React.createElement(GzhPublisherCard, props))
    }

    const modalState = {
      open: false,
      listeners: new Set(),
      setOpen(val) {
        modalState.open = val
        modalState.listeners.forEach((fn) => {
          try { fn(val) } catch {}
        })
      },
      subscribe(fn) {
        modalState.listeners.add(fn)
        return () => modalState.listeners.delete(fn)
      },
    }

    if (typeof window !== "undefined") {
      window.__openSocialPublisher = () => modalState.setOpen(true)
      window.__closeSocialPublisher = () => modalState.setOpen(false)
      window.addEventListener("dsh:open-social-publisher", () => modalState.setOpen(true))
    }

    function SidebarFooterButton() {
      const [open, setOpen] = React.useState(modalState.open)
      React.useEffect(() => modalState.subscribe(setOpen), [])

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "button",
          {
            type: "button",
            className: "gzhSidebarFooterBtn" + (open ? " gzhSidebarFooterBtnActive" : ""),
            onClick: () => modalState.setOpen(!open),
            title: "打开社媒发布工作台卡片",
          },
          Icons.feed(14),
          React.createElement("span", { className: "gzhSidebarFooterLabel" }, "社媒发布"),
          React.createElement("span", { className: "gzhStatusDot gzhStatusDotOn" }),
        ),
        open ? React.createElement(SafeGzhPublisherCard, {
          mode: "modal",
          onClose: () => modalState.setOpen(false),
        }) : null,
      )
    }

    function SessionHeaderButton() {
      const [open, setOpen] = React.useState(modalState.open)
      React.useEffect(() => modalState.subscribe(setOpen), [])

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "button",
          {
            type: "button",
            className: "gzhSessionHeaderBtn" + (open ? " gzhSessionHeaderBtnActive" : ""),
            onClick: () => modalState.setOpen(true),
            title: "打开社媒发布工作台卡片",
          },
          Icons.feed(13),
          React.createElement("span", null, "社媒发布"),
        ),
        open ? React.createElement(SafeGzhPublisherCard, {
          mode: "modal",
          onClose: () => modalState.setOpen(false),
        }) : null,
      )
    }

    function summaryText() {
      const snap = safeGetSnapshot(scope)
      const val = normalizeValue(snap?.value ?? {})
      const accCount = Object.keys(val.accounts || {}).length
      const provCount = Object.keys(val.image_providers || {}).length
      return `社媒自动化发布工作台（${accCount} 个账号，${provCount} 个生图接口）`
    }

    if (ctx && ctx.slots) {
      // 1. 侧栏底部独立卡片入口（sidebar.footer.action）
      try {
        ctx.slots.inject("sidebar.footer.action", () =>
          ctx.slots.register(
            {
              name: "sidebar.footer.action",
              id: "social-publisher-footer",
              order: 15,
              label: () => "社媒发布",
            },
            SidebarFooterButton,
          )
        )
      } catch (err) {
        console.warn("[dsh-social-publisher] Failed to register sidebar.footer.action:", err)
      }

      // 2. 会话顶部快捷入口（conversation.session.header.actions）
      try {
        ctx.slots.inject("conversation.session.header.actions", () =>
          ctx.slots.register(
            {
              name: "conversation.session.header.actions",
              id: "social-publisher-header",
              order: 25,
              label: () => "社媒发布",
            },
            SessionHeaderButton,
          )
        )
      } catch (err) {
        console.warn("[dsh-social-publisher] Failed to register conversation.session.header.actions:", err)
      }

      // 3. 插件页独立行配置页面卡片（plugins.row.config）
      try {
        const configRowHandler = (slotProps) => {
          if (slotProps && slotProps.view === "summary") {
            return summaryText()
          }
          return React.createElement(SafeGzhPublisherCard, { mode: "page" })
        }

        ctx.slots.inject("plugins.row.config", () => [
          ctx.slots.register({ name: "plugins.row.config", key: "dsh-social-publisher#social-publisher" }, configRowHandler),
          ctx.slots.register({ name: "plugins.row.config", key: "dsh-social-publisher#social-publisher-dev" }, configRowHandler),
          ctx.slots.register({ name: "plugins.row.config", key: "file:///D:/666/gzh/dsh-plugin/src/index.ts#social-publisher-dev" }, configRowHandler),
          ctx.slots.register({ name: "plugins.row.config", key: "dsh-social-publisher" }, configRowHandler),
        ])
      } catch (err) {
        console.warn("[dsh-social-publisher] Failed to register plugins.row.config:", err)
      }

      // 4. 设置页插件项卡片（settings.plugin.item）
      try {
        ctx.slots.inject("settings.plugin.item", () =>
          ctx.slots.register(
            {
              name: "settings.plugin.item",
              key: "social-publisher",
              id: "dsh-social-publisher",
              order: 20,
              inject: () => ({}),
            },
            (props) => React.createElement(SafeGzhPublisherCard, { ...props, mode: "card" }),
          )
        )
      } catch (err) {
        console.warn("[dsh-social-publisher] Failed to register settings.plugin.item:", err)
      }
    }
    }

    return {
      name: "dsh-social-publisher",
      inject: ["slots", "settingsScope"],
      apply,
    }
  },
})
