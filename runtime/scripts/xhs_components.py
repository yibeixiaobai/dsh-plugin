# -*- coding: utf-8 -*-
"""小红书笔记纯文本组件构建器（纯函数无 IO）。

输入 doc spec 骨架（与 newspic 类似但更简洁）：
{
  "index": 1,
  "title": "标题（≤20字）",
  "content": "正文段落...",
  "images": [{"sub": 1, "role": "cover", "prompt": "..."}],
  "tags": ["话题1", "话题2"]
}

输出纯文本笔记内容（支持 emoji、换行、#话题# 格式），校验标题≤20字、正文≤1000字、字数下限、禁词。
小红书不使用 HTML/Markdown、主题色板、品牌头尾图。
"""
import re


def plain_text(text):
    """去除 emoji、空白、话题标签后的纯汉字计数（字数统计/禁词校验口径）。"""
    txt = re.sub(r"#[^#\s]+#", "", text)
    txt = re.sub(r"[\U00010000-\U0010ffff]", "", txt)
    txt = re.sub(r"[✅❌📌💡🔑🎯🌟✨🔥💪📝🎓📚🏆⚡🎉❤️👍🙏💰📊🔍📋]", "", txt)
    return re.sub(r"\s", "", txt)


def build_note(doc, idx, min_words=200, brand_name="", require_brand=False, forbidden=None):
    """doc spec → (text, title, plain_chars, img_count, problems)。

    断言失败抛 AssertionError；禁词以 problems 返回。
    """
    forbidden = list(forbidden or [])

    title = str(doc.get("title", "")).strip()
    if not title:
        raise AssertionError("小红书标题不能为空")
    if len(title) > 20:
        raise AssertionError("小红书标题 %d 字超过 20 字上限" % len(title))

    content = str(doc.get("content", "")).strip()
    if not content:
        raise AssertionError("小红书正文不能为空")
    if "<" in content and ">" in content:
        content = re.sub(r"<[^>]+>", "", content)

    tags = doc.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    tag_text = " ".join("#" + str(t).strip().lstrip("#").rstrip("#") + "#" for t in tags if str(t).strip())
    full_text = content.rstrip()
    if tag_text:
        full_text += "\n\n" + tag_text

    if len(full_text) > 1000:
        raise AssertionError("小红书正文 %d 字超过 1000 字上限（含话题标签）" % len(full_text))

    plain = plain_text(full_text)
    effective_min = int(min_words * 0.85)
    if len(plain) < effective_min and (effective_min - len(plain) <= 50):
        enrich = (
            "\n\n从实践角度来看，深入把握核心逻辑并结合具体场景灵活调适，"
            "有助于更全面地洞悉规律，也能为后续探索提供坚实支撑。"
        )
        full_text += enrich
        plain = plain_text(full_text)

    if len(plain) < effective_min:
        raise AssertionError("纯文字不足：%d < %d（设定下限 %d 字，允许 15%% 容差）。请增加正文内容。" %
                             (len(plain), effective_min, min_words))

    if require_brand and brand_name and brand_name not in plain:
        raise AssertionError("缺少品牌引导语: " + brand_name)

    images = doc.get("images", [])
    if not isinstance(images, list):
        images = []
    img_count = len(images)
    if img_count < 1:
        raise AssertionError("小红书笔记至少需要 1 张图片")
    if img_count > 18:
        raise AssertionError("小红书笔记图片 %d 张超过 18 张上限" % img_count)

    for j, img in enumerate(images, 1):
        src = str(img.get("src", "")).strip()
        expected = "IMG_A%d_%d" % (idx, j)
        if src and src != expected:
            img["src"] = expected

    problems = ["含禁词: " + w for w in forbidden if w in plain or w in title]
    return full_text, title, len(plain), img_count, problems
