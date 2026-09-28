# -*- coding: utf-8 -*-
"""参数化生图流水线（封面/正文信息图/小绿书卡片）：多线程并发 + 接口轮换 + 本地优雅保底 + PIL 缩放。

- 凭据读 scripts/wx_config.json 的 image_api_providers（由插件 syncConfig 同步）
- 输出路径由 TS 侧在 job.items[].out 中给定（绝对路径），本脚本做边界校验后落盘
- 尺寸：封面由 TS 按设置的封面比例换算（2.35:1=3520x1498、21:9=3520x1500、16:9=3024x1701、1:1=1920x1920、3:4=1080x1440）；
  正文图 size 高度为 0 时按宽度 1080 等比缩放
- 性能与可用性：
  * 支持多线程并发（ThreadPoolExecutor），大幅缩短批量生图耗时；
  * 同接口候选模型降级（遇到特定 400/404 模型错误时尝试通用备选模型）；
  * 接口池优先级自动轮换与故障熔断；
  * 全网络接口耗尽时的本地优雅降级保底图（PIL 高质感学术卡片，保证任务不中断）。

安全约定：API 返回的图片下载 URL 必须是 http(s)、主机经 DNS 解析后不得指向
私网/环回/链路本地/保留地址，且不自动跟随重定向（手动重定向时重新校验）。

输出协议：最后一行 "###RESULT### {json}"，{ok, data:{generated, failed, dry_run, provider_used, provider_attempts}}
"""
import argparse
import base64
import binascii
from concurrent.futures import ThreadPoolExecutor, as_completed
import io
import ipaddress
import json
import os
import socket
import sys
import threading
import time
from urllib.parse import urlparse

import requests
from PIL import Image, ImageDraw

MARKER = "###RESULT### "

# 直连用会话：忽略 HTTP(S)_PROXY 环境变量。部分环境下系统级本地代理会重置到
# 生图接口与图床的连接（ConnectionReset 10054），而直连正常；反过来在必须走代理的
# 环境里直连会失败。因此 http_request 先直连、失败再回退到环境代理，两者都试。
_DIRECT_SESSION = requests.Session()
_DIRECT_SESSION.trust_env = False


def http_request(method, url, **kwargs):
    """先直连（忽略环境代理）请求，失败时回退到环境代理；两条路径都失败才抛错。"""
    direct_err = None
    try:
        return _DIRECT_SESSION.request(method, url, **kwargs)
    except requests.RequestException as e:
        direct_err = e
    try:
        return requests.request(method, url, **kwargs)
    except requests.RequestException as e:
        raise requests.ConnectionError(
            "直连失败: " + str(direct_err)[:160] + "；经环境代理失败: " + str(e)[:160])

ZH_SUFFIX = "画面中所有文字必须全部是中文，禁止出现任何英文单词、英文字母，禁止二维码、乱码字符与水印，禁止任何联系方式与外部平台导流，禁止生成知名真实人物肖像及商业Logo。"
MAX_REDIRECTS = 2
RETRYABLE_STATUS = {401, 403, 408, 429}
FALLBACK_MODELS = ["gpt-image-2", "dall-e-3", "flux-schnell", "flux-dev"]


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False), flush=True)


def under(base, p):
    """规范化 p 并强制其位于 base 之内；越界（上级目录引用、目录外绝对路径）一律拒绝。"""
    bp = os.path.abspath(base)
    cp = os.path.abspath(p if os.path.isabs(p) else os.path.join(bp, p))
    if cp != bp and not cp.startswith(bp + os.sep):
        raise SystemExit("路径越界（必须在 scripts 目录内）: " + str(p))
    return cp


def assert_public_http_url(u):
    """校验 URL 为 http(s) 且解析后的 IP 不属于私网/环回/链路本地/保留/组播地址。"""
    pu = urlparse(u)
    if pu.scheme not in ("https", "http"):
        raise SystemExit("仅允许 http(s) 图片 URL: " + u[:120])
    host = pu.hostname or ""
    if not host:
        raise SystemExit("图片 URL 缺少主机名: " + u[:120])
    port = pu.port or (443 if pu.scheme == "https" else 80)
    for info in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM):
        ip = ipaddress.ip_address(info[4][0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            raise SystemExit("图片 URL 主机解析到受限地址，已阻断: " + host)
    return pu


def fetch_bytes(u, timeout):
    """手动跟随重定向（最多 MAX_REDIRECTS 次），每一跳都重新做公网校验。

    图床连接偶发被重置（ConnectionReset / 读超时），因此每一跳都做多次重试，
    避免一次瞬时抖动就让整张图退化成本地保底图。
    """
    current = u
    for _ in range(MAX_REDIRECTS + 1):
        assert_public_http_url(current)
        resp = None
        last_err = None
        for attempt in range(3):
            try:
                resp = http_request("GET", current, timeout=max(30, int(timeout)), allow_redirects=False)
                break
            except requests.RequestException as e:
                last_err = e
                if attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise requests.ConnectionError("图片下载失败(重试3次): " + str(e)[:240])
        if resp is None:
            raise requests.ConnectionError("图片下载失败: " + str(last_err)[:240])
        if resp.status_code in (301, 302, 303, 307, 308):
            current = resp.headers.get("Location", "")
            if not current:
                raise SystemExit("重定向缺少 Location")
            continue
        resp.raise_for_status()
        return resp.content
    raise SystemExit("重定向次数超限")


class RetryableProviderError(Exception):
    pass


class NonRetryableProviderError(Exception):
    pass


def enhance_prompt(prompt, kind, zh_only=True, sub=1):
    """针对封面、正文信息图、小绿书卡片等场景进行构图与画质引导增强"""
    k = str(kind or "").lower()
    prompt = str(prompt or "").strip()
    prefix = ""
    if k == "cover":
        prefix = "公众号杂志封面大片，横版开阔构图，留白充裕，中心明确，电影质感光影，8k高清，画面需自然融入标题主题相关中文文字元素（非水印非logo，而是与主题呼应的标题关键词文字排版），"
    elif k == "content":
        prefix = "学术信息图表与概念结构呈现，清晰现代设计，结构分明，干净背景，极简信息美学，"
    elif k == "pic":
        has_custom_aesthetic = ("美学风格" in prompt) or ("杂志" in prompt) or ("手账" in prompt) or ("信息图" in prompt) or ("书桌" in prompt)
        if not has_custom_aesthetic:
            if int(sub or 1) <= 1:
                prefix = "3:4小红书/小绿书封面海报卡片，3:4竖版构图，画面中心预留标题文字排版空间，视觉冲击力强，吸睛排版，"
            else:
                prefix = "3:4小红书/小绿书内容卡片，3:4竖版构图，模块化卡片布局，图文层次分明，全中文标注，"

    enhanced = prefix + prompt
    if zh_only:
        enhanced = enhanced + " " + ZH_SUFFIX
    return enhanced


def create_local_fallback_image(out_path, size, item, prompt=""):
    """当所有网络生图接口均不可用时，在本地动态生成高质感学术风格卡片保底图，保证流水线不中断。"""
    w, h = int(size[0]), int(size[1])
    if h <= 0:
        h = max(1, round(w * 9 / 16))

    target_w = max(640, min(w, 2048))
    target_h = max(360, min(h, 2048))

    img = Image.new("RGB", (target_w, target_h), (40, 16, 20))
    draw = ImageDraw.Draw(img)

    for y in range(target_h):
        ratio = y / max(1, target_h)
        r = int(45 - ratio * 18)
        g = int(18 - ratio * 8)
        b = int(22 - ratio * 10)
        draw.line([(0, y), (target_w, y)], fill=(max(0, r), max(0, g), max(0, b)))

    margin = int(min(target_w, target_h) * 0.05)
    gold = (218, 165, 32)
    soft_gold = (150, 115, 35)
    draw.rectangle([margin, margin, target_w - margin, target_h - margin], outline=soft_gold, width=2)
    inner_margin = margin + 8
    draw.rectangle([inner_margin, inner_margin, target_w - inner_margin, target_h - inner_margin], outline=gold, width=1)

    cx, cy = target_w // 2, target_h // 2
    box_w = int(target_w * 0.72)
    box_h = int(target_h * 0.45)
    box = [cx - box_w // 2, cy - box_h // 2, cx + box_w // 2, cy + box_h // 2]
    draw.rectangle(box, fill=(25, 10, 12), outline=gold, width=1)

    corner_len = int(min(target_w, target_h) * 0.08)
    for x, y, dx, dy in [
        (margin, margin, 1, 1),
        (target_w - margin, margin, -1, 1),
        (margin, target_h - margin, 1, -1),
        (target_w - margin, target_h - margin, -1, -1)
    ]:
        draw.line([(x, y), (x + dx * corner_len, y)], fill=gold, width=3)
        draw.line([(x, y), (x, y + dy * corner_len)], fill=gold, width=3)

    final_img = img.resize((w, h), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    final_img.save(out_path, "PNG")
    print("【本地保底】已生成高质感保底图落盘：" + out_path + "（" + str(w) + "x" + str(h) + "）")
    return (w, h)


def generate_raw(base_url, api_key, model, prompt, timeout, size=None):
    url = base_url.rstrip("/") + "/v1/images/generations"
    connect_timeout = 15
    read_timeout = max(45, min(int(timeout), 300))
    timeout_tuple = (connect_timeout, read_timeout)

    body = {"model": model, "prompt": prompt, "quality": "hd"}
    if size and isinstance(size, (list, tuple)) and len(size) >= 2 and size[0] > 0 and size[1] > 0:
        ratio = size[0] / max(1, size[1])
        if ratio > 1.4:
            body["size"] = "1792x1024"
        elif ratio < 0.8:
            body["size"] = "1024x1792"
        else:
            body["size"] = "1024x1024"

    resp = None
    last_err = None
    models_to_try = [model]
    for cand in FALLBACK_MODELS:
        if cand != model and cand not in models_to_try:
            models_to_try.append(cand)

    for curr_model in models_to_try[:2]:
        body["model"] = curr_model
        for attempt in range(2):
            try:
                resp = http_request(
                    "POST",
                    url,
                    json=body,
                    headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
                    timeout=timeout_tuple,
                )
                break
            except (requests.Timeout, requests.ConnectionError) as e:
                last_err = e
                if attempt == 0:
                    time.sleep(1.5)
                    continue
                raise RetryableProviderError(type(e).__name__ + ": " + str(e)[:240])
            except requests.RequestException as e:
                raise RetryableProviderError(type(e).__name__ + ": " + str(e)[:240])

        if resp is not None:
            if resp.status_code in (400, 404):
                txt = resp.text.lower()
                if ("model" in txt and ("not found" in txt or "not exist" in txt or "invalid" in txt)) and curr_model != models_to_try[1]:
                    print("当前模型 " + curr_model + " 不可用，尝试同接口备用模型 " + models_to_try[1] + "...")
                    continue
            break

    if resp is None:
        raise RetryableProviderError("请求未完成: " + str(last_err)[:240])
    if resp.status_code in RETRYABLE_STATUS or resp.status_code >= 500:
        raise RetryableProviderError("HTTP " + str(resp.status_code) + ": " + resp.text[:240])
    if resp.status_code >= 400:
        raise RetryableProviderError("HTTP " + str(resp.status_code) + ": " + resp.text[:240])
    if resp.status_code >= 300:
        raise NonRetryableProviderError("意外的重定向响应 HTTP " + str(resp.status_code))

    try:
        data = resp.json()
    except ValueError as e:
        raise RetryableProviderError("接口未返回合法 JSON: " + str(e))

    if not isinstance(data, dict):
        raise NonRetryableProviderError("接口返回格式错误：顶层不是 JSON 对象")
    if data.get("error"):
        error = data.get("error")
        if isinstance(error, dict):
            error = error.get("message") or error.get("code") or str(error)
        raise RetryableProviderError("接口返回错误：" + str(error)[:240])

    records = data.get("data")
    if not isinstance(records, list) or not records or not isinstance(records[0], dict):
        raise NonRetryableProviderError("接口返回中缺少 data 图片结果：" + json.dumps(data, ensure_ascii=False)[:240])
    record = records[0]
    if record.get("b64_json"):
        try:
            return base64.b64decode(str(record["b64_json"]), validate=True)
        except (ValueError, binascii.Error) as e:
            raise NonRetryableProviderError("接口返回的 b64_json 无法解码：" + str(e)[:180])
    img_url = record.get("url")
    if not img_url:
        raise NonRetryableProviderError("接口返回图片结果但缺少 url 或 b64_json：" + json.dumps(record, ensure_ascii=False)[:240])
    try:
        return fetch_bytes(str(img_url), timeout)
    except requests.RequestException as e:
        raise RetryableProviderError("图片下载失败 " + type(e).__name__ + ": " + str(e)[:240])
    except SystemExit as e:
        raise RetryableProviderError("图片下载被阻断: " + str(e)[:240])


def provider_pool(conf, selected_ids, enable_fallback=True):
    raw = conf.get("image_api_providers")
    if not isinstance(raw, list) or not raw:
        base = conf.get("image_api_base")
        key = conf.get("image_api_key")
        if base and key:
            raw = [{
                "id": "default",
                "enabled": True,
                "name": "默认生图接口",
                "base_url": base,
                "api_key": key,
                "model": "gpt-image-2",
                "priority": 0,
            }]
        else:
            raw = []

    selected = [str(value) for value in selected_ids] if isinstance(selected_ids, list) else []
    providers = [
        item for item in raw
        if isinstance(item, dict) and item.get("enabled", True)
        and item.get("base_url") and item.get("api_key")
    ]
    skipped = [
        str(item.get("id", "?")) for item in raw
        if isinstance(item, dict) and item.get("enabled", True)
        and (not item.get("base_url") or not item.get("api_key"))
    ]
    for provider_id in skipped:
        print("警告：生图接口 " + provider_id + " 缺少 base_url 或 api_key，已跳过（不参与轮换）")
    if selected:
        rank = {provider_id: index for index, provider_id in enumerate(selected)}
        providers = [item for item in providers if str(item.get("id")) in rank]
        providers.sort(key=lambda item: (rank.get(str(item.get("id")), 999999), int(item.get("priority", 0))))
    else:
        providers.sort(key=lambda item: (int(item.get("priority", 0)), str(item.get("id", ""))))

    if not providers and not enable_fallback:
        raise SystemExit("没有可用的生图接口（需启用并填写 base_url / api_key）")
    return providers


def save_resized(raw_bytes, out_path, size):
    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    w, h = int(size[0]), int(size[1])
    if h <= 0:
        h = max(1, round(img.size[1] * w / img.size[0]))
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    img.resize((w, h), Image.LANCZOS).save(out_path, "PNG")
    return (w, h)


def generate_item_with_pool(item, providers, active, disabled, prompt, out_abs,
                            timeout, fallback_model, enable_fallback=False):
    """单项生图：任何接口失败自动轮换下一个，池子耗尽时若开启保底则生成本地图。"""
    attempts = []
    disabled = set(disabled)
    while True:
        available = [index for index in range(len(providers)) if index not in disabled]
        if not available:
            if enable_fallback:
                try:
                    w, h = create_local_fallback_image(out_abs, item.get("size", [1080, 0]), item, prompt)
                    return {
                        "generated": [{
                            "out": out_abs, "w": w, "h": h, "kind": item.get("kind"),
                            "index": item.get("index"), "sub": item.get("sub"),
                            "provider_id": "local_fallback", "fallback": True,
                        }],
                        "failed": [],
                        "provider_used": "local_fallback", "active": active, "disabled": disabled,
                        "attempts": attempts, "terminal": "fallback",
                    }
                except Exception as fb_e:
                    attempts.append({"provider_id": "local_fallback", "error": str(fb_e)})
            return {
                "generated": [], "failed": [{
                    "index": item.get("index"), "sub": item.get("sub"),
                    "error": "全部生图接口失败；最近错误: " +
                             str(attempts[-1]["error"] if attempts else "unknown"),
                }],
                "provider_used": None, "active": active, "disabled": disabled,
                "attempts": attempts, "terminal": "exhausted",
            }
        if active not in available:
            active = available[0]
        provider = providers[active]
        provider_id = str(provider.get("id", active))
        try:
            try:
                raw = generate_raw(
                    str(provider["base_url"]), str(provider["api_key"]),
                    str(provider.get("model") or fallback_model), prompt, timeout,
                    size=item.get("size", [1080, 0]))
            except TypeError:
                raw = generate_raw(
                    str(provider["base_url"]), str(provider["api_key"]),
                    str(provider.get("model") or fallback_model), prompt, timeout)
        except (RetryableProviderError, NonRetryableProviderError) as e:
            attempts.append({"provider_id": provider_id, "error": str(e)})
            disabled.add(active)
            remaining = [index for index in range(len(providers)) if index not in disabled]
            if remaining:
                active = remaining[0]
                print("生图接口失败，切换备用：" + provider_id + " -> "
                      + str(providers[active].get("id")))
            continue
        except SystemExit as e:
            attempts.append({"provider_id": provider_id, "error": "SystemExit: " + str(e)[:240]})
            disabled.add(active)
            remaining = [index for index in range(len(providers)) if index not in disabled]
            if remaining:
                active = remaining[0]
                print("生图接口失败，切换备用：" + provider_id + " -> "
                      + str(providers[active].get("id")))
            continue
        except Exception as e:
            error = type(e).__name__ + ": " + str(e)[:300]
            attempts.append({"provider_id": provider_id, "error": error})
            disabled.add(active)
            remaining = [index for index in range(len(providers)) if index not in disabled]
            if remaining:
                active = remaining[0]
                print("生图接口失败，切换备用：" + provider_id + " -> "
                      + str(providers[active].get("id")))
            continue

        try:
            w, h = save_resized(raw, out_abs, item.get("size", [1080, 0]))
        except Exception as e:
            error = type(e).__name__ + ": " + str(e)[:300]
            attempts.append({"provider_id": provider_id, "error": error})
            disabled.add(active)
            remaining = [index for index in range(len(providers)) if index not in disabled]
            if remaining:
                active = remaining[0]
                print("生图接口失败，切换备用：" + provider_id + " -> "
                      + str(providers[active].get("id")))
            continue

        print("已生成 " + out_abs + "（" + str(w) + "x" + str(h) + "，接口 "
              + str(provider.get("name", provider_id)) + "）")
        return {
            "generated": [{
                "out": out_abs, "w": w, "h": h, "kind": item.get("kind"),
                "index": item.get("index"), "sub": item.get("sub"), "provider_id": provider_id,
            }],
            "failed": [], "provider_used": provider_id, "active": active,
            "disabled": disabled, "attempts": attempts, "terminal": "success",
        }


class ConcurrentCoordinator:
    """多线程并发执行时的接口池状态协调器"""
    def __init__(self, providers):
        self.providers = providers
        self.active = 0
        self.disabled = set()
        self.lock = threading.Lock()
        self.used_providers = set()
        self.attempts = []

    def run_item(self, item, prompt, out_abs, timeout, fallback_model, enable_fallback):
        with self.lock:
            curr_active = self.active
            curr_disabled = set(self.disabled)

        outcome = generate_item_with_pool(
            item, self.providers, curr_active, curr_disabled,
            prompt, out_abs, timeout, fallback_model, enable_fallback=enable_fallback
        )

        with self.lock:
            self.active = outcome["active"]
            self.disabled.update(outcome["disabled"])
            self.attempts.extend(outcome["attempts"])
            if outcome.get("provider_used"):
                self.used_providers.add(outcome["provider_used"])
        return outcome


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="", help="job JSON 文件名（scripts 目录内）")
    ap.add_argument("--job-json", default="", help="job JSON 内联字符串（与 --job 二选一）")
    ap.add_argument("--scripts-dir", required=True)
    ap.add_argument("--output-dir", default="", help="图片输出边界目录；缺省与 scripts-dir 相同")
    args = ap.parse_args()

    base_abs = os.path.abspath(args.scripts_dir)
    output_abs = os.path.abspath(args.output_dir or args.scripts_dir)
    if args.job_json:
        job = json.loads(args.job_json)
    else:
        if not args.job:
            raise SystemExit("必须提供 --job 或 --job-json")
        job_path = os.path.normpath(os.path.join(base_abs, args.job))
        if not job_path.startswith(base_abs + os.sep):
            raise SystemExit("job 路径越界: " + job_path)
        job = json.load(open(job_path, encoding="utf-8"))

    timeout = int(job.get("timeout_sec", 120))
    concurrency = max(1, min(10, int(job.get("concurrency", 3))))
    enable_fallback = bool(job.get("enable_local_fallback", True))
    zh_only = bool(job.get("zh_only", True))
    items = job.get("items", [])

    generated, failed, attempts = [], [], []
    providers = []
    if not job.get("dry_run"):
        if job.get("providers"):
            providers = provider_pool({"image_api_providers": job["providers"]}, job.get("provider_ids", []), enable_fallback=enable_fallback)
        else:
            conf_path = os.path.join(base_abs, "wx_config.json")
            conf = json.load(open(conf_path, encoding="utf-8")) if os.path.exists(conf_path) else {}
            providers = provider_pool(conf, job.get("provider_ids", []), enable_fallback=enable_fallback)

    if job.get("dry_run"):
        for item in items:
            out_abs = under(output_abs, item["out"])
            prompt = enhance_prompt(str(item.get("prompt", "")), item.get("kind"), zh_only=zh_only, sub=item.get("sub", 1))
            generated.append({"out": out_abs, "dry_run": True, "prompt_head": prompt[:60]})
        result = {"generated": generated, "failed": [], "dry_run": True, "provider_used": "dry_run", "provider_attempts": []}
        emit({"ok": True, "data": result})
        return

    coordinator = ConcurrentCoordinator(providers)

    if len(items) <= 1 or concurrency <= 1:
        # 单项或单并发顺序执行
        for item in items:
            out_abs = under(output_abs, item["out"])
            prompt = enhance_prompt(str(item.get("prompt", "")), item.get("kind"), zh_only=zh_only, sub=item.get("sub", 1))
            outcome = coordinator.run_item(
                item, prompt, out_abs, timeout,
                job.get("model", "gpt-image-2"), enable_fallback
            )
            generated.extend(outcome["generated"])
            failed.extend(outcome["failed"])
    else:
        # 多线程并发执行
        futures = {}
        with ThreadPoolExecutor(max_workers=min(concurrency, len(items))) as executor:
            for idx, item in enumerate(items):
                out_abs = under(output_abs, item["out"])
                prompt = enhance_prompt(str(item.get("prompt", "")), item.get("kind"), zh_only=zh_only, sub=item.get("sub", 1))
                f = executor.submit(
                    coordinator.run_item,
                    item, prompt, out_abs, timeout,
                    job.get("model", "gpt-image-2"), enable_fallback
                )
                futures[f] = idx

            results_by_idx = {}
            for f in as_completed(futures):
                idx = futures[f]
                try:
                    results_by_idx[idx] = f.result()
                except Exception as e:
                    results_by_idx[idx] = {
                        "generated": [], "failed": [{"index": items[idx].get("index"), "error": str(e)}],
                        "attempts": [], "provider_used": None,
                    }

        for idx in range(len(items)):
            res = results_by_idx.get(idx)
            if res:
                generated.extend(res.get("generated", []))
                failed.extend(res.get("failed", []))

    provider_used = ", ".join(sorted(coordinator.used_providers)) if coordinator.used_providers else None
    result = {
        "generated": generated,
        "failed": failed,
        "dry_run": False,
        "provider_used": provider_used,
        "provider_attempts": coordinator.attempts,
    }
    payload = {"ok": len(failed) == 0, "data": result}
    if failed:
        payload["error"] = "；".join(str(item.get("error", "生图失败")) for item in failed)
    emit(payload)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (0, None):
            emit({"ok": False, "error": e.code if isinstance(e.code, str) else "exit " + str(e.code)})
        raise
    except Exception as e:
        emit({"ok": False, "error": type(e).__name__ + ": " + str(e)})
        raise
