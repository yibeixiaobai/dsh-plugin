/**
 * 社媒发布登录模态框辅助工具与平台探针 (Social Publisher Login Helpers)
 */
/**
 * 小红书创作者服务平台 Webview 专属探针：
 * 综合页面 DOM 创作者元素（发布按钮、用户信息卡片、粉丝数据等）、排除登录二维码与表单，精准识别实际登录态并提取用户名
 */
export async function probeXhsWebviewLogin(webview) {
    try {
        return await webview.executeJavaScript(`
      (() => {
        try {
          // 1. 检查是否存在可见的登录二维码或登录表单框
          const qrcode = document.querySelector('.qrcode, [class*="qrcode"], [class*="login-box"], [class*="login-container"], #login_container');
          const hasQrcode = Boolean(qrcode && qrcode.offsetParent !== null);
          const loginBox = document.querySelector('.login-form, form[action*="login"]');
          const hasLoginBox = Boolean(loginBox && loginBox.offsetParent !== null);
          if (hasQrcode || hasLoginBox) {
            return { ok: false, reason: "仍处于登录二维码/表单展示中" };
          }

          // 2. 检查创作者核心功能与后台特征（铁证：发布笔记/笔记管理/创作者后台）
          const bodyText = document.body ? document.body.innerText || "" : "";
          const publishEl = document.querySelector('[class*="publish"], a[href*="publish"], a[href*="note-manager"]');
          const hasPublishFeature = Boolean(
            publishEl ||
            bodyText.includes("发布笔记") ||
            bodyText.includes("发布图文笔记") ||
            bodyText.includes("创作服务平台") ||
            bodyText.includes("Builder hub")
          );

          // 3. 提取创作者真实昵称
          let userName = "";
          const nameEl = document.querySelector('[class*="user-name"], [class*="name-box"], [class*="author-name"], [class*="creator-name"]');
          if (nameEl && nameEl.innerText) {
            userName = nameEl.innerText.trim();
          }
          if (!userName && bodyText) {
            // 从后台名片区提取（如 "文映千秋学术win00cn 账号状态正常" 或 "关注数 粉丝数" 前的名称）
            const cardMatch = bodyText.match(/([^\\n]+?)\\s*(?:[✔\\s]*账号状态正常|\\d+\\s*关注数|\\d+\\s*粉丝数)/);
            if (cardMatch && cardMatch[1]) {
              userName = cardMatch[1].replace(/创作服务平台/g, "").replace(/退出登录/g, "").trim();
            }
          }
          if (!userName) {
            try {
              const uRaw = localStorage.getItem("USER_INFO") || localStorage.getItem("snsWebPublishCurrentUser");
              if (uRaw) {
                const parsed = JSON.parse(uRaw);
                userName = parsed?.userName || parsed?.user?.value?.userName || parsed?.user?.userName || "";
              }
            } catch {}
          }

          // 4. 判定：只要包含创作者后台核心特征且无二维码，即判定为已授权成功
          const isCreatorLogged = hasPublishFeature || Boolean(userName);
          return {
            ok: isCreatorLogged,
            userName: userName || ""
          };
        } catch {
          return { ok: false };
        }
      })()
    `);
    }
    catch {
        return { ok: false };
    }
}
/**
 * 【中文注释与修复依据】：微信公众平台权限拦截护盾
 * 微信前端在初始化时通过 navigator.permissions.query({ name: "local-network-access" }) 探测是否发起快捷登录。
 * 若返回 granted，微信前端会展示旋转菊花与「扫码登录」按钮，等待用户手动点击；
 * 若返回 denied，微信前端在 else 分支中原生直接执行 switchFastLogin(false) 并请求二维码。
 * 本护盾在页面生命周期早期覆盖 permissions.query，促使微信前端直接原生展示二维码。
 */
export async function injectWechatPermissionsShield(webview) {
    if (!webview || !webview.executeJavaScript)
        return false;
    try {
        return await webview.executeJavaScript(`
      (() => {
        try {
          if (window.__wincode_wechat_shield_injected) return true;
          window.__wincode_wechat_shield_injected = true;
          if (navigator.permissions && navigator.permissions.query) {
            const origQuery = navigator.permissions.query.bind(navigator.permissions);
            navigator.permissions.query = function (desc) {
              if (desc && desc.name === 'local-network-access') {
                return Promise.resolve({ state: 'denied', status: 'denied', name: 'local-network-access' });
              }
              return origQuery(desc);
            };
          }
          return true;
        } catch {
          return false;
        }
      })()
    `).catch(() => false);
    }
    catch {
        return false;
    }
}
/**
 * 【中文注释与修复依据】：微信公众平台扫码登录直达与自愈加速探针
 * 确保唤起微信登录窗口时自动直达点击「扫码登录」后的二维码页面，彻底避免用户还要手动再点击扫码按钮：
 * 1. 检查是否存在微信可见的登录二维码，若已就绪则返回成功；
 * 2. 检查页面若处于「快登探测中 (旋转菊花)」并渲染了「扫码登录」链接，毫秒级自动触发其 click 事件；
 * 3. 检查 Vue 根实例 (#app.__vue__)，若存在 switchFastLogin 方法且处于 showFastLogin，直接自愈调用；
 * 4. 检查若处于账号密码模式，自动点击右上角切换至扫码登录。
 */
export async function ensureWechatQrCodeLogin(webview) {
    if (!webview || !webview.executeJavaScript) {
        return { switched: false, hasQrCode: false };
    }
    try {
        const res = await webview.executeJavaScript(`
      (() => {
        try {
          const u = (location.href || '').toLowerCase();
          // 若已在后台且包含 token，直接视作完成
          if (u.includes('cgi-bin') && u.includes('token=')) {
            return { switched: true, hasQrCode: true };
          }

          const app = document.getElementById('app');
          const vue = app ? app.__vue__ : null;

          // 1. 检查扫码二维码图片是否已可见呈现（DOM 或 Vue 数据层就绪）
          const qrImg = document.querySelector('.login__type__container__scan__qrcode, img[src*="qrcode"], #fast_login_container iframe');
          const isQrImgVisible = Boolean(
            qrImg &&
            qrImg.offsetParent !== null &&
            window.getComputedStyle(qrImg).visibility !== 'hidden' &&
            qrImg.getAttribute('src') &&
            !qrImg.getAttribute('src').includes('default_qrcode')
          );

          const isVueQrReady = Boolean(
            vue &&
            vue.mode === 1 &&
            !vue.showFastLogin &&
            vue.qrcodeSrc &&
            !vue.qrcodeSrc.includes('default_qrcode')
          );

          if (isQrImgVisible || isVueQrReady) {
            // [中文修复依据]：二维码一旦稳定展示，立即固化稳定标记，严禁后续任何触发再次刷新二维码
            window.__wincode_wechat_qr_stabilized = true;
            return { switched: true, hasQrCode: true };
          }

          // 2. 如果已经完成过一次模式切换或已标记稳定，严禁重复调用 switchFastLogin 或重复点击，防止二维码高频跳变
          if (window.__wincode_wechat_qr_stabilized || window.__wincode_wechat_qr_switched_once) {
            return { switched: true, hasQrCode: false };
          }

          // 3. 检查快登模式下的「扫码登录」链接，并自动点击一次
          const scanLinks = Array.from(
            document.querySelectorAll(
              '.login__type__container__scan .login__type__container__link_text, .login__type__container__scan a, .fast_login_wrp ~ * a'
            )
          );
          const fastScanBtn = scanLinks.find(
            (el) => (el.textContent || '').trim().includes('扫码登录')
          );
          if (fastScanBtn && fastScanBtn.offsetParent !== null) {
            window.__wincode_wechat_qr_switched_once = true;
            fastScanBtn.click();
            return { switched: true, hasQrCode: false };
          }

          // 4. 探测 Vue 根实例内部状态：仅在处于快登探测态且尚未展示二维码时调用一次 switchFastLogin
          if (vue && typeof vue.switchFastLogin === 'function') {
            if (vue.showFastLogin) {
              window.__wincode_wechat_qr_switched_once = true;
              vue.switchFastLogin(false, true);
              return { switched: true, hasQrCode: false };
            }
          }

          // 5. 检查是否处于账号密码登录框 (mode === 0)，若存在切换扫码登录按钮则切换一次
          if (vue && vue.mode === 0 && typeof vue.switchMode === 'function') {
            window.__wincode_wechat_qr_switched_once = true;
            vue.switchMode(1);
            return { switched: true, hasQrCode: false };
          }

          const switchToScanBtn = document.querySelector(
            '.login__type__container__select-type__scan'
          );
          if (switchToScanBtn && switchToScanBtn.offsetParent !== null) {
            window.__wincode_wechat_qr_switched_once = true;
            switchToScanBtn.click();
            return { switched: true, hasQrCode: false };
          }

          return { switched: false, hasQrCode: false };
        } catch {
          return { switched: false, hasQrCode: false };
        }
      })()
    `).catch(() => ({ switched: false, hasQrCode: false }));
        return res || { switched: false, hasQrCode: false };
    }
    catch {
        return { switched: false, hasQrCode: false };
    }
}
//# sourceMappingURL=socialPublisherLoginHelper.js.map