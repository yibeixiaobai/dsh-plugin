# -*- coding: utf-8 -*-
"""选题查重：候选选题 vs 历史发布标题（跨账号聚合）。

历史来源（--scripts-dir 本账号 + --history-dirs 其它账号/旧共享目录）：
1. 各目录 scripts/publish_result.json 的 articles 列表（最近一次成功发布）
2. 各目录 scripts/gen_*.py / publish_*.py 内 TITLES = [...] 字面量（历次发布脚本）

来源标注：<目录上级名>:<文件名>（按账号分目录后即账号 ID）。

输出协议：最后一行 "###RESULT### {json}"，{ok, data:{history_count, items:[{topic, risk, top_score, matches}]}}
用法: python check_topics.py --topics '["选题1","选题2"]' --scripts-dir <本账号 scripts 目录> \
        --history-dirs '["<其它账号或旧共享 scripts 目录>", ...]'
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


def extract_history(scripts_dir, tag):
    titles = []
    if not os.path.isdir(scripts_dir):
        return titles
    ph = os.path.join(scripts_dir, "publish_history.json")
    if os.path.exists(ph):
        try:
            records = json.load(open(ph, encoding="utf-8"))
            if isinstance(records, list):
                for rec in records:
                    for t in rec.get("articles", []):
                        titles.append((t, tag + ":publish_history.json"))
        except Exception as ex:
            print("跳过 publish_history.json: %s" % ex, file=sys.stderr)
    pr = os.path.join(scripts_dir, "publish_result.json")
    if os.path.exists(pr):
        try:
            d = json.load(open(pr, encoding="utf-8"))
            for t in d.get("articles", []):
                titles.append((t, tag + ":publish_result.json"))
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
                titles.append((sm.group(1), tag + ":" + fn))
    return titles


def normalize(s):
    return re.sub(r"[\s，。、：；！？!?:;,.\-—（）()【】\[\]\"'“”]+", "", s)


def bigrams(s):
    s = normalize(s)
    if len(s) < 2:
        return {s} if s else set()
    return {s[i:i + 2] for i in range(len(s) - 1)}


_STOP_WORDS = {
    "可以", "如何", "什么", "怎么", "为什么", "哪些", "其中", "以及",
    "还是", "或者", "但是", "因为", "所以", "如果", "那么", "已经",
    "这个", "那个", "一个", "不是", "就是", "这些", "那些", "你的",
    "我的", "他的", "她的", "我们", "你们", "他们", "自己", "别人",
    "真的", "其实", "应该", "需要", "知道", "了解", "使用", "进行",
}


def core_keywords(s):
    """提取标题中的核心实义词（2-4 字中文片段，去停用词），用于语义级重复检测。"""
    s = normalize(s)
    words = re.findall(r"[\u4e00-\u9fff]{2,4}", s)
    return [w for w in words if w not in _STOP_WORDS]


def similarity(topic, title):
    a, b = normalize(topic), normalize(title)
    if not a or not b:
        return 0.0
    ratio = SequenceMatcher(None, a, b).ratio()
    bg_a, bg_b = bigrams(topic), bigrams(title)
    overlap = len(bg_a & bg_b) / max(1, len(bg_a))
    ck_a, ck_b = set(core_keywords(topic)), set(core_keywords(title))
    core_overlap = len(ck_a & ck_b) / max(1, len(ck_a)) if ck_a else 0.0
    return max(ratio, overlap, core_overlap * 0.85)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--topics", required=True, help="候选选题 JSON 数组")
    ap.add_argument("--scripts-dir", required=True, help="本账号 scripts 目录")
    ap.add_argument("--history-dirs", default="[]", help="额外历史目录 JSON 数组（其它账号/旧共享 scripts 目录）")
    args = ap.parse_args()

    topics = json.loads(args.topics)
    if not isinstance(topics, list) or not topics:
        raise SystemExit("topics 必须是非空 JSON 数组")

    # 聚合本账号 + 其它账号/旧共享目录的历史，来源标注目录上级名（账号 ID）便于人工核对
    history_dirs = [args.scripts_dir] + [d for d in json.loads(args.history_dirs) if isinstance(d, str)]
    titles = []
    for d in history_dirs:
        absd = os.path.abspath(d)
        tag = os.path.basename(os.path.dirname(absd)) or absd
        titles.extend(extract_history(d, tag))
    seen, history = set(), []
    for t, s in titles:
        k = t.strip()
        if k and k not in seen:
            seen.add(k)
            history.append((k, s))

    PREFIX_PATTERN = re.compile(r"^(\s*[\[【(（].+?[\]】)）]\s*|[^\s：:]{2,12}[：:])\s*")

    items = []
    for idx, topic in enumerate(topics):
        prefix_matched = PREFIX_PATTERN.match(topic)
        prefix_violation = bool(prefix_matched)
        matches = []
        batch_duplicates = []
        # 同批次候选选题互斥比对（相同账号配置的选题不应该重复）
        for other_idx, other_topic in enumerate(topics):
            if other_idx == idx:
                continue
            b_score = similarity(topic, other_topic)
            if b_score >= 0.35:
                kind = "batch-duplicate" if b_score >= 0.50 else "batch-overlap"
                match_entry = {
                    "title": other_topic,
                    "source": "当前配置候选(第%d篇)" % (other_idx + 1),
                    "score": round(b_score, 3),
                    "kind": kind,
                }
                matches.append(match_entry)
                if b_score >= 0.50:
                    batch_duplicates.append((other_idx + 1, other_topic))

        # 本账号历史比对
        for title, source in history:
            score = similarity(topic, title)
            if score >= 0.35:
                matches.append({
                    "title": title,
                    "source": source,
                    "score": round(score, 3),
                    "kind": "similar" if score >= 0.50 else "keyword-overlap",
                })
        matches.sort(key=lambda m: -m["score"])
        top = matches[0]["score"] if matches else 0.0
        risk = "high" if (top >= 0.50 or prefix_violation or batch_duplicates) else ("medium" if top >= 0.35 else "low")
        item = {
            "topic": topic,
            "risk": risk,
            "top_score": round(top, 3),
            "matches": matches[:2],
        }
        warnings = []
        if batch_duplicates:
            item["batch_duplicate"] = True
            other_names = "、".join(["第%d篇《%s》" % (pos, name) for pos, name in batch_duplicates[:3]])
            warnings.append("检测到与相同账号本次配置中的候选选题（%s）高度相似或重复，相同账号选题严禁重复，请更换该选题。" % other_names)
        if prefix_violation:
            item["prefix_violation"] = True
            warnings.append("检测到标题使用前缀开头（如「%s」），违反全账号选题铁律。严禁将业务关键词作为开头词语或前缀标签，必须去除前缀并改为自然流畅的完整叙述标题。" % prefix_matched.group(0).strip())
        if warnings:
            item["warning"] = "；".join(warnings)
        items.append(item)

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
