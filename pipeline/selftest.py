# -*- coding: utf-8 -*-
"""流水线自测（零写盘、零联网）：验证 选题查重 → 文章构建 → HTML 校验 → 生图演练 → 发布演练。

用法:
    python selftest.py [--scripts-dir <任务工作区 scripts 目录>]

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
    ap.add_argument("--scripts-dir", default="")
    ap.add_argument("--brand-dir", default="")
    ap.add_argument("--resource-dir", default="")
    args = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    plugin_abs = os.path.dirname(here)
    scripts_abs = os.path.abspath(args.scripts_dir or os.path.join(plugin_abs, "tasks", "default", "scripts"))
    brand_abs = os.path.abspath(args.brand_dir or os.path.join(os.path.dirname(scripts_abs), "brand_assets"))
    resource_abs = os.path.abspath(args.resource_dir or os.path.join(plugin_abs, "runtime"))
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
        "--resource-dir", resource_abs,
        "--min-words", "2000", "--forbidden", "[]", "--brand-name", "文映千秋学术网"])
    ok = r["exit"] == 0 and r["result"] and r["result"].get("ok")
    results.append(("build_article 文章构建", ok, r))

    # 3. 品牌头尾图变换（关闭头图、尾图裁切+卡片边框）
    brand_images = {
        "header": {"enabled": False},
        "footer": {
            "enabled": True, "file": "brand_bot.jpg", "width": 72, "height": 180,
            "fit": "cover", "position": "bottom", "radius": 12,
            "margin_top": 18, "margin_bottom": 6, "frame": True,
        },
    }
    r = run_script(os.path.join(here, "build_article.py"), [
        "--doc-json", json.dumps(doc, ensure_ascii=False), "--scripts-dir", scripts_abs,
        "--resource-dir", resource_abs,
        "--min-words", "2000", "--forbidden", "[]", "--brand-name", "文映千秋学术网",
        "--brand-images", json.dumps(brand_images, ensure_ascii=False)])
    data = (r["result"] or {}).get("data") or {}
    html = data.get("html", "")
    sys.path.insert(0, here)
    import publish_pipeline as pp
    precheck_problems, _ = pp.precheck(
        html, 99, 2000, [], "文映千秋学术网", 3, False, True, 2)
    # 正文配图数参数生效：声明 3 张时应报缺少第 3 张占位符
    strict_problems, _ = pp.precheck(
        html, 99, 2000, [], "文映千秋学术网", 4, False, True, 3)
    ok = (
        r["exit"] == 0 and r["result"] and r["result"].get("ok")
        and data.get("img_count") == 3
        and "__BRAND_TOP__" not in html
        and "__BRAND_BOT__" in html
        and "object-fit:cover" in html
        and "object-position:bottom" in html
        and "border-radius:18px" in html
        and not precheck_problems
        and any("第 3 张" in p for p in strict_problems)
    )
    results.append(("brand_images 头尾图变换", ok, r))

    # 4. HTML 校验（复用 scripts 目录内现成文章，只读）
    existing = []
    for i in range(1, 7):
        p = os.path.join(scripts_abs, "article_v2_" + str(i) + ".html")
        if os.path.exists(p):
            existing.append(p)
    if existing:
        r = run_script(os.path.join(here, "check_html.py"), [
            "--files", json.dumps([os.path.basename(existing[0])]), "--scripts-dir", scripts_abs,
            "--resource-dir", resource_abs,
            "--min-words", "2000", "--forbidden", "[]", "--allow-placeholders", "--lint"])
        ok = r["exit"] == 0 and r["result"] and r["result"].get("ok") and r["result"]["data"].get("passed")
    else:
        r = {"result": {"data": {"note": "scripts 目录无现成 article_v2_*.html，跳过"}}}
        ok = True
    results.append(("check_html HTML校验", ok, r))

    # 5. 生图演练（dry_run 不联网不写图）
    img_job = {
        "items": [
            {"kind": "cover", "index": 1, "prompt": "自测封面",
             "out": "cover_99.png", "size": [3520, 1500]},
            {"kind": "content", "index": 1, "sub": 1, "prompt": "自测信息图",
             "out": "content_99_1.png", "size": [1080, 0]},
        ],
        "dry_run": True, "zh_only": True, "model": "gpt-image-2", "timeout_sec": 60,
    }
    r = run_script(os.path.join(here, "gen_images_pipeline.py"), [
        "--job-json", json.dumps(img_job, ensure_ascii=False), "--scripts-dir", scripts_abs])
    ok = r["exit"] == 0 and r["result"] and r["result"].get("ok")
    results.append(("gen_images 生图演练", ok, r))

    # 6. 生图接口轮换（零联网 mock：可重试错误换接口，成功后保持）
    sys.path.insert(0, here)
    import gen_images_pipeline as gp
    original_raw, original_save = gp.generate_raw, gp.save_resized
    try:
        calls = []

        def fake_generate(base_url, api_key, model, prompt, timeout):
            calls.append(base_url)
            if base_url == "https://bad-401.example":
                raise gp.RetryableProviderError("HTTP 401: unauthorized")
            if base_url == "https://bad-429.example":
                raise gp.RetryableProviderError("HTTP 429: rate limit")
            if base_url == "https://bad-503.example":
                raise gp.RetryableProviderError("HTTP 503: unavailable")
            if base_url == "https://bad-400.example":
                raise gp.requests.HTTPError("400 Client Error")
            return b"image"

        gp.generate_raw = fake_generate
        gp.save_resized = lambda raw, out, size: (32, 32)
        providers = [
            {"id": "p1", "name": "P1", "base_url": "https://bad-401.example", "api_key": "x", "model": "m"},
            {"id": "p2", "name": "P2", "base_url": "https://bad-429.example", "api_key": "x", "model": "m"},
            {"id": "p3", "name": "P3", "base_url": "https://bad-503.example", "api_key": "x", "model": "m"},
            {"id": "p4", "name": "P4", "base_url": "https://ok.example", "api_key": "x", "model": "m"},
        ]
        first = gp.generate_item_with_pool(
            {"index": 1, "kind": "cover", "size": [32, 32]}, providers, 0, set(),
            "prompt", os.path.join(scripts_abs, "cover_99.png"), 10, "m")
        second = gp.generate_item_with_pool(
            {"index": 2, "kind": "cover", "size": [32, 32]}, providers,
            first["active"], first["disabled"], "prompt",
            os.path.join(scripts_abs, "cover_99.png"), 10, "m")
        nonretryable = gp.generate_item_with_pool(
            {"index": 3, "kind": "cover", "size": [32, 32]},
            [{"id": "bad", "name": "bad", "base_url": "https://bad-400.example", "api_key": "x", "model": "m"}],
            0, set(), "prompt", os.path.join(scripts_abs, "cover_99.png"), 10, "m")
        ok = (
            first["terminal"] == "success"
            and first["provider_used"] == "p4"
            and len(first["attempts"]) == 3
            and second["provider_used"] == "p4"
            and calls.count("https://bad-401.example") == 1
            and calls.count("https://bad-429.example") == 1
            and calls.count("https://bad-503.example") == 1
            and nonretryable["terminal"] == "nonretryable"
        )
    finally:
        gp.generate_raw, gp.save_resized = original_raw, original_save
    results.append(("gen_images 接口轮换", ok, {
        "result": {"data": {"first": first, "second": second, "nonretryable": nonretryable}},
        "exit": 0, "output": "", "stderr": "",
    }))

    # 7. 发布演练（dry_run 不联网不落盘，复用现成文章）
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
            "content_img_count": 2,
            "cache": {}, "use_cache": True, "dry_run": True,
            "need_open_comment": 1, "only_fans_can_comment": 0,
            "author": "文映学术win00.cn", "brand_name": "文映千秋学术网",
            "min_words": 2000, "forbidden": [], "verify": False,
        }
        r = run_script(os.path.join(here, "publish_pipeline.py"), [
            "--job-json", json.dumps(job, ensure_ascii=False),
            "--scripts-dir", scripts_abs, "--brand-dir", brand_abs,
            "--resource-dir", resource_abs])
        ok = r["exit"] == 0 and r["result"] and r["result"].get("ok")
    else:
        r = {"result": {"data": {"note": "无现成文章，跳过"}}}
        ok = True
    results.append(("publish 发布演练", ok, r))

    # 8. 多账号凭据解析（数组/字典新模型 + 默认账号旧字段回退）
    multi = {
        "default_account": "main",
        "accounts": [
            {"id": "main", "appid": "main-id", "app_secret": "main-secret"},
            {"id": "backup", "appid": "backup-id", "app_secret": "backup-secret"},
        ],
    }
    dict_model = {
        "default_account": "main",
        "accounts": {"main": {"appid": "dict-id", "app_secret": "dict-secret"}},
    }
    legacy = {"appid": "legacy-id", "app_secret": "legacy-secret"}
    resolved_default = pp.account_credentials(multi, "")
    resolved_backup = pp.account_credentials(multi, "backup")
    resolved_dict = pp.account_credentials(dict_model, "main")
    resolved_legacy = pp.account_credentials(legacy, "")
    ok = (
        resolved_default[0:2] == ("main", "main-id")
        and resolved_backup[0:2] == ("backup", "backup-id")
        and resolved_dict[0:2] == ("main", "dict-id")
        and resolved_legacy[0:2] == ("default", "legacy-id")
    )
    results.append(("accounts 多账号凭据解析", ok, {
        "result": {"data": {"default": resolved_default[0], "backup": resolved_backup[0],
                            "dict": resolved_dict[0], "legacy": resolved_legacy[0]}},
        "exit": 0, "output": "", "stderr": "",
    }))

    # 9. 上传缓存键：内容 hash 前缀稳定且随内容变化
    brand_file = os.path.join(brand_abs, "brand_top.jpg")
    if os.path.exists(brand_file):
        h1 = pp.file_hash(brand_file)
        h2 = pp.file_hash(brand_file)
        ok = len(h1) == 12 and h1 == h2 and (h1 + ":__BRAND_TOP__").endswith(":__BRAND_TOP__")
    else:
        ok = False
    results.append(("cache 内容hash缓存键", ok, {
        "result": {"data": {"hash": h1 if os.path.exists(brand_file) else None}},
        "exit": 0, "output": "", "stderr": "",
    }))

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
