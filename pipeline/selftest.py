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
import time

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

    # 4b. 知乎 Markdown 构建（多行、无品牌图、无主题）+ 校验核心（零写盘走 check_md_text）
    zhihu_doc = {
        "index": 98,
        "intro": {"pre": "开篇", "hl": "重点", "post": "收束"},
        "toc": ["看点一", "看点二"],
        "sections": [
            {"h2": "01", "text": "章节一", "blocks": [
                {"p": [fill(160), ["kw", "期刊发表"], ["b", "职称评审"]]} for _ in range(4)
            ]},
            {"h2": "02", "text": "章节二", "blocks": [
                {"card": "提示"},
                {"card_ul": {"title": "清单", "items": ["甲", "乙"]}},
                {"img": {"src": "IMG_A98_1", "caption": "图一"}},
                {"img": {"src": "IMG_A98_2", "caption": "图二"}},
                {"hr": True},
            ]},
        ],
        "sign_off": "关注文映千秋学术网，第一时间获取学术出版资讯与评审攻略。",
    }
    r = run_script(os.path.join(here, "build_article.py"), [
        "--doc-json", json.dumps(zhihu_doc, ensure_ascii=False), "--scripts-dir", scripts_abs,
        "--resource-dir", resource_abs, "--min-words", "500", "--forbidden", "[]",
        "--platform", "zhihu", "--content-img-count", "2", "--require-brand",
        "--brand-name", "文映千秋学术网"])
    data = (r["result"] or {}).get("data") or {}
    md = data.get("markdown", "")
    built_ok = (
        r["exit"] == 0 and r["result"] and r["result"].get("ok")
        and data.get("img_count") == 2
        and md.startswith("开篇**重点**收束")
        and "## 01 章节一" in md and "> 提示：提示" in md
        and "![图一](IMG_A98_1)" in md
        and "__BRAND" not in md and "<img" not in md
    )
    import check_html as ch
    checked = ch.check_md_text(md, 500, [], "文映千秋学术网", 2, True, True)
    strict = ch.check_md_text(md.replace("![图二](IMG_A98_2)", ""), 500, [], "", 2, False, True)
    residue = ch.check_md_text(md, 500, [], "", 2, False, False)
    ok = (
        built_ok
        and data.get("plain_chars", 0) == checked["plain_chars"]
        and checked["problems"] == []
        and any("数量 1 != 2" in p for p in strict["problems"])
        and any("占位符残留" in p for p in residue["problems"])
    )
    results.append(("zhihu Markdown构建+校验", ok, r))

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
                raise gp.NonRetryableProviderError("HTTP 400: model not found")
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
        # 400（模型不存在等）也必须轮换到备用接口，而不是终止批次
        rotated = gp.generate_item_with_pool(
            {"index": 3, "kind": "cover", "size": [32, 32]},
            [{"id": "bad400", "name": "B", "base_url": "https://bad-400.example", "api_key": "x", "model": "m"},
             {"id": "ok2", "name": "O", "base_url": "https://ok2.example", "api_key": "x", "model": "m"}],
            0, set(), "prompt", os.path.join(scripts_abs, "cover_99.png"), 10, "m")
        # 单接口 400：轮换后池子耗尽 → exhausted（附失败原因），不再有 nonretryable 提前终止
        exhausted = gp.generate_item_with_pool(
            {"index": 4, "kind": "cover", "size": [32, 32]},
            [{"id": "bad400", "name": "B", "base_url": "https://bad-400.example", "api_key": "x", "model": "m"}],
            0, set(), "prompt", os.path.join(scripts_abs, "cover_99.png"), 10, "m")
        ok = (
            first["terminal"] == "success"
            and first["provider_used"] == "p4"
            and len(first["attempts"]) == 3
            and second["provider_used"] == "p4"
            and calls.count("https://bad-401.example") == 1
            and calls.count("https://bad-429.example") == 1
            and calls.count("https://bad-503.example") == 1
            and rotated["terminal"] == "success"
            and rotated["provider_used"] == "ok2"
            and len(rotated["attempts"]) == 1
            and exhausted["terminal"] == "exhausted"
            and len(exhausted["attempts"]) == 1
        )
    finally:
        gp.generate_raw, gp.save_resized = original_raw, original_save
    results.append(("gen_images 接口轮换", ok, {
        "result": {"data": {"first": first, "second": second, "rotated": rotated, "exhausted": exhausted}},
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

    # 10. 配图占位符缺失自愈（0 个图自动智能补齐为指定数量）
    heal_sections = []
    for i, st in enumerate(["章节一", "章节二", "章节三"], 1):
        heal_sections.append({
            "h2": "0" + str(i), "text": st,
            "blocks": [{"p": [fill(160), ["kw", "自测"]]} for _ in range(3)],
        })
    # 故意不放任何 img 块（模拟当前 0 个的报错场景）
    zero_img_doc = {
        "index": 97, "theme": "wenying",
        "intro": {"pre": "前", "hl": "高亮", "post": "后"},
        "sections": heal_sections,
        "sign_off": "关注文映千秋学术网。",
    }
    r_heal = run_script(os.path.join(here, "build_article.py"), [
        "--doc-json", json.dumps(zero_img_doc, ensure_ascii=False), "--scripts-dir", scripts_abs,
        "--resource-dir", resource_abs, "--min-words", "1000", "--forbidden", "[]",
        "--brand-name", "文映千秋学术网", "--content-img-count", "2"])
    heal_html = ((r_heal["result"] or {}).get("data") or {}).get("html", "")
    heal_ok = (
        r_heal["exit"] == 0 and r_heal["result"] and r_heal["result"].get("ok")
        and "IMG_A97_1" in heal_html and "IMG_A97_2" in heal_html
        and heal_html.count("<img") == 4
    )
    results.append(("image_auto_heal 配图占位符缺失自愈", heal_ok, r_heal))

    # 11. 纯文字字数 15% 容差机制（2323 字达标 2500 字下限判定）
    target_len = 2323
    prefix_text = "测试前置"
    fill_len = target_len - len(prefix_text) - len("关注文映千秋学术网。") - 27
    tol_sections = [
        {"h2": "01", "text": "容差测试", "blocks": [
            {"p": [prefix_text + fill(fill_len)]},
            {"img": {"src": "IMG_A96_1", "caption": "图一"}},
            {"img": {"src": "IMG_A96_2", "caption": "图二"}},
        ]}
    ]
    tol_doc = {
        "index": 96, "theme": "wenying",
        "intro": {"pre": "", "hl": "", "post": ""},
        "sections": tol_sections,
        "sign_off": "关注文映千秋学术网。",
    }
    r_tol = run_script(os.path.join(here, "build_article.py"), [
        "--doc-json", json.dumps(tol_doc, ensure_ascii=False), "--scripts-dir", scripts_abs,
        "--resource-dir", resource_abs, "--min-words", "2500", "--forbidden", "[]",
        "--brand-name", "文映千秋学术网", "--content-img-count", "2"])
    tol_data = (r_tol["result"] or {}).get("data") or {}
    tol_chars = tol_data.get("plain_chars", 0)
    # 2323 字面对 3000 下限时（容差底线 2550，且超出 80 字自愈缓冲），应当拦截报错
    r_fail = run_script(os.path.join(here, "build_article.py"), [
        "--doc-json", json.dumps(tol_doc, ensure_ascii=False), "--scripts-dir", scripts_abs,
        "--resource-dir", resource_abs, "--min-words", "3000", "--forbidden", "[]",
        "--brand-name", "文映千秋学术网", "--content-img-count", "2"])
    tol_ok = (
        r_tol["exit"] == 0 and r_tol["result"] and r_tol["result"].get("ok")
        and tol_chars == 2323
        and r_fail["exit"] != 0
        and "纯文字不足" in str(r_fail["result"] or r_fail["output"])
    )
    results.append(("word_count_tolerance 纯文字15%容差机制", tol_ok, r_tol))

    # 13. 小绿书（newspic 图片消息构建、校验与发布演练）
    newspic_doc = {
        "index": 95,
        "article_type": "newspic",
        "title": "2026选刊避坑！中科院分区新规一览",
        "content": "📌 核心速览：2026年选刊规则与期刊分区评价体系迎来重大调整，申报人员与科研学者需提前做好防范与应对规划。敬请关注文映千秋学术网！#选刊 #学术出版",
        "cards": [
            {"sub": 1, "role": "cover", "prompt": "封面卡片海报，醒目标题"},
            {"sub": 2, "role": "points", "prompt": "要点说明信息图"},
        ]
    }
    r_np = run_script(os.path.join(here, "build_article.py"), [
        "--doc-json", json.dumps(newspic_doc, ensure_ascii=False),
        "--scripts-dir", scripts_abs,
        "--resource-dir", resource_abs,
        "--min-words", "40",
        "--forbidden", "[]",
        "--brand-name", "文映千秋学术网",
        "--article-type", "newspic",
        "--require-brand"
    ])
    np_ok = (
        r_np["exit"] == 0 and r_np["result"] and r_np["result"].get("ok")
        and r_np["result"]["data"].get("article_type") == "newspic"
        and r_np["result"]["data"].get("img_count") == 2
    )
    np_file_path = os.path.join(scripts_abs, "article_v2_95_pic.json")
    with open(np_file_path, "w", encoding="utf-8") as _f:
        json.dump((r_np["result"] or {}).get("data") or {}, _f, ensure_ascii=False)
    np_job = {
        "account_id": "test",
        "article_type": "newspic",
        "titles": ["2026选刊避坑！中科院分区新规一览"],
        "digests": ["摘要占位"],
        "article_files": [np_file_path],
        "author": "文映学术win00.cn",
        "brand_name": "文映千秋学术网",
        "ending_guide_required": True,
        "min_words": 40,
        "forbidden": [],
        "dry_run": True,
        "cache": {},
    }
    try:
        r_np_chk = run_script(os.path.join(here, "check_html.py"), [
            "--files", json.dumps(["article_v2_95_pic.json"]),
            "--scripts-dir", scripts_abs,
            "--min-words", "40",
            "--forbidden", "[]",
            "--brand-name", "文映千秋学术网",
            "--img-count", "2",
            "--allow-placeholders",
            "--article-type", "newspic",
            "--require-brand"
        ])
        r_np_pub = run_script(os.path.join(here, "publish_pipeline.py"), [
            "--job-json", json.dumps(np_job, ensure_ascii=False),
            "--scripts-dir", scripts_abs,
            "--brand-dir", brand_abs,
            "--resource-dir", resource_abs
        ])
        np_all_ok = (
            np_ok
            and r_np_chk["exit"] == 0 and r_np_chk["result"] and r_np_chk["result"]["data"].get("passed")
            and r_np_pub["exit"] == 0 and r_np_pub["result"] and r_np_pub["result"].get("ok")
        )
    finally:
        if os.path.exists(np_file_path):
            os.remove(np_file_path)
    results.append(("newspic 小绿书构建+校验+发布演练", np_all_ok, r_np_pub if not np_all_ok else r_np))

    # 14. 生图并发加速演练
    concurrent_job = {
        "items": [
            {"kind": "cover", "index": 1, "prompt": "并发封面1", "out": "c_t1.png", "size": [64, 64]},
            {"kind": "cover", "index": 2, "prompt": "并发封面2", "out": "c_t2.png", "size": [64, 64]},
            {"kind": "content", "index": 1, "sub": 1, "prompt": "并发内容1", "out": "cnt_t1.png", "size": [64, 64]},
        ],
        "providers": [{"id": "p_fast", "name": "PF", "base_url": "https://fast.example", "api_key": "k", "model": "m"}],
        "concurrency": 3,
        "timeout_sec": 30,
    }
    coordinator = gp.ConcurrentCoordinator(concurrent_job["providers"])
    original_raw_c, original_save_c = gp.generate_raw, gp.save_resized
    try:
        from concurrent.futures import ThreadPoolExecutor
        def fake_fast_gen(base_url, api_key, model, prompt, timeout, size=None):
            time.sleep(0.05)
            return b"fast_img"
        gp.generate_raw = fake_fast_gen
        gp.save_resized = lambda raw, out, size: (64, 64)
        t_start = time.time()
        with ThreadPoolExecutor(max_workers=3) as executor:
            futs = [executor.submit(coordinator.run_item, it, it["prompt"], os.path.join(scripts_abs, it["out"]), 10, "m", False) for it in concurrent_job["items"]]
            results_c = [f.result() for f in futs]
        t_elapsed = time.time() - t_start
        conc_ok = (
            len(results_c) == 3
            and all(r["terminal"] == "success" for r in results_c)
            and all(r["provider_used"] == "p_fast" for r in results_c)
            and t_elapsed < 0.14
        )
    finally:
        gp.generate_raw, gp.save_resized = original_raw_c, original_save_c
    results.append(("gen_images 并发加速演练", conc_ok, {"exit": 0, "result": {"data": {"results": results_c, "elapsed": t_elapsed}}}))

    # 15. 本地优雅降级保底图演练（全接口失效时触发本地动态生成）
    fb_job = {
        "items": [
            {"kind": "cover", "index": 1, "prompt": "保底测试封面", "out": "cover_fb_test.png", "size": [640, 360]},
        ],
        "providers": [{"id": "p_dead", "name": "PD", "base_url": "https://dead.example", "api_key": "k", "model": "m"}],
        "enable_local_fallback": True,
        "timeout_sec": 10,
    }
    fb_out_file = os.path.join(scripts_abs, "cover_fb_test.png")
    try:
        def fake_dead_gen(base_url, api_key, model, prompt, timeout, size=None):
            raise gp.RetryableProviderError("HTTP 500: Server Dead")
        gp.generate_raw = fake_dead_gen
        r_fb = run_script(os.path.join(here, "gen_images_pipeline.py"), [
            "--job-json", json.dumps(fb_job, ensure_ascii=False), "--scripts-dir", scripts_abs])
        fb_ok = (
            r_fb["exit"] == 0 and r_fb["result"] and r_fb["result"].get("ok")
            and len(r_fb["result"]["data"].get("generated", [])) == 1
            and r_fb["result"]["data"]["generated"][0].get("fallback") is True
            and os.path.exists(fb_out_file)
        )
    finally:
        gp.generate_raw = original_raw_c
        if os.path.exists(fb_out_file):
            try: os.remove(fb_out_file)
            except: pass
    results.append(("gen_images 本地优雅降级保底演练", fb_ok, r_fb))

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
