/**
 * 社媒发布登录模态框辅助工具与平台探针 (Social Publisher Login Helpers)
 */
/**
 * 小红书创作者服务平台 Webview 专属探针：
 * 综合页面 DOM 创作者元素（发布按钮、用户信息卡片、粉丝数据等）、排除登录二维码与表单，精准识别实际登录态并提取用户名
 */
export declare function probeXhsWebviewLogin(webview: any): Promise<{
    ok: boolean;
    userName?: string;
}>;
/**
 * 【中文注释与修复依据】：微信公众平台权限拦截护盾
 * 微信前端在初始化时通过 navigator.permissions.query({ name: "local-network-access" }) 探测是否发起快捷登录。
 * 若返回 granted，微信前端会展示旋转菊花与「扫码登录」按钮，等待用户手动点击；
 * 若返回 denied，微信前端在 else 分支中原生直接执行 switchFastLogin(false) 并请求二维码。
 * 本护盾在页面生命周期早期覆盖 permissions.query，促使微信前端直接原生展示二维码。
 */
export declare function injectWechatPermissionsShield(webview: any): Promise<boolean>;
/**
 * 【中文注释与修复依据】：微信公众平台扫码登录直达与自愈加速探针
 * 确保唤起微信登录窗口时自动直达点击「扫码登录」后的二维码页面，彻底避免用户还要手动再点击扫码按钮：
 * 1. 检查是否存在微信可见的登录二维码，若已就绪则返回成功；
 * 2. 检查页面若处于「快登探测中 (旋转菊花)」并渲染了「扫码登录」链接，毫秒级自动触发其 click 事件；
 * 3. 检查 Vue 根实例 (#app.__vue__)，若存在 switchFastLogin 方法且处于 showFastLogin，直接自愈调用；
 * 4. 检查若处于账号密码模式，自动点击右上角切换至扫码登录。
 */
export declare function ensureWechatQrCodeLogin(webview: any): Promise<{
    switched: boolean;
    hasQrCode: boolean;
}>;
//# sourceMappingURL=socialPublisherLoginHelper.d.ts.map