# -*- coding: utf-8 -*-
"""参数化生图流水线（封面/正文信息图）：纯网络调用 + PIL 缩放。

- 凭据读 scripts/wx_config.json 的 image_api_base / image_api_key（由插件 syncConfig 同步）
- 输出路径由 TS 侧在 job.items[].out 中给定（绝对路径），本脚本仅做边界校验后经 PIL 保存
- 尺寸：封面由 TS 按设置的封面比例换算（21:9=3520x1500、16:9=3024x1701、1:1=1920x1920）；
  正文图 size 高度为 0 时按宽度 1080 等比缩放

安全约定：API 返回的图片下载 URL 必须是 http(s)、主机经 DNS 解析后不得指向
私网/环回/链路本地/保留地址，且不自动跟随重定向（手动重定向时重新校验）。

输出协议：最后一行 "###RESULT### {json}"，{ok, data:{generated, failed, dry_run}}
"""
import argparse
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


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False))


def under(base, p):
    """规范化 p 并强制其位于 base 之内；越界（上级目录引用、目录外绝对路径）一律拒绝。"""
    bp = os.path.abspath(base)
    cp = os.path.abspath(p)
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
        resp = requests.get(current, timeout=timeout, allow_redirects=False)
        if resp.status_code in (301, 302, 303, 307, 308):
            current = resp.headers.get("Location", "")
            if not current:
                raise SystemExit("重定向缺少 Location")
            continue
        resp.raise_for_status()
        return resp.content
    raise SystemExit("重定向次数超限")


def generate_raw(base_url, api_key, model, prompt, timeout):
    url = base_url.rstrip("/") + "/v1/images/generations"
    resp = requests.post(
        url,
        json={"model": model, "prompt": prompt, "quality": "hd"},
        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    img_url = data["data"][0]["url"]
    return fetch_bytes(img_url, timeout)


def save_resized(raw_bytes, out_path, size):
    img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    w, h = int(size[0]), int(size[1])
    if h <= 0:
        h = max(1, round(img.size[1] * w / img.size[0]))
    img.resize((w, h), Image.LANCZOS).save(out_path, "PNG")
    return (w, h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="", help="job JSON 文件名（scripts 目录内）")
    ap.add_argument("--job-json", default="", help="job JSON 内联字符串（与 --job 二选一）")
    ap.add_argument("--scripts-dir", required=True)
    args = ap.parse_args()

    base_abs = os.path.abspath(args.scripts_dir)
    if args.job_json:
        job = json.loads(args.job_json)
    else:
        if not args.job:
            raise SystemExit("必须提供 --job 或 --job-json")
        job_path = os.path.normpath(os.path.join(base_abs, args.job))
        if not job_path.startswith(base_abs + os.sep):
            raise SystemExit("job 路径越界: " + job_path)
        job = json.load(open(job_path, encoding="utf-8"))

    conf = json.load(open(os.path.join(base_abs, "wx_config.json"), encoding="utf-8"))
    base_url = conf.get("image_api_base", "https://api.a6api.com")
    api_key = conf.get("image_api_key", "")
    if not job.get("dry_run") and not api_key:
        raise SystemExit("缺少生图 API Key（image_api_key）")

    timeout = int(job.get("timeout_sec", 150))
    generated, failed = [], []
    items = job.get("items", [])
    for k, item in enumerate(items):
        out_abs = under(base_abs, item["out"])
        prompt = str(item["prompt"])
        if job.get("zh_only", True):
            prompt = prompt + " " + ZH_SUFFIX
        if job.get("dry_run"):
            generated.append({"out": out_abs, "dry_run": True, "prompt_head": prompt[:60]})
            continue
        try:
            raw = generate_raw(base_url, api_key, job.get("model", "gpt-image-2"), prompt, timeout)
            w, h = save_resized(raw, out_abs, item.get("size", [1080, 0]))
            generated.append({"out": out_abs, "w": w, "h": h, "kind": item.get("kind"), "index": item.get("index")})
            print("已生成 " + out_abs + "（" + str(w) + "x" + str(h) + "）")
        except Exception as e:
            failed.append({"index": item.get("index"), "sub": item.get("sub"),
                           "error": type(e).__name__ + ": " + str(e)[:300]})
        if k < len(items) - 1:
            time.sleep(2)

    emit({"ok": len(failed) == 0,
          "data": {"generated": generated, "failed": failed, "dry_run": bool(job.get("dry_run"))}})


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
