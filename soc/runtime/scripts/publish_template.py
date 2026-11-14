#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文映千秋学术网 - 公众号六篇组合发布脚本模板
====================================================
使用方法（AI Agent / 人工均适用）：
1. 准备好 6 篇文章 HTML：article_1.html ~ article_6.html（纯单行、内联样式），
   品牌图占位符 __BRAND_TOP__ / __BRAND_BOT__，正文配图占位符 IMG_A1_1、IMG_A1_2 ... IMG_A6_2
   （生成方式参考 gen_articles_最新样例.py）
2. 准备图片文件：
   - 封面：cover_1.jpg(21:9 头条) cover_2.jpg~cover_6.jpg(1:1)
   - 正文图：content_1_1.jpg、content_1_2.jpg ... content_6_2.jpg
   - 品牌图：../brand_assets/brand_top.jpg、../brand_assets/brand_bot.jpg
3. 修改下方 CONFIG 区的 TITLES / DIGESTS
4. 运行：python publish_template.py
   脚本自带 ast 语法自检、发布前机器校验（禁词/字数/占位符/图片数）、上传缓存断点续跑。
"""
import ast
import json
import os
import re
import time

import requests

# ========== 脚本自检：语法通过才继续（防中断预案第1条） ==========
with open(__file__, "r", encoding="utf-8") as _f:
    ast.parse(_f.read())

# ==================== CONFIG 区（每次运行前修改） ====================
OUT = os.path.dirname(os.path.abspath(__file__))
BRAND_DIR = os.path.normpath(os.path.join(OUT, "..", "brand_assets"))
CONFIG_JSON = os.path.join(OUT, "wx_config.json")

AUTHOR = "文映学术win00.cn"          # 固定作者名，必须使用
BRAND_NAME = "文映千秋学术网"          # 结尾引导语必须包含
ARTICLE_COUNT = 6
UPLOAD_CACHE = os.path.join(OUT, "uploaded_urls.json")  # 上传缓存，断点续跑

TITLES = [
    "中科院分区表停更第一年：22年评价体系谢幕，2026选刊新规一文读懂",
    "学术期刊划定AI使用边界：百余家期刊要求提交AI使用声明",
    "高校专利转化攻坚令：成效直接挂钩职称评聘，121.5万件专利待破局",
    "2026年度职称评审启动：多省通知密集落地，代表作制度深化",
    "国家级学术出版资助攻略：最高覆盖25万元，还送独立书号",
    "国产英文期刊加速崛起：213种中国期刊进入SCI收录阵容",
]
DIGESTS = [
    "中科院文献情报中心声明自2026年起不再更新期刊分区表，多所高校采用向前就近原则以2025年版认定。选刊参照系如何重构、申报人如何应对，本文逐条拆解。",
    "2026年百余家学术期刊发布AI使用规范，核心内容须由作者独立完成，严禁AI洗稿。投稿前如何撰写AI使用声明、规避署名红线，本文给出实操模板。",
    "教育部2026年4月启动高校专利转化运用攻坚行动，转化成效与职称评聘直接挂钩。高校121.5万件发明专利如何破局三不难题，本文详解转化路径。",
    "2026年度多省市职称评审通知密集发布，代表作制度深化，论文从门槛变为选项之一。申报材料三大翻车点与时间管理实操建议，申报人必读。",
    "自费出版书号加编校动辄两三万，但多项国家级资助最高覆盖25万元。2026年国家社科后期资助、博后基金专著、科技部著作基金三项对比与申报攻略。",
    "中国主办SCI期刊达213种，部分国产英文期刊审稿快、对中国研究友好。如何辨别正规国产刊、避开预警名单，本文给出筛选标准与投稿窗口分析。",
]

# 品牌图占位符 → 本地文件
BRAND_PLACEHOLDER_FILES = {
    "__BRAND_TOP__": os.path.join(BRAND_DIR, "brand_top.jpg"),
    "__BRAND_BOT__": os.path.join(BRAND_DIR, "brand_bot.jpg"),
}

# 正文配图占位符 → 本地文件（IMG_A{篇}_{序}）
CONTENT_IMAGE_FILES = {}
for _i in range(1, ARTICLE_COUNT + 1):
    for _j in (1, 2):
        _p = os.path.join(OUT, "content_%d_%d.jpg" % (_i, _j))
        if not os.path.exists(_p):
            _p = os.path.join(OUT, "content_%d_%d.png" % (_i, _j))  # 兼容png
        CONTENT_IMAGE_FILES["IMG_A%d_%d" % (_i, _j)] = _p

COVER_PATHS = []
for _i in range(1, ARTICLE_COUNT + 1):
    _p = os.path.join(OUT, "cover_%d.jpg" % _i)
    if not os.path.exists(_p):
        _p = os.path.join(OUT, "cover_%d.png" % _i)
    COVER_PATHS.append(_p)

# 禁词表（出现即失败）
FORBIDDEN_WORDS = ["查重", "降重", "检测", "论文检测中心", "AIGC查降重",
                   "撤稿", "学术不端", "倒查", "论文工厂", "学术打假"]

# ==================== 微信 API ====================

def load_credentials():
    with open(CONFIG_JSON, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    return cfg["appid"], cfg["app_secret"]


def get_access_token(appid, secret):
    url = ("https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential"
           "&appid=%s&secret=%s" % (appid, secret))
    data = requests.get(url, timeout=10).json()
    if "access_token" not in data:
        raise Exception("获取token失败: " + str(data))
    return data["access_token"]


def upload_cover(token, image_path):
    """封面图：material/add_material，返回 media_id"""
    url = "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=%s&type=image" % token
    ext = os.path.splitext(image_path)[1].lower()
    mime = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"
    with open(image_path, "rb") as f:
        files = {"media": (os.path.basename(image_path), f, mime)}
        data = requests.post(url, files=files, timeout=30).json()
    if "media_id" not in data:
        raise Exception("上传封面失败(%s): %s" % (os.path.basename(image_path), str(data)))
    return data["media_id"]


def upload_content_image(token, image_path):
    """正文图：media/uploadimg，返回 CDN URL"""
    url = "https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=%s" % token
    ext = os.path.splitext(image_path)[1].lower()
    mime = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"
    with open(image_path, "rb") as f:
        files = {"media": (os.path.basename(image_path), f, mime)}
        data = requests.post(url, files=files, timeout=30).json()
    if "url" not in data:
        raise Exception("上传正文图失败(%s): %s" % (os.path.basename(image_path), str(data)))
    return data["url"]


def create_draft(token, articles):
    url = "https://api.weixin.qq.com/cgi-bin/draft/add?access_token=%s" % token
    payload = {"articles": articles}
    headers = {"Content-Type": "application/json; charset=utf-8"}
    resp = requests.post(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                         headers=headers, timeout=30)
    data = resp.json()
    if "media_id" not in data:
        raise Exception("创建草稿失败: " + str(data))
    return data["media_id"]


def verify_draft(token, media_id):
    """draft/get 必须用 POST（GET 报 43002）；返回的 img 是 data-src 属性"""
    url = "https://api.weixin.qq.com/cgi-bin/draft/get?access_token=%s" % token
    resp = requests.post(url, data=json.dumps({"media_id": media_id}).encode("utf-8"),
                         headers={"Content-Type": "application/json; charset=utf-8"}, timeout=30)
    # 微信 draft/get 返回的 Content-Type 是 text/plain 且不带 charset，
    # requests 会按 RFC 默认的 ISO-8859-1 解码，导致标题/摘要/正文中文全部变成乱码，
    # 进而让核验误报「标题超长/摘要超长/缺少品牌引导语」。此处强制按 UTF-8 解码。
    resp.encoding = "utf-8"
    return resp.json()

# ==================== 发布前机器校验 ====================

def validate_html(html, idx):
    assert "IMG_A" not in html and "__BRAND" not in html, "文章%d仍有占位符残留" % idx
    assert "\n" not in html and "\r" not in html, "文章%d存在换行符" % idx
    assert "\\u" not in html, "文章%d存在unicode转义残留" % idx
    plain = re.sub(r"\s", "", re.sub(r"<[^>]+>", "", html))
    assert len(plain) >= 2000, "文章%d纯文字不足2000字: %d" % (idx, len(plain))
    assert BRAND_NAME in plain, "文章%d缺少品牌引导语" % idx
    for w in FORBIDDEN_WORDS:
        assert w not in plain, "文章%d含禁词: %s" % (idx, w)
    img_srcs = re.findall(r'(?:data-src|src)="([^"]+)"', html)
    assert all("mmbiz.qpic.cn" in s for s in img_srcs), "文章%d存在非CDN图片" % idx
    return len(img_srcs)

# ==================== 上传缓存（断点续跑） ====================

def load_cache():
    if os.path.exists(UPLOAD_CACHE):
        with open(UPLOAD_CACHE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    with open(UPLOAD_CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

# ==================== 主流程 ====================

def main():
    print("=" * 50)
    print("文映千秋学术网 - 六篇组合发布")
    print("=" * 50)
    appid, secret = load_credentials()

    print("\n[1/6] 获取 access_token...")
    token = get_access_token(appid, secret)
    print("OK - token: %s..." % token[:20])

    cache = load_cache()

    # [2/6] 上传品牌图与正文配图（带缓存）
    print("\n[2/6] 上传品牌图与正文配图...")
    placeholder_map = dict(BRAND_PLACEHOLDER_FILES)
    for key, path in sorted(placeholder_map.items()):
        if key in cache:
            print("  %s (缓存) -> %s" % (key, cache[key][:60]))
            continue
        cache[key] = upload_content_image(token, path)
        print("  %s -> %s" % (key, cache[key][:60]))
        time.sleep(0.3)
    for key, path in sorted(CONTENT_IMAGE_FILES.items()):
        if not os.path.exists(path):
            raise Exception("缺少正文配图: " + path)
        if key in cache:
            print("  %s (缓存)" % key)
            continue
        cache[key] = upload_content_image(token, path)
        print("  %s -> %s" % (key, cache[key][:60]))
        time.sleep(0.3)
    save_cache(cache)

    # [3/6] 读取文章HTML并替换占位符
    print("\n[3/6] 处理文章HTML...")
    articles_html = []
    for i in range(1, ARTICLE_COUNT + 1):
        fp = os.path.join(OUT, "article_v2_%d.html" % i)
        with open(fp, "r", encoding="utf-8") as f:
            html = f.read()
        for key, url in cache.items():
            if key.startswith("IMG_A") or key.startswith("__BRAND"):
                html = html.replace(key, url)
        articles_html.append(html)
        print("  article_%d.html 处理完成" % i)

    # [4/6] 发布前机器校验
    print("\n[4/6] 发布前校验...")
    for i, html in enumerate(articles_html, 1):
        n = validate_html(html, i)
        print("  文章%d 通过（%d张图，纯文字%d字）" % (i, n, len(re.sub(r"\s", "", re.sub(r"<[^>]+>", "", html)))))

    # [5/6] 上传封面图
    print("\n[5/6] 上传封面图...")
    cover_media_ids = []
    for i, path in enumerate(COVER_PATHS, 1):
        cache_key = "COVER_%d" % i
        if cache_key in cache:
            cover_media_ids.append(cache[cache_key])
            print("  封面%d (缓存) media_id: %s" % (i, cache[cache_key]))
            continue
        mid = upload_cover(token, path)
        cover_media_ids.append(mid)
        cache[cache_key] = mid
        print("  封面%d OK - media_id: %s" % (i, mid))
        time.sleep(0.5)
    save_cache(cache)

    # [6/6] 创建多图文草稿并核验
    print("\n[6/6] 创建多图文草稿...")
    articles = []
    for i in range(ARTICLE_COUNT):
        articles.append({
            "title": TITLES[i],
            "content": articles_html[i],
            "thumb_media_id": cover_media_ids[i],
            "author": AUTHOR,
            "digest": DIGESTS[i],
            "need_open_comment": 1,
            "only_fans_can_comment": 0,
        })
    media_id = create_draft(token, articles)
    print("草稿创建成功 media_id: %s" % media_id)

    draft = verify_draft(token, media_id)
    n_items = len(draft.get("news_item", []))
    print("draft/get 核验：共 %d 篇" % n_items)
    assert n_items == ARTICLE_COUNT, "草稿篇数不符"

    result = {
        "status": "success",
        "draft_media_id": media_id,
        "article_count": ARTICLE_COUNT,
        "author": AUTHOR,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "articles": TITLES,
    }
    with open(os.path.join(OUT, "publish_result.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("\n发布成功！结果已保存 publish_result.json（草稿箱内待人工确认后群发）")


if __name__ == "__main__":
    main()
