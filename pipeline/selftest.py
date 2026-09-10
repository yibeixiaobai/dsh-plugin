# -*- coding: utf-8 -*-
"""流水线自测（零写盘、零联网）：验证 选题查重 → 文章构建 → HTML 校验 → 生图演练 → 发布演练。

用法:
    python selftest.py --scripts-dir <项目 scripts 目录> [--brand-dir <brand_assets 目录>]

- 全部子脚本以 runpy 进程内执行（无子进程），输出按 ###RESULT### 协议解析
- 生图/发布均为 dry_run，不联网、不写任何文件
- 发布演练直接复用 scripts 目录内现成的 article_v2_*.html（没有则跳过）
"""
import argparse
import contextlib
import glob
import io
import json
import os
import runpy
import sys

MARKER = "###RESULT### "


def run_script(path, argv):
    buf_out, buf_err = io.StringIO(), io.StringIO()
    code = 0
    old = sys.argv
    try:
        sys.argv = [path] + argv
        with contextlib.redirect_stdout(buf_out), contextlib.redirect_stderr(buf_err):
            try:
                runpy.run_path(path, run_name="__main__")
            except SystemExit as e:
                code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
    finally:
        sys.argv = old
    out = buf_out.getvalue()
    marker = None
    for line in out.splitlines():
        if line.startswith(MARKER):
            marker = line[len(MARKER):]
    result = None
    if marker:
        try:
            result = json.loads(marker)
        except Exception:
            result = None
    return {"exit": code, "result": result, "output": out[-600:], "stderr": buf_err.getvalue()[-400:]}


def fill(n):
    s = ("学术出版领域持续涌现新动态，期刊评价体系、职称评审政策与专著出版规范都在快速演进，"
         "作者需要及时掌握最新要求，合理规划投稿与出版安排，避免因信息滞后而错失良机。")
    return (s * (n // len(s) + 1))[:n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scripts-dir", required=True)
    ap.add_argument("--brand-dir", default="")
    args = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    scripts_abs = os.path.abspath(args.scripts_dir)
    brand_abs = os.path.abspath(args.brand_dir or os.path.join(os.path.dirname(scripts_abs), "brand_assets"))
    results = []

    # 1. 选题查重
    r = run_script(os.path.join(here, "check_topics.py"), [
        "--topics", json.dumps(["2026年期刊分区新变化解读", "专著出版流程与书号申请"]), "--scripts-dir", scripts_abs])
    ok = r["exit"] == 0 and r["result"] and r["result"].get("ok")
    results.append(("check_topics 选题查重", ok, r))

    # 2. 文章构建（index=99 测试专用，不落盘）
    sections = []
    for i, st in enumerate(["政策背景", "核心变化", "实操建议"], 1):
        sections.append({
            "h2": "0" + str(i), "text": st,
            "blocks": [{"p": [fill(160), ["kw", "期刊发表"], ["b", "职称评审"]]} for _ in range(5)],
        })
    sections[0]["blocks"].append({"img": {"src": "IMG_A99_1", "caption": "测试图一"}})
    sections[2]["blocks"].append({"img": {"src": "IMG_A99_2", "caption": "测试图二"}})
    doc = {
        "index": 99, "theme": "wenying",
        "intro": {"pre": "测试引言", "hl": "高亮词", "post": "收尾"},
        "toc": ["看点一", "看点二", "看点三"], "sections": sections,
        "sign_off": "关注文映千秋学术网，第一时间获取学术出版资讯与评审攻略。",
    }
    r = run_script(os.path.join(here, "build_article.py"), [
        "--doc-json", json.dumps(doc, ensure_ascii=False), "--scripts-dir", scripts_abs,
        "--min-words", "2000", "--forbidden", "[]", "--brand-name", "文映千秋学术网"])
    ok = r["exit"] == 0 and r["result"] and r["result"].get("ok")
    results.append(("build_article 文章构建", ok, r))

    # 3. HTML 校验（复用 scripts 目录内现成文章，只读）
    existing = []
    for i in range(1, 7):
        p = os.path.join(scripts_abs, "article_v2_" + str(i) + ".html")
        if os.path.exists(p):
            existing.append(p)
    if existing:
        r = run_script(os.path.join(here, "check_html.py"), [
            "--files", json.dumps([os.path.basename(existing[0])]), "--scripts-dir", scripts_abs,
            "--min-words", "2000", "--forbidden", "[]", "--allow-placeholders", "--lint"])
        ok = r["exit"] == 0 and r["result"] and r["result"].get("ok") and r["result"]["data"].get("passed")
    else:
        r = {"result": {"data": {"note": "scripts 目录无现成 article_v2_*.html，跳过"}}}
        ok = True
    results.append(("check_html HTML校验", ok, r))

    # 4. 生图演练（dry_run 不联网不写图）
    img_job = {
        "items": [
            {"kind": "cover", "index": 1, "prompt": "自测封面",
             "out": os.path.join(scripts_abs, "cover_99.png"), "size": [3520, 1500]},
            {"kind": "content", "index": 1, "sub": 1, "prompt": "自测信息图",
             "out": os.path.join(scripts_abs, "content_99_1.png"), "size": [1080, 0]},
        ],
        "dry_run": True, "zh_only": True, "model": "gpt-image-2", "timeout_sec": 60,
    }
    r = run_script(os.path.join(here, "gen_images_pipeline.py"), [
        "--job-json", json.dumps(img_job, ensure_ascii=False), "--scripts-dir", scripts_abs])
    ok = r["exit"] == 0 and r["result"] and r["result"].get("ok")
    results.append(("gen_images 生图演练", ok, r))

    # 5. 发布演练（dry_run 不联网不落盘，复用现成文章）
    if existing:
        titles = ["自测标题" + os.path.basename(p)[10] for p in existing]
        digests = ["自测摘要，用于演练模式的发布前校验，不含敏感信息。" + "x" * i for i, p in enumerate(existing)]
        job = {
            "titles": titles, "digests": digests,
            "article_files": existing,
            "cover_files": [os.path.join(scripts_abs, "cover_99.png") for _ in existing],
            "content_files": {"IMG_A1_1": os.path.join(scripts_abs, "content_99_1.png")},
            "brand_top": os.path.join(brand_abs, "brand_top.jpg"),
            "brand_bot": os.path.join(brand_abs, "brand_bot.jpg"),
            "cache": {}, "use_cache": True, "dry_run": True,
            "need_open_comment": 1, "only_fans_can_comment": 0,
            "author": "文映学术win00.cn", "brand_name": "文映千秋学术网",
            "min_words": 2000, "forbidden": [], "verify": False,
        }
        r = run_script(os.path.join(here, "publish_pipeline.py"), [
            "--job-json", json.dumps(job, ensure_ascii=False),
            "--scripts-dir", scripts_abs, "--brand-dir", brand_abs])
        ok = r["exit"] == 0 and r["result"] and r["result"].get("ok")
    else:
        r = {"result": {"data": {"note": "无现成文章，跳过"}}}
        ok = True
    results.append(("publish 发布演练", ok, r))

    print("=" * 60)
    failed = 0
    for name, ok, r in results:
        print(("PASS" if ok else "FAIL") + "  " + name)
        if not ok:
            failed += 1
            print("  exit:", r["exit"])
            print("  result:", json.dumps(r["result"], ensure_ascii=False)[:600] if r["result"] else None)
            if r["stderr"]:
                print("  stderr:", r["stderr"][-300:])
            elif r["output"]:
                print("  output:", r["output"][-300:])
    print("=" * 60)
    if failed:
        print("自测未通过：%d/%d" % (failed, len(results)))
        sys.exit(1)
    print("自测全部通过（%d 项，零写盘零联网）" % len(results))


if __name__ == "__main__":
    main()
