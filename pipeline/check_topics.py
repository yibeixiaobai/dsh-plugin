# -*- coding: utf-8 -*-
"""选题查重：候选选题 vs 历史发布标题。

历史来源：
1. scripts/publish_result.json 的 articles 列表（最近一次成功发布）
2. scripts/gen_*.py / publish_*.py 内 TITLES = [...] 字面量（历次发布脚本）

输出协议：最后一行 "###RESULT### {json}"，{ok, data:{history_count, items:[{topic, risk, top_score, matches}]}}
用法: python check_topics.py --topics '["选题1","选题2"]' --scripts-dir <项目 scripts 目录>
"""
import argparse
import json
import os
import re
import sys
from difflib import SequenceMatcher

MARKER = "###RESULT### "


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False))


def extract_history(scripts_dir):
    titles = []
    if not os.path.isdir(scripts_dir):
        return titles
    pr = os.path.join(scripts_dir, "publish_result.json")
    if os.path.exists(pr):
        try:
            d = json.load(open(pr, encoding="utf-8"))
            for t in d.get("articles", []):
                titles.append((t, "publish_result.json"))
        except Exception as ex:
            print("跳过 publish_result.json: %s" % ex, file=sys.stderr)
    for fn in sorted(os.listdir(scripts_dir)):
        if not fn.endswith(".py"):
            continue
        try:
            src = open(os.path.join(scripts_dir, fn), encoding="utf-8").read()
        except Exception:
            continue
        for m in re.finditer(r"TITLES\s*=\s*\[(.*?)\]", src, re.S):
            for sm in re.finditer(r"['\"]([^'\"]{8,})['\"]", m.group(1)):
                titles.append((sm.group(1), fn))
    seen, uniq = set(), []
    for t, s in titles:
        k = t.strip()
        if k and k not in seen:
            seen.add(k)
            uniq.append((k, s))
    return uniq


def normalize(s):
    return re.sub(r"[\s，。、：；！？!?:;,.\-—（）()【】\[\]\"'“”]+", "", s)


def bigrams(s):
    s = normalize(s)
    if len(s) < 2:
        return {s} if s else set()
    return {s[i:i + 2] for i in range(len(s) - 1)}


def similarity(topic, title):
    a, b = normalize(topic), normalize(title)
    if not a or not b:
        return 0.0
    ratio = SequenceMatcher(None, a, b).ratio()
    bg_a, bg_b = bigrams(topic), bigrams(title)
    overlap = len(bg_a & bg_b) / max(1, len(bg_a))
    return max(ratio, overlap)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--topics", required=True, help="候选选题 JSON 数组")
    ap.add_argument("--scripts-dir", required=True)
    args = ap.parse_args()

    topics = json.loads(args.topics)
    if not isinstance(topics, list) or not topics:
        raise SystemExit("topics 必须是非空 JSON 数组")
    history = extract_history(args.scripts_dir)

    items = []
    for topic in topics:
        matches = []
        for title, source in history:
            score = similarity(topic, title)
            if score >= 0.40:
                matches.append({
                    "title": title,
                    "source": source,
                    "score": round(score, 3),
                    "kind": "similar" if score >= 0.55 else "keyword-overlap",
                })
        matches.sort(key=lambda m: -m["score"])
        top = matches[0]["score"] if matches else 0.0
        risk = "high" if top >= 0.55 else ("medium" if top >= 0.40 else "low")
        items.append({
            "topic": topic,
            "risk": risk,
            "top_score": round(top, 3),
            "matches": matches[:8],
        })

    emit({"ok": True, "data": {"history_count": len(history), "items": items}})


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (0, None):
            emit({"ok": False, "error": str(e.code) if not isinstance(e.code, str) else e.code})
            raise
    except Exception as e:
        emit({"ok": False, "error": "%s: %s" % (type(e).__name__, e)})
        raise
