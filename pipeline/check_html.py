# -*- coding: utf-8 -*-
"""发布前机器校验（独立入口）：换行/转义/占位符/字数/禁词/图片数/CDN + 可选 gzh-design lint。

输出协议：最后一行 "###RESULT### {json}"
用法:
  python check_html.py --files '["a.html","b.html"]' --scripts-dir <scripts> \
      --min-words 2000 --forbidden '["查重",...]' --brand-name 文映千秋学术网 \
      --img-count 4 --allow-placeholders --lint

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


def check_file(path, min_words, forbidden, brand_name, img_count, allow_placeholders):
    html = open(path, encoding="utf-8").read()
    problems = []
    if "\n" in html or "\r" in html:
        problems.append("存在换行符（必须纯单行）")
    if "\\u" in html:
        problems.append("存在 unicode 转义残留")
    txt = re.sub(r"<[^>]+>", "", html)
    plain = re.sub(r"\s", "", txt)
    if len(plain) < min_words:
        problems.append("纯文字 %d 字，低于下限 %d" % (len(plain), min_words))
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
