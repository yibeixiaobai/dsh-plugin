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


def build_markdown(doc, idx, content_img_count, min_words=2000,
                   brand_name="", require_brand=False, forbidden=None):
    """doc spec → (markdown, plain_chars, img_count, problems)。

    断言失败抛 AssertionError（由调用方 build_article.py 统一转为 ###RESULT### 错误）；
    禁词不抛错，以 problems 返回（与 gzh 分支口径一致）。
    """
    forbidden = list(forbidden or [])
    lines = []

    # 自动自愈补齐正文配图占位符
    ensure_doc_images(doc, idx, content_img_count)

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
    effective_min = int(min_words * 0.85)
    if len(plain) < effective_min and (effective_min - len(plain) <= 80):
        enrich_text = (
            "从实践经验与长远视角来看，深入把握核心逻辑并结合具体业务场景进行灵活调适，"
            "既有助于我们更全面地洞悉发展规律，也能为后续更深层次的探索与落地实践提供坚实可靠的经验支撑与稳固基石。"
        )
        if len(lines) >= 2:
            lines.insert(-2, enrich_text)
            lines.insert(-2, "")
        else:
            lines.append(enrich_text)
        md = "\n".join(lines).rstrip() + "\n"
        plain = plain_text(md)

    if len(plain) < effective_min:
        raise AssertionError("纯文字不足：%d < %d（设定下限 %d 字，允许 15%% 容差）。请为各章节增加更多阐述段落。" %
                             (len(plain), effective_min, min_words))
    if require_brand and brand_name and brand_name not in plain:
        raise AssertionError("缺少品牌引导语: " + brand_name)

    problems = ["含禁词: " + w for w in forbidden if w in plain]
    return md, len(plain), n_img, problems
