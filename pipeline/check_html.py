# -*- coding: utf-8 -*-
"""发布前机器校验（独立入口）：换行/转义/占位符/字数/禁词/图片数/CDN + 可选 gzh-design lint。

输出协议：最后一行 "###RESULT### {json}"
用法:
  python check_html.py --files '["a.html","b.html"]' --scripts-dir <scripts> \
      --min-words 2000 --forbidden '["查重",...]' --brand-name 文映千秋学术网 \
      --img-count 4 --allow-placeholders --lint

知乎分支（--platform zhihu，校验 article_v2_*.md）：字数/禁词/图片占位符数量，
--require-brand 时要求含品牌名；不做单行约束、mmbiz CDN、gzh-design lint。

安全约定：
- 所有文件路径规范化后必须位于 --scripts-dir（公众号任务包 scripts 目录）之内，
  拒绝任何形式的上级目录引用或指向目录之外的路径；
- gzh-design lint 用 runpy 在进程内执行校验器（无 shell、无子进程）。
"""
import argparse
import contextlib
import io
import json
import os
import re
import runpy
import sys

MARKER = "###RESULT### "


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False))


def resolve_under(base, p):
    """规范化 p 并强制其位于 base 之内；越界（上级目录引用、指向别处的绝对路径）一律拒绝。"""
    if not isinstance(p, str) or not p:
        raise SystemExit("非法路径: %r" % (p,))
    base_abs = os.path.abspath(base)
    cand = os.path.abspath(p if os.path.isabs(p) else os.path.join(base_abs, p))
    if cand != base_abs and not cand.startswith(base_abs + os.sep):
        raise SystemExit("路径越界（必须在 scripts 目录内）: %s" % p)
    return cand


def check_md_text(md, min_words, forbidden, brand_name, img_count, require_brand, allow_placeholders):
    """知乎 Markdown 校验核心（内存版，selftest 直接复用）：字数/禁词/图片占位符。"""
    problems = []
    if "\\u" in md:
        problems.append("存在 unicode 转义残留")
    txt = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md)
    txt = re.sub(r"^#{1,6}\s+", "", txt, flags=re.M)
    txt = re.sub(r"^>\s?", "", txt, flags=re.M)
    txt = re.sub(r"^\s*[-*]\s+", "", txt, flags=re.M)
    txt = re.sub(r"^\s*-{3,}\s*$", "", txt, flags=re.M)
    txt = txt.replace("**", "")
    plain = re.sub(r"\s", "", txt)
    effective_min = int(min_words * 0.85)
    if len(plain) < effective_min:
        problems.append("纯文字 %d 字，低于容差下限 %d（设定下限 %d）" % (len(plain), effective_min, min_words))
    for w in forbidden:
        if w in plain:
            problems.append("含禁词: " + w)
    if require_brand and brand_name and brand_name not in plain:
        problems.append("缺少品牌引导语: " + brand_name)
    imgs = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", md)
    bad_src = [s for s in imgs if not re.fullmatch(r"IMG_A\d+_\d+", s)]
    if bad_src:
        problems.append("图片占位符格式非法（应为 IMG_A{index}_{j}）: %s" % bad_src[:3])
    if len(imgs) != img_count:
        problems.append("图片占位符数量 %d != %d（按设置的每篇配图数）" % (len(imgs), img_count))
    if not allow_placeholders and ("IMG_" in md or "__BRAND" in md):
        problems.append("仍有占位符残留（IMG_*、__BRAND_*）")
    return {"plain_chars": len(plain), "img_count": len(imgs), "problems": problems}


def check_file_md(path, min_words, forbidden, brand_name, img_count, require_brand, allow_placeholders):
    """知乎 Markdown 文章校验：读文件后走 check_md_text，与 zhihu_components.plain_text 同口径。"""
    md = open(path, encoding="utf-8").read()
    r = check_md_text(md, min_words, forbidden, brand_name, img_count, require_brand, allow_placeholders)
    r["file"] = path
    return r


def check_file_newspic(path, min_words, forbidden, brand_name, img_count, require_brand, scripts_dir, allow_placeholders):
    """小绿书图片消息校验：读取 JSON，校验标题/文字/禁词/品牌/卡片图片。"""
    try:
        data = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        return {"file": path, "plain_chars": 0, "img_count": 0, "problems": ["JSON 解析失败: " + str(e)]}

    problems = []
    title = str(data.get("title", "")).strip()
    if not title:
        problems.append("标题不能为空")
    elif len(title) > 32:
        problems.append("标题超长：%d 字 > 32 字限制" % len(title))

    content = str(data.get("content", "")).strip()
    if "<" in content and ">" in content:
        problems.append("正文含有非法 HTML 标签")
    plain = re.sub(r"\s", "", content)
    limit = max(50, int(min_words * 0.90))
    if len(plain) < limit:
        problems.append("纯文字 %d 字，低于容差下限 %d（设定下限 %d）" % (len(plain), limit, min_words))

    for w in forbidden:
        if w in plain or w in title:
            problems.append("含禁词: " + w)

    if require_brand and brand_name and brand_name not in plain:
        problems.append("缺少品牌引导语: " + brand_name)

    cards = data.get("cards", [])
    if not isinstance(cards, list) or len(cards) == 0:
        problems.append("卡片列表为空")
    elif len(cards) > 20:
        problems.append("卡片数量 %d > 20 张限制" % len(cards))

    idx = data.get("index", 1)
    missing_pics = []
    for j in range(1, len(cards) + 1):
        found = False
        for ext in (".png", ".jpg", ".jpeg"):
            pic_cand = os.path.join(scripts_dir, "pic_%d_%d%s" % (idx, j, ext))
            if os.path.exists(pic_cand):
                found = True
                break
        if not found:
            missing_pics.append("pic_%d_%d" % (idx, j))

    if missing_pics and not allow_placeholders:
        problems.append("缺少卡片图片: %s" % missing_pics[:3])

    return {"file": path, "plain_chars": len(plain), "img_count": len(cards), "problems": problems}


def check_file_xhs(path, min_words, forbidden, brand_name, img_count, require_brand, allow_placeholders):
    """小红书纯文本笔记校验：标题≤20字、正文≤1000字、字数下限、禁词、图片数。

    重要：小红书正文是【纯文本】，图片通过上传区单独提交，正文里【不允许】出现
    IMG_A{i}_{j} 占位符（旧逻辑要求正文含 N 个占位符，导致占位符被当正文发给读者）。
    因此这里的图片数校验以磁盘上真实存在的 pic_{index}_{sub}.png 为准。
    """
    text = open(path, encoding="utf-8").read()
    problems = []
    if "\\u" in text:
        problems.append("存在 unicode 转义残留")
    plain = re.sub(r"#[^#\s]+#", "", text)
    plain = re.sub(r"[\U00010000-\U0010ffff]", "", plain)
    plain = re.sub(r"[✅❌📌💡🔑🎯🌟✨🔥💪📝🎓📚🏆⚡🎉❤️👍🙏💰📊🔍📋]", "", plain)
    plain = re.sub(r"\s", "", plain)
    effective_min = int(min_words * 0.85)
    if len(plain) < effective_min:
        problems.append("纯文字 %d 字，低于容差下限 %d（设定下限 %d）" % (len(plain), effective_min, min_words))
    for w in forbidden:
        if w in plain:
            problems.append("含禁词: " + w)
    if require_brand and brand_name and brand_name not in plain:
        problems.append("缺少品牌引导语: " + brand_name)
    # 正文中不得残留任何图片占位符
    leftover = re.findall(r"IMG_A\d+_\d+", text)
    if leftover:
        problems.append("正文残留图片占位符 %d 个（%s）：小红书正文为纯文本，占位符不得出现在正文中"
                        % (len(leftover), ",".join(sorted(set(leftover))[:4])))
    # 图片数按磁盘真实文件统计：pic_{index}_{sub}.png
    m = re.search(r"article_v2_(\d+)_xhs", os.path.basename(path))
    idx = int(m.group(1)) if m else 0
    scripts_dir = os.path.dirname(os.path.abspath(path))
    real = 0
    if idx:
        sub = 1
        while os.path.exists(os.path.join(scripts_dir, "pic_%d_%d.png" % (idx, sub))):
            real += 1
            sub += 1
    if real != img_count:
        problems.append("实际配图数量 %d != %d（按设置的每篇笔记图片数，查找 pic_%d_*.png）"
                        % (real, img_count, idx))
    return {"file": path, "plain_chars": len(plain), "img_count": real, "problems": problems}


def check_file(path, min_words, forbidden, brand_name, img_count, allow_placeholders):
    html = open(path, encoding="utf-8").read()
    problems = []
    if "\n" in html or "\r" in html:
        problems.append("存在换行符（必须纯单行）")
    if "\\u" in html:
        problems.append("存在 unicode 转义残留")
    txt = re.sub(r"<[^>]+>", "", html)
    plain = re.sub(r"\s", "", txt)
    effective_min = int(min_words * 0.85)
    if len(plain) < effective_min:
        problems.append("纯文字 %d 字，低于容差下限 %d（设定下限 %d）" % (len(plain), effective_min, min_words))
    for w in forbidden:
        if w in plain:
            problems.append("含禁词: " + w)
    if brand_name not in plain:
        problems.append("缺少品牌引导语: " + brand_name)
    n_img = html.count("<img")
    if n_img != img_count:
        problems.append("img 数量 %d != %d（正文图x2 + 启用的头尾品牌图）" % (n_img, img_count))
    srcs = re.findall(r'(?:data-src|src)="([^"]+)"', html)
    bad = [
        s for s in srcs
        if "mmbiz.qpic.cn" not in s
        and not (allow_placeholders and (s.startswith("IMG_") or s.startswith("__IMG_") or s.startswith("__BRAND")))
    ]
    if bad:
        problems.append("存在非 CDN 图片: %s" % bad[:3])
    if not allow_placeholders and ("IMG_A" in html or "__IMG_" in html or "__BRAND" in html):
        problems.append("仍有占位符残留（IMG_A*/__IMG_*__*/__BRAND_*）")
    return {"file": path, "plain_chars": len(plain), "img_count": n_img, "problems": problems}


def lint_file(path, gzh_design_scripts):
    """进程内运行 validate_gzh_html.py：捕获其 stdout/stderr 与退出码。"""
    validator = os.path.join(gzh_design_scripts, "validate_gzh_html.py")
    if not os.path.exists(validator):
        return None
    buf = io.StringIO()
    code = 0
    old_argv = sys.argv
    try:
        sys.argv = [validator, path]
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                runpy.run_path(validator, run_name="__main__")
            except SystemExit as e:
                code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
    finally:
        sys.argv = old_argv
    return {"exit": code, "output": buf.getvalue()[-4000:]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", required=True, help="HTML 路径 JSON 数组（相对 scripts 目录或目录内绝对路径）")
    ap.add_argument("--scripts-dir", required=True)
    ap.add_argument("--min-words", type=int, default=2000)
    ap.add_argument("--forbidden", default="[]")
    ap.add_argument("--brand-name", default="文映千秋学术网")
    ap.add_argument("--img-count", type=int, default=4)
    ap.add_argument("--allow-placeholders", action="store_true", help="发布前阶段允许 IMG_*/__BRAND_* 占位符")
    ap.add_argument("--lint", action="store_true", help="同时运行 validate_gzh_html.py 校验")
    ap.add_argument("--platform", choices=["gzh", "zhihu", "xiaohongshu"], default="gzh", help="发布平台分支")
    ap.add_argument("--article-type", choices=["news", "newspic"], default="news", help="文章形态")
    ap.add_argument("--require-brand", action="store_true", help="知乎/小绿书分支：结尾必须包含品牌名")
    ap.add_argument("--gzh-design-scripts", default="")
    ap.add_argument("--resource-dir", default="", help="插件内置运行资源目录")
    args = ap.parse_args()

    files = json.loads(args.files)
    forbidden = json.loads(args.forbidden)
    results = []
    for f in files:
        fp = resolve_under(args.scripts_dir, f)
        if not os.path.exists(fp):
            results.append({"file": fp, "problems": ["文件不存在"]})
            continue
        if args.article_type == "newspic" or f.endswith("_pic.json") or f.endswith(".json"):
            results.append(check_file_newspic(fp, args.min_words, forbidden, args.brand_name,
                                              args.img_count, args.require_brand, args.scripts_dir, args.allow_placeholders))
            continue
        if args.platform == "zhihu":
            results.append(check_file_md(fp, args.min_words, forbidden, args.brand_name,
                                         args.img_count, args.require_brand, args.allow_placeholders))
            continue
        if args.platform == "xiaohongshu":
            results.append(check_file_xhs(fp, args.min_words, forbidden, args.brand_name,
                                          args.img_count, args.require_brand, args.allow_placeholders))
            continue
        r = check_file(fp, args.min_words, forbidden, args.brand_name, args.img_count, args.allow_placeholders)
        if args.lint:
            gds = args.gzh_design_scripts or (
                os.path.join(os.path.abspath(args.resource_dir), "gzh_design", "scripts")
                if args.resource_dir else os.path.join(
                    os.path.dirname(os.path.abspath(args.scripts_dir)), "gzh_design", "scripts"))
            r["lint"] = lint_file(fp, gds)
            if r["lint"] and r["lint"]["exit"] != 0:
                r["problems"].append("validate_gzh_html 存在 ERROR（详见 lint.output）")
        results.append(r)

    passed = all(not r["problems"] for r in results)
    emit({"ok": True, "data": {"passed": passed, "results": results}})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        emit({"ok": False, "error": "%s: %s" % (type(e).__name__, e)})
        raise
