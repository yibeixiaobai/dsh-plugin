# -*- coding: utf-8 -*-
"""按 doc spec 调用 gzh_components 纯构建单篇文章 HTML（不写任何文件）。

doc spec（gzh_build_article 工具的 doc_json 入参）:
{
  "index": 1,                       // 第几篇（1 起），由 TS 侧落盘为 article_v2_{index}.html
  "theme": "wenying",               // gzh_components.THEMES 键
  "intro": {"pre": "...", "hl": "...", "post": "..."},   // 引言卡：金句=pre+高亮hl+post
  "toc": ["看点1", "看点2", "看点3"],                      // 三列目录，可省略
  "sections": [
    {"h2": "01", "text": "章节标题",
     "blocks": [
       {"p": ["文字", ["kw", "下划线关键词"], ["b", "主题色加粗"], ["hl", "浅底高亮"]]},
       {"card": "单条提示"},
       {"card_ul": {"title": "清单", "items": ["a", "b"]}},
       {"img": {"src": "IMG_A1_1", "caption": "图注"}},     // 必须恰好 2 个
       {"hr": true}
     ]}
  ],
  "sign_off": "结尾引导语（必须含品牌名）"
}

断言（复刻 gzh_components.build 并参数化）：零换行、不少于 min_words 字、恰好 4 img
（品牌图x2+正文图x2）、正文含品牌名。HTML 经 ###RESULT### JSON 返回，由 TS 侧落盘；
落盘后的 gzh-design 合规校验由 check_html.py --lint 承担。

安全约定：唯一读取的文件是 --doc（normpath + startswith 边界守卫，限制在 --scripts-dir 之内）。
"""
import argparse
import json
import os
import re
import sys

MARKER = "###RESULT### "


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False))


def apply_typography(html, typo):
    # gzh_components 生成的默认样式值做精确替换（默认配置时为 no-op）
    pairs = [
        ("font-size:13px", "font-size:" + typo["font_size"]),
        ("line-height:20px", "line-height:" + typo["line_height"]),
        ("text-indent:2em", "text-indent:" + typo["text_indent"]),
        ("margin:0 0 25px 0", "margin:0 0 " + typo["paragraph_margin"] + " 0"),
    ]
    for a, b in pairs:
        if a != b:
            html = html.replace(a, b)
    return html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", default="", help="doc spec JSON 文件名（scripts 目录内）")
    ap.add_argument("--doc-json", default="", help="doc spec JSON 内联字符串（与 --doc 二选一）")
    ap.add_argument("--scripts-dir", required=True)
    ap.add_argument("--min-words", type=int, default=2000)
    ap.add_argument("--forbidden", default="[]")
    ap.add_argument("--brand-name", default="文映千秋学术网")
    ap.add_argument("--typography", default="{}", help='{"font_size":"13px",...}')
    args = ap.parse_args()

    base_abs = os.path.abspath(args.scripts_dir)
    if args.doc_json:
        doc = json.loads(args.doc_json)
    else:
        if not args.doc:
            raise SystemExit("必须提供 --doc 或 --doc-json")
        doc_path = os.path.normpath(os.path.join(base_abs, args.doc))
        if not doc_path.startswith(base_abs + os.sep):
            raise SystemExit("doc 路径越界: " + doc_path)
        doc = json.load(open(doc_path, encoding="utf-8"))
    forbidden = json.loads(args.forbidden)
    typo = {"font_size": "13px", "line_height": "20px", "paragraph_margin": "25px", "text_indent": "2em"}
    typo.update(json.loads(args.typography))

    sys.path.insert(0, base_abs)
    import gzh_components as gc

    theme = doc.get("theme", "wenying")
    if theme not in gc.THEMES:
        raise SystemExit("未知主题 " + str(theme) + "，可用：" + ",".join(gc.THEMES))
    idx = int(doc["index"])
    if not (1 <= idx <= 99):
        raise SystemExit("index 必须在 1~99")

    intro = gc.intro_card(doc["intro"]["pre"], doc["intro"]["hl"], doc["intro"]["post"], theme)
    sections = []
    if doc.get("toc"):
        p1, p2, p3 = (list(doc["toc"]) + ["", "", ""])[:3]
        sections.append(gc.toc(p1, p2, p3, theme))
    n_img = 0
    for sec in doc.get("sections", []):
        sections.append(gc.h2(sec["h2"], sec["text"], theme))
        for b in sec.get("blocks", []):
            if "p" in b:
                parts = [tuple(x) if isinstance(x, list) else x for x in b["p"]]
                sections.append(gc.p(parts, theme))
            elif "card" in b:
                sections.append(gc.card(b["card"], theme))
            elif "card_ul" in b:
                sections.append(gc.card_ul(b["card_ul"]["title"], b["card_ul"]["items"], theme))
            elif "img" in b:
                img_src = str(b["img"]["src"])
                # 兼容两代占位符：IMG_A{idx}_{j} 与 __IMG_{idx}_{j}__
                if not (re.fullmatch(r"IMG_A" + str(idx) + r"_[12]", img_src)
                        or re.fullmatch(r"__IMG_" + str(idx) + r"_[12]__", img_src)):
                    raise SystemExit("img src 必须是 IMG_A" + str(idx) + "_1/_2 或 __IMG_" + str(idx)
                                     + "_1/_2__ 占位符，得到: " + img_src)
                sections.append(gc.img_card(img_src, b["img"]["caption"]))
                n_img += 1
            elif b.get("hr"):
                sections.append(gc.hr(theme))
    sections.append(gc.sign_off(doc["sign_off"], theme))
    if n_img != 2:
        raise SystemExit("doc 必须恰好包含 2 个 img 块（IMG_A" + str(idx) + "_1 / _2 占位），当前 " + str(n_img) + " 个")

    # 复刻 gzh_components.build 的组装与断言（品牌名/字数参数化），但不写文件
    html = gc.brand_top() + intro + "".join(sections)
    html = html.encode("utf-8", errors="replace").decode("utf-8")
    assert html.count("\n") == 0, "组件拼接产生了换行符"
    html = apply_typography(html, typo)
    assert html.count("\n") == 0, "排版替换产生了换行符"
    txt = re.sub(r"<[^>]+>", "", html)
    plain = re.sub(r"\s", "", txt)
    assert len(plain) >= args.min_words, "纯文字不足：" + str(len(plain)) + " < " + str(args.min_words)
    assert html.count("<img") == 4, "img 数量不为 4：" + str(html.count("<img"))
    assert args.brand_name in txt, "缺少品牌引导语: " + args.brand_name

    problems = []
    for w in forbidden:
        if w in plain:
            problems.append("含禁词: " + w)

    emit({"ok": len(problems) == 0,
          "data": {"index": idx, "theme": theme, "html": html,
                   "plain_chars": len(plain), "img_count": 4, "problems": problems}})


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        emit({"ok": False, "error": "构建断言失败：" + str(e)})
        sys.exit(1)
    except SystemExit as e:
        if e.code not in (0, None):
            emit({"ok": False, "error": e.code if isinstance(e.code, str) else "exit " + str(e.code)})
        raise
    except Exception as e:
        emit({"ok": False, "error": type(e).__name__ + ": " + str(e)})
        raise
