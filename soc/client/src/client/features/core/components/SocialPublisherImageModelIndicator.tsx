import { memo, useMemo } from 'react'
import { Sparkles, AlertCircle, ExternalLink } from 'lucide-react'
import { useModelProviders } from '../../../compat/hooks/useModelProviders.js'
import { useTabStore } from '../../../compat/store/TabStoreProvider.js'
import { setPendingSettingsSectionIntent } from '../../../compat/lib/settingsNavigation.js'
import { cn } from '../../../compat/components/lib/utils.js'
import { getProviderFormLabel } from '../../../compat/lib/providerSettingsFormTypes.js'

export interface UnifiedImageModelItem {
  providerId: string
  providerName: string
  modelId: string
  modelName: string
}

export interface SocialPublisherImageModelIndicatorProps {
  workspacePath?: string
  disabled?: boolean
  onModelSelect?: (model: UnifiedImageModelItem | null) => void
  selectedModelId?: string
}

export const SocialPublisherImageModelIndicator = memo(
  function SocialPublisherImageModelIndicator({
    workspacePath = '',
    disabled = false,
  }: SocialPublisherImageModelIndicatorProps) {
    const openSettingsTab = useTabStore(state => state.openSettingsTab)
    const { modelProviders } = useModelProviders({ workspacePath })

    // 筛选当前项目模型设置中勾选了生图输出类型的模型
    const imageModels = useMemo<UnifiedImageModelItem[]>(() => {
      const list: UnifiedImageModelItem[] = []
      for (const p of modelProviders || []) {
        if (!p.enabled) continue
        for (const m of p.models || []) {
          const isImage =
            m.config?.properties?.outputFormat?.supportsImage === true ||
            m.personalConfig?.properties?.outputFormat?.supportsImage === true
          if (isImage && (m.config as any)?.enabled !== false) {
            list.push({
              providerId: p.providerId,
              providerName: getProviderFormLabel(p),
              modelId: m.modelId,
              modelName: m.modelId,
            })
          }
        }
      }
      return list
    }, [modelProviders])

    const activeModel = imageModels[0] || null

    const handleOpenSettings = () => {
      setPendingSettingsSectionIntent('modelProvider')
      openSettingsTab()
    }

    if (activeModel) {
      return (
        <button
          type="button"
          onClick={handleOpenSettings}
          disabled={disabled}
          title={`社媒生图模型：${activeModel.providerName} / ${activeModel.modelName}\n（默认采用模型设置中勾选了生图输出类型的模型，点击前往模型设置调整）`}
          className={cn(
            'group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-xl text-ui-xs font-medium cursor-pointer transition-all',
            'border border-white/60 dark:border-white/15 bg-white/50 dark:bg-white/[0.08] backdrop-blur-xl',
            'shadow-[0_2px_8px_rgba(0,0,0,0.03),inset_0_1px_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_1px_0_rgba(255,255,255,0.18)]',
            'hover:bg-white/70 dark:hover:bg-white/[0.12] active:scale-[0.985]',
            'text-foreground',
          )}
        >
          <Sparkles className="size-3 text-emerald-500 shrink-0" />
          <span className="text-[11px] text-foreground-subtle hidden sm:inline">生图:</span>
          <span className="truncate max-w-[120px] text-[11px] font-semibold text-foreground">
            {activeModel.modelName}
          </span>
          <ExternalLink className="size-2.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0 ml-0.5 text-foreground-subtle" />
        </button>
      )
    }

    return (
      <button
        type="button"
        onClick={handleOpenSettings}
        disabled={disabled}
        title="当前项目未在模型设置中勾选生图模型。演练模式将生成演练图，实盘模式需前往模型设置开启生图模态。点击前往配置。"
        className={cn(
          'group inline-flex items-center gap-1.5 h-7 px-2 rounded-xl text-[11px] font-medium cursor-pointer transition-all',
          'border border-amber-500/30 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300 backdrop-blur-xl',
          'hover:bg-amber-500/[0.15] active:scale-[0.985]',
        )}
      >
        <AlertCircle className="size-3 text-amber-500 shrink-0" />
        <span className="truncate max-w-[130px]">未设生图模型</span>
        <ExternalLink className="size-2.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    )
  },
)
