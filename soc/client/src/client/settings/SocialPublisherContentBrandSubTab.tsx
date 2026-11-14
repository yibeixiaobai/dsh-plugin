import { useState, useRef, useEffect } from "react";
import { Input } from "../compat/components/ui/input.js";
import { Switch } from "../compat/components/ui/switch.js";
import { Button } from "../compat/components/ui/button.js";
import { Upload, Image as ImageIcon, Info } from "lucide-react";
import { useOptionalServices } from "../compat/hooks/useServices.js";
import { getApiBaseUrl, publisherApiFetch, safeParseJson } from "./SocialPublisherTypes.js";

interface BrandSubTabProps {
  currentAccount: any;
  updateCurrentAccount: (patch: any) => void;
  isCardFlow?: boolean;
  isXhs?: boolean;
}

export function SocialPublisherContentBrandSubTab({
  currentAccount,
  updateCurrentAccount,
  isCardFlow,
  isXhs,
}: BrandSubTabProps) {
  const services = useOptionalServices();
  const socialPublisherRpc = services?.socialPublisherService ?? null;
  const [brandSlot, setBrandSlot] = useState<"header" | "footer">("header");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // [中文修复依据]：按 `${accountId}_${slot}` 粒度隔离的瞬时乐观预览缓存字典，实现 0 毫秒即时呈现与防串号
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});

  const accountId = currentAccount.id || "default";
  const brandData = currentAccount.brand_images?.[brandSlot] || {};
  const currentFileName =
    brandData.file || (brandSlot === "header" ? "brand_top.jpg" : "brand_bot.jpg");
  const cacheKey = `${accountId}_${brandSlot}`;

  // [中文修复依据]：仅在当前账号专属缓存未命中时发起静默拉取，严禁首行清空，杜绝旧图回闪与操作延迟
  useEffect(() => {
    if (!socialPublisherRpc) return;
    if (previewCache[cacheKey]) return;

    let isMounted = true;
    socialPublisherRpc
      .handleGenericRoute("/api/gzh-publisher/brand-image", "GET", undefined, {
        slot: brandSlot,
        account: accountId,
        file: currentFileName,
      })
      .then((res: any) => {
        if (isMounted && res?.data?.data_url) {
          setPreviewCache((prev) => ({
            ...prev,
            [cacheKey]: res.data.data_url,
          }));
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [brandSlot, accountId, currentFileName, cacheKey, previewCache, socialPublisherRpc]);

  // 【中文修复依据】：体裁精准边界——纯多图卡片流（小红书/小绿书）展示体裁说明，不嵌入长图文首尾横幅品牌图；长图文（知乎、百家号、头条号、公众号长文）全面开放品牌头尾图配置
  if (isCardFlow || isXhs) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 text-ui-xs text-foreground">
        <Info className="size-4.5 text-rose-500 shrink-0 mt-0.5" />
        <p className="text-foreground-subtle leading-relaxed">
          当前账号为 3:4 竖版多图卡片流体裁，专注于图文卡片与封面视觉，不插入文章型首尾横幅品牌图。
        </p>
      </div>
    );
  }

  const activePreviewUrl =
    previewCache[cacheKey] ||
    `${getApiBaseUrl()}/api/gzh-publisher/brand-image?slot=${brandSlot}&account=${accountId}&file=${encodeURIComponent(currentFileName)}`;

  const handleUploadBrandImage = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = String(e.target?.result || "");
        // 1. 0毫秒乐观更新当前账号专属预览，用户选图瞬间立即呈现新图！
        setPreviewCache((prev) => ({ ...prev, [cacheKey]: base64Data }));

        // 2. 发起后端专属目录落盘
        const route = `/api/gzh-publisher/brand-image?slot=${brandSlot}&account=${accountId}&file=${encodeURIComponent(file.name)}`;
        const res = await publisherApiFetch(
          route,
          {
            method: "POST",
            headers: {
              "Content-Type": file.type || "image/jpeg",
              "x-dsh-gzh-upload": "brand-image",
              "x-dsh-gzh-filename": encodeURIComponent(file.name),
            },
            body: base64Data,
          },
          socialPublisherRpc,
        );
        const parsed = await safeParseJson(res);
        const data = parsed.data || {};
        if (parsed.ok && data.ok) {
          const finalFile = data.file || file.name;
          // [中文修复依据]：深度解耦当前账号 brand_images，绝不引用共享对象
          const clonedBrandImages = JSON.parse(JSON.stringify(currentAccount.brand_images || {}));
          // 3. 靶向更新当前账号专属 brand_images
          updateCurrentAccount({
            brand_images: {
              ...clonedBrandImages,
              [brandSlot]: {
                ...clonedBrandImages[brandSlot],
                file: finalFile,
              },
            },
          });
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.warn("上传品牌图失败:", err);
      setUploading(false);
    }
  };

  const updateBrandField = (fieldPatch: Record<string, any>) => {
    // [中文修复依据]：深度解耦当前账号 brand_images，精准更新目标账号字段，彻底杜绝一改全改
    const clonedBrandImages = JSON.parse(JSON.stringify(currentAccount.brand_images || {}));
    updateCurrentAccount({
      brand_images: {
        ...clonedBrandImages,
        [brandSlot]: {
          ...clonedBrandImages[brandSlot],
          ...fieldPatch,
        },
      },
    });
  };

  return (
    <div className="space-y-4" data-testid="social-publisher-brand-settings">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="inline-flex rounded-xl bg-surface/80 p-1 border border-border/70 shadow-2xs">
          <button
            type="button"
            onClick={() => setBrandSlot("header")}
            className={`px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer ${
              brandSlot === "header"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-foreground-subtle hover:text-foreground"
            }`}
          >
            头部品牌图（文章开头）
          </button>
          <button
            type="button"
            onClick={() => setBrandSlot("footer")}
            className={`px-3.5 py-1.5 rounded-lg text-ui-xs font-semibold transition-all cursor-pointer ${
              brandSlot === "footer"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-foreground-subtle hover:text-foreground"
            }`}
          >
            尾部品牌图（引导关注）
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-ui-xs text-foreground font-medium">启用该品牌图</span>
          <Switch
            checked={Boolean(brandData.enabled ?? true)}
            onCheckedChange={(checked) => updateBrandField({ enabled: checked })}
          />
        </div>
      </div>

      {/* 预览与上传 */}
      <div className="flex flex-wrap items-center gap-5 rounded-xl border border-border/80 bg-surface/50 p-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-card-border bg-background flex items-center justify-center shadow-xs">
          <img
            src={activePreviewUrl}
            alt={brandSlot === "header" ? "头部品牌图" : "尾部品牌图"}
            className="size-full object-contain"
            onLoad={(e) => {
              (e.target as HTMLElement).style.display = "block";
            }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
          <ImageIcon className="size-8 text-foreground-subtle opacity-40 absolute -z-10" />
        </div>

        <div className="space-y-2 flex-1 min-w-[200px]">
          <div className="text-ui-sm font-semibold text-foreground">
            图片文件: {currentFileName}
          </div>
          <p className="text-ui-xs text-foreground-subtle">
            建议上传宽度 ≥ 900px 的清晰长条图，自动适应文章版心宽度。
          </p>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleUploadBrandImage(e.target.files[0]);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-8 gap-1.5 text-ui-xs"
          >
            <Upload className="size-3.5" />
            <span>{uploading ? "上传中..." : "上传替换图片 (JPG/PNG/WebP)"}</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-ui-xs text-foreground">
          <span className="font-medium text-foreground-subtle">
            显示宽度比例 (0~100%，0=自适应)
          </span>
          <Input
            type="number"
            value={brandData.width ?? (brandSlot === "header" ? 100 : 60)}
            onChange={(e) => updateBrandField({ width: Number(e.target.value) })}
            className="h-8.5 font-mono text-ui-xs"
          />
        </label>
        <label className="space-y-1.5 text-ui-xs text-foreground">
          <span className="font-medium text-foreground-subtle">图片圆角大小 (px)</span>
          <Input
            type="number"
            value={brandData.radius ?? 0}
            onChange={(e) => updateBrandField({ radius: Number(e.target.value) })}
            className="h-8.5 font-mono text-ui-xs"
          />
        </label>
        <label className="space-y-1.5 text-ui-xs text-foreground">
          <span className="font-medium text-foreground-subtle">上方间距 (margin_top px)</span>
          <Input
            type="number"
            value={brandData.margin_top ?? 0}
            onChange={(e) => updateBrandField({ margin_top: Number(e.target.value) })}
            className="h-8.5 font-mono text-ui-xs"
          />
        </label>
        <label className="space-y-1.5 text-ui-xs text-foreground">
          <span className="font-medium text-foreground-subtle">下方间距 (margin_bottom px)</span>
          <Input
            type="number"
            value={brandData.margin_bottom ?? 0}
            onChange={(e) => updateBrandField({ margin_bottom: Number(e.target.value) })}
            className="h-8.5 font-mono text-ui-xs"
          />
        </label>
        <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface/50 p-3 sm:col-span-2">
          <div className="space-y-0.5">
            <div className="text-ui-xs font-semibold text-foreground">卡片边框与柔和阴影</div>
            <div className="text-ui-xs text-foreground-subtle">
              在品牌图周围增加一层卡片外框与阴影，更具质感
            </div>
          </div>
          <Switch
            checked={Boolean(brandData.frame)}
            onCheckedChange={(checked) => updateBrandField({ frame: checked })}
          />
        </div>
      </div>
    </div>
  );
}
