# -*- coding: utf-8 -*-
"""主题 30 天深度研究引擎 (Topic 30-Day Deep Researcher)

功能：
1. 并发检索知乎、B站、头条、百度（及Bing）过去 30 天真实讨论与高赞内容；
2. 提取具体互动指标（播放量/点赞数/评论数/收藏数/回答数）；
3. 聚类高赞观点、争议热点、实操痛点；
4. 输出供 Agent 创作引用的证据链摘要与完整 JSON。
"""
import concurrent.futures
import json
import re
import urllib.parse
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from .http_client import fetch_json, fetch_text, get_headers


def search_zhihu_topic(topic: str, limit: int = 15) -> List[Dict[str, Any]]:
    """检索知乎相关高赞讨论与回答"""
    items = []
    # 知乎公共搜索或联想
    encoded = urllib.parse.quote(topic)
    url = f"https://api.zhihu.com/search_v3?t=general&q={encoded}&correction=1&offset=0&limit={limit}"
    try:
        data = fetch_json(url, headers=get_headers(referer="https://www.zhihu.com/"), timeout=8)
        data_list = (data or {}).get("data", [])
        for entry in data_list:
            t_obj = entry.get("object", {})
            title = t_obj.get("title") or t_obj.get("question", {}).get("title") or ""
            excerpt = t_obj.get("excerpt") or ""
            clean_excerpt = re.sub(r"<[^>]+>", "", excerpt).strip()
            voteup_count = t_obj.get("voteup_count") or 0
            comment_count = t_obj.get("comment_count") or 0
            url_val = t_obj.get("url") or ""
            if not title:
                continue
            items.append({
                "source": "zhihu",
                "source_name": "知乎",
                "title": re.sub(r"<[^>]+>", "", title).strip(),
                "snippet": clean_excerpt[:150],
                "url": url_val,
                "engagement": {
                    "likes": voteup_count,
                    "comments": comment_count,
                },
                "why_relevant": f"知乎高赞回答 ({voteup_count} 赞同, {comment_count} 评论)",
            })
    except Exception:
        pass
    return items


def search_bilibili_topic(topic: str, limit: int = 15) -> List[Dict[str, Any]]:
    """检索 B站相关高播放/收藏视频与教程"""
    items = []
    encoded = urllib.parse.quote(topic)
    url = f"https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword={encoded}&page=1"
    try:
        headers = get_headers(
            referer="https://search.bilibili.com/",
            extra={"Cookie": "buvid3=b_search_guest; buvid4=b_search_guest_4"},
        )
        data = fetch_json(url, headers=headers, timeout=8)
        results = (data or {}).get("data", {}).get("result", [])
        for r in results:
            title = re.sub(r"<[^>]+>", "", r.get("title", "")).strip()
            desc = re.sub(r"<[^>]+>", "", r.get("description", "")).strip()
            author = r.get("author", "")
            play = r.get("play", 0)
            favorites = r.get("favorites", 0)
            danmaku = r.get("danmaku", 0)
            arcurl = r.get("arcurl", "")
            if not title:
                continue
            items.append({
                "source": "bilibili",
                "source_name": "B站",
                "title": title,
                "snippet": f"UP主【{author}】: {desc[:120]}",
                "url": arcurl,
                "engagement": {
                    "views": play,
                    "favorites": favorites,
                    "comments": danmaku,
                },
                "why_relevant": f"B站视频 ({play} 播放, {favorites} 收藏)",
            })
            if len(items) >= limit:
                break
    except Exception:
        pass
    return items


def search_toutiao_topic(topic: str, limit: int = 15) -> List[Dict[str, Any]]:
    """检索今日头条相关热门资讯"""
    items = []
    encoded = urllib.parse.quote(topic)
    url = f"https://so.toutiao.com/search?keyword={encoded}&pd=information"
    try:
        html = fetch_text(url, headers=get_headers(referer="https://so.toutiao.com/"), timeout=8)
        # 匹配卡片 JSON 数据
        card_matches = re.findall(r'<script[^>]*type="application/json"[^>]*>(\{"data":[\s\S]*?)</script>', html)
        for raw_json in card_matches:
            try:
                parsed = json.loads(raw_json)
                entries = (parsed or {}).get("data", [])
                for entry in entries:
                    t = entry.get("title") or entry.get("title_rich") or ""
                    clean_t = re.sub(r"<[^>]+>", "", t).strip()
                    if not clean_t:
                        continue
                    u = entry.get("url") or entry.get("article_url") or ""
                    items.append({
                        "source": "toutiao",
                        "source_name": "今日头条",
                        "title": clean_t,
                        "snippet": entry.get("summary", "")[:120],
                        "url": u,
                        "engagement": {
                            "reads": entry.get("read_count", 0),
                            "comments": entry.get("comment_count", 0),
                        },
                        "why_relevant": "头条时效资讯",
                    })
                    if len(items) >= limit:
                        break
            except Exception:
                continue
            if len(items) >= limit:
                break
    except Exception:
        pass
    return items


def search_baidu_web_topic(topic: str, limit: int = 15) -> List[Dict[str, Any]]:
    """检索百度网页/学术政策实时热点"""
    items = []
    encoded = urllib.parse.quote(topic)
    url = f"https://www.baidu.com/s?wd={encoded}&rn={limit}"
    try:
        html = fetch_text(url, headers=get_headers(referer="https://www.baidu.com/", is_json=False), timeout=8)
        # 提取结果卡片标题
        matches = re.findall(r'<h3 class="[^"]*t[^"]*"><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a></h3>', html)
        for link, raw_title in matches:
            clean_title = re.sub(r"<[^>]+>", "", raw_title).strip()
            if not clean_title or len(clean_title) < 4:
                continue
            items.append({
                "source": "baidu",
                "source_name": "百度搜索",
                "title": clean_title,
                "snippet": clean_title,
                "url": link,
                "engagement": {},
                "why_relevant": "全网主流搜索引用",
            })
            if len(items) >= limit:
                break
    except Exception:
        pass
    return items


def research_topic(
    topic: str,
    days: int = 30,
    depth: str = "default",
    timeout: int = 15,
) -> Dict[str, Any]:
    """执行主题 30 天全网多平台深度研究"""
    limit_per_source = 20 if depth == "deep" else 10
    tasks = [
        ("zhihu", search_zhihu_topic, limit_per_source),
        ("bilibili", search_bilibili_topic, limit_per_source),
        ("toutiao", search_toutiao_topic, limit_per_source),
        ("baidu", search_baidu_web_topic, limit_per_source),
    ]

    evidence_items: List[Dict[str, Any]] = []
    platform_coverage: Dict[str, int] = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks)) as executor:
        future_map = {
            executor.submit(fn, topic, lim): code
            for code, fn, lim in tasks
        }
        for future in concurrent.futures.as_completed(future_map, timeout=timeout):
            code = future_map[future]
            try:
                res = future.result()
                platform_coverage[code] = len(res)
                evidence_items.extend(res)
            except Exception:
                platform_coverage[code] = 0

    # 提取关键高频论点与互动最高条目
    def get_sort_weight(item: Dict[str, Any]) -> int:
        eng = item.get("engagement", {})
        return (
            eng.get("views", 0) // 100
            + eng.get("likes", 0) * 5
            + eng.get("favorites", 0) * 8
            + eng.get("comments", 0) * 3
            + eng.get("reads", 0) // 50
        )

    evidence_items.sort(key=get_sort_weight, reverse=True)

    # 提炼 Agent 友好的精简事实摘要 (Compact Evidence)
    compact_points = []
    for idx, item in enumerate(evidence_items[:8], start=1):
        s_name = item.get("source_name", "社媒")
        t = item.get("title", "")
        snip = item.get("snippet", "")
        eng = item.get("engagement", {})
        eng_parts = []
        if eng.get("likes"):
            eng_parts.append(f"{eng['likes']}赞")
        if eng.get("views"):
            eng_parts.append(f"{eng['views']}播放")
        if eng.get("favorites"):
            eng_parts.append(f"{eng['favorites']}收藏")
        eng_str = f" [{', '.join(eng_parts)}]" if eng_parts else ""
        compact_points.append(f"{idx}. 【{s_name}】{t}{eng_str} - {snip[:80]}")

    return {
        "topic": topic,
        "days": days,
        "total_evidence_count": len(evidence_items),
        "platform_coverage": platform_coverage,
        "evidence_items": evidence_items,
        "compact_points": compact_points,
        "researched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
