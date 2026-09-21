# -*- coding: utf-8 -*-
"""参数化生图流水线（封面/正文信息图）：纯网络调用 + PIL 缩放。

- 凭据读 scripts/wx_config.json 的 image_api_providers（由插件 syncConfig 同步）
- 输出路径由 TS 侧在 job.items[].out 中给定（绝对路径），本脚本仅做边界校验后经 PIL 保存
- 尺寸：封面由 TS 按设置的封面比例换算（2.35:1=3520x1498、21:9=3520x1500、16:9=3024x1701、1:1=1920x1920）；
  正文图 size 高度为 0 时按宽度 1080 等比缩放

安全约定：API 返回的图片下载 URL 必须是 http(s)、主机经 DNS 解析后不得指向
私网/环回/链路本地/保留地址，且不自动跟随重定向（手动重定向时重新校验）。

输出协议：最后一行 "###RESULT### {json}"，{ok, data:{generated, failed, dry_run}}
"""
import argparse
import base64
import binascii
import io
import ipaddress
import json
import os
import socket
import sys
import time
from urllib.parse import urlparse

import requests
from PIL import Image

MARKER = "###RESULT### "

ZH_SUFFIX = "画面中所有文字必须全部是中文，禁止出现任何英文单词、英文字母，禁止二维码。"
MAX_REDIRECTS = 2
RETRYABLE_STATUS = {401, 403, 408, 429}


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False))


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
    """手动跟随重定向（最多 MAX_REDIRECTS 次），每一跳都重新做公网校验。"""
    current = u
    for _ in range(MAX_REDIRECTS + 1):
        assert_public_http_url(current)
        resp = requests.get(current, timeout=max(30, int(timeout)), allow_redirects=False)
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


def generate_raw(base_url, api_key, model, prompt, timeout):
    url = base_url.rstrip("/") + "/v1/images/generations"
    connect_timeout = 15
    read_timeout = max(60, min(int(timeout), 300))
    timeout_tuple = (connect_timeout, read_timeout)
    resp = None
    last_err = None
    for attempt in range(2):
        try:
            resp = requests.post(
                url,
                json={"model": model, "prompt": prompt, "quality": "hd"},
                headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
                timeout=timeout_tuple,
            )
            break
        except (requests.Timeout, requests.ConnectionError) as e:
            last_err = e
            if attempt == 0:
                time.sleep(2)
                continue
            raise RetryableProviderError(type(e).__name__ + ": " + str(e)[:240])
        except requests.RequestException as e:
            raise RetryableProviderError(type(e).__name__ + ": " + str(e)[:240])
    if resp is None:
        raise RetryableProviderError("请求未完成: " + str(last_err)[:240])
    if resp.status_code in RETRYABLE_STATUS or resp.status_code >= 500:
        raise RetryableProviderError(
            "HTTP " + str(resp.status_code) + ": " + resp.text[:240])
    if resp.status_code >= 400:
        # 4xx（400 模型不存在 / 402 欠费 / 404 路径不符等）是接口级失败，
        # 同样切换下一个接口，而不是终止整个批次
        raise RetryableProviderError(
            "HTTP " + str(resp.status_code) + ": " + resp.text[:240])
    if resp.status_code >= 300:
        raise NonRetryableProviderError("意外的重定向响应 HTTP " + str(resp.status_code))
    try:
        data = resp.json()
    except ValueError as e:
        raise RetryableProviderError("接口未返回合法 JSON: " + str(e))
    # OpenAI 兼容接口可能返回图片 URL，也可能直接返回 base64。
    # 不假定 data[0] 一定有 url，避免把接口格式差异暴露成 KeyError。
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
        # 安全校验（受限地址/重定向超限）按接口级失败处理，交给轮换而非炸掉整个进程
        raise RetryableProviderError("图片下载被阻断: " + str(e)[:240])


def provider_pool(conf, selected_ids):
    raw = conf.get("image_api_providers")
    if not isinstance(raw, list) or not raw:
        raw = [{
            "id": "default",
            "enabled": True,
            "name": "默认生图接口",
            "base_url": conf.get("image_api_base", "https://api.a6api.com"),
            "api_key": conf.get("image_api_key", ""),
            "model": "gpt-image-2",
            "priority": 0,
        }]
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
    if not providers:
        raise SystemExit("没有可用的生图接口（需启用并填写 base_url / api_key）")
    return providers


def save_resized(raw_bytes, out_path, size):
    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    w, h = int(size[0]), int(size[1])
    if h <= 0:
        h = max(1, round(img.size[1] * w / img.size[0]))
    img.resize((w, h), Image.LANCZOS).save(out_path, "PNG")
    return (w, h)


def generate_item_with_pool(item, providers, active, disabled, prompt, out_abs,
                            timeout, fallback_model):
    """Generate one item; any provider-scoped failure (network, any HTTP status,
    malformed response, decode error) advances to the next provider without re-probing
    failed ones. The item only fails when the whole pool is exhausted."""
    attempts = []
    disabled = set(disabled)
    while True:
        available = [index for index in range(len(providers)) if index not in disabled]
        if not available:
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
            else:
                return {
                    "generated": [], "failed": [{
                        "index": item.get("index"), "sub": item.get("sub"),
                        "error": "全部生图接口失败；最近错误: " + str(e),
                    }],
                    "provider_used": None, "active": active, "disabled": disabled,
                    "attempts": attempts, "terminal": "exhausted",
                }
            continue
        except SystemExit as e:
            # 不让单接口的安全拦截/退出把整个进程带走
            attempts.append({"provider_id": provider_id, "error": "SystemExit: " + str(e)[:240]})
            disabled.add(active)
            remaining = [index for index in range(len(providers)) if index not in disabled]
            if remaining:
                active = remaining[0]
                print("生图接口失败，切换备用：" + provider_id + " -> "
                      + str(providers[active].get("id")))
                continue
            return {
                "generated": [], "failed": [{
                    "index": item.get("index"), "sub": item.get("sub"),
                    "error": "全部生图接口失败；最近错误: " + str(e),
                }],
                "provider_used": None, "active": active, "disabled": disabled,
                "attempts": attempts, "terminal": "exhausted",
            }
        except Exception as e:
            # 生图返回内容解析（PIL 等）等意外异常视为该接口失败，同样轮换
            error = type(e).__name__ + ": " + str(e)[:300]
            attempts.append({"provider_id": provider_id, "error": error})
            disabled.add(active)
            remaining = [index for index in range(len(providers)) if index not in disabled]
            if remaining:
                active = remaining[0]
                print("生图接口失败，切换备用：" + provider_id + " -> "
                      + str(providers[active].get("id")))
                continue
            return {
                "generated": [], "failed": [{
                    "index": item.get("index"), "sub": item.get("sub"),
                    "error": "全部生图接口失败；最近错误: " + error,
                }],
                "provider_used": None, "active": active, "disabled": disabled,
                "attempts": attempts, "terminal": "exhausted",
            }
        try:
            w, h = save_resized(raw, out_abs, item.get("size", [1080, 0]))
        except Exception as e:
            # 接口返回的图片内容无法解析属于该接口的问题，轮换下一个接口
            error = type(e).__name__ + ": " + str(e)[:300]
            attempts.append({"provider_id": provider_id, "error": error})
            disabled.add(active)
            remaining = [index for index in range(len(providers)) if index not in disabled]
            if remaining:
                active = remaining[0]
                print("生图接口失败，切换备用：" + provider_id + " -> "
                      + str(providers[active].get("id")))
                continue
            return {
                "generated": [], "failed": [{
                    "index": item.get("index"), "sub": item.get("sub"),
                    "error": "全部生图接口失败；最近错误: " + error,
                }],
                "provider_used": None, "active": active, "disabled": disabled,
                "attempts": attempts, "terminal": "exhausted",
            }
        print("已生成 " + out_abs + "（" + str(w) + "x" + str(h) + "，接口 "
              + str(provider.get("name", provider_id)) + "）")
        return {
            "generated": [{
                "out": out_abs, "w": w, "h": h, "kind": item.get("kind"),
                "index": item.get("index"), "provider_id": provider_id,
            }],
            "failed": [], "provider_used": provider_id, "active": active,
            "disabled": disabled, "attempts": attempts, "terminal": "success",
        }


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

    timeout = int(job.get("timeout_sec", 150))
    generated, failed, attempts = [], [], []
    items = job.get("items", [])
    providers = []
    active = 0
    disabled = set()
    provider_used = None
    if not job.get("dry_run"):
        if job.get("providers"):
            providers = provider_pool({"image_api_providers": job["providers"]}, job.get("provider_ids", []))
        else:
            conf = json.load(open(os.path.join(base_abs, "wx_config.json"), encoding="utf-8"))
            providers = provider_pool(conf, job.get("provider_ids", []))
    for k, item in enumerate(items):
        out_abs = under(output_abs, item["out"])
        prompt = str(item["prompt"])
        if job.get("zh_only", True):
            prompt = prompt + " " + ZH_SUFFIX
        if job.get("dry_run"):
            generated.append({"out": out_abs, "dry_run": True, "prompt_head": prompt[:60]})
            continue
        outcome = generate_item_with_pool(
            item, providers, active, set(), prompt, out_abs, timeout,
            job.get("model", "gpt-image-2"))
        generated.extend(outcome["generated"])
        failed.extend(outcome["failed"])
        attempts.extend(outcome["attempts"])
        active = outcome["active"]
        if outcome["provider_used"]:
            provider_used = outcome["provider_used"]
        if k < len(items) - 1:
            time.sleep(2)

    result = {"generated": generated, "failed": failed, "dry_run": bool(job.get("dry_run")),
              "provider_used": provider_used, "provider_attempts": attempts}
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
