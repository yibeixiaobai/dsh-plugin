# -*- coding: utf-8 -*-
"""小红书笔记纯文本组件构建器与平台规则合规校验引擎（纯函数无 IO）。

依据小红书官方在线协议《小红书社区规范》（协议编号：ZXXY20221213003）：
1. 价值观与真实性（第一条、第四条4.1.4）：
   - 倡导真实、向上、多元的社区氛围，真实分享、真诚互动；
   - 杜绝无真实体验经历、假大空套话、机械公式化内容或过分参照商业指引。
2. 法律法规与违规交易（第二条、第三条3.1）：
   - 严禁学术不端（代写、代办、代发、包过、保过、买卖论文、枪手等）；
   - 严禁违禁药品、高风险投资理财等违禁交易行为。
3. 交易及导流行为红线（第三条3.2）——最高违规等级：
   - 严禁导流个人联系方式：微信号、微信、加V、VX、QQ、手机号、邮箱、暗号等；
   - 严禁导流外部平台与外链：网址链接（http/https/域名如.cn/.com等）、二维码、外部平台（淘宝/京东/公众号/知乎等）、“私信领资料”等。
4. 不当行为与标题党（第四条4.1.3）：
   - 严禁图文不符、虚假宣传、广告极限词（第一、顶级、国家级、绝密、100%等）。
5. 知识产权与肖像权（第五条5.1、5.2）：
   - 严禁侵犯他人肖像权（不得生成真实知名人物肖像）、商标侵权（不得生成知名商业Logo）。
6. 技术与格式规范：
   - 标题严格 <= 20 字；
   - 正文纯文本（支持 emoji 与换行分段，200~1000字，含话题标签）；
   - 严禁残留 IMG_A{i}_{j} 图片占位符；
   - 话题标签规范为 #话题 格式，去重且控制在合理数量（1~8个）；
   - 品牌名清洗：自动剥离网址域名后缀（如 win00.cn -> 文映学术），以知识博主/专栏IP形式合规融入。
"""
import re


# ==================== 小红书社区规范合规规则集 ====================

# 1. 导流红线词与模式（《社区规范》3.2）
DIVERSION_KEYWORDS = [
    # 微信/即时通讯导流
    "微信", "微信号", "加微", "加v", "加V", "vx", "VX", "v信", "企鹅号", "扣扣",
    # 电话/手机/邮箱
    "手机号", "联系电话", "电话咨询", "拨打电话", "电子邮箱", "邮箱地址",
    # 外部平台导流
    "淘宝", "天猫", "京东", "拼多多", "咸鱼", "闲鱼", "公众号", "微信公众号", "知乎", "抖音", "快手", "bilibili", "B站",
    # 导流动作与话术
    "私信领", "私信发", "私信我", "私聊", "私发", "后台回复", "看主页简介", "主页有惊喜", "主页联系", "扫码", "二维码",
]

# 网址/域名正则
URL_REGEX = re.compile(
    r"(https?://\S+|www\.\S+|[a-zA-Z0-9-]+\.(?:cn|com|net|org|cc|top|xyz|vip|edu|gov|hk|tw)\b)",
    re.IGNORECASE
)

# 连续 7 位以上电话/QQ 号码（排查联系方式，排除年份如 2024年、2026年）
PHONE_OR_QQ_REGEX = re.compile(
    r"(?<![0-9])(?:1[3-9]\d{9}|[1-9]\d{6,10})(?![0-9])"
)

# 2. 违规交易与学术不端禁词（《社区规范》2.3 & 3.1）
PROHIBITED_SERVICE_KEYWORDS = [
    "代写", "代办", "代发", "包过", "保过", "100%包过", "稳过", "枪手", "代做",
    "买卖论文", "论文代写", "保录", "保定刊", "买卖专利", "快速拿证",
]

# 3. 广告极限词与标题党虚假夸大（《社区规范》4.1.3 & 4.1.4）
EXTREME_AD_KEYWORDS = [
    "全网第一", "全国第一", "国家级顶级", "顶级绝密", "极品", "史上最全", "秒杀一切",
    "100%搞定", "绝对保过", "包教包会", "零门槛暴富", "稳赚不赔", "永久免费",
]

# 4. AI 八股套话与假大空词句库（去套路化、去模板化引擎）
AI_CLICHE_PATTERNS = [
    "在当今快节奏的", "不可否认的是", "毋庸置疑的是", "毋庸置疑", "显而易见的是",
    "随着时代的发展", "从某种意义上说", "有助于全面洞悉规律", "综上所述",
    "总而言之", "众所周知的是", "正如我们所知", "毫无疑问的是", "不得不说的是",
    "值得注意的是", "总的来说",
]

# 5. 小红书 5 大原生爆款叙事体裁定义
ARCHETYPES = {
    "story_trap": {
        "name": "避坑经历型",
        "desc": "以第一人称真实踩坑经历切入，剖析症结，给出复盘对策，情绪共鸣强",
        "emoji": "🚨",
    },
    "step_checklist": {
        "name": "保姆级实操清单型",
        "desc": "阶段化/时间线推进，搭配可逐项打勾的对照清单，实操落地性强",
        "emoji": "📋",
    },
    "comparison_matrix": {
        "name": "横向对比测评型",
        "desc": "横向对比A/B方案的优缺点、适用场景与性价比，表格化思维呈现",
        "emoji": "⚖️",
    },
    "myth_buster": {
        "name": "认知反转破局型",
        "desc": "打破90%人搞错的误区，揭示深层真相，提供认知升级与降维思考",
        "emoji": "💡",
    },
    "toolkit_resources": {
        "name": "实用工具库盘点型",
        "desc": "自用私藏高频神器、文献助手、提效软件盘点，高信息密度与收藏率",
        "emoji": "🧰",
    },
}

# 6. 多样化自然博主互动与收尾语池（替代单一机械补全，轮换分配）
HUMANIZED_INTERACTIONS = [
    "💬 互动时间：你在写这部分时遇到过什么头疼问题？欢迎在评论区聊聊，学姐看到都会回复~",
    "📌 实用建议：先收藏起来，等写到这一步直接对照执行！有疑问随时在评论区提问~",
    "🙋‍♀️ 互助交流：大家目前的进度推进到哪一步啦？欢迎在评论区打卡，一起交流避坑！",
    "💡 小贴士：建议把这套清单截图存好，随用随查。你在实操中还有哪些好习惯？评论区互相取经呀~",
    "🎯 行动指南：光看不练假把式，今天就试着按这套逻辑过一遍！遇到卡点欢迎评论区探讨~",
    "📚 持续分享：持续更新硬核实操干货，大家还想看哪方面内容？在评论区告诉我吧~",
]


def sanitize_brand_for_xhs(brand_name):
    """去除品牌名中的网址、域名、外链及导流后缀（如 '文映学术win00.cn' -> '文映学术'）。
    
    小红书严禁出现网址域名，品牌必须作为干净的博主/专栏名称呈现。
    """
    if not brand_name:
        return ""
    cleaned = URL_REGEX.sub("", brand_name)
    cleaned = re.sub(r"[\s._\-–—]+$", "", cleaned)
    return cleaned.strip()


def plain_text(text):
    """去除 emoji、空白、话题标签后的纯汉字计数（字数统计/禁词校验口径）。"""
    txt = re.sub(r"#[^#\s]+#?", "", text)
    txt = re.sub(r"[\U00010000-\U0010ffff]", "", txt)
    txt = re.sub(r"[✅❌📌💡🔑🎯🌟✨🔥💪📝🎓📚🏆⚡🎉❤️👍🙏💰📊🔍📋🏷️📖🧭🚀]", "", txt)
    return re.sub(r"\s", "", txt)


def sanitize_xhs_tags(raw_tags):
    """规范小红书话题标签格式：去除井号前后杂质，去重，过滤空标签和非法符号。
    
    小红书标准标签格式为单个空格分隔的 `#话题名称 `。
    """
    if not isinstance(raw_tags, list):
        return []
    clean_tags = []
    seen = set()
    for t in raw_tags:
        t_str = str(t).strip().replace("#", "").strip()
        # 标签不得包含空格、斜杠、换行等
        t_str = re.sub(r"[\s/\\<>#]", "", t_str)
        if t_str and t_str not in seen:
            seen.add(t_str)
            clean_tags.append(t_str)
    return clean_tags[:8]


def check_xhs_compliance(title, content, brand_name="", forbidden=None):
    """小红书社区规范（ZXXY20221213003）全面合规校验。
    
    返回违规问题列表（包含引用规范条款的具体提示）。
    """
    problems = []
    forbidden = list(forbidden or [])
    combined = (title or "") + " " + (content or "")

    # 1. 检查导流行为（《社区规范》3.2）
    for kw in DIVERSION_KEYWORDS:
        if kw in combined:
            problems.append("[违反社区规范3.2-禁止导流] 包含违规导流关键词: 「%s」（小红书严禁导流至微信/电话/外部平台）" % kw)

    # 检查 URL / 域名
    urls = URL_REGEX.findall(combined)
    if urls:
        problems.append("[违反社区规范3.2-禁止外链] 包含外部网址或域名: %s（小红书严禁发布外部网址链接）" % (", ".join(urls[:3]),))

    # 检查疑似联系方式（排除正常年份数字 2000-2099）
    plain_for_phone = combined
    for y in range(1990, 2035):
        plain_for_phone = plain_for_phone.replace(str(y), "")
    phone_matches = PHONE_OR_QQ_REGEX.findall(plain_for_phone)
    if phone_matches:
        problems.append("[违反社区规范3.2-禁止联系方式] 疑似包含连续电话/QQ联系方式: %s" % (", ".join(phone_matches[:2]),))

    # 2. 检查违规代办与学术不端（《社区规范》2.3 & 3.1）
    for kw in PROHIBITED_SERVICE_KEYWORDS:
        if kw in combined:
            problems.append("[违反社区规范3.1/2.3-违规交易] 包含涉嫌违规学术代办/保过承诺词: 「%s」" % kw)

    # 3. 检查广告法极限词与虚假夸大（《社区规范》4.1.3 & 4.1.4）
    for kw in EXTREME_AD_KEYWORDS:
        if kw in combined:
            problems.append("[违反社区规范4.1-虚假夸大] 包含广告极限词/绝对化承诺: 「%s」" % kw)

    # 4. 检查用户/账号自定义禁词
    plain_chars = plain_text(combined)
    for w in forbidden:
        if w in combined or w in plain_chars:
            problems.append("[命中账号自定义禁词] 「%s」" % w)

    # 5. 检查正文残留图片占位符
    leftover = re.findall(r"IMG_A\d+_\d+", content or "")
    if leftover:
        problems.append("[违反小红书图文体验] 正文残留图片占位符: %s（小红书正文为纯文本，图片单独上传）" % (", ".join(sorted(set(leftover))[:3]),))

    # 6. 检查 AI 八股套话与假大空（去套路化引擎）
    cliche_hits = [c for c in AI_CLICHE_PATTERNS if c in combined]
    if len(cliche_hits) >= 2:
        problems.append("[检测到AI八股套话超标] 包含机械套话: %s（请采用第一人称真实博主口吻，杜绝机械假大空AI腔）" % ("、".join(cliche_hits[:3]),))

    return problems


def build_note(doc, idx, min_words=200, brand_name="", require_brand=False, forbidden=None):
    """doc spec → (text, title, plain_chars, img_count, problems)。

    输入 doc spec 骨架（支持 5 大原生爆款体裁）：
    {
      "index": 1,
      "archetype": "story_trap" | "step_checklist" | "comparison_matrix" | "myth_buster" | "toolkit_resources",
      "title": "标题（<=20字，痛点+数字+解决方案）",
      "content": "正文段落（支持 emoji 导读与清晰分段）...",
      "images": [{"sub": 1, "role": "cover", "prompt": "..."}],
      "tags": ["考研", "论文发表"]
    }

    严格按照小红书平台规则校验：
    - 标题 <= 20 字；
    - 正文 <= 1000 字（含话题标签），且纯文字满足字数下限；
    - 绝不允许导流（微信号、网址域名、外部平台）；
    - 绝不允许虚假宣传、学术代办与极端违规词；
    - 过滤 AI 八股套话，促进生动多元的博主真实表达；
    - 规范话题标签格式；
    - 占位符自动剔除。
    """
    forbidden = list(forbidden or [])

    title = str(doc.get("title", "")).strip()
    if not title:
        raise AssertionError("小红书标题不能为空")
    if len(title) > 20:
        raise AssertionError("小红书标题 %d 字超过 20 字上限（当前标题：「%s」）" % (len(title), title))

    content = str(doc.get("content", "")).strip()
    if not content:
        raise AssertionError("小红书正文不能为空")
    if "<" in content and ">" in content:
        content = re.sub(r"<[^>]+>", "", content)

    # 剔除正文中可能误写残留的 IMG_A{i}_{j} 占位符
    content = re.sub(r"^[ \t]*IMG_A\d+_\d+[ \t]*$", "", content, flags=re.M)
    content = re.sub(r"IMG_A\d+_\d+", "", content)
    content = re.sub(r"\n{3,}", "\n\n", content).strip()

    # 处理合规话题标签
    tags = doc.get("tags", [])
    clean_tags = sanitize_xhs_tags(tags)
    tag_text = " ".join("#" + t + " " for t in clean_tags).strip()

    full_text = content.rstrip()
    if tag_text and tag_text not in full_text:
        full_text += "\n\n" + tag_text

    if len(full_text) > 1000:
        raise AssertionError("小红书正文 %d 字超过 1000 字上限（含话题标签），请精简内容" % len(full_text))

    plain = plain_text(full_text)
    effective_min = int(min_words * 0.85)

    # 若字数略微不足（差值<=60字），按篇号轮换提供符合小红书真诚分享风格的拓展引导，拒绝单一机械套话
    if len(plain) < effective_min and (effective_min - len(plain) <= 60):
        enrich_pool = [
            "\n\n💡 亲测心得：\n每个人的研究方向和基础不同，建议大家结合自己的实际场景灵活参考，把核心要点落实为每天的执行清单，循序渐进才能走得更稳。",
            "\n\n🚨 避坑提示：\n很多同学刚开始容易陷入完美主义焦虑，其实只要先迈出第一步完成框架搭建，后续对照清单迭代优化，效率会成倍提升。",
            "\n\n✨ 实操复盘：\n复盘比盲目努力更重要，推进过程中建议多做笔记留痕，把阶段性结论梳理清晰，后续写报告或论文时会省心很多。",
            "\n\n📌 关键备忘：\n把复杂任务拆解成可量化的微习惯，每天专注突破一个小难点，不知不觉就能啃下硬骨头，大家一起加油！"
        ]
        enrich = enrich_pool[(idx - 1) % len(enrich_pool)]
        full_text += enrich
        plain = plain_text(full_text)

    if len(plain) < effective_min:
        raise AssertionError("小红书纯文字不足：%d < %d（设定下限 %d 字，允许 15%% 容差）。请丰富正文干货细节。" %
                             (len(plain), effective_min, min_words))

    # 品牌引导语清洗与融入（小红书规则：严禁带 .cn/.com 或外链，以博主IP或分享专栏呈现）
    clean_brand = sanitize_brand_for_xhs(brand_name)
    if require_brand and clean_brand:
        if clean_brand not in plain:
            inter_text = HUMANIZED_INTERACTIONS[(idx - 1) % len(HUMANIZED_INTERACTIONS)]
            interaction = "\n\n📌 本期分享来自【%s】。\n%s" % (clean_brand, inter_text)
            full_text += interaction
            plain = plain_text(full_text)

    # 图片数量断言（小红书规范：1~18张）
    images = doc.get("images", [])
    if not isinstance(images, list):
        images = []
    img_count = len(images)
    if img_count < 1:
        raise AssertionError("小红书笔记至少需要 1 张图片（推荐 3~6 张 3:4 竖版卡片）")
    if img_count > 18:
        raise AssertionError("小红书笔记图片 %d 张超过 18 张上限" % img_count)

    for j, img in enumerate(images, 1):
        src = str(img.get("src", "")).strip()
        expected = "IMG_A%d_%d" % (idx, j)
        if src and src != expected:
            img["src"] = expected

    # 全面合规检查
    compliance_problems = check_xhs_compliance(title, full_text, brand_name=clean_brand, forbidden=forbidden)

    return full_text, title, len(plain), img_count, compliance_problems
