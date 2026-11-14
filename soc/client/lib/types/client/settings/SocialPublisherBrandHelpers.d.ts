/**
 * 社媒发布模块品牌头尾图与平台展示规范辅助库
 * [中文修复依据]：将账号专属品牌图深拷贝合并与平台 Badge 映射逻辑抽离为独立领域辅助模块，
 * 满足单文件不超过 400 行架构约束，彻底杜绝多账号引用污染与一改全改。
 */
export declare const DEFAULT_PLATFORM_INFO: {
    label: string;
    badge: string;
    color: string;
};
export declare const PLATFORM_MAP: Record<string, typeof DEFAULT_PLATFORM_INFO>;
export declare const DEFAULT_BRAND_IMAGES_CONFIG: {
    readonly header: {
        readonly enabled: true;
        readonly file: "brand_top.jpg";
        readonly width: 100;
        readonly height: 0;
        readonly fit: "contain";
        readonly position: "center";
        readonly radius: 0;
        readonly margin_top: 0;
        readonly margin_bottom: 0;
        readonly frame: false;
    };
    readonly footer: {
        readonly enabled: true;
        readonly file: "brand_bot.jpg";
        readonly width: 0;
        readonly height: 0;
        readonly fit: "contain";
        readonly position: "center";
        readonly radius: 0;
        readonly margin_top: 20;
        readonly margin_bottom: 0;
        readonly frame: false;
    };
};
/**
 * 账号品牌头尾图深度安全合并辅助方法：
 * [中文修复依据]：精准深拷贝当前账号的 brand_images，避免对象引用共享与无用展开回落
 */
export declare function mergeAccountBrandImages(existing: any, patchBrand: any): any;
//# sourceMappingURL=SocialPublisherBrandHelpers.d.ts.map