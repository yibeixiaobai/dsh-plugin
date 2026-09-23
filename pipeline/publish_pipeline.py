# -*- coding: utf-8 -*-
"""参数化发布流水线：上传素材（缓存断点续跑）→ 替换占位符 → 机器校验 → draft/add → 核验。

纯计算 + 网络，不写任何文件：上传缓存（job.cache 传入、结果 cache 返回）、
publish_result.json、draft_media_id.txt 均由 TS 侧落盘。
凭据读 scripts/wx_config.json（appid/app_secret），与 publish_template.py 的 API 函数复用。

job（TS 侧生成的 JSON 文件，scripts 目录内）:
{
  "titles": [...], "digests": [...],
  "article_files": [...], "cover_files": [...],          // 绝对路径
  "content_files": {"IMG_A1_1": "...", "IMG_A1_2": "...", ...},
  "content_img_count": 2,                                // 每篇正文配图数（0-4）
  "brand_top": "...", "brand_bot": "...",                // brand_assets 内绝对路径
  "brand_top_enabled": true, "brand_bot_enabled": true,  // 是否要求/上传头尾品牌图
  "cache": {"<sha256前12位>:__BRAND_TOP__": "https://...", "<hash>:COVER_1": "media_id", ...},
  "use_cache": true, "dry_run": false,
  "need_open_comment": 1, "only_fans_can_comment": 0,
  "author": "...", "brand_name": "...", "min_words": 2000,
  "forbidden": [...]
}
输出协议：{ok, data:{dry_run, media_id?, verify?, cache, checks?}}
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
import re
import sys
import time

MARKER = "###RESULT### "


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False))


def file_hash(path):
    """文件内容 sha256 前 12 位：上传缓存键的一部分，文件一变缓存自然失效。"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def account_credentials(conf, account_id):
    """Resolve credentials from the multi-account config, with legacy fallback for default."""
    selected = account_id or conf.get("default_account") or "default"
    accounts = conf.get("accounts") or []
    if isinstance(accounts, dict):
        entry = accounts.get(selected)
    else:
        entry = next((item for item in accounts if str(item.get("id", "")) == selected), None)
    if entry:
        appid = str(entry.get("appid", "")).strip()
        secret = str(entry.get("app_secret", "")).strip()
        if appid and secret:
            return selected, appid, secret
        raise SystemExit("账号 %s 的 AppID 或 AppSecret 未配置" % selected)
    if selected == (conf.get("default_account") or "default"):
        appid = str(conf.get("appid", "")).strip()
        secret = str(conf.get("app_secret", "")).strip()
        if appid and secret:
            return selected, appid, secret
    raise SystemExit("公众号账号不存在: " + selected)


def under(base, p):
    """规范化 p 并强制其位于 base 之内；越界（上级目录引用、目录外绝对路径）一律拒绝。"""
    bp = os.path.abspath(base)
    if not os.path.isabs(p):
        cp = os.path.abspath(os.path.join(bp, p))
    else:
        cp = os.path.abspath(p)
    if cp != bp and not cp.startswith(bp + os.sep):
        raise SystemExit("路径越界: " + str(p))
    return cp


def precheck(html, idx, min_words, forbidden, brand_name, expected_img,
             brand_top_enabled, brand_bot_enabled, content_img_count):
    """发布前校验（占位符阶段）：换行/转义/字数/禁词/品牌/图片数/占位符齐全。"""
    problems = []
    if "\n" in html or "\r" in html:
        problems.append("文章%d 存在换行符" % idx)
    if "\\u" in html:
        problems.append("文章%d 存在 unicode 转义残留" % idx)
    txt = re.sub(r"<[^>]+>", "", html)
    plain = re.sub(r"\s", "", txt)
    effective_min = int(min_words * 0.85)
    if len(plain) < effective_min:
        problems.append("文章%d 纯文字 %d 字，低于容差下限 %d（设定下限 %d）" % (idx, len(plain), effective_min, min_words))
    for w in forbidden:
        if w in plain:
            problems.append("文章%d 含禁词: %s" % (idx, w))
    if brand_name not in plain:
        problems.append("文章%d 缺少品牌引导语: %s" % (idx, brand_name))
    if html.count("<img") != expected_img:
        problems.append("文章%d img 数量 %d != %d" % (idx, html.count("<img"), expected_img))
    required_brand_placeholders = []
    if brand_top_enabled:
        required_brand_placeholders.append("__BRAND_TOP__")
    if brand_bot_enabled:
        required_brand_placeholders.append("__BRAND_BOT__")
    for ph in required_brand_placeholders:
        if ph not in html:
            problems.append("文章%d 缺少占位符 %s" % (idx, ph))
    # 正文图占位符兼容两代格式：IMG_A{idx}_{j} 与 __IMG_{idx}_{j}__
    for j in range(1, content_img_count + 1):
        if ("IMG_A" + str(idx) + "_" + str(j)) not in html and ("__IMG_" + str(idx) + "_" + str(j) + "__") not in html:
            problems.append("文章%d 缺少正文图占位符（第 %d 张）" % (idx, j))
    return problems, len(plain)


def postcheck(html, idx, min_words, forbidden, brand_name, expected_img,
              brand_top_enabled, brand_bot_enabled):
    """占位符替换后的最终校验：全部 src 必须是 mmbiz CDN。"""
    problems = []
    if "IMG_A" in html or "__IMG_" in html:
        problems.append("文章%d 仍有占位符残留" % idx)
    if brand_top_enabled and "__BRAND_TOP__" in html:
        problems.append("文章%d 仍有头部品牌图占位符" % idx)
    if brand_bot_enabled and "__BRAND_BOT__" in html:
        problems.append("文章%d 仍有尾部品牌图占位符" % idx)
    if html.count("<img") != expected_img:
        problems.append("文章%d img 数量 %d != %d" % (idx, html.count("<img"), expected_img))
    srcs = re.findall(r'(?:data-src|src)="([^"]+)"', html)
    bad = [s for s in srcs if "mmbiz.qpic.cn" not in s]
    if bad:
        problems.append("文章%d 存在非 CDN 图片: %s" % (idx, bad[:2]))
    txt = re.sub(r"<[^>]+>", "", html)
    plain = re.sub(r"\s", "", txt)
    effective_min = int(min_words * 0.85)
    if len(plain) < effective_min:
        problems.append("文章%d 纯文字 %d 字，低于容差下限 %d（设定下限 %d）" % (idx, len(plain), effective_min, min_words))
    for w in forbidden:
        if w in plain:
            problems.append("文章%d 含禁词: %s" % (idx, w))
    if brand_name not in plain:
        problems.append("文章%d 缺少品牌引导语: %s" % (idx, brand_name))
    return problems, len(srcs), len(plain)


def publish_newspic(job, args, scripts_abs, cache):
    titles = job["titles"]
    n = len(titles)
    article_paths = [under(scripts_abs, p) for p in job["article_files"]]
    if len(article_paths) != n:
        raise SystemExit("article_files 数量必须与 titles 一致")

    articles_data = []
    all_checks = []
    min_words = int(job.get("min_words", 80))
    limit = 80 if min_words > 500 else max(10, int(min_words * 0.80))
    forbidden = job.get("forbidden", [])
    brand_name = job.get("brand_name", "")
    require_brand = bool(job.get("ending_guide_required", False))

    for i, p in enumerate(article_paths, 1):
        if not os.path.exists(p):
            raise SystemExit("文章文件不存在: " + p)
        try:
            doc = json.load(open(p, encoding="utf-8"))
        except Exception as e:
            raise SystemExit("读取小绿书文件失败: %s (%s)" % (p, e))

        t = doc.get("title") or titles[i - 1]
        if len(t) > 32:
            all_checks.append("小绿书%d 标题超 32 字: %s" % (i, t))
        c = doc.get("content", "")
        plain = re.sub(r"\s", "", c)
        if len(plain) < limit:
            all_checks.append("小绿书%d 纯文字 %d 字低于下限 %d" % (i, len(plain), limit))
        for w in forbidden:
            if w in plain or w in t:
                all_checks.append("小绿书%d 含禁词: %s" % (i, w))
        if require_brand and brand_name and brand_name not in plain:
            all_checks.append("小绿书%d 缺少品牌引导语: %s" % (i, brand_name))

        cards = doc.get("cards", [])
        if not cards or len(cards) > 20:
            all_checks.append("小绿书%d 卡片张数不符（须 1~20 张，当前 %d 张）" % (i, len(cards)))

        articles_data.append({"title": t, "content": c, "cards": cards})

    if all_checks:
        emit({"ok": False, "error": "发布前校验未通过", "data": {"checks": all_checks, "cache": cache}})
        sys.exit(1)

    if job.get("dry_run"):
        emit({"ok": True, "data": {"dry_run": True, "checks": ["全部 %d 篇小绿书通过发布前校验（演练模式：不创建独立草稿）" % n], "media_ids": [], "cache": cache}})
        return

    resource_scripts = os.path.join(os.path.abspath(args.resource_dir), "scripts")
    sys.path.insert(0, resource_scripts)
    from publish_template import create_draft, get_access_token, upload_cover, upload_content_image, verify_draft

    conf = json.load(open(os.path.join(scripts_abs, "wx_config.json"), encoding="utf-8"))
    account_id, appid, app_secret = account_credentials(conf, job.get("account_id"))
    token = get_access_token(appid, app_secret)

    # 上传每张卡片图片（微信小绿书图片消息须使用永久素材 media_id）
    articles_payload = []
    for i, data in enumerate(articles_data, 1):
        pic_media_ids = []
        for j in range(1, len(data["cards"]) + 1):
            pic_path = None
            for ext in (".png", ".jpg", ".jpeg"):
                cand = os.path.join(scripts_abs, "pic_%d_%d%s" % (i, j, ext))
                if os.path.exists(cand):
                    pic_path = cand
                    break
            if not pic_path:
                raise SystemExit("缺少小绿书卡片图: pic_%d_%d" % (i, j))
            cache_key = file_hash(pic_path) + ":PIC_MEDIA_" + str(i) + "_" + str(j)
            cached_media = cache.get(cache_key)
            if job.get("use_cache") and cached_media and not str(cached_media).startswith("http"):
                media_id = cached_media
                print("pic_%d_%d (缓存 media_id)" % (i, j))
            else:
                media_id = upload_cover(token, pic_path)
                cache[cache_key] = media_id
                print("pic_%d_%d -> media_id: %s" % (i, j, media_id[:20]))
                time.sleep(0.3)
            pic_media_ids.append(media_id)

        articles_payload.append({
            "article_type": "newspic",
            "title": data["title"][:32],
            "content": data["content"],
            "author": job.get("author", "文映学术win00.cn"),
            "image_info": {
                "image_list": [{"image_media_id": mid} for mid in pic_media_ids]
            },
            "need_open_comment": int(job.get("need_open_comment", 1)),
            "only_fans_can_comment": int(job.get("only_fans_can_comment", 0)),
        })

    # 微信小绿书图片消息不支持组合发布，每篇单独发布为一个独立草稿
    published_media_ids = []
    verifies = []
    for i, single_payload in enumerate(articles_payload, 1):
        mid = create_draft(token, [single_payload])
        print("小绿书第 %d/%d 篇草稿创建成功 media_id: %s" % (i, len(articles_payload), mid))
        published_media_ids.append(mid)
        time.sleep(0.5)

    if job.get("verify", True):
        for i, mid in enumerate(published_media_ids, 1):
            draft = verify_draft(token, mid)
            items = draft.get("news_item", [])
            if len(items) != 1:
                emit({"ok": False, "error": "小绿书第 %d 篇草稿篇数异常：草稿 %d / 预期 1" % (i, len(items)),
                      "data": {"media_id": mid, "media_ids": published_media_ids, "cache": cache}})
                sys.exit(1)
            verifies.append({"media_id": mid, "article_count": len(items)})

    primary_media_id = published_media_ids[0] if published_media_ids else ""
    emit({
        "ok": True,
        "data": {
            "account_id": account_id,
            "dry_run": False,
            "media_id": primary_media_id,
            "media_ids": published_media_ids,
            "article_count": len(published_media_ids),
            "titles": [d["title"] for d in articles_data],
            "cache": cache,
            "verify": {"checked": bool(job.get("verify", True)), "results": verifies, "article_count": len(published_media_ids)},
        },
    })


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", default="", help="job JSON 文件名（scripts 目录内）")
    ap.add_argument("--job-json", default="", help="job JSON 内联字符串（与 --job 二选一）")
    ap.add_argument("--scripts-dir", required=True)
    ap.add_argument("--brand-dir", required=True)
    ap.add_argument("--resource-dir", required=True, help="插件内置运行资源目录")
    args = ap.parse_args()

    scripts_abs = os.path.abspath(args.scripts_dir)
    if args.job_json:
        job = json.loads(args.job_json)
    else:
        if not args.job:
            raise SystemExit("必须提供 --job 或 --job-json")
        job_path = os.path.normpath(os.path.join(scripts_abs, args.job))
        if not job_path.startswith(scripts_abs + os.sep):
            raise SystemExit("job 路径越界: " + job_path)
        job = json.load(open(job_path, encoding="utf-8"))

    cache = dict(job.get("cache", {}))
    is_newspic = job.get("article_type") == "newspic" or any(str(p).endswith("_pic.json") or str(p).endswith(".json") for p in job.get("article_files", []))
    if is_newspic:
        publish_newspic(job, args, scripts_abs, cache)
        return

    titles = job["titles"]
    digests = job["digests"]
    n = len(titles)
    if n == 0 or len(digests) != n:
        raise SystemExit("titles 与 digests 必须为等长非空数组")
    if n > 99:
        raise SystemExit("篇数过多")
    forbidden = job.get("forbidden", [])
    brand_name = job.get("brand_name", "文映千秋学术网")
    min_words = int(job.get("min_words", 2000))
    brand_top_enabled = bool(job.get("brand_top_enabled", True))
    brand_bot_enabled = bool(job.get("brand_bot_enabled", True))
    content_img_count = max(0, min(4, int(job.get("content_img_count", 2))))
    expected_img = content_img_count + (1 if brand_top_enabled else 0) + (1 if brand_bot_enabled else 0)

    # 路径边界校验：文章/封面/正文图必须位于 scripts 目录，品牌图必须位于 brand_assets
    article_paths = [under(scripts_abs, p) for p in job["article_files"]]
    cover_paths = [under(scripts_abs, p) for p in job["cover_files"]]
    content_paths = {}
    for k, p in job.get("content_files", {}).items():
        cp = under(scripts_abs, p)
        content_paths[k] = cp
        # 键名兼容两代占位符：IMG_A{i}_{j} ↔ __IMG_{i}_{j}__
        m = re.fullmatch(r"IMG_A(\d+)_(\d+)", k)
        if m:
            content_paths["__IMG_" + m.group(1) + "_" + m.group(2) + "__"] = cp
        m2 = re.fullmatch(r"__IMG_(\d+)_(\d+)__", k)
        if m2:
            content_paths["IMG_A" + m2.group(1) + "_" + m2.group(2)] = cp
    brand_top = under(os.path.abspath(args.brand_dir), job["brand_top"]) if job.get("brand_top") else ""
    brand_bot = under(os.path.abspath(args.brand_dir), job["brand_bot"]) if job.get("brand_bot") else ""

    if len(article_paths) != n or len(cover_paths) != n:
        raise SystemExit("article_files/cover_files 数量必须与 titles 一致")

    htmls = []
    for i, p in enumerate(article_paths, 1):
        if not os.path.exists(p):
            raise SystemExit("文章文件不存在: " + p)
        htmls.append(open(p, encoding="utf-8").read())

    # [1] 发布前校验（占位符阶段）
    all_checks = []
    for i, html in enumerate(htmls, 1):
        problems, chars = precheck(
            html, i, min_words, forbidden, brand_name, expected_img,
            brand_top_enabled, brand_bot_enabled, content_img_count)
        all_checks.extend(problems)
        if not problems:
            print("文章%d 校验通过（纯文字 %d 字）" % (i, chars))
    if all_checks:
        emit({"ok": False, "error": "发布前校验未通过", "data": {"checks": all_checks, "cache": cache}})
        sys.exit(1)

    if job.get("dry_run"):
        emit({"ok": True, "data": {"dry_run": True, "checks": ["全部 %d 篇通过发布前校验" % n], "cache": cache}})
        return

    # [2] 上传素材（缓存断点续跑；键 = "内容hash:占位符"，文件一变即重新上传，跨账号/陈旧缓存不会误命中）
    resource_scripts = os.path.join(os.path.abspath(args.resource_dir), "scripts")
    if not os.path.exists(os.path.join(resource_scripts, "publish_template.py")):
        raise SystemExit("插件内置资源缺少 publish_template.py: " + resource_scripts)
    sys.path.insert(0, resource_scripts)
    from publish_template import (create_draft, get_access_token, upload_content_image,
                                  upload_cover, verify_draft)

    conf = json.load(open(os.path.join(scripts_abs, "wx_config.json"), encoding="utf-8"))
    account_id, appid, app_secret = account_credentials(conf, job.get("account_id"))
    token = get_access_token(appid, app_secret)

    uploads = {}
    if brand_top_enabled:
        uploads["__BRAND_TOP__"] = brand_top
    if brand_bot_enabled:
        uploads["__BRAND_BOT__"] = brand_bot
    uploads.update(content_paths)
    resolved = {}  # 本次运行的占位符 → 刚上传/命中的 URL
    path_urls = {}  # 同一文件多占位符拼写只上传一次

    # 1. 优先从缓存读取
    to_upload = {}
    for key in sorted(uploads):
        p = uploads[key]
        if not os.path.exists(p):
            raise SystemExit("缺少素材: " + p)
        if p in path_urls:
            resolved[key] = path_urls[p]
            continue
        cache_key = file_hash(p) + ":" + key
        if job.get("use_cache") and cache_key in cache:
            resolved[key] = cache[cache_key]
            path_urls[p] = resolved[key]
            print(key + " （缓存）")
        else:
            if p not in to_upload:
                to_upload[p] = []
            to_upload[p].append((key, cache_key))

    # 2. 多线程并发上传未命中的正文素材
    if to_upload:
        def do_upload(item):
            f_path, keys_info = item
            url = upload_content_image(token, f_path)
            return f_path, url, keys_info

        with ThreadPoolExecutor(max_workers=min(4, len(to_upload))) as executor:
            futures = [executor.submit(do_upload, it) for it in to_upload.items()]
            for f in as_completed(futures):
                f_path, url, keys_info = f.result()
                path_urls[f_path] = url
                for k, c_k in keys_info:
                    resolved[k] = url
                    cache[c_k] = url
                    print(k + " -> " + url[:60])

    # [3] 替换占位符 + 最终校验
    final_htmls = []
    for i, html in enumerate(htmls, 1):
        for key, url in resolved.items():
            if key.startswith("IMG_A") or key.startswith("__IMG_") or key.startswith("__BRAND"):
                html = html.replace(key, url)
        problems, n_img, chars = postcheck(
            html, i, min_words, forbidden, brand_name, expected_img,
            brand_top_enabled, brand_bot_enabled)
        if problems:
            emit({"ok": False, "error": "最终校验未通过", "data": {"checks": problems, "cache": cache}})
            sys.exit(1)
        final_htmls.append(html)
        print("文章%d 最终校验通过（%d 张图，纯文字 %d 字）" % (i, n_img, chars))

    # [4] 上传封面（material/add_material → media_id；并发加速）
    cover_ids = [None] * n
    covers_to_upload = []
    for i, p in enumerate(cover_paths, 1):
        key = "COVER_" + str(i)
        if not os.path.exists(p):
            raise SystemExit("缺少封面: " + p)
        cache_key = file_hash(p) + ":" + key
        if job.get("use_cache") and cache_key in cache:
            cover_ids[i - 1] = cache[cache_key]
            print(key + " （缓存）")
        else:
            covers_to_upload.append((i - 1, key, cache_key, p))

    if covers_to_upload:
        def do_upload_cover(item):
            idx, k, c_k, p = item
            mid = upload_cover(token, p)
            return idx, k, c_k, mid

        with ThreadPoolExecutor(max_workers=min(4, len(covers_to_upload))) as executor:
            futures = [executor.submit(do_upload_cover, it) for it in covers_to_upload]
            for f in as_completed(futures):
                idx, k, c_k, mid = f.result()
                cover_ids[idx] = mid
                cache[c_k] = mid
                print(k + " -> " + mid[:40])

    # [5] draft/add 组合多图文草稿
    articles = []
    for i in range(n):
        articles.append({
            "title": titles[i],
            "content": final_htmls[i],
            "thumb_media_id": cover_ids[i],
            "author": job.get("author", "文映学术win00.cn"),
            "digest": digests[i],
            "need_open_comment": int(job.get("need_open_comment", 1)),
            "only_fans_can_comment": int(job.get("only_fans_can_comment", 0)),
        })
    media_id = create_draft(token, articles)
    print("草稿创建成功 media_id: " + media_id)

    # [6] draft/get 核验（必须 POST）
    verify = {"checked": False}
    if job.get("verify", True):
        draft = verify_draft(token, media_id)
        items = draft.get("news_item", [])
        verify = {"checked": True, "article_count": len(items)}
        if len(items) != n:
            emit({"ok": False, "error": "草稿篇数不符：草稿 %d / 预期 %d" % (len(items), n),
                  "data": {"media_id": media_id, "cache": cache, "verify": verify}})
            sys.exit(1)

    emit({"ok": True, "data": {"account_id": account_id, "dry_run": False, "media_id": media_id, "article_count": n,
                               "titles": titles, "cache": cache, "verify": verify}})


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        emit({"ok": False, "error": "断言失败：" + str(e)})
        sys.exit(1)
    except SystemExit as e:
        if e.code not in (0, None):
            emit({"ok": False, "error": e.code if isinstance(e.code, str) else "exit " + str(e.code)})
        raise
    except Exception as e:
        emit({"ok": False, "error": type(e).__name__ + ": " + str(e)})
        raise
