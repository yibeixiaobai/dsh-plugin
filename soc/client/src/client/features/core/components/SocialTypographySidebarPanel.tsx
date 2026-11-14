import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'
import {
  Palette,
  Search,
  Plus,
  Check,
  ChevronDown,
  RotateCw,
  RefreshCw,
  MapPin,
  X,
  ArrowDownToLine,
} from 'lucide-react'
import { WECHAT_COMPONENT_TEMPLATES } from '../wechat-canvas/wechatComponentLibrary.js'
import {
  getRecommendedTemplates,
  recordRecentTemplateId,
} from '../wechat-canvas/wechatRecommendationManager.js'
import { SocialTypographyDropdownMenu } from './SocialTypographyDropdownMenu.js'
import type {
  ComponentTemplateItem,
  ComponentMainCategory,
  WechatSectionNode,
} from '../wechat-canvas/wechatCanvasTypes.js'
import css from './SocialTypographySidebarPanel.module.css'

/**
 * 将模板生成的原始微信 HTML 适度收敛外边距与最大宽度，用于侧栏小卡片中的高保真紧凑居中呈现
 */
function sanitizeForPreview(rawHtml?: string): string {
  if (!rawHtml) return ''
  return rawHtml
    .replace(/margin:\s*(?:1[6-9]|2\d|3\d)px\s+0(?:\s+(?:1[6-9]|2\d|3\d)px)?/gi, 'margin:4px 0')
    .replace(/margin:\s*(?:1[6-9]|2\d|3\d)px\s+auto/gi, 'margin:4px auto')
}

export interface SocialTypographySidebarPanelProps {
  /** Optional theme key override. */
  readonly currentTheme?: string
}

/**
 * Left sidebar typography template library panel (64 curated components).
 * Supports category filtering, search, intelligent recommendation,
 * theme switching, and lossless in-place replace, below-insert, or gap anchor insert.
 *
 * @param props - Optional panel configuration.
 * @returns Rendered typography library panel.
 */
export function SocialTypographySidebarPanel({
  currentTheme = 'wenying',
}: SocialTypographySidebarPanelProps): ReactNode {
  // 1. 一级大类与二级细分类状态
  const [activeMainCategory, setActiveMainCategory] = useState<ComponentMainCategory>('recommend')
  const [activeSubCategory, setActiveSubCategory] = useState<string>('all')

  // 2. 主题色
  const [currentThemeKey, setCurrentThemeKey] = useState<string>(currentTheme)

  // 3. 搜索与换一换
  const [searchQuery, setSearchQuery] = useState('')
  const [shuffleSeed, setShuffleSeed] = useState(0)

  // 4. 当前画纸中选中的容器节点（通过 CustomEvent 广播全局监听）
  const [activeSelectedNode, setActiveSelectedNode] = useState<WechatSectionNode | null>(null)

  // 5. 当前画纸激活的插入缝隙索引 (0..N，通过 CustomEvent 广播全局监听)
  const [insertAnchorIndex, setInsertAnchorIndex] = useState<number | null>(null)

  // 6. 瞬时插入动效标记
  const [recentlyInsertedId, setRecentlyInsertedId] = useState<string | null>(null)

  // 7. 下拉浮层状态
  const [dropdownMode, setDropdownMode] = useState<'subCategory' | 'themePicker' | null>(null)

  // 监听画纸广播的选中容器变动事件
  useEffect(() => {
    function handleSelectedNodeChange(e: Event): void {
      const detail = (e as CustomEvent<{ selectedNode: WechatSectionNode | null }>).detail
      setActiveSelectedNode(detail?.selectedNode || null)
    }
    window.addEventListener('wincode:wechat-canvas-selected-node-changed', handleSelectedNodeChange)
    return () => {
      window.removeEventListener('wincode:wechat-canvas-selected-node-changed', handleSelectedNodeChange)
    }
  }, [])

  // 监听画纸广播的插入位置锚点事件
  useEffect(() => {
    function handleAnchorChange(e: Event): void {
      const detail = (e as CustomEvent<{ targetIndex?: number | null }>).detail
      setInsertAnchorIndex(detail?.targetIndex ?? null)
    }
    window.addEventListener('wincode:wechat-canvas-set-insert-anchor', handleAnchorChange)
    return () => {
      window.removeEventListener('wincode:wechat-canvas-set-insert-anchor', handleAnchorChange)
    }
  }, [])

  const handleCancelAnchor = useCallback((): void => {
    setInsertAnchorIndex(null)
    window.dispatchEvent(
      new CustomEvent('wincode:wechat-canvas-set-insert-anchor', {
        detail: { targetIndex: null },
      }),
    )
  }, [])

  // 一级分类元数据定义
  const mainCategories: { id: ComponentMainCategory; label: string }[] = [
    { id: 'recommend', label: '推荐' },
    { id: 'hot', label: '热门' },
    { id: 'heading', label: '标题' },
    { id: 'card', label: '卡片' },
    { id: 'image', label: '图片' },
    { id: 'component', label: '组件' },
    { id: 'layout', label: '布局' },
    { id: 'all', label: '全部' },
  ]

  const activeMainLabel = mainCategories.find(c => c.id === activeMainCategory)?.label || '全部'

  const handleSelectMainCategory = (cat: ComponentMainCategory): void => {
    setActiveMainCategory(cat)
    setActiveSubCategory('all')
    setDropdownMode(null)
  }

  const handleShuffle = (): void => {
    setShuffleSeed(prev => prev + 1)
  }

  // 过滤展示的模板列表
  const displayedTemplates = useMemo(() => {
    let list: ComponentTemplateItem[] = []

    if (activeMainCategory === 'recommend') {
      list = getRecommendedTemplates(activeSelectedNode)
    } else if (activeMainCategory === 'hot') {
      list = WECHAT_COMPONENT_TEMPLATES.filter((tpl) => {
        if (activeSubCategory === '节日专属') {
          return tpl.mainCategory === 'festival' || (tpl.badge || '').includes('节')
        }
        if (activeSubCategory === '爆款金句') {
          return tpl.mainCategory === 'card' && (tpl.badge?.includes('金句') || tpl.title.includes('名言'))
        }
        if (activeSubCategory === '吸睛大标题') {
          return tpl.mainCategory === 'heading'
        }
        if (activeSubCategory === '引导关注') {
          return tpl.badge?.includes('关注') || tpl.title.includes('关注')
        }
        return Boolean(tpl.badge) || tpl.id.startsWith('title_')
      })
    } else {
      list = WECHAT_COMPONENT_TEMPLATES.filter((tpl) => {
        if (activeMainCategory !== 'all' && tpl.mainCategory && tpl.mainCategory !== activeMainCategory) {
          if (activeMainCategory === 'component' && (tpl.badge?.includes('关注') || tpl.title.includes('关注'))) {
            return true
          }
          return false
        }
        if (activeSubCategory && activeSubCategory !== 'all') {
          if (activeSubCategory.includes('底色') && !tpl.title.includes('底色') && !tpl.desc?.includes('底色')) return false
          if (activeSubCategory.includes('线框') && !tpl.title.includes('线框') && !tpl.desc?.includes('线框')) return false
          if (activeSubCategory.includes('图标') && !tpl.title.includes('徽标') && !tpl.title.includes('符号')) return false
          if (activeSubCategory.includes('序号') && !tpl.title.includes('编号') && !tpl.title.includes('数字')) return false
        }
        return true
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.desc?.toLowerCase().includes(q) || t.badge?.toLowerCase().includes(q))
    }

    if (shuffleSeed > 0) {
      list = [...list].sort(() => 0.5 - Math.random())
    }

    return list
  }, [activeMainCategory, activeSubCategory, activeSelectedNode, searchQuery, shuffleSeed])

  // 应用组件模板：根据是否有锚点模式、选中节点与指定操作模式进行高精度分流
  const handleApplyTemplate = useCallback((
    tpl: ComponentTemplateItem,
    actionOverride?: 'replace' | 'insert_below' | 'insert',
  ): void => {
    recordRecentTemplateId(tpl.id)
    const newNode = tpl.createNode(currentThemeKey)

    let mode: 'replace' | 'insert' | 'insert_below' = 'insert'
    let targetIndex: number | undefined
    let targetNodeId: string | undefined

    if (actionOverride) {
      mode = actionOverride
      if (actionOverride === 'replace' || actionOverride === 'insert_below') {
        targetNodeId = activeSelectedNode?.id
      }
    } else if (insertAnchorIndex !== null) {
      mode = 'insert'
      targetIndex = insertAnchorIndex
    } else if (activeSelectedNode) {
      mode = 'replace'
      targetNodeId = activeSelectedNode.id
    } else {
      mode = 'insert'
    }

    window.dispatchEvent(
      new CustomEvent('wincode:wechat-canvas-apply-template', {
        detail: {
          mode,
          targetNodeId,
          targetIndex,
          templateId: tpl.id,
          template: tpl,
          node: newNode,
          title: tpl.title,
        },
      }),
    )

    // 若处于缝隙锚点模式，插入完成后自动清除侧栏锚点记录
    if (insertAnchorIndex !== null) {
      setInsertAnchorIndex(null)
    }

    setRecentlyInsertedId(tpl.id)
    setTimeout(() => {
      setRecentlyInsertedId(curr => (curr === tpl.id ? null : curr))
    }, 1200)
  }, [activeSelectedNode, insertAnchorIndex, currentThemeKey])

  return (
    <div className={css.panelRoot}>
      {/* 1. 一级大类 Tab 栏与主题色胶囊 */}
      <div className={css.headerRow}>
        <div className={css.tabsScroll}>
          {mainCategories.map((cat) => {
            const isActive = activeMainCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectMainCategory(cat.id)}
                className={`${css.tabBtn} ${isActive ? css.tabBtnActive : ''}`}
              >
                <span>{cat.label}</span>
                {isActive && cat.id !== 'recommend' && (
                  <ChevronDown
                    className={css.tabChevron}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDropdownMode(prev => (prev === 'subCategory' ? null : 'subCategory'))
                    }}
                  />
                )}
                {isActive && <span className={css.tabIndicator} />}
              </button>
            )
          })}
        </div>

        {/* 右侧主题色调色胶囊 */}
        <button
          type="button"
          onClick={() => setDropdownMode(prev => (prev === 'themePicker' ? null : 'themePicker'))}
          title="切换画纸主题色"
          className={css.themeCapsuleBtn}
        >
          <div className={css.themeColorCircle}>
            <Palette className={css.themePaletteIcon} />
          </div>
          <span className={css.themeLabel}>主题色</span>
        </button>

        {dropdownMode && (
          <SocialTypographyDropdownMenu
            mode={dropdownMode}
            activeMainCategory={activeMainCategory}
            activeSubCategory={activeSubCategory}
            activeThemeKey={currentThemeKey}
            onSelectSubCategory={sub => setActiveSubCategory(sub)}
            onSelectTheme={theme => setCurrentThemeKey(theme)}
            onClose={() => setDropdownMode(null)}
          />
        )}
      </div>

      {/* 2. 状态提示条：缝隙锚点指示 vs 选中容器指引 vs 推荐分类说明 */}
      {insertAnchorIndex !== null ? (
        <div className={css.statusBarAnchor}>
          <div className={css.anchorStatusInfo}>
            <MapPin className={css.anchorPinIcon} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              目标：{insertAnchorIndex === 0 ? '正文开头' : `第 ${insertAnchorIndex} 节下方`} · 点击组件直插
            </span>
          </div>
          <button
            type="button"
            className={css.cancelAnchorBtn}
            onClick={handleCancelAnchor}
            title="退出缝隙插入锚点模式"
          >
            <X style={{ width: '10px', height: '10px' }} />
            <span>取消</span>
          </button>
        </div>
      ) : activeSelectedNode ? (
        <div className={css.statusBarReplace}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            选中【{activeSelectedNode.label}】：卡片悬浮可选无损换装或向下插入
          </span>
          <span className={css.badgePill}>
            换装 / 下插
          </span>
        </div>
      ) : activeMainCategory === 'recommend' ? (
        <div className={css.statusBarRecommend}>
          <span>推荐：常用爆款与最近使用（最多10款）</span>
        </div>
      ) : null}

      {/* 3. 快捷搜索与换一换辅助工具栏 */}
      <div className={css.searchBar}>
        <div className={css.searchInputWrap}>
          <Search className={css.searchIcon} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`在 '${activeMainLabel}' 内搜索...`}
            className={css.searchInput}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={css.searchClearBtn}
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleShuffle}
          title="换一批推荐组件"
          className={css.shuffleBtn}
        >
          <RotateCw style={{ width: '12px', height: '12px' }} />
          <span>换一换</span>
        </button>
      </div>

      {/* 4. 纯净视觉所见即所得画板流 */}
      <div className={css.templatesStream}>
        {displayedTemplates.length === 0 ? (
          <div className={css.emptyPrompt}>
            未找到匹配的版式组件
          </div>
        ) : (
          displayedTemplates.map((tpl) => {
            const isJustApplied = recentlyInsertedId === tpl.id
            const previewHtml = sanitizeForPreview(tpl.createNode(currentThemeKey).rawHtml)
            const hasAnchor = insertAnchorIndex !== null
            const hasSelectedNode = Boolean(activeSelectedNode) && !hasAnchor

            return (
              <div
                key={tpl.id}
                onClick={() => {
                  if (hasAnchor) {
                    handleApplyTemplate(tpl)
                  } else if (hasSelectedNode) {
                    handleApplyTemplate(tpl, 'replace')
                  } else {
                    handleApplyTemplate(tpl, 'insert')
                  }
                }}
                title={
                  hasAnchor
                    ? `点击直接插入到第 ${insertAnchorIndex === 0 ? '开头' : `${insertAnchorIndex} 节下方`}`
                    : hasSelectedNode
                      ? `点击无损换装【${activeSelectedNode?.label}】，或悬浮点击右上角【下插】`
                      : `${tpl.title} · 点击插入画纸末尾`
                }
                className={`${css.templateCard} ${
                  isJustApplied
                    ? css.templateCardApplied
                    : hasAnchor
                      ? css.templateCardAnchor
                      : hasSelectedNode
                        ? css.templateCardReplace
                        : ''
                }`}
              >
                {/* 真实 HTML / SVG 视觉效果渲染区 */}
                <div
                  className={css.templatePreviewContent}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />

                {/* 悬浮操作徽标：根据模式展示对应快捷动作 */}
                {hasAnchor ? (
                  <div className={`${css.cardHoverBadge} ${css.cardHoverBadgeAnchor}`}>
                    <MapPin style={{ width: '10px', height: '10px' }} />
                    <span>插入此位置</span>
                  </div>
                ) : hasSelectedNode ? (
                  <div className={css.cardActionGroup}>
                    <button
                      type="button"
                      className={`${css.cardActionBtn} ${css.cardActionBtnReplace}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleApplyTemplate(tpl, 'replace')
                      }}
                      title="保留当前文字/图片，仅换用此样式"
                    >
                      <RefreshCw style={{ width: '10px', height: '10px' }} />
                      <span>换装</span>
                    </button>
                    <button
                      type="button"
                      className={`${css.cardActionBtn} ${css.cardActionBtnInsertBelow}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleApplyTemplate(tpl, 'insert_below')
                      }}
                      title="在当前选中段落下方插入此新组件"
                    >
                      <ArrowDownToLine style={{ width: '10px', height: '10px' }} />
                      <span>下插</span>
                    </button>
                  </div>
                ) : (
                  <div className={`${css.cardHoverBadge} ${css.cardHoverBadgeInsert}`}>
                    <Plus style={{ width: '10px', height: '10px' }} />
                    <span>插入</span>
                  </div>
                )}

                {/* 操作成功的瞬时绿色指示 */}
                {isJustApplied && (
                  <div className={css.appliedSuccessOverlay}>
                    <span className={css.appliedSuccessPill}>
                      <Check style={{ width: '14px', height: '14px' }} />
                      <span>
                        {hasAnchor
                          ? '已插入指定位置'
                          : hasSelectedNode
                            ? '已就绪'
                            : '已插入画纸'}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
