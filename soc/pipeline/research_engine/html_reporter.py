# -*- coding: utf-8 -*-
"""离线 HTML 研究报告生成器（美观现代、零外链、支持暗黑模式）"""
import html
import os
from typing import Any, Dict


def generate_research_html(data: Dict[str, Any], output_path: str) -> str:
    """基于研究数据渲染离线 HTML 报告并写入文件"""
    topic = html.escape(data.get("topic", "社媒主题研究报告"))
    total_count = data.get("total_evidence_count", 0)
    researched_at = data.get("researched_at", "")
    coverage = data.get("platform_coverage", {})
    evidence_items = data.get("evidence_items", [])
    compact_points = data.get("compact_points", [])

    coverage_badges = "".join(
        f'<span class="badge">{html.escape(k.upper())}: {v}条</span>'
        for k, v in coverage.items()
    )

    items_html = ""
    for item in evidence_items:
        src = html.escape(item.get("source_name", ""))
        title = html.escape(item.get("title", ""))
        snippet = html.escape(item.get("snippet", ""))
        url = html.escape(item.get("url", "#"))
        why = html.escape(item.get("why_relevant", ""))
        items_html += f"""
        <div class="card">
            <div class="card-header">
                <span class="source-tag">{src}</span>
                <a href="{url}" target="_blank" class="card-title">{title}</a>
            </div>
            <p class="card-snippet">{snippet}</p>
            <div class="card-footer">
                <span class="why-badge">{why}</span>
            </div>
        </div>
        """

    points_html = "".join(
        f"<li>{html.escape(pt)}</li>" for pt in compact_points
    )

    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>30天深度研究报告 - {topic}</title>
    <style>
        :root {{
            --bg: #0f172a;
            --surface: #1e293b;
            --border: #334155;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --primary: #38bdf8;
            --accent: #f59e0b;
        }}
        @media (prefers-color-scheme: light) {{
            :root {{
                --bg: #f8fafc;
                --surface: #ffffff;
                --border: #e2e8f0;
                --text: #0f172a;
                --text-muted: #64748b;
                --primary: #0284c7;
                --accent: #d97706;
            }}
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 24px;
            line-height: 1.6;
        }}
        .container {{
            max-width: 960px;
            margin: 0 auto;
        }}
        header {{
            border-bottom: 1px solid var(--border);
            padding-bottom: 16px;
            margin-bottom: 24px;
        }}
        h1 {{
            margin: 0 0 8px 0;
            font-size: 24px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .meta {{
            color: var(--text-muted);
            font-size: 13px;
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }}
        .coverage {{
            display: flex;
            gap: 8px;
            margin-top: 12px;
            flex-wrap: wrap;
        }}
        .badge {{
            background: var(--surface);
            border: 1px solid var(--border);
            padding: 2px 10px;
            border-radius: 999px;
            font-size: 12px;
            color: var(--primary);
            font-weight: 500;
        }}
        .section-title {{
            font-size: 18px;
            font-weight: 600;
            margin: 24px 0 12px 0;
            color: var(--primary);
        }}
        .summary-box {{
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 24px;
        }}
        .summary-box ul {{
            margin: 0;
            padding-left: 20px;
        }}
        .summary-box li {{
            margin-bottom: 8px;
            font-size: 14px;
        }}
        .grid {{
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
        }}
        .card {{
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 14px 18px;
            transition: transform 0.15s, border-color 0.15s;
        }}
        .card:hover {{
            border-color: var(--primary);
        }}
        .card-header {{
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 6px;
        }}
        .source-tag {{
            background: rgba(56, 189, 248, 0.15);
            color: var(--primary);
            font-size: 11px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            flex-shrink: 0;
        }}
        .card-title {{
            color: var(--text);
            text-decoration: none;
            font-size: 15px;
            font-weight: 600;
        }}
        .card-title:hover {{
            color: var(--primary);
            text-decoration: underline;
        }}
        .card-snippet {{
            margin: 0 0 8px 0;
            font-size: 13px;
            color: var(--text-muted);
        }}
        .why-badge {{
            font-size: 11px;
            color: var(--accent);
            background: rgba(245, 158, 11, 0.1);
            padding: 2px 6px;
            border-radius: 4px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 主题研究事实报告: {topic}</h1>
            <div class="meta">
                <span>生成时间: {researched_at}</span>
                <span>全网捕获条目: {total_count} 条</span>
                <span>研究窗口: 最近 30 天</span>
            </div>
            <div class="coverage">
                {coverage_badges}
            </div>
        </header>

        <div class="section-title">💡 核心舆情论点与事实摘要</div>
        <div class="summary-box">
            <ul>
                {points_html}
            </ul>
        </div>

        <div class="section-title">🔍 多平台引用证据库</div>
        <div class="grid">
            {items_html}
        </div>
    </div>
</body>
</html>
"""
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    return output_path
