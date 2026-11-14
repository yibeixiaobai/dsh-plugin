# -*- coding: utf-8 -*-
"""草稿核验（draft/get 必须 POST）：逐篇核对标题/作者/摘要/图片数/CDN/品牌/禁词。

与 scripts/verify_draft.py 的差异：参数化（media_id、author、brand_name、min_words、
forbidden 由命令行传入），token 复用 publish_template.get_access_token（无落盘缓存）。
输出协议：{ok, data:{article_count, expected, articles:[{index, title, author, digest,
digest_len, plain_chars, img_count, all_cdn, problems}]}}
"""
import argparse
import json
import os
import re
import sys

MARKER = "###RESULT### "


def emit(payload):
    print(MARKER + json.dumps(payload, ensure_ascii=False))


def account_credentials(conf, account_id):
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--media-id", required=True)
    ap.add_argument("--account-id", default="")
    ap.add_argument("--scripts-dir", required=True)
    ap.add_argument("--resource-dir", required=True, help="插件内置运行资源目录")
    ap.add_argument("--expected-count", type=int, default=6)
    ap.add_argument("--author", default="文映学术win00.cn")
    ap.add_argument("--brand-name", default="文映千秋学术网")
    ap.add_argument("--expected-img-count", type=int, default=4)
    ap.add_argument("--min-words", type=int, default=2000)
    ap.add_argument("--forbidden", default="[]")
    args = ap.parse_args()

    scripts_abs = os.path.abspath(args.scripts_dir)
    conf = json.load(open(os.path.join(scripts_abs, "wx_config.json"), encoding="utf-8"))
    forbidden = json.loads(args.forbidden)

    resource_scripts = os.path.join(os.path.abspath(args.resource_dir), "scripts")
    if not os.path.exists(os.path.join(resource_scripts, "publish_template.py")):
        raise SystemExit("插件内置资源缺少 publish_template.py: " + resource_scripts)
    sys.path.insert(0, resource_scripts)
    from publish_template import get_access_token, verify_draft

    account_id, appid, app_secret = account_credentials(conf, args.account_id)
    token = get_access_token(appid, app_secret)
    draft = verify_draft(token, args.media_id)
    if "news_item" not in draft:
        raise SystemExit("draft/get 失败: " + json.dumps(draft, ensure_ascii=False)[:400])

    items = draft["news_item"]
    is_newspic_draft = bool(items and (items[0].get("image_info") or {}).get("image_list"))
    expected_count = 1 if is_newspic_draft else args.expected_count

    articles = []
    for idx, it in enumerate(items, 1):
        title, author, digest = it.get("title", ""), it.get("author", ""), it.get("digest", "")
        content = it.get("content", "")
        imgs = re.findall(r'(?:data-src|src)="(http[^"]+)"', content)
        n_img = len(re.findall(r"<img", content))
        all_cdn = bool(imgs) and all("mmbiz.qpic.cn" in u for u in imgs)
        image_info = it.get("image_info") or {}
        image_list = image_info.get("image_list") or []
        if image_list:
            n_img = len(image_list)
            all_cdn = True
        txt = re.sub(r"<[^>]+>", "", content)
        plain = re.sub(r"\s", "", txt)
        problems = []
        # 小绿书「图片消息」草稿的 draft/get 不回显 author（恒为空），
        # 对 newspic 跳过作者比对，避免误判「作者不符: 」。
        if not is_newspic_draft and author != args.author:
            problems.append("作者不符: " + author)
        max_title = 32 if is_newspic_draft else 64
        if len(title) > max_title:
            problems.append("标题超长 %d 字（上限 %d）" % (len(title), max_title))
        if not is_newspic_draft and len(digest) > 120:
            problems.append("摘要超长 %d 字" % len(digest))
        if is_newspic_draft:
            if n_img < 1:
                problems.append("小绿书卡片图数量为 0")
        else:
            if n_img != args.expected_img_count or not all_cdn:
                problems.append("图片数 %d / 全CDN %s" % (n_img, all_cdn))
        req_min_words = min(args.min_words, 100) if is_newspic_draft else args.min_words
        effective_min = int(req_min_words * 0.85)
        if len(plain) < effective_min:
            problems.append("纯文字 %d 字 < 容差下限 %d（设定 %d）" % (len(plain), effective_min, req_min_words))
        if args.brand_name not in txt and args.brand_name not in title:
            if not is_newspic_draft:
                problems.append("缺少品牌引导语")
        for w in forbidden:
            if w in txt or w in title or w in digest:
                problems.append("含禁词: " + w)
        articles.append({
            "index": idx, "title": title, "author": author,
            "digest": digest, "digest_len": len(digest),
            "plain_chars": len(plain), "img_count": n_img,
            "all_cdn": all_cdn, "problems": problems,
        })
        print("第%d篇「%s」%s" % (idx, title[:24], "通过" if not problems else "存在问题"))

    ok = len(articles) == expected_count and all(not a["problems"] for a in articles)
    if len(articles) != expected_count:
        articles.append({"index": len(articles) + 1, "problems": ["篇数 %d != 预期 %d" % (len(articles), expected_count)]})
    emit({"ok": ok, "data": {"account_id": account_id, "article_count": len(items), "expected": expected_count, "articles": articles}})


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (0, None):
            emit({"ok": False, "error": e.code if isinstance(e.code, str) else "exit " + str(e.code)})
        raise
    except Exception as e:
        emit({"ok": False, "error": type(e).__name__ + ": " + str(e)})
        raise
