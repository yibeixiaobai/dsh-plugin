# -*- coding: utf-8 -*-
"""知乎专栏 Markdown 组件构建器（与 gzh_components 对应的平台分支，纯函数无 IO）。

输入与 gzh 相同的 doc spec 骨架（intro/sections/blocks/sign_off），输出标准 Markdown 长文：
- intro → 开篇段落（高亮词加粗）；toc → "本文看点"列表
- sections → "## {h2} {text}" 章节标题
- p 的 kw/b/hl 标注 → 统一 **加粗**（Markdown 无下划线/高亮语义）
- card → "> 提示：..." 引用块；card_ul → 加粗清单标题 + 无序列表
- img → ![caption](IMG_A{idx}_{j}) 占位（发布时上传后替换为知乎 CDN URL）
- hr → ---；sign_off → 结尾段落

知乎不使用：主题色板、13px 单行 HTML、span leaf、头尾品牌图（无微信 CDN 概念）。
Markdown 天然多行，不受公众号"零换行"约束。
"""
import re


def render_parts(parts):
    """p 块的标注片段 → Markdown 行内文本：kw/b/hl 一律加粗；相邻加粗合并，避免 **a****b** 歧义。"""
    segments = []  # [text, bold]
    for part in parts:
        if isinstance(part, (list, tuple)) and len(part) >= 2:
            kind, text = str(part[0]), str(part[1])
            segments.append([text, bool(kind in ("kw", "b", "hl") and text)])
        else:
            segments.append([str(part), False])
    out = ""
    pending_bold = ""
    for text, bold in segments:
        if bold:
            pending_bold += text
            continue
        if pending_bold:
            out += "**" + pending_bold + "**"
            pending_bold = ""
        out += text
    if pending_bold:
        out += "**" + pending_bold + "**"
    return out


def plain_text(md):
    """剥离 Markdown 语法后的纯文字（字数统计/禁词/品牌断言的口径）。"""
    txt = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md)          # 图片
    txt = re.sub(r"^#{1,6}\s+", "", txt, flags=re.M)        # 标题
    txt = re.sub(r"^>\s?", "", txt, flags=re.M)             # 引用
    txt = re.sub(r"^\s*[-*]\s+", "", txt, flags=re.M)       # 列表
    txt = re.sub(r"^\s*-{3,}\s*$", "", txt, flags=re.M)     # 分隔线
    txt = txt.replace("**", "")
    return re.sub(r"\s", "", txt)


def build_markdown(doc, idx, content_img_count, min_words=2000,
                   brand_name="", require_brand=False, forbidden=None):
    """doc spec → (markdown, plain_chars, img_count, problems)。

    断言失败抛 AssertionError（由调用方 build_article.py 统一转为 ###RESULT### 错误）；
    禁词不抛错，以 problems 返回（与 gzh 分支口径一致）。
    """
    forbidden = list(forbidden or [])
    lines = []

    intro = doc.get("intro")
    if isinstance(intro, dict):
        head = (str(intro.get("pre", "")) + "**" + str(intro.get("hl", "")) + "**"
                + str(intro.get("post", ""))).replace("****", "")
        if head.strip():
            lines.append(head.strip())
            lines.append("")

    toc = [str(t) for t in (doc.get("toc") or []) if str(t).strip()]
    if toc:
        lines.append("本文看点：")
        for item in toc[:3]:
            lines.append("- " + item.strip())
        lines.append("")

    n_img = 0
    for sec in doc.get("sections", []):
        heading = ("## " + str(sec.get("h2", "")).strip() + " " + str(sec.get("text", "")).strip()).strip()
        if heading == "##":
            raise AssertionError("section 缺少 h2/text 标题")
        lines.append(heading)
        lines.append("")
        for b in sec.get("blocks", []):
            if "p" in b:
                text = render_parts([tuple(x) if isinstance(x, list) else x for x in b["p"]])
                if text.strip():
                    lines.append(text.strip())
                    lines.append("")
            elif "card" in b:
                text = str(b["card"]).strip()
                if text:
                    lines.append("> 提示：" + text)
                    lines.append("")
            elif "card_ul" in b:
                spec = b["card_ul"]
                title = str(spec.get("title", "")).strip()
                if title:
                    lines.append("**" + title + "**")
                    lines.append("")
                for item in spec.get("items", []):
                    lines.append("- " + str(item))
                lines.append("")
            elif "img" in b:
                src = str(b["img"].get("src", ""))
                m = re.fullmatch(r"IMG_A(\d+)_(\d+)", src)
                if not m or int(m.group(1)) != idx or not (1 <= int(m.group(2)) <= content_img_count):
                    raise AssertionError(
                        "img src 必须是 IMG_A" + str(idx) + "_1 ~ IMG_A" + str(idx) + "_" +
                        str(content_img_count) + " 占位符，得到: " + src)
                caption = str(b["img"].get("caption", "")).strip()
                lines.append("![" + caption + "](" + src + ")")
                lines.append("")
                n_img += 1
            elif b.get("hr"):
                lines.append("---")
                lines.append("")

    sign_off = str(doc.get("sign_off", "")).strip()
    if sign_off:
        lines.append(sign_off)
        lines.append("")

    md = "\n".join(lines).rstrip() + "\n"
    plain = plain_text(md)

    if n_img != content_img_count:
        raise AssertionError(
            "img 占位符数量应为 " + str(content_img_count) + "，实际 " + str(n_img) +
            "（IMG_A" + str(idx) + "_1 ~ _" + str(content_img_count) + "）")
    if len(plain) < min_words:
        raise AssertionError("纯文字不足：" + str(len(plain)) + " < " + str(min_words))
    if require_brand and brand_name and brand_name not in plain:
        raise AssertionError("缺少品牌引导语: " + brand_name)

    problems = ["含禁词: " + w for w in forbidden if w in plain]
    return md, len(plain), n_img, problems
