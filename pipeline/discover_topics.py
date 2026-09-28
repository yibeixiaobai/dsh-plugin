# -*- coding: utf-8 -*-
"""动态热点选题雷达与搜索聚合引擎 (Topic Trend Radar & Search Aggregator).

功能职责:
1. 实时搜索嗅探：Bing RSS 资讯检索、知乎/百度/360 实时搜索下拉联想词；
2. 外部搜索信息接入：支持接收 Agent 宿主搜索工具传入的 --search-snippets；
3. 行业时令日历引擎：按当前月份与日期匹配自媒体/学术/行业时效焦点（申报/毕业/职称/分区/考核）；
4. 5大原生爆款切角矩阵：政策解读(policy)、痛点避坑(trap)、保姆清单(guide)、认知反转(myth)、实用工具(tools)；
5. 多维评分与合规优选：热度分、痛点分、匹配分、历史新颖度、禁词过滤与无前缀铁律守护；
6. 本地优雅降级：网络受限时由本地日历与领域特征库 100% 兜底产出。

输出协议:
最后一行输出 "###RESULT### {json}"，包含 trending_signals, seasonal_focus, recommended_topics 等。
"""
import argparse
import concurrent.futures
from datetime import datetime
from difflib import SequenceMatcher
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

MARKER = "###RESULT### "

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# 噪音与百科黑名单（过滤无时效性的纯定义条目）
NOISE_PATTERNS = [
    r"_百度百科", r"百科名片", r"汉语字典", r"词条解释", r"汉语文字",
    r"英文翻译", r"黄页", r"电话号码", r"股票代码", r"行情走势",
]

# 行业时令日历（学术、教育、科研与自媒体周期）
SEASONAL_CALENDAR = {
    1: {
        "focus": "国自然基金申报冲刺期、考研初试结束复盘、春招科研岗启动",
        "keywords": ["基金申报", "开题立项", "春招", "课题标书"],
        "hot_angles": ["标书避坑", "立项要点", "本子撰写"],
    },
    2: {
        "focus": "基金标书形式审查与打磨、考研初试查分前瞻、寒假论文集中修改",
        "keywords": ["基金评审", "考研查分", "论文润色", "降重误区"],
        "hot_angles": ["标书打磨", "查分避坑", "润色技巧"],
    },
    3: {
        "focus": "国自然基金系统提交截止、考研国家线与复试线出炉、毕业论文预答辩",
        "keywords": ["基金截止", "考研复试", "调剂策略", "毕业答辩"],
        "hot_angles": ["复试避坑", "答辩前瞻", "调剂秘籍"],
    },
    4: {
        "focus": "高校春季职称申报材料摸底、硕士博士毕业论文盲审送审高峰、夏令营通知",
        "keywords": ["盲审送审", "毕业查重", "职称材料", "保研夏令营"],
        "hot_angles": ["盲审避坑", "格式合规", "查重陷阱"],
    },
    5: {
        "focus": "毕业论文正式答辩季、学术不端倒查与抽检预警、各省软课题申报",
        "keywords": ["答辩问答", "抽检预警", "毕业致谢", "课题申报"],
        "hot_angles": ["答辩通关", "抽检自查", "选题复盘"],
    },
    6: {
        "focus": "年中毕业离校季、最新JCR期刊影响因子(IF)年度重磅发布、年中科研总结",
        "keywords": ["影响因子", "JCR分区", "IF暴涨", "中科院分区"],
        "hot_angles": ["影响因子解读", "水刊预警", "投稿趋势"],
    },
    7: {
        "focus": "暑期集中写论文攻关、高校保研夏令营考核、国家社科基金评审动向",
        "keywords": ["暑期攻关", "夏令营考核", "论文撰写", "文献精读"],
        "hot_angles": ["暑期弯道超车", "保研面试", "精读清单"],
    },
    8: {
        "focus": "国家自然科学基金/国家社科放榜月、开学前投稿准备、专著书号申报窗口",
        "keywords": ["基金放榜", "专著出版", "专著书号", "SCI催稿"],
        "hot_angles": ["放榜复盘", "专著周期", "秋季投稿"],
    },
    9: {
        "focus": "秋季新学期开学、各省市高校职称评审材料申报启动高峰、考研大纲发布",
        "keywords": ["职称评审", "职称论文", "专著截稿", "考研大纲"],
        "hot_angles": ["职称政策新规", "专著加分", "核心期刊周期"],
    },
    10: {
        "focus": "职称评审公示与答辩期、考研正式报名缴费、秋招名企/高校教师试讲",
        "keywords": ["职称答辩", "考研报名", "高校教师招聘", "核心版面"],
        "hot_angles": ["职称答辩避坑", "版面抢占", "高校应聘"],
    },
    11: {
        "focus": "各省职称评审结果公示期、年终专著出版赶末班车、中科院新分区前瞻",
        "keywords": ["职称公示", "出版截稿", "分区预测", "预警期刊名单"],
        "hot_angles": ["专著末班车", "新分区变动", "避开预警刊"],
    },
    12: {
        "focus": "中科院最新《期刊分区表》与预警名单重磅发布、全国硕士研究生统考、年终科研绩效核算",
        "keywords": ["中科院分区", "预警名单公布", "考研初试", "科研绩效"],
        "hot_angles": ["最新分区解读", "踢出预警刊", "年终成果盘点"],
    },
}


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False))


def fetch_bing_rss(query, timeout=3):
    """通过 Bing RSS 获取最新实时检索结果"""
    results = []
    try:
        url = "https://www.bing.com/search?q=" + urllib.parse.quote(query) + "&format=rss"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as res:
            xml = res.read().decode("utf-8", errors="ignore")
            items = re.findall(r"<item>(.*?)</item>", xml, re.S)
            for it in items[:6]:
                m_title = re.search(r"<title>(.*?)</title>", it)
                m_desc = re.search(r"<description>(.*?)</description>", it)
                t_text = m_title.group(1) if m_title else ""
                d_text = m_desc.group(1) if m_desc else ""
                t_text = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", t_text)
                t_text = re.sub(r"<.*?>", "", t_text).strip()
                d_text = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", d_text)
                d_text = re.sub(r"<.*?>", "", d_text).strip()

                # 噪音过滤
                if any(re.search(pat, t_text) for pat in NOISE_PATTERNS):
                    continue
                if t_text and len(t_text) >= 6:
                    results.append({
                        "title": t_text,
                        "snippet": d_text[:140],
                        "source": "Bing实时搜索",
                    })
    except Exception:
        pass
    return results


def fetch_zhihu_suggest(kw, timeout=3):
    """获取知乎高频搜索联想与问答焦点"""
    suggestions = []
    try:
        url = "https://www.zhihu.com/api/v4/search/suggest?q=" + urllib.parse.quote(kw)
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as res:
            data = json.loads(res.read().decode("utf-8", errors="ignore"))
            for item in data.get("suggest", []):
                q = item.get("query", "").strip()
                if q and len(q) >= 4 and q != kw:
                    suggestions.append(q)
    except Exception:
        pass
    return suggestions[:8]


def fetch_baidu_suggest(kw, timeout=3):
    """获取百度搜索下拉联想词"""
    suggestions = []
    try:
        url = "https://suggestion.baidu.com/su?wd=" + urllib.parse.quote(kw) + "&action=opensearch"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("gbk", errors="ignore")
            data = json.loads(raw)
            if len(data) >= 2 and isinstance(data[1], list):
                for q in data[1]:
                    q_str = str(q).strip()
                    if q_str and len(q_str) >= 4 and q_str != kw:
                        suggestions.append(q_str)
    except Exception:
        pass
    return suggestions[:8]


def fetch_360_suggest(kw, timeout=3):
    """获取 360 搜索下拉联想词"""
    suggestions = []
    try:
        url = "https://sug.so.360.cn/suggest?word=" + urllib.parse.quote(kw) + "&encodein=utf-8&encodeout=utf-8"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as res:
            data = json.loads(res.read().decode("utf-8", errors="ignore"))
            for item in data.get("result", []):
                w = item.get("word", "").strip()
                if w and len(w) >= 4 and w != kw:
                    suggestions.append(w)
    except Exception:
        pass
    return suggestions[:6]


def gather_search_intelligence(keywords, extra_snippets=None):
    """并发收集全网搜索情报与热搜下拉"""
    search_results = []
    search_queries = []

    # 1. 如果有 Agent 传入的外部搜索摘要，优先收录
    if extra_snippets and isinstance(extra_snippets, list):
        for snip in extra_snippets:
            if isinstance(snip, dict) and snip.get("title"):
                search_results.append({
                    "title": snip["title"].strip(),
                    "snippet": snip.get("snippet", "")[:140],
                    "source": snip.get("source", "Agent搜索工具"),
                })
            elif isinstance(snip, str) and len(snip.strip()) >= 6:
                search_results.append({
                    "title": snip.strip()[:60],
                    "snippet": snip.strip(),
                    "source": "Agent搜索工具",
                })

    # 2. 构造高相关度搜索查询（关键词 + 时效修饰词）
    curr_year = datetime.now().year
    modifiers = [f"{curr_year}最新政策", "新规通知", "预警名单", "避坑指南", "流程图解"]

    top_keywords = keywords[:3] if keywords else ["期刊发表", "职称评审"]
    search_tasks = []
    for kw in top_keywords:
        # Bing 检索组合
        search_tasks.append((fetch_bing_rss, (f"{kw} {modifiers[0]}", 3)))
        search_tasks.append((fetch_bing_rss, (f"{kw} {modifiers[2]}", 3)))
        # 下拉联想
        search_tasks.append((fetch_zhihu_suggest, (kw, 2)))
        search_tasks.append((fetch_baidu_suggest, (kw, 2)))
        search_tasks.append((fetch_360_suggest, (kw, 2)))

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        future_map = {executor.submit(fn, *args): fn.__name__ for fn, args in search_tasks}
        for future in concurrent.futures.as_completed(future_map):
            fn_name = future_map[future]
            try:
                res = future.result()
                if fn_name == "fetch_bing_rss":
                    search_results.extend(res)
                else:
                    search_queries.extend(res)
            except Exception:
                pass

    # 结果去重与整理
    seen_titles = set()
    cleaned_results = []
    for item in search_results:
        t = item["title"]
        norm = re.sub(r"\s+", "", t)
        if norm and norm not in seen_titles:
            seen_titles.add(norm)
            cleaned_results.append(item)

    unique_queries = list(dict.fromkeys(search_queries))
    return cleaned_results[:8], unique_queries[:16]


def extract_history_titles(scripts_dir):
    """从本地账号目录提取历史文章标题用于新颖度与去重打分"""
    titles = set()
    if not scripts_dir or not os.path.isdir(scripts_dir):
        return titles

    for fname in ["publish_history.json", "publish_result.json"]:
        p = os.path.join(scripts_dir, fname)
        if os.path.exists(p):
            try:
                data = json.load(open(p, encoding="utf-8"))
                if isinstance(data, list):
                    for item in data:
                        t = item.get("title") or item.get("topic")
                        if t:
                            titles.add(t.strip())
                elif isinstance(data, dict):
                    for a in data.get("articles", []) + data.get("items", []):
                        t = a.get("title") if isinstance(a, dict) else a
                        if t:
                            titles.add(t.strip())
            except Exception:
                pass
    return titles


def calculate_novelty(topic, history_titles):
    """计算选题与历史标题的差异度 (0.0 ~ 1.0)"""
    if not history_titles:
        return 1.0
    norm_topic = re.sub(r"[\s，。、：；！？!?:;,.\-—（）()【】\[\]\"'“”]+", "", topic)
    max_sim = 0.0
    for h in history_titles:
        norm_h = re.sub(r"[\s，。、：；！？!?:;,.\-—（）()【】\[\]\"'“”]+", "", h)
        if norm_topic and norm_h:
            sim = SequenceMatcher(None, norm_topic, norm_h).ratio()
            if sim > max_sim:
                max_sim = sim
    return round(max(0.0, 1.0 - max_sim), 2)


CLICKBAIT_WORDS = [
    r"重磅(?:解读|消息|发布)?！?",
    r"突发！?",
    r"震惊！?",
    r"惊呆！?",
    r"千万别(?:投|做|选|盲投)?！?",
    r"手把手教你？",
    r"保姆级(?:教程|指南|清单)?！?",
    r"避坑指南",
    r"深水区(?:亲历)?复盘",
    r"致命盲区",
    r"大坑",
    r"90%人?搞错了",
    r"99%的人不知道",
    r"颠覆认知",
    r"决胜(?:实操)?策略",
    r"私藏！?",
    r"建议收藏！?",
    r"赶紧码住！?",
    r"绝了！?",
    r"看这一篇就够了",
]


def sanitize_human_tone(title, is_xhs=False):
    """去除人机感、标题党套路词与学术八股长词，保证简洁明了与社交传播属性"""
    t = title.strip()
    for pat in CLICKBAIT_WORDS:
        t = re.sub(pat, "", t)

    # 替换或平滑感叹号，避免情绪过载
    t = re.sub(r"[！!]+", "，", t)
    # 消除连续逗号与顿号
    t = re.sub(r"，{2,}", "，", t)
    t = re.sub(r"、、+", "、", t)
    # 消除两端无效标点
    t = re.sub(r"^[\s，。、：；！？!?:;,.\-—]+|[\s，。、：；！？!?:;,.\-—]+$", "", t).strip()

    # 消除冒号前缀（全账号铁律）
    prefix_regex = re.compile(r"^(\s*[\[【(（].+?[\]】)）]\s*|[^\s：:]{2,12}[：:])\s*")
    if prefix_regex.match(t):
        t = prefix_regex.sub("", t).strip()

    if is_xhs:
        # 小红书严格 <= 20 字，自然截断
        if len(t) > 20:
            if "，" in t:
                parts = t.split("，")
                t = parts[0] if len(parts[0]) <= 20 else t[:20]
            else:
                t = t[:20]
            t = re.sub(r"[\s，。、：；！？!?:;,.\-—]+$", "", t).strip()
    else:
        # 公众号/知乎推荐 16~24 字，若超长进行自然优化
        if len(t) > 28:
            if "，" in t:
                parts = t.split("，")
                if len(parts[0]) >= 12:
                    t = parts[0]
                else:
                    t = t[:28]
            else:
                t = t[:28]
            t = re.sub(r"[\s，。、：；！？!?:;,.\-—]+$", "", t).strip()

    return t


def generate_candidate_topics(keywords, seasonal_info, search_news, search_queries, history_titles, forbidden_words, platform="gzh"):
    """基于搜索热点、时令日历与社交传播逻辑，生成简洁明了、去模板化、无营销套路与无论文官话的优质候选选题"""
    candidates = []
    kw_primary = keywords[0] if keywords else "学术论文"
    kw_secondary = keywords[1] if len(keywords) > 1 else "期刊发表"
    kw_tertiary = keywords[2] if len(keywords) > 2 else "专著出版"
    is_xhs = (platform == "xiaohongshu")
    month_val = datetime.now().month

    # 提取搜索新闻中的真实政策/事件实体（精简提炼核心词，杜绝论文官话）
    policy_entity = "预警名单"
    policy_reason = "结合最新学术期刊预警与动态调整热点"
    for news in search_news:
        if any(term in news["title"] for term in ["预警", "分区", "政策", "通知", "改革", "规定", "调整"]):
            clean = re.sub(r"\s*[-_|].*$", "", news["title"]).strip()
            clean = re.sub(r"[！!。]+$", "", clean).strip()
            for cb in CLICKBAIT_WORDS:
                clean = re.sub(cb, "", clean)

            matched_kw = None
            for term in ["中科院分区表", "期刊预警名单", "最新分区表", "破五唯评价", "撤稿自查要求"]:
                if term in clean:
                    matched_kw = term
                    break
            if matched_kw:
                policy_entity = matched_kw
            elif 4 <= len(clean) <= 10:
                policy_entity = clean
            elif len(clean) > 10:
                for kw in ["预警名单", "分区表", "撤稿动态", "评价改革", "学术规范"]:
                    if kw in clean:
                        policy_entity = kw
                        break
                else:
                    policy_entity = clean[:8]
            policy_reason = f"捕捉到全网实时新闻热搜: {news['title'][:30]}"
            break

    # 提取搜索下拉中的高频困惑/焦点
    issue_entity = kw_primary
    issue_reason = "聚焦全网学者在投稿发表中真实面临的决策与规范困惑"
    for q in search_queries:
        if any(term in q for term in ["费用", "多少钱", "错误", "撤稿", "流程", "时间", "周期", "勘误"]):
            clean_q = re.sub(r"[\s？?！!]+$", "", q).strip()
            if 4 <= len(clean_q) <= 12:
                issue_entity = clean_q
                issue_reason = f"知乎/百度实时搜索高频焦点: {clean_q}"
                break

    season_focus = seasonal_info.get("focus", "阶段成果推进与规划")
    season_kw = seasonal_info.get("keywords", ["专著出版", "职称评审"])[0]

    seed = sum(ord(ch) for ch in kw_primary) % 3

    # -------------------------------------------------------------
    # 1. 政策透视与行业动态 (policy) - 简洁明了，直击最新变化
    # -------------------------------------------------------------
    if is_xhs:
        policy_patterns = [
            "预警名单又更新了，投稿前先查这几项",
            "最新期刊分区出炉，手头有稿件先自查",
            "避开被拉黑的刊，选刊自查这几个细节",
        ]
    else:
        policy_patterns = [
            f"{policy_entity}又有新变动，投稿前先自查这几项",
            f"最新{policy_entity}调整了，手头有文章的先看这几条",
            "发论文认准新分区，避开这几所高校已经拉黑的刊",
        ]
    policy_title = policy_patterns[seed % len(policy_patterns)]

    candidates.append({
        "title": policy_title,
        "angle": "policy",
        "angle_name": "政策透视与行业动态",
        "reason": policy_reason,
        "hot_score": 96,
        "pain_score": 90,
        "target_audience": "高校教师、硕博研究生、临床科研人员",
        "platform_fit": "知乎专栏/公众号长文深度解析，理性权威",
    })

    # -------------------------------------------------------------
    # 2. 现实困惑与决策权衡 (trap / trade-off) - 平实大白话，解决切身困扰
    # -------------------------------------------------------------
    if is_xhs:
        trap_patterns = [
            "版面费越来越贵，预算有限怎么选刊",
            "外审等了几个月，到底要不要主动催",
            "录用后发现有笔误，要不要联系编辑",
        ]
    else:
        trap_patterns = [
            "版面费越来越贵，普通人发论文到底该怎么选刊",
            "投稿等了小半年还在外审，这时候到底该不该催稿",
            "论文录用后发现数据有笔误，要不要主动联系编辑",
        ]
    trap_title = trap_patterns[(seed + 1) % len(trap_patterns)]

    candidates.append({
        "title": trap_title,
        "angle": "trap",
        "angle_name": "现实困惑与决策权衡",
        "reason": issue_reason,
        "hot_score": 94,
        "pain_score": 98,
        "target_audience": "面临选刊决策、担心费用超标或周期过长的学者",
        "platform_fit": "公众号头条/知乎专栏，引发读者深度共鸣",
    })

    # -------------------------------------------------------------
    # 3. 时令阶段与实务自查 (guide / standard) - 节点自查，拿来即用
    # -------------------------------------------------------------
    if is_xhs:
        guide_patterns = [
            f"{month_val}月准备评职称，材料自查重点都在这",
            "开题报告改不动了？文献和框架这样理",
            "第一次出专著，合同这几个条款要看清",
        ]
    else:
        guide_patterns = [
            f"{month_val}月准备评职称递交材料，这几条自查细节别疏忽",
            "开题报告改了好几版，把文献和逻辑框架理顺最省心",
            "下半年准备出版专著，合同里这几个条款一定要看清",
        ]
    guide_title = guide_patterns[(seed + 2) % len(guide_patterns)]

    candidates.append({
        "title": guide_title,
        "angle": "guide",
        "angle_name": "时令阶段与实务自查",
        "reason": f"契合当前{month_val}月份行业时令关注点（{season_focus[:25]}）",
        "hot_score": 91,
        "pain_score": 88,
        "target_audience": "处于当期申报或材料准备周期内的刚需学者",
        "platform_fit": "公众号小绿书/知乎标准图文，收藏与转发价值高",
    })

    # -------------------------------------------------------------
    # 4. 理念澄清与专业思考 (myth / insight) - 破除盲从，思辨共鸣
    # -------------------------------------------------------------
    if is_xhs:
        myth_patterns = [
            "论文发得越多越好？聊聊代表作分量",
            "出专著到底管不管用？不同学科差距大",
            "盲目冲高分期刊，不如选审稿快的好同行",
        ]
    else:
        myth_patterns = [
            "发论文真的越多越好吗？聊聊代表作的真实分量",
            "出专著到底有没有用？不同学科的含金量差距挺大",
            "盲目冲高分期刊，真不如踏实找个审稿规范的好同行",
        ]
    myth_title = myth_patterns[seed % len(myth_patterns)]

    candidates.append({
        "title": myth_title,
        "angle": "myth",
        "angle_name": "理念澄清与专业思考",
        "reason": "以辩证与同行探讨视角切入，探讨代表作制度与评价演进",
        "hot_score": 89,
        "pain_score": 92,
        "target_audience": "关注学术成果长远价值与评价导向的科研骨干",
        "platform_fit": "知乎专栏/公众号次条，引发专业探讨与长效传播",
    })

    # -------------------------------------------------------------
    # 5. 工具流与方法论沉淀 (tools / workflow) - 真实心得，经验分享
    # -------------------------------------------------------------
    if is_xhs:
        tools_patterns = [
            "日常写论文查文献，这几个习惯很管用",
            "文献读完就忘？试试这套笔记分类法",
            "文稿引文总出错，教你两个快速排查法",
        ]
    else:
        tools_patterns = [
            "日常写论文做文献管理，这几个习惯确实很管用",
            "文献读完总是记不住，试试这套简便的分类做笔记",
            "文稿引文格式总容易出错，分享两个高效排查办法",
        ]
    tools_title = tools_patterns[(seed + 1) % len(tools_patterns)]

    candidates.append({
        "title": tools_title,
        "angle": "tools",
        "angle_name": "工具流与方法论沉淀",
        "reason": "扎实的方法论与学术工具流分享，具备长效检索与自发分享属性",
        "hot_score": 88,
        "pain_score": 85,
        "target_audience": "日常需要检索文献、排版论文、管理知识库的学生与科研人员",
        "platform_fit": "小红书图文笔记/公众号小绿书多图轮播",
    })

    # -------------------------------------------------------------
    # 6. 前瞻视野与长期规划 (advance / horizon) - 从容规划，理顺节奏
    # -------------------------------------------------------------
    if is_xhs:
        advance_patterns = [
            "下半年发文章评职称，先把时间线理顺",
            "小论文到出专著，学术成果这样规划",
            "青年学者做科研，怎么把握自己的节奏",
        ]
    else:
        advance_patterns = [
            "下半年准备评职称或投稿，提前把时间线理顺最省力",
            "从阶段小论文到成书出版，学术成果这样规划更从容",
            "青年学者做科研，如何摆脱总被考核推着走的被动",
        ]
    advance_title = advance_patterns[(seed + 2) % len(advance_patterns)]

    candidates.append({
        "title": advance_title,
        "angle": "advance",
        "angle_name": "前瞻视野与长期规划",
        "reason": f"结合当前时令日历（{seasonal_info.get('focus', '')[:20]}），帮助学者从容规划",
        "hot_score": 87,
        "pain_score": 86,
        "target_audience": "中高级职称申报者、学术团队骨干、学科带头人",
        "platform_fit": "公众号深度长文/知乎专栏",
    })

    # 综合清洗、去重与多样性守护
    filtered = []
    used_prefixes = set()
    has_question_ending = False

    for c in candidates:
        raw_t = c["title"]
        cleaned_t = sanitize_human_tone(raw_t, is_xhs=is_xhs)

        # 1. 禁词过滤
        if any(fw in cleaned_t for fw in forbidden_words):
            continue

        # 2. 问号频率守护：同批次最多仅允许 1 个以问号结尾的标题，避免全篇反问的人机感
        if cleaned_t.endswith("？") or cleaned_t.endswith("?"):
            if has_question_ending:
                cleaned_t = re.sub(r"[？?]+$", "", cleaned_t).strip()
            else:
                has_question_ending = True

        # 3. 句首多样性守护：禁止同批次出现相同开头的标题
        pfx = cleaned_t[:4]
        if pfx in used_prefixes:
            continue
        used_prefixes.add(pfx)

        c["title"] = cleaned_t

        # 4. 新颖度与综合评分
        novelty = calculate_novelty(c["title"], history_titles)
        c["novelty_score"] = int(novelty * 100)
        c["composite_score"] = int(
            c["hot_score"] * 0.4 +
            c["pain_score"] * 0.3 +
            c["novelty_score"] * 0.3
        )
        filtered.append(c)

    # 按综合得分从高到低排序
    filtered.sort(key=lambda x: -x["composite_score"])
    return filtered


def main():
    ap = argparse.ArgumentParser(description="动态热点选题雷达与搜索聚合引擎")
    ap.add_argument("--keywords", default="[]", help="核心业务关键词 JSON 数组")
    ap.add_argument("--scripts-dir", default="", help="账号 scripts 目录，用于读取历史文章比对新颖度")
    ap.add_argument("--search-snippets", default="[]", help="外部搜索工具获取到的热点新闻摘要 JSON 数组")
    ap.add_argument("--angle", default="all", help="切角偏好: all / policy / trap / guide / myth / tools")
    ap.add_argument("--count", type=int, default=6, help="生成推荐选题数量")
    ap.add_argument("--platform", default="gzh", help="发布平台: gzh / zhihu / xiaohongshu")
    ap.add_argument("--brand-name", default="学术知识分享", help="品牌名称")
    ap.add_argument("--forbidden", default="[]", help="禁词 JSON 数组")
    args = ap.parse_args()

    try:
        keywords = json.loads(args.keywords) if args.keywords else []
        if not isinstance(keywords, list) or not keywords:
            keywords = ["期刊发表", "专著出版", "论文发表", "职称评审", "SCI", "专利申办"]
    except Exception:
        keywords = ["期刊发表", "专著出版", "论文发表", "职称评审", "SCI"]

    try:
        extra_snippets = json.loads(args.search_snippets) if args.search_snippets else []
    except Exception:
        extra_snippets = []

    try:
        forbidden_words = json.loads(args.forbidden) if args.forbidden else []
    except Exception:
        forbidden_words = []

    # 1. 行业时令日历
    curr_month = datetime.now().month
    seasonal_info = SEASONAL_CALENDAR.get(curr_month, {
        "focus": "常规科研成果推进与发表规划",
        "keywords": ["期刊发表", "专著出版"],
        "hot_angles": ["避坑指南", "实操流程"],
    })

    # 2. 搜索情报收集（实时搜索嗅探 + 外部 Agent 搜索结果）
    search_news, search_queries = gather_search_intelligence(keywords, extra_snippets)

    # 3. 历史文章对比
    history_titles = extract_history_titles(args.scripts_dir)

    # 4. 生成候选选题
    candidates = generate_candidate_topics(
        keywords=keywords,
        seasonal_info=seasonal_info,
        search_news=search_news,
        search_queries=search_queries,
        history_titles=history_titles,
        forbidden_words=forbidden_words,
        platform=args.platform,
    )

    # 切角筛选
    if args.angle and args.angle != "all":
        filtered = [c for c in candidates if c.get("angle") == args.angle]
        if filtered:
            candidates = filtered

    target_count = max(1, min(args.count, len(candidates)))
    recommended = candidates[:target_count]

    result_payload = {
        "ok": True,
        "data": {
            "platform": args.platform,
            "seasonal_focus": {
                "month": curr_month,
                "focus": seasonal_info.get("focus"),
                "seasonal_keywords": seasonal_info.get("keywords", []),
            },
            "trending_signals": {
                "search_news_count": len(search_news),
                "top_news": [n["title"] for n in search_news[:3]],
                "surging_queries": search_queries[:8],
            },
            "recommended_topics": recommended,
        },
    }

    emit(result_payload)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (0, None):
            emit({"ok": False, "error": str(e.code) if not isinstance(e.code, str) else e.code})
            raise
    except Exception as e:
        emit({"ok": False, "error": "%s: %s" % (type(e).__name__, e)})
        raise
