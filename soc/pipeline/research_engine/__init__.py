# -*- coding: utf-8 -*-
"""last30days-cn 社媒研究引擎集成模块"""
from .clustering import calculate_dice_similarity, cluster_hot_items, is_near_duplicate, normalize_title
from .hot_boards import fetch_all_hot_boards
from .html_reporter import generate_research_html
from .topic_researcher import research_topic

__all__ = [
    "calculate_dice_similarity",
    "cluster_hot_items",
    "is_near_duplicate",
    "normalize_title",
    "fetch_all_hot_boards",
    "generate_research_html",
    "research_topic",
]
