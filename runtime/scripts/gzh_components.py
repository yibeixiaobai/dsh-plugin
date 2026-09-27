# -*- coding: utf-8 -*-
# 融合版组件函数库：gzh-design视觉体系 + 13px正文铁律 + span leaf包裹 + 品牌规则
# 每个主题一套组件函数，全部"+"拼接、零换行符、文字节点span leaf包裹
import re, os

def _rgba(color, a):
    return "rgba(" + str(int(color[1:3],16)) + "," + str(int(color[3:5],16)) + "," + str(int(color[5:7],16)) + "," + a + ")"

def leaf(text):
    return '<span leaf="">' + text + '</span>'

# ========== 主题参数表（色值+下划线CSS+浅底色） ==========
THEMES = {
    "wenying":   {"main": "#991B1B", "light": "#FEF2F2", "ul": "#E7C878", "gold": "#B8860B", "name": "文映学术"},
    "olive":     {"main": "#1e1f23", "light": "#eeefe9", "ul": "#ed7b2f", "gold": "#ed7b2f", "name": "橄榄手记"},
    "graphite":  {"main": "#52525B", "light": "#FAFAFA", "ul": "#52525B", "gold": "#F97316", "name": "石墨极简"},
    "moyu":      {"main": "#059669", "light": "#ECFDF5", "ul": "#A7F3D0", "gold": "#059669", "name": "摸鱼绿"},
    "redwhite":  {"main": "#DC2626", "light": "#FEF2F2", "ul": "#FECACA", "gold": "#DC2626", "name": "红白色系"},
    "zen":       {"main": "#4A5D52", "light": "#F4F6F3", "ul": "#B5C8BC", "gold": "#4A5D52", "name": "留白禅意"},
}

T = THEMES  # 简写

def brand_top():
    return '<p style="text-align:center;margin:0;padding:0;"><img src="__BRAND_TOP__" style="width:100%;max-width:100%;display:block;margin:0 auto;" /></p>'

def brand_bot():
    return '<p style="text-align:center;margin:20px 0 0 0;padding:0;"><img src="__BRAND_BOT__" style="width:auto;max-width:100%;height:auto;object-fit:contain;object-position:center;display:block;margin:0 auto;border-radius:0px;" /></p>'

# ========== 组件：引言卡（金句+主题色高亮词+署名） ==========
def intro_card(pre, hl, post, t):
    c = T[t]
    return ('<section style="margin:20px 10px 28px;background:#ffffff;border-radius:12px;box-shadow:0 4px 24px -4px ' + _rgba(c["main"], "0.12") + ';padding:24px 20px 18px;overflow:hidden;">'
            '<p style="font-size:28px;color:' + c["main"] + ';font-weight:900;margin:0;line-height:0.6;">' + leaf('"') + '</p>'
            '<p style="font-size:14px;font-weight:800;color:#1C1917;margin:10px 0 8px;line-height:1.7;">' + leaf(pre) +
            '<span style="background:' + c["main"] + ';color:#FFFFFF;padding:2px 8px;border-radius:4px;">' + leaf(hl) + '</span>' + leaf(post) + '</p>'
            '<p style="text-align:right;font-size:11px;color:#9CA3AF;margin:8px 0 0;letter-spacing:1px;">' + leaf('—— 文映学术win00.cn') + '</p></section>')

# ========== 组件：三列目录（本文看点） ==========
def toc(p1, p2, p3, t):
    c = T[t]
    def cell(n, txt, mr):
        return ('<section style="flex:1;background:' + c["light"] + ';border-radius:10px;padding:14px 10px;' + mr + 'text-align:center;border:1px solid ' + _rgba(c["main"], "0.15") + ';">'
                '<p style="display:inline-block;background:' + c["main"] + ';color:#FFFFFF;font-size:11px;font-weight:800;padding:2px 10px;border-radius:4px;margin:0 0 8px;">' + leaf(n) + '</p>'
                '<p style="font-size:12px;font-weight:700;color:#1C1917;margin:0;">' + leaf(txt) + '</p></section>')
    return ('<section style="padding:0 10px 28px;">'
            '<p style="font-size:11px;color:#9CA3AF;margin:0 0 12px;letter-spacing:2px;">' + leaf('本文看点') + '</p>'
            '<section style="display:flex;justify-content:space-between;">'
            + cell("01", p1, "margin-right:8px;") + cell("02", p2, "margin-right:8px;") + cell("03", p3, "") +
            '</section></section>')

# ========== 组件：章节标题（编号徽章+左竖条） ==========
def h2(num, text, t):
    c = T[t]
    return ('<p style="margin:25px 0 15px 0;padding:0;font-size:16px;font-weight:bold;line-height:26px;color:#1C1917;border-left:4px solid ' + c["main"] + ';padding-left:12px;">'
            '<span style="display:inline-block;background:' + c["main"] + ';color:#fff;font-size:11px;padding:2px 8px;border-radius:3px;margin-right:8px;vertical-align:middle;">' + leaf(num) + '</span>'
            + leaf(text) + '</p>')

# ========== 组件：正文段落（13px铁律+首行缩进+关键词下划线） ==========
# parts为字符串列表：普通str=原样文字（leaf包裹），tuple ("kw", text)=关键词下划线，tuple ("b", text)=主题色加粗
def p(parts, t):
    c = T[t]
    body = ""
    for x in parts:
        if isinstance(x, tuple):
            if x[0] == "kw":
                body += '<span style="border-bottom:2px solid ' + c["ul"] + ';font-weight:600;">' + leaf(x[1]) + '</span>'
            elif x[0] == "b":
                body += '<strong style="color:' + c["main"] + ';">' + leaf(x[1]) + '</strong>'
            elif x[0] == "hl":
                body += '<span style="background:' + c["light"] + ';padding:1px 5px;border-radius:3px;font-weight:600;color:#1C1917;">' + leaf(x[1]) + '</span>'
        else:
            body += leaf(x)
    return '<p style="margin:0 0 25px 0;padding:0;font-size:13px;line-height:20px;color:#374151;text-indent:2em;">' + body + '</p>'

# ========== 组件：提示卡（清单） ==========
def card_ul(title, items, t):
    c = T[t]
    lis = "".join(['<p style="margin:4px 0 4px 20px;padding-left:20px;font-size:13px;line-height:20px;color:#555;">' + leaf('\u2022 ' + i) + '</p>' for i in items])
    return ('<p style="margin:15px 0;padding:12px 15px;background:' + c["light"] + ';border-left:4px solid ' + c["main"] + ';border-radius:0 6px 6px 0;">'
            '<span style="font-weight:bold;color:' + c["main"] + ';font-size:13px;">' + leaf('\u2605 提示：' + title) + '</span></p>' + lis)

# ========== 组件：提示卡（单条） ==========
def card(text, t):
    c = T[t]
    return ('<p style="margin:15px 0;padding:12px 15px;background:' + c["light"] + ';border-left:4px solid ' + c["main"] + ';border-radius:0 6px 6px 0;font-size:13px;line-height:20px;color:#374151;">'
            '<span style="font-weight:bold;color:' + c["main"] + ';">' + leaf('\u2605 提示：') + '</span>' + leaf(text) + '</p>')

# ========== 组件：卡片式图片（正文配图） ==========
def img_card(url, caption):
    return ('<section style="background:#ffffff;border-radius:10px;padding:6px;border:1px solid #E5E7EB;box-shadow:0 4px 12px -2px rgba(0,0,0,0.06);margin:0 0 5px;">'
            '<section style="margin:0;border-radius:6px;overflow:hidden;">' + leaf('<img src="' + url + '" style="max-width:100%;height:auto;display:block;margin:0 auto;">').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"') + '</section></section>'
            '<p style="text-align:center;font-size:11px;color:#9CA3AF;margin:0 0 20px 0;padding:0;">' + leaf('— ' + caption) + '</p>')

# ========== 组件：渐变分割线 ==========
def hr(t):
    c = T[t]
    return '<p style="margin:20px 0;text-align:center;"><span style="display:inline-block;width:60%;height:1px;background:linear-gradient(to right,transparent,' + c["gold"] + ',' + c["gold"] + ',transparent);"><span leaf=""><br></span></span></p>'

# ========== 组件：签名区（品牌引导+底图） ==========
def sign_off(guide_text, t):
    c = T[t]
    return ('<p style="margin:15px 0 10px;padding:14px 16px;background:' + _rgba(c["gold"], "0.10") + ';border-left:4px solid ' + c["gold"] + ';border-radius:0 6px 6px 0;font-size:13px;line-height:20px;color:#374151;">' + leaf(guide_text) + '</p>'
            + brand_bot())

# ========== 构建 ==========
def build(i, theme, intro, sections):
    html = brand_top() + intro
    for s in sections:
        html += s
    html = html.encode("utf-8", errors="replace").decode("utf-8")
    assert html.count("\n") == 0, "newline in article %d" % i
    txt = re.sub(r"<[^>]+>", "", html)
    plain = re.sub(r"\s", "", txt)
    assert len(plain) >= 2000, "article %d too short: %d" % (i, len(plain))
    assert html.count("<img") == 4, "article %d img count: %d" % (i, html.count("<img"))
    assert "文映千秋学术网" in txt
    out_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() or '__file__' in globals() else os.getcwd()
    open(os.path.join(out_dir, "article_v2_%d.html" % i), "w", encoding="utf-8").write(html)
    print("article", i, "theme:", theme, "plain chars:", len(plain))
