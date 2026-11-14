# -*- coding: utf-8 -*-
"""轻量高可用 HTTP 客户端（仅依赖 Python 3 标准库）"""
import json
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

# 默认跳过非严格证书校验（避免在企业网络或特殊代理下抛 SSL 异常）
try:
    _SSL_CTX = ssl.create_default_context()
    _SSL_CTX.check_hostname = False
    _SSL_CTX.verify_mode = ssl.CERT_NONE
except Exception:
    _SSL_CTX = None

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
)


def get_headers(
    referer: Optional[str] = None,
    is_mobile: bool = False,
    is_json: bool = True,
    extra: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    headers = {
        "User-Agent": MOBILE_UA if is_mobile else DEFAULT_UA,
        "Accept": "application/json, text/plain, */*" if is_json else "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    if referer:
        headers["Referer"] = referer
    if extra:
        headers.update(extra)
    return headers


def fetch_text(
    url: str,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 8,
    encoding: str = "utf-8",
) -> str:
    """发送 GET 请求并返回文本内容"""
    req_headers = headers or get_headers(is_json=False)
    req = urllib.request.Request(url, headers=req_headers, method="GET")
    try:
        kwargs: Dict[str, Any] = {"timeout": timeout}
        if _SSL_CTX is not None:
            kwargs["context"] = _SSL_CTX
        with urllib.request.urlopen(req, **kwargs) as resp:
            raw = resp.read()
            return raw.decode(encoding, errors="replace")
    except Exception as exc:
        raise RuntimeError(f"HTTP GET failed ({url}): {exc}") from exc


def fetch_json(
    url: str,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 8,
    encoding: str = "utf-8",
) -> Any:
    """发送 GET 请求并返回解析后的 JSON 对象"""
    req_headers = headers or get_headers(is_json=True)
    text = fetch_text(url, headers=req_headers, timeout=timeout, encoding=encoding)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed to parse JSON from {url}: {exc}") from exc
