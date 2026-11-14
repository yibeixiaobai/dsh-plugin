import { ImageQuotaBadge } from "./ImageQuotaBadge.js";
import { useMemo } from "react";
import { Input } from "../compat/components/ui/input.js";
import { Button } from "../compat/components/ui/button.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Plus, Trash2, RefreshCw, Layers } from "lucide-react";
import {
  WinCodeModelImportDropdown,
  type WinCodeModelImportItem,
} from "./WinCodeModelImportDropdown.js";
import type { ProviderSettingsFormProvider } from "../compat/lib/providerSettingsFormTypes.js";
import { getProviderFormApiKey } from "../compat/lib/providerSettingsFormTypes.js";

interface MediaTabsProps {
  config: any;
  setConfig: React.Dispatch<React.SetStateAction<any>>;
  activeTab?: "image_providers";
  testingProvider: string | null;
  testProvider: (provider: any) => void;
  modelProviders?: readonly ProviderSettingsFormProvider[];
}

function getProvidersList(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    return Object.entries(raw).map(([id, val]: [string, any]) => ({
      id,
      ...(typeof val === "object" ? val : {}),
    }));
  }
  return [];
}

export function SocialPublisherMediaTabs({
  config,
  setConfig,
  activeTab,
  testingProvider,
  testProvider,
  modelProviders,
}: MediaTabsProps) {
  const providersList = useMemo(
    () => getProvidersList(config.image_providers),
    [config.image_providers],
  );

  // 从 WinCode 模型库导入
  const handleImportWinCodeModel = (item: WinCodeModelImportItem) => {
    const newP = {
      id: `${item.providerId}_${item.model.split("/").pop() || "image"}`,
      base_url: item.baseUrl,
      api_key: item.apiKey,
      model: item.model,
      priority: (providersList.length || 0) + 1,
      enabled: true,
      wincodeProviderId: item.providerId,
      wincodeProviderName: item.providerName,
    };
    setConfig((prev: any) => {
      const list = getProvidersList(prev.image_providers);
      return { ...prev, image_providers: [...list, newP] };
    });
  };

  // 刷新与 WinCode 绑定的凭据
  const handleSyncWinCodeCredentials = (provider: any) => {
    if (!provider.wincodeProviderId || !modelProviders) return;
    const target = modelProviders.find((p) => p.providerId === provider.wincodeProviderId);
    if (!target) return;
    const latestKey = getProviderFormApiKey(target);
    const latestBaseUrl = target.config.api?.baseUrl || provider.base_url;
    setConfig((prev: any) => {
      const list = getProvidersList(prev.image_providers);
      return {
        ...prev,
        image_providers: list.map((p: any) =>
          p.id === provider.id
            ? { ...p, api_key: latestKey || p.api_key, base_url: latestBaseUrl || p.base_url }
            : p,
        ),
      };
    });
  };

  if (activeTab === "image_providers") {
    return (
      <div className="space-y-6" data-testid="social-publisher-media-tabs">
        <ImageQuotaBadge />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
          <div className="space-y-0.5">
            <h4 className="text-ui-base font-bold text-foreground">多渠道 AI 生图接口池</h4>
            <p className="text-ui-xs text-foreground-subtle">
              生图遇到超时或配额不足时，系统将按优先级秒级切换至下一个可用接口。已停用接口自动跳过。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {modelProviders && (
              <WinCodeModelImportDropdown
                modelProviders={modelProviders}
                onImport={handleImportWinCodeModel}
              />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const newP = {
                  id: `provider_${Date.now().toString().slice(-4)}`,
                  base_url: "https://api.openai.com/v1",
                  api_key: "",
                  model: "dall-e-3",
                  priority: (providersList.length || 0) + 1,
                  enabled: true,
                };
                setConfig((prev: any) => {
                  const list = getProvidersList(prev.image_providers);
                  return { ...prev, image_providers: [...list, newP] };
                });
              }}
              className="h-8 gap-1 text-ui-xs"
            >
              <Plus className="size-3.5" />
              <span>自定义接口</span>
            </Button>
          </div>
        </div>

        <div className="space-y-3.5">
          {providersList.map((provider: any, idx: number) => {
            const isEnabled = provider.enabled !== false;
            return (
              <div
                key={provider.id || idx}
                className={`rounded-xl border p-4 space-y-3.5 transition-all shadow-2xs backdrop-blur-md ${
                  isEnabled
                    ? "border-card-border bg-card/80"
                    : "border-border/60 bg-surface/40 opacity-70"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ui-sm text-foreground">{provider.id}</span>
                    {provider.wincodeProviderId && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-ui-xs text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                        <Layers className="size-3" />
                        <span>
                          已绑定服务商: {provider.wincodeProviderName || provider.wincodeProviderId}
                        </span>
                      </span>
                    )}
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-ui-xs text-primary font-medium">
                      优先级: {provider.priority || idx + 1}
                    </span>
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-ui-xs font-medium ${
                        isEnabled
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {isEnabled ? "启用中" : "已停用"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 mr-2">
                      <span className="text-ui-xs text-foreground-subtle font-medium">启停</span>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => {
                          setConfig((prev: any) => {
                            const list = getProvidersList(prev.image_providers);
                            return {
                              ...prev,
                              image_providers: list.map((p: any) =>
                                p.id === provider.id ? { ...p, enabled: checked } : p,
                              ),
                            };
                          });
                        }}
                        className="scale-80 origin-right"
                      />
                    </div>
                    {provider.wincodeProviderId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="从服务商刷新最新 API Key 与 Base URL"
                        onClick={() => handleSyncWinCodeCredentials(provider)}
                        className="h-7 text-ui-xs gap-1"
                      >
                        <RefreshCw className="size-3" />
                        <span>同步凭据</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => testProvider(provider)}
                      disabled={testingProvider === provider.id}
                      className="h-7 text-ui-xs gap-1"
                    >
                      <RefreshCw
                        className={`size-3 ${testingProvider === provider.id ? "animate-spin" : ""}`}
                      />
                      <span>{testingProvider === provider.id ? "测试中..." : "测试连接"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-foreground-subtle hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setConfig((prev: any) => {
                          const list = getProvidersList(prev.image_providers);
                          return {
                            ...prev,
                            image_providers: list.filter((p: any) => p.id !== provider.id),
                          };
                        });
                      }}
                      title="删除该生图接口"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-ui-xs text-foreground">
                    <span className="font-medium text-foreground-subtle">Base URL 接口地址</span>
                    <Input
                      value={provider.base_url || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConfig((prev: any) => {
                          const list = getProvidersList(prev.image_providers);
                          return {
                            ...prev,
                            image_providers: list.map((p: any) =>
                              p.id === provider.id ? { ...p, base_url: val } : p,
                            ),
                          };
                        });
                      }}
                      className="h-8.5 font-mono text-ui-xs"
                    />
                  </label>
                  <label className="space-y-1 text-ui-xs text-foreground">
                    <span className="font-medium text-foreground-subtle">Model 模型名称</span>
                    <Input
                      value={provider.model || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConfig((prev: any) => {
                          const list = getProvidersList(prev.image_providers);
                          return {
                            ...prev,
                            image_providers: list.map((p: any) =>
                              p.id === provider.id ? { ...p, model: val } : p,
                            ),
                          };
                        });
                      }}
                      className="h-8.5 font-mono text-ui-xs"
                    />
                  </label>
                  <label className="space-y-1 text-ui-xs text-foreground">
                    <span className="font-medium text-foreground-subtle">API Key 授权秘钥</span>
                    <Input
                      type="password"
                      value={provider.api_key || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConfig((prev: any) => {
                          const list = getProvidersList(prev.image_providers);
                          return {
                            ...prev,
                            image_providers: list.map((p: any) =>
                              p.id === provider.id ? { ...p, api_key: val } : p,
                            ),
                          };
                        });
                      }}
                      placeholder="sk-..."
                      className="h-8.5 font-mono text-ui-xs"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
