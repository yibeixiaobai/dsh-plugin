# -*- coding: utf-8 -*-
"""主流社媒平台全网热榜抓取器集合（纯标准库实现，高可用容错）"""
import concurrent.futures
import re
import urllib.parse
from typing import Any, Dict, List, Optional

from .clustering import cluster_hot_items
from .http_client import fetch_json, fetch_text, get_headers


def fetch_weibo_hot(limit: int = 30) -> List[Dict[str, Any]]:
    """抓取微博实时热搜榜"""
    items = []
    url = "https://weibo.com/ajax/side/hotSearch"
    try:
        data = fetch_json(url, headers=get_headers(referer="https://weibo.com/"), timeout=6)
        realtime = (data or {}).get("data", {}).get("realtime", [])
        for rank, entry in enumerate(realtime, start=1):
            title = entry.get("word") or entry.get("note") or ""
            if not title:
                continue
            hot_val = entry.get("num") or entry.get("raw_hot") or 0
            items.append({
                "title": title.strip(),
                "rank": rank,
                "source": "weibo",
                "source_name": "微博热搜",
                "url": f"https://s.weibo.com/weibo?q={urllib.parse.quote(title)}",
                "hot_value": hot_val,
                "label": entry.get("label_name", ""),
            })
            if len(items) >= limit:
                break
    except Exception:
        pass
    return items


def fetch_zhihu_hot(limit: int = 30) -> List[Dict[str, Any]]:
    """抓取知乎热榜"""
    items = []
    url = "https://api.zhihu.com/topstory/hot-lists/total?limit=50"
    try:
        data = fetch_json(url, headers=get_headers(referer="https://www.zhihu.com/"), timeout=6)
        data_list = (data or {}).get("data", [])
        for rank, entry in enumerate(data_list, start=1):
            target = entry.get("target") or {}
            title = target.get("title") or ""
            if not title:
                continue
            detail_text = entry.get("detail_text") or ""
            url_val = target.get("url") or f"https://www.zhihu.com/question/{target.get('id', '')}"
            items.append({
                "title": title.strip(),
                "rank": rank,
                "source": "zhihu",
                "source_name": "知乎热榜",
                "url": url_val,
                "hot_value": detail_text,
            })
            if len(items) >= limit:
                break
    except Exception:
        pass
    return items


def fetch_bilibili_hot(limit: int = 30) -> List[Dict[str, Any]]:
    """抓取 B站实时热搜词"""
    items = []
    url = "https://s.search.bilibili.com/main/hotword"
    try:
        data = fetch_json(url, headers=get_headers(referer="https://www.bilibili.com/"), timeout=6)
        list_data = (data or {}).get("list", [])
        for rank, entry in enumerate(list_data, start=1):
            title = entry.get("keyword") or ""
            if not title:
                continue
            items.append({
                "title": title.strip(),
                "rank": rank,
                "source": "bilibili",
                "source_name": "B站热搜",
                "url": f"https://search.bilibili.com/all?keyword={urllib.parse.quote(title)}",
                "hot_value": entry.get("icon", ""),
            })
            if len(items) >= limit:
                break
    except Exception:
        pass
    return items


def fetch_toutiao_hot(limit: int = 30) -> List[Dict[str, Any]]:
    """抓取今日头条热榜"""
    items = []
    url = "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc"
    try:
        data = fetch_json(url, headers=get_headers(referer="https://www.toutiao.com/"), timeout=6)
        data_list = (data or {}).get("data", [])
        for rank, entry in enumerate(data_list, start=1):
            title = entry.get("Title") or ""
            if not title:
                continue
            items.append({
                "title": title.strip(),
                "rank": rank,
                "source": "toutiao",
                "source_name": "头条热榜",
                "url": entry.get("Url") or f"https://so.toutiao.com/search?keyword={urllib.parse.quote(title)}",
                "hot_value": entry.get("HotValue", ""),
            })
            if len(items) >= limit:
                break
    except Exception:
        pass
    return items


def fetch_douyin_hot(limit: int = 30) -> List[Dict[str, Any]]:
    """抓取抖音热搜榜单"""
    items = []
    url = "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1"
    try:
        data = fetch_json(url, headers=get_headers(referer="https://www.douyin.com/"), timeout=6)
        word_list = (data or {}).get("data", {}).get("word_list", [])
        for rank, entry in enumerate(word_list, start=1):
            title = entry.get("word") or ""
            if not title:
                continue
            items.append({
                "title": title.strip(),
                "rank": rank,
                "source": "douyin",
                "source_name": "抖音热榜",
                "url": f"https://www.douyin.com/search/{urllib.parse.quote(title)}",
                "hot_value": entry.get("hot_value", 0),
            })
            if len(items) >= limit:
                break
    except Exception:
        pass
    return items


def fetch_baidu_hot(limit: int = 30) -> List[Dict[str, Any]]:
    """抓取百度热搜"""
    items = []
    url = "https://top.baidu.com/board?tab=realtime"
    try:
        html = fetch_text(url, headers=get_headers(referer="https://www.baidu.com/", is_json=False), timeout=6)
        # 从页面 script 中匹配热搜数组
        matches = re.findall(r'"word":\s*"([^"]+)"', html)
        if matches:
            seen = set()
            rank = 1
            for w in matches:
                word_clean = w.encode("utf-8").decode("unicode_escape", errors="ignore").strip()
                if word_clean and word_clean not in seen and len(word_clean) >= 2:
                    seen.add(word_clean)
                    items.append({
                        "title": word_clean,
                        "rank": rank,
                        "source": "baidu",
                        "source_name": "百度热搜",
                        "url": f"https://www.baidu.com/s?wd={urllib.parse.quote(word_clean)}",
                        "hot_value": "热搜",
                    })
                    rank += 1
                    if len(items) >= limit:
                        break
    except Exception:
        pass
    return items


PLATFORM_FETCHERS = [
    ("weibo", fetch_weibo_hot),
    ("zhihu", fetch_zhihu_hot),
    ("bilibili", fetch_bilibili_hot),
    ("toutiao", fetch_toutiao_hot),
    ("douyin", fetch_douyin_hot),
    ("baidu", fetch_baidu_hot),
]


def fetch_all_hot_boards(
    timeout: int = 10,
    per_platform_limit: int = 25,
) -> Dict[str, Any]:
    """并发抓取全网主流平台热搜，并生成跨平台聚合聚类结果"""
    all_raw_items: List[Dict[str, Any]] = []
    platform_coverage: Dict[str, int] = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(PLATFORM_FETCHERS)) as executor:
        future_map = {
            executor.submit(fetcher, per_platform_limit): plat_code
            for plat_code, fetcher in PLATFORM_FETCHERS
        }
        for future in concurrent.futures.as_completed(future_map, timeout=timeout):
            plat_code = future_map[future]
            try:
                plat_items = future.result()
                platform_coverage[plat_code] = len(plat_items)
                all_raw_items.extend(plat_items)
            except Exception:
                platform_coverage[plat_code] = 0

    # 跨平台聚类合并
    clustered = cluster_hot_items(all_raw_items)

    return {
        "raw_count": len(all_raw_items),
        "cluster_count": len(clustered),
        "platform_coverage": platform_coverage,
        "clusters": clustered,
    }
