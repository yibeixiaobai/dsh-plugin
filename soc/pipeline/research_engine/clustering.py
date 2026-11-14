# -*- coding: utf-8 -*-
"""跨平台热点标题聚类与相似度算法模块（基于 2-gram Dice 系数，无需外部依赖）"""
import re
from typing import Any, Dict, List, Set

_PUNCT_RE = re.compile(r"[\s#＃\"“”'‘’《》<>【】\[\]()（）,，.。!！?？:：;；、·…—\-_/|]+")


def normalize_title(title: str) -> str:
    """清理并归一化标题文本"""
    return _PUNCT_RE.sub("", (title or "").lower())


def get_bigrams(text: str) -> Set[str]:
    """生成 2-gram (Bigram) 集合"""
    if len(text) < 2:
        return {text} if text else set()
    return {text[i : i + 2] for i in range(len(text) - 1)}


def calculate_dice_similarity(a: str, b: str) -> float:
    """计算两个文本的 Bigram Dice 相似系数 (0.0 ~ 1.0)"""
    na, nb = normalize_title(a), normalize_title(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    # 短文本包含测试
    if min(len(na), len(nb)) >= 4 and (na in nb or nb in na):
        return 0.95
    sa, sb = get_bigrams(na), get_bigrams(nb)
    if not sa or not sb:
        return 0.0
    intersection = len(sa & sb)
    return (2.0 * intersection) / (len(sa) + len(sb))


def is_near_duplicate(a: str, b: str, threshold: float = 0.42) -> bool:
    """判断两个标题是否属于跨平台同一事件"""
    return calculate_dice_similarity(a, b) >= threshold


def cluster_hot_items(raw_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """将来自不同平台的原始热搜条目合并为跨平台聚合热点。

    每个输入 item 期望包含：
    - title: 标题
    - source: 来源平台代号 (weibo / bilibili / zhihu / toutiao / douyin / baidu)
    - source_name: 来源平台名称 (微博热搜 / B站热搜 等)
    - rank: 榜单排名 (1-50)
    - url: 链接
    - hot_value: 热度值 (数值或字符串)
    """
    clusters: List[Dict[str, Any]] = []

    for item in raw_items:
        title = item.get("title", "").strip()
        if not title or len(title) < 2:
            continue

        matched_cluster = None
        for cluster in clusters:
            # 与聚类中心标题比对
            if is_near_duplicate(title, cluster["title"]):
                matched_cluster = cluster
                break

        if matched_cluster:
            matched_cluster["items"].append(item)
            if item["source"] not in matched_cluster["platforms"]:
                matched_cluster["platforms"].append(item["source"])
                matched_cluster["platform_names"].append(item["source_name"])
            # 如果当前项的标题更短或更具有总结性，更新主标题
            if 6 <= len(title) < len(matched_cluster["title"]):
                matched_cluster["title"] = title
        else:
            clusters.append({
                "title": title,
                "platforms": [item["source"]],
                "platform_names": [item["source_name"]],
                "items": [item],
                "created_at": item.get("date", ""),
            })

    # 计算跨平台综合热度指数并排序
    for cluster in clusters:
        # 跨平台共振加权分：登上的平台数量越丰富，热度越高
        p_count = len(cluster["platforms"])
        # 计算该聚类在各平台的最高排名贡献
        best_rank = min((it.get("rank", 50) for it in cluster["items"]), default=50)
        rank_score = max(0, 50 - best_rank)
        # 综合热度分 (0 - 100)
        composite_score = min(99, 50 + (p_count * 15) + int(rank_score * 0.8))
        cluster["cross_platform_count"] = p_count
        cluster["best_rank"] = best_rank
        cluster["hot_score"] = composite_score

    # 优先按登上的平台数降序、综合热度降序
    clusters.sort(key=lambda c: (c["cross_platform_count"], c["hot_score"]), reverse=True)
    return clusters
