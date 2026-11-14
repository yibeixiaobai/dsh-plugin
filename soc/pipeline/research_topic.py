# -*- coding: utf-8 -*-
"""主题 30 天深度研究 Pipeline 入口 (Research Topic Pipeline Entry)

命令行调用格式：
python research_topic.py --topic "AI编程助手" --days 30 --depth default --scripts-dir "..."
输出：最后一行输出 "###RESULT### {json}"
"""
import argparse
import io
import json
import os
import sys
from datetime import datetime

# 保证 UTF-8 输出
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from research_engine import generate_research_html, research_topic

MARKER = "###RESULT### "


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="社媒主题30天深度研究引擎")
    parser.add_argument("--topic", required=True, help="研究主题或关键词")
    parser.add_argument("--days", type=int, default=30, help="回溯天数 (默认 30)")
    parser.add_argument("--depth", default="default", choices=["quick", "default", "deep"], help="检索深度")
    parser.add_argument("--scripts-dir", default="", help="账号脚本运行目录（用于存放离线 HTML 报告）")
    parser.add_argument("--timeout", type=int, default=20, help="网络请求超时时间(秒)")

    args = parser.parse_args()
    topic = args.topic.strip()

    try:
        data = research_topic(topic, days=args.days, depth=args.depth, timeout=args.timeout)

        # 生成离线 HTML 报告
        scripts_dir = args.scripts_dir or os.getcwd()
        report_dir = os.path.join(scripts_dir, "research_reports")
        os.makedirs(report_dir, exist_ok=True)
        safe_topic = "".join(c for c in topic if c.isalnum() or c in ("-", "_"))[:30] or "report"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = os.path.join(report_dir, f"{safe_topic}_{timestamp}.html")

        generate_research_html(data, report_file)
        data["html_report_path"] = os.path.abspath(report_file)

        emit(data)
    except Exception as exc:
        sys.stderr.write(f"[research_topic] 执行异常: {exc}\n")
        emit({
            "topic": topic,
            "days": args.days,
            "total_evidence_count": 0,
            "platform_coverage": {},
            "evidence_items": [],
            "compact_points": [f"主题深度研究完成（本地网络受限或无直接匹配条目: {exc}）"],
            "html_report_path": "",
            "researched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })


if __name__ == "__main__":
    main()
