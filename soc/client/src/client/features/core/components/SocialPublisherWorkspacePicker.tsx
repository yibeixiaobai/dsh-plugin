import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { Folder, FolderPlus, House, Cloud, Search, ChevronDown, Check } from 'lucide-react'
import { useWinCodeIntl } from '../../../compat/i18n/IntlProvider.js'
import { useTabStore } from '../../../compat/store/TabStoreProvider.js'
import { isWorkspaceTab, type WorkspaceTabState } from '../../../compat/store/tabStore.js'
import { useSelectDirectory } from '../../../compat/hooks/usePlatform.js'
import css from '../SocialPublisherComposerCard.module.css'

export interface SocialPublisherWorkspacePickerProps {
  currentWorkspacePath?: string
  onSelectWorkspacePath: (path: string) => void
  disabled?: boolean
}

function getPathBaseName(pathStr?: string): string {
  if (!pathStr) return ''
  const normalized = pathStr.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized
}

function isHomePath(pathStr: string): boolean {
  const normalized = pathStr.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\/Users\/[^/]+)$/.test(normalized)
}

export const SocialPublisherWorkspacePicker = memo(function SocialPublisherWorkspacePicker({
  currentWorkspacePath,
  onSelectWorkspacePath,
  disabled = false,
}: SocialPublisherWorkspacePickerProps) {
  const { intl } = useWinCodeIntl()
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selectDirectory = useSelectDirectory()

  // 点击外部自动关闭浮层
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // 按 Escape 键自动关闭浮层
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // 从 tabStore 获取所有已打开的工作区项目（安全空值防御）
  const rawTabs = useTabStore((state: any) => state?.tabs)
  const tabs = Array.isArray(rawTabs) ? rawTabs : []
  const openWorkspaceTabs = useMemo(() => {
    const list: WorkspaceTabState[] = []
    const seen = new Set<string>()
    for (const tab of tabs) {
      if (isWorkspaceTab(tab) && tab.workspacePath) {
        const key = tab.workspaceIdentity?.trim() || tab.workspacePath
        if (!seen.has(key)) {
          seen.add(key)
          list.push(tab)
        }
      }
    }
    if (list.length === 0 && currentWorkspacePath) {
      list.push({
        id: 'current-workspace',
        workspacePath: currentWorkspacePath,
        workspaceIdentity: currentWorkspacePath,
      })
    }
    return list
  }, [tabs, currentWorkspacePath])

  // 根据搜索词过滤
  const filteredTabs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return openWorkspaceTabs
    return openWorkspaceTabs.filter((tab) => {
      const name = getPathBaseName(tab.workspacePath).toLowerCase()
      return name.includes(q) || tab.workspacePath.toLowerCase().includes(q)
    })
  }, [openWorkspaceTabs, searchQuery])

  const currentWorkspaceName = useMemo(() => {
    if (!currentWorkspacePath) return ''
    return getPathBaseName(currentWorkspacePath)
  }, [currentWorkspacePath])

  const isCurrentHome = currentWorkspacePath ? isHomePath(currentWorkspacePath) : false
  const TriggerIcon = isCurrentHome ? House : Folder

  const handleOpenFolder = async () => {
    try {
      const selected = await selectDirectory()
      if (selected && typeof selected === 'string') {
        onSelectWorkspacePath(selected)
      }
    } catch {
      // 忽略文件选择取消
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(prev => !prev)}
        className={css.workspacePickerBtn}
        title={currentWorkspacePath ? `当前项目工作区: ${currentWorkspacePath}` : '选择工作区'}
      >
        <TriggerIcon size={13} style={{ color: 'var(--dsw-alias-label-secondary, #6b7280)', flexShrink: 0 }} />
        <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentWorkspaceName || '选择工作区'}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: 'var(--dsw-alias-label-tertiary, #9ca3af)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {open && (
        <div className={css.workspacePopover}>
          {/* 顶部搜索输入框 */}
          <div className={css.workspaceSearchRow}>
            <Search size={13} style={{ color: 'var(--dsw-alias-label-caption, #9ca3af)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={intl.formatMessage({ id: 'chat.empty.workspaceSearchPlaceholder', defaultMessage: '搜索工作区...' })}
              className={css.workspaceSearchInput}
              autoFocus
              onKeyDown={e => e.stopPropagation()}
            />
          </div>

          {/* 已打开的工作区列表 */}
          <div className={css.workspaceList}>
            {filteredTabs.map((tab, idx) => {
              const isSelected = tab.workspacePath === currentWorkspacePath
              const tabName = getPathBaseName(tab.workspacePath)
              const isHome = isHomePath(tab.workspacePath)
              const isRemote = Boolean(tab.remoteSessionId || tab.workspaceIdentity?.startsWith('remote:'))
              const ItemIcon = isRemote ? Cloud : isHome ? House : Folder

              return (
                <button
                  key={tab.id || tab.workspacePath || idx}
                  type="button"
                  data-active={isSelected ? 'true' : undefined}
                  onClick={() => {
                    onSelectWorkspacePath(tab.workspacePath)
                    setOpen(false)
                  }}
                  className={`${css.workspaceItem} ${isSelected ? css.workspaceItemActive : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                    <ItemIcon size={13} style={{ color: 'var(--dsw-alias-label-secondary, #6b7280)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tabName}</span>
                  </div>
                  {isSelected && <Check size={13} style={{ flexShrink: 0, color: '#059669' }} />}
                </button>
              )
            })}

            {filteredTabs.length === 0 && (
              <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--dsw-alias-label-caption, #9ca3af)' }}>
                {intl.formatMessage({ id: 'chat.empty.workspaceSearchEmpty', defaultMessage: '暂无可选工作区' })}
              </div>
            )}
          </div>

          {/* 底部操作项：打开文件夹 */}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              handleOpenFolder()
            }}
            className={css.workspaceActionItem}
          >
            <FolderPlus size={13} style={{ color: 'var(--dsw-alias-label-secondary, #6b7280)', flexShrink: 0 }} />
            <span>{intl.formatMessage({ id: 'workspace.openFolder', defaultMessage: '选择其他目录...' })}</span>
          </button>
        </div>
      )}
    </div>
  )
})
