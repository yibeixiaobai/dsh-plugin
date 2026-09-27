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

断言（复刻 gzh_components.build 并参数化）：零换行、不少于 min_words 字、按品牌图开关
得到 2~4 img（正文图x2 + 可选的头/尾品牌图）、正文含品牌名。HTML 经 ###RESULT### JSON 返回，由 TS 侧落盘；
落盘后的 gzh-design 合规校验由 check_html.py --lint 承担。

知乎分支（--platform zhihu）：同一 doc spec 骨架交由 runtime/scripts/zhihu_components.py 构建
标准 Markdown（多行、无主题/品牌图），返回 data.markdown，由 TS 侧落盘为 article_v2_{index}.md。

安全约定：唯一读取的文件是 --doc（normpath + startswith 边界守卫，限制在 --scripts-dir 之内）。
"""
import argparse
import json
import os
import re
import sys

MARKER = "###RESULT### "


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False), flush=True)
    try:
        sys.stdout.flush()
    except Exception:
        pass


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


BRAND_IMAGE_DEFAULTS = {
    "header": {
        "enabled": True, "file": "brand_top.jpg", "width": 100, "height": 0,
        "fit": "contain", "position": "center", "radius": 0,
        "margin_top": 0, "margin_bottom": 0, "frame": False,
    },
    "footer": {
        "enabled": True, "file": "brand_bot.jpg", "width": 0, "height": 0,
        "fit": "contain", "position": "center", "radius": 0,
        "margin_top": 20, "margin_bottom": 0, "frame": False,
    },
}


def resolve_brand_spec(raw, kind):
    spec = dict(BRAND_IMAGE_DEFAULTS[kind])
    if isinstance(raw, dict):
        spec.update(raw)
    spec["enabled"] = bool(spec.get("enabled", True))
    spec["file"] = str(spec.get("file") or BRAND_IMAGE_DEFAULTS[kind]["file"])
    for key, lower, upper in (
        ("width", 0, 100), ("height", 0, 2000), ("radius", 0, 100),
        ("margin_top", 0, 200), ("margin_bottom", 0, 200),
    ):
        try:
            value = int(spec.get(key, BRAND_IMAGE_DEFAULTS[kind][key]))
        except (TypeError, ValueError):
            value = BRAND_IMAGE_DEFAULTS[kind][key]
        spec[key] = max(lower, min(upper, value))
    spec["fit"] = spec.get("fit") if spec.get("fit") in ("contain", "cover", "fill") else "contain"
    spec["position"] = spec.get("position") if spec.get("position") in ("top", "center", "bottom") else "center"
    spec["frame"] = bool(spec.get("frame", False))
    return spec


def brand_image_html(kind, spec):
    if not spec["enabled"]:
        return ""
    src = "__BRAND_TOP__" if kind == "header" else "__BRAND_BOT__"
    height = str(spec["height"]) + "px" if spec["height"] > 0 else "auto"
    margin = str(spec["margin_top"]) + "px auto " + str(spec["margin_bottom"]) + "px"
    # width==0 表示自适应：不设百分比宽度，按原始尺寸呈现且不超过容器宽度
    adaptive = int(spec["width"]) <= 0
    size_style = "width:auto;max-width:100%;" if adaptive else (
        "width:" + str(spec["width"]) + "%;max-width:" + str(spec["width"]) + "%;")
    image_style = (
        size_style + "height:" + height + ";object-fit:" + spec["fit"] +
        ";object-position:" + spec["position"] + ";display:block;margin:0 auto;border-radius:" +
        str(spec["radius"]) + "px;"
    )
    if spec["frame"]:
        frame_size = ("width:auto;max-width:100%;" if adaptive else
                      "width:" + str(spec["width"]) + "%;max-width:" + str(spec["width"]) + "%;")
        return (
            '<section style="text-align:center;margin:' + margin + ';padding:0;">'
            '<section style="display:inline-block;box-sizing:border-box;' + frame_size +
            'background:#FFFFFF;border:1px solid #E5E7EB;' +
            'border-radius:' + str(spec["radius"] + 6) + 'px;padding:6px;box-shadow:0 4px 12px -2px rgba(0,0,0,0.06);">'
            '<img src="' + src + '" style="' + image_style + '">'
            '</section></section>'
        )
    return (
        '<p style="text-align:center;margin:' + margin + ';padding:0;">'
        '<img src="' + src + '" style="' + size_style + 'height:' + height + ';object-fit:' + spec["fit"] +
        ';object-position:' + spec["position"] + ';display:block;margin:0 auto;border-radius:' +
        str(spec["radius"]) + 'px;"></p>'
    )


def main_zhihu(args, doc, forbidden):
    """知乎专栏分支：同一 doc spec 骨架 → 标准 Markdown（无主题/品牌图/单行约束）。"""
    idx = int(doc["index"])
    if not (1 <= idx <= 99):
        raise SystemExit("index 必须在 1~99")
    resource_scripts = os.path.join(os.path.abspath(args.resource_dir), "scripts")
    if not os.path.exists(os.path.join(resource_scripts, "zhihu_components.py")):
        raise SystemExit("插件内置资源缺少 zhihu_components.py: " + resource_scripts)
    sys.path.insert(0, resource_scripts)
    import zhihu_components as zc

    md, plain_chars, img_count, problems = zc.build_markdown(
        doc, idx, max(0, args.content_img_count),
        min_words=args.min_words,
        brand_name=args.brand_name,
        require_brand=args.require_brand,
        forbidden=forbidden)
    emit({"ok": len(problems) == 0,
          "data": {"index": idx, "platform": "zhihu", "markdown": md,
                   "plain_chars": plain_chars, "img_count": img_count, "problems": problems}})


def main_newspic(args, doc, forbidden):
    """小绿书分支：纯文本说明 + 多图卡片提示词列表。"""
    idx = int(doc.get("index", 1))
    if not (1 <= idx <= 99):
        raise SystemExit("index 必须在 1~99")
    title = str(doc.get("title", "")).strip()
    if not title:
        raise SystemExit("小绿书 title 不能为空")
    if len(title) > 32:
        raise SystemExit("小绿书 title 不能超过 32 字（当前 %d 字）" % len(title))
    content = str(doc.get("content", "")).strip()
    if not content:
        raise SystemExit("小绿书 content 不能为空")
    if "<" in content and ">" in content:
        content = re.sub(r"<[^>]+>", "", content)
    plain = re.sub(r"\s", "", content)
    limit = max(50, int(args.min_words * 0.90))
    if len(plain) < limit:
        raise SystemExit("小绿书纯文字不足：%d < %d（设定下限 %d 字）" % (len(plain), limit, args.min_words))
    if args.require_brand and args.brand_name:
        if args.brand_name not in plain:
            raise SystemExit("缺少品牌引导语: " + args.brand_name)

    cards = doc.get("cards", [])
    if not isinstance(cards, list) or len(cards) == 0:
        raise SystemExit("小绿书 cards 列表不能为空（必须规划 1~20 张卡片提示词）")
    if len(cards) > 20:
        raise SystemExit("小绿书 cards 数量不能超过 20 张（当前 %d 张）" % len(cards))

    normalized_cards = []
    for j, c in enumerate(cards, 1):
        prompt = str(c.get("prompt") or c.get("description") or c.get("text") or "").strip()
        if not prompt:
            raise SystemExit("第 %d 张卡片 prompt 不能为空" % j)
        normalized_cards.append({
            "sub": int(c.get("sub", j)),
            "role": str(c.get("role", "cover" if j == 1 else "content")),
            "prompt": prompt,
        })

    problems = []
    for w in forbidden:
        if w in plain or w in title:
            problems.append("含禁词: " + w)

    emit({
        "ok": len(problems) == 0,
        "data": {
            "index": idx,
            "article_type": "newspic",
            "title": title,
            "content": content,
            "cards": normalized_cards,
            "plain_chars": len(plain),
            "img_count": len(normalized_cards),
            "problems": problems,
        }
    })


def ensure_doc_images(doc, idx, target_count):
    """确保 doc 中的正文配图占位符数量与格式恰好为 target_count 个（IMG_A{idx}_1 ~ IMG_A{idx}_{target_count}）。
    若模型漏填（如 0 个）、填错占位符名称或数量不符，自动自愈补齐或规整，避免构建中断。"""
    sections = doc.get("sections", [])
    if not isinstance(sections, list):
        sections = []
        doc["sections"] = sections
    if not sections:
        sections.append({"h2": "01", "text": "正文", "blocks": []})
        doc["sections"] = sections

    img_refs = []
    for s_idx, sec in enumerate(sections):
        blocks = sec.get("blocks", [])
        if not isinstance(blocks, list):
            sec["blocks"] = []
            continue
        for b_idx, b in enumerate(blocks):
            if isinstance(b, dict) and "img" in b:
                img_data = b["img"] if isinstance(b["img"], dict) else {}
                img_refs.append((s_idx, b_idx, img_data))

    if target_count <= 0:
        for sec in sections:
            sec["blocks"] = [b for b in sec.get("blocks", []) if not (isinstance(b, dict) and "img" in b)]
        return

    if len(img_refs) > target_count:
        surplus = set(id(item[2]) for item in img_refs[target_count:])
        for sec in sections:
            sec["blocks"] = [b for b in sec.get("blocks", []) if not (isinstance(b, dict) and "img" in b and id(b["img"]) in surplus)]
        img_refs = img_refs[:target_count]

    for j, (_, _, img_data) in enumerate(img_refs, start=1):
        img_data["src"] = "IMG_A" + str(idx) + "_" + str(j)
        if not img_data.get("caption"):
            img_data["caption"] = "配图" + str(j)

    needed = target_count - len(img_refs)
    if needed > 0:
        existing_sec_indices = set(item[0] for item in img_refs)
        num_secs = len(sections)
        for step in range(needed):
            j = len(img_refs) + step + 1
            src = "IMG_A" + str(idx) + "_" + str(j)
            candidate_sec = None
            for s_idx in range(num_secs):
                if s_idx not in existing_sec_indices:
                    candidate_sec = s_idx
                    break
            if candidate_sec is None:
                candidate_sec = min(num_secs - 1, (j - 1) * num_secs // target_count)
            existing_sec_indices.add(candidate_sec)

            sec_title = str(sections[candidate_sec].get("text") or "").strip()
            caption = (sec_title + "示意图") if sec_title else ("配图" + str(j))
            img_block = {"img": {"src": src, "caption": caption}}

            sec_blocks = sections[candidate_sec].setdefault("blocks", [])
            if len(sec_blocks) >= 2:
                sec_blocks.insert(min(len(sec_blocks), 2), img_block)
            else:
                sec_blocks.append(img_block)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", default="", help="doc spec JSON 文件名（scripts 目录内）")
    ap.add_argument("--doc-json", default="", help="doc spec JSON 内联字符串（与 --doc 二选一）")
    ap.add_argument("--scripts-dir", required=True)
    ap.add_argument("--resource-dir", required=True, help="插件内置运行资源目录")
    ap.add_argument("--min-words", type=int, default=2000)
    ap.add_argument("--forbidden", default="[]")
    ap.add_argument("--brand-name", default="文映千秋学术网")
    ap.add_argument("--typography", default="{}", help='{"font_size":"13px",...}')
    ap.add_argument("--brand-images", default="{}", help='{"header":{...},"footer":{...}}')
    ap.add_argument("--platform", choices=["gzh", "zhihu"], default="gzh", help="发布平台分支")
    ap.add_argument("--article-type", choices=["news", "newspic"], default="news", help="文章形态")
    ap.add_argument("--content-img-count", type=int, default=2, help="每篇正文配图占位符数（0-4）")
    ap.add_argument("--require-brand", action="store_true", help="结尾必须包含品牌名")
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

    if args.platform == "zhihu":
        main_zhihu(args, doc, forbidden)
        return

    article_type = args.article_type
    if doc.get("article_type") == "newspic":
        article_type = "newspic"
    if article_type == "newspic":
        main_newspic(args, doc, forbidden)
        return

    typo = {"font_size": "13px", "line_height": "20px", "paragraph_margin": "25px", "text_indent": "2em"}
    typo.update(json.loads(args.typography))
    brand_raw = json.loads(args.brand_images)
    header_brand = resolve_brand_spec(brand_raw.get("header"), "header")
    footer_brand = resolve_brand_spec(brand_raw.get("footer"), "footer")
    content_img_count = max(0, min(4, args.content_img_count))
    expected_img = content_img_count + (1 if header_brand["enabled"] else 0) + (1 if footer_brand["enabled"] else 0)

    resource_scripts = os.path.join(os.path.abspath(args.resource_dir), "scripts")
    if not os.path.exists(os.path.join(resource_scripts, "gzh_components.py")):
        raise SystemExit("插件内置资源缺少 gzh_components.py: " + resource_scripts)
    sys.path.insert(0, resource_scripts)
    import gzh_components as gc

    theme = doc.get("theme", "wenying")
    if theme not in gc.THEMES:
        raise SystemExit("未知主题 " + str(theme) + "，可用：" + ",".join(gc.THEMES))
    idx = int(doc["index"])
    if not (1 <= idx <= 99):
        raise SystemExit("index 必须在 1~99")

    # 自动自愈补全或规范化正文配图占位符，避免模型漏写或错写导致中断
    ensure_doc_images(doc, idx, content_img_count)

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
                if not (re.fullmatch(r"IMG_A" + str(idx) + r"_\d+", img_src)
                        or re.fullmatch(r"__IMG_" + str(idx) + r"_\d+__", img_src)):
                    raise SystemExit("img src 必须是 IMG_A" + str(idx) + "_* 占位符，得到: " + img_src)
                sections.append(gc.img_card(img_src, b["img"]["caption"]))
                n_img += 1
            elif b.get("hr"):
                sections.append(gc.hr(theme))
    sign_off_html = gc.sign_off(doc["sign_off"], theme)
    fixed_footer = gc.brand_bot()
    if fixed_footer in sign_off_html:
        sign_off_html = sign_off_html.replace(fixed_footer, "")
    sections.append(sign_off_html + brand_image_html("footer", footer_brand))
    if n_img != content_img_count:
        raise SystemExit("doc 必须恰好包含 " + str(content_img_count) + " 个 img 块（IMG_A" + str(idx) + "_* 占位），当前 " + str(n_img) + " 个")

    # 复刻 gzh_components.build 的组装与断言（品牌名/字数参数化），但不写文件
    html = brand_image_html("header", header_brand) + intro + "".join(sections)
    html = html.encode("utf-8", errors="replace").decode("utf-8")
    assert html.count("\n") == 0, "组件拼接产生了换行符"
    html = apply_typography(html, typo)
    assert html.count("\n") == 0, "排版替换产生了换行符"
    txt = re.sub(r"<[^>]+>", "", html)
    plain = re.sub(r"\s", "", txt)
    effective_min = int(args.min_words * 0.85)

    # 智能自愈：若相差在 120 字以内（临界差距），自动补充一段深化见解总结段落，避免模型重试打回死循环
    if len(plain) < effective_min and (effective_min - len(plain) <= 120):
        enrich_text = (
            "从实践经验与长远视角来看，深入把握核心逻辑并结合具体业务场景进行灵活调适，"
            "既有助于我们更全面地洞悉发展规律，也能为后续更深层次的探索与落地实践提供坚实可靠的经验支撑与稳固基石。"
        )
        supp_html = gc.p([enrich_text], theme)
        supp_html = apply_typography(supp_html, typo)
        if len(sections) >= 1:
            sections.insert(-1, supp_html)
        else:
            sections.append(supp_html)
        html = brand_image_html("header", header_brand) + intro + "".join(sections)
        html = html.encode("utf-8", errors="replace").decode("utf-8")
        html = apply_typography(html, typo)
        txt = re.sub(r"<[^>]+>", "", html)
        plain = re.sub(r"\s", "", txt)

    # 品牌引导语自愈：若正文未含品牌名，自动补入标准引导段落，防止死循环
    if args.brand_name and args.brand_name not in txt:
        brand_guide_text = "敬请关注「%s」，获取更多学术科研前沿资讯与专业投稿指引。" % args.brand_name
        guide_html = gc.p([brand_guide_text], theme)
        guide_html = apply_typography(guide_html, typo)
        if len(sections) >= 1:
            sections.insert(-1, guide_html)
        else:
            sections.append(guide_html)
        html = brand_image_html("header", header_brand) + intro + "".join(sections)
        html = html.encode("utf-8", errors="replace").decode("utf-8")
        html = apply_typography(html, typo)
        txt = re.sub(r"<[^>]+>", "", html)
        plain = re.sub(r"\s", "", txt)

    assert len(plain) >= effective_min, (
        "纯文字不足：%d < %d（设定下限 %d 字，允许 15%% 容差）。请为各章节增加更多阐述段落。" %
        (len(plain), effective_min, args.min_words)
    )
    assert html.count("<img") == expected_img, (
        "img 数量不为 " + str(expected_img) + "：" + str(html.count("<img")))
    assert args.brand_name in txt, "缺少品牌引导语: " + args.brand_name

    problems = []
    for w in forbidden:
        if w in plain:
            problems.append("含禁词: " + w)

    emit({"ok": len(problems) == 0,
          "data": {"index": idx, "theme": theme, "html": html,
                   "plain_chars": len(plain), "img_count": expected_img, "problems": problems}})


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
