# 公众号排版组件库 —— 文映学术（品牌专属主题）

> **使用说明**：本组件库为「文映学术」品牌专属主题，服务文映千秋学术网公众号（学术出版方向：期刊发表、专著出版、论文发表、专利申办、国际刊、职称评审）。所有组件使用**内联样式**，兼容API发布（draft/add）与编辑器粘贴两种管线。
>
> **设计风格**：学术酒红 + 学术金点睛的经典学报风。编号章节 + 引言卡 + 三列目录 + 关键词下划线 + 品牌签名区，气质对标高水平学术期刊版式：克制、严谨、有权威感。
>
> **本主题铁律**：
> - 正文规范（用户确认）：字号13px / 行高20px / 段落间距25px / 首行缩进2em，正文色 #374151
> - 所有文字节点用 `<span leaf="">` 包裹；装饰性空元素内放 `<span leaf=""><br></span>`
> - 品牌规则：首行品牌图在最顶部（全局容器外），末尾品牌底图在签名区之后；品牌引导语必含"文映千秋学术网"
> - 字号映射（从gzh-design 15px体系等比缩写）：金句14px / 章节标题16px / 英文标签10px / 编号大字22px / 说明文字11px / 看点标题12px

---

## 设计变量速查表

```
主色调：       #991B1B（学术酒红）
主色调亮：     #DC2626（正红，锚点用）
主色调浅：     #FEE2E2（粉白底）
主色调背景：   #FEF2F2（极淡红底）
点缀色：       #B8860B（学术金）
点缀色浅：     #E7C878（金色下划线）
点缀色极浅：   #FDF6E3（米金底）
标题色：       #1C1917（近黑）
正文色：       #374151（深灰）
辅助文字色：   #9CA3AF（中灰）
分割线色：     #E5E7EB
正文字号：     13px（铁律，不可改）
行高：         20px（铁律）
段落间距：     25px（铁律）
首行缩进：     2em（铁律）
```

---

## 组件 1 引言卡（金句卡，替代加粗引言段）

> 文案策略：金句从文章核心论点提炼，与外标题视角错开；高亮词用酒红底白字，全文锚点配额计入。

```html
<section style="margin:20px 10px 28px;background:#ffffff;border-radius:12px;box-shadow:0 4px 24px -4px rgba(153,27,27,0.12);padding:24px 20px 18px;overflow:hidden;">
  <p style="font-size:28px;color:#991B1B;font-weight:900;margin:0;line-height:0.6;"><span leaf="">"</span></p>
  <p style="font-size:14px;font-weight:800;color:#1C1917;margin:10px 0 8px;line-height:1.7;"><span leaf="">{{金句前段}}</span><span style="background:#991B1B;color:#FFFFFF;padding:2px 8px;border-radius:4px;"><span leaf="">{{高亮关键词}}</span></span><span leaf="">{{金句收尾}}</span></p>
  <p style="text-align:right;font-size:11px;color:#9CA3AF;margin:8px 0 0;letter-spacing:1px;"><span leaf="">—— 文映学术win00.cn</span></p>
</section>
```

## 组件 2 三列目录（本文看点）

> 3个及以上章节时生成；精选3个核心看点，非全量章节。

```html
<section style="padding:0 10px 28px;">
  <p style="font-size:11px;color:#9CA3AF;margin:0 0 12px;letter-spacing:2px;"><span leaf="">本文看点</span></p>
  <section style="display:flex;justify-content:space-between;">
    <section style="flex:1;background:#FEF2F2;border-radius:10px;padding:14px 10px;margin-right:8px;text-align:center;border:1px solid #FEE2E2;">
      <p style="display:inline-block;background:#991B1B;color:#FFFFFF;font-size:11px;font-weight:800;padding:2px 10px;border-radius:4px;margin:0 0 8px;"><span leaf="">01</span></p>
      <p style="font-size:12px;font-weight:700;color:#1C1917;margin:0;"><span leaf="">{{看点一}}</span></p>
    </section>
    <section style="flex:1;background:#FEF2F2;border-radius:10px;padding:14px 10px;margin-right:8px;text-align:center;border:1px solid #FEE2E2;">
      <p style="display:inline-block;background:#991B1B;color:#FFFFFF;font-size:11px;font-weight:800;padding:2px 10px;border-radius:4px;margin:0 0 8px;"><span leaf="">02</span></p>
      <p style="font-size:12px;font-weight:700;color:#1C1917;margin:0;"><span leaf="">{{看点二}}</span></p>
    </section>
    <section style="flex:1;background:#FEF2F2;border-radius:10px;padding:14px 10px;text-align:center;border:1px solid #FEE2E2;">
      <p style="display:inline-block;background:#991B1B;color:#FFFFFF;font-size:11px;font-weight:800;padding:2px 10px;border-radius:4px;margin:0 0 8px;"><span leaf="">03</span></p>
      <p style="font-size:12px;font-weight:700;color:#1C1917;margin:0;"><span leaf="">{{看点三}}</span></p>
    </section>
  </section>
</section>
```

## 组件 3 章节标题（编号徽章 + 左竖条 + 英文标签）

```html
<p style="margin:25px 0 15px 0;padding:0;font-size:16px;font-weight:bold;line-height:26px;color:#1C1917;border-left:4px solid #991B1B;padding-left:12px;"><span style="display:inline-block;background:#991B1B;color:#fff;font-size:11px;padding:2px 8px;border-radius:3px;margin-right:8px;vertical-align:middle;"><span leaf="">{{01}}</span></span><span leaf="">{{中文标题}}</span></p>
```

## 组件 4 正文段落（13px铁律 + 首行缩进 + 关键词下划线）

> 每段主动标记1-3个关键短语（4-15字）用金色下划线；优先标核心观点、关键数据、专有名词。

```html
<p style="margin:0 0 25px 0;padding:0;font-size:13px;line-height:20px;color:#374151;text-indent:2em;"><span leaf="">{{前半句}}</span><span style="border-bottom:2px solid #E7C878;font-weight:600;"><span leaf="">{{关键短语}}</span></span><span leaf="">{{后半句}}</span></p>
```

### 行内样式变体

**a. 酒红加粗（核心概念、品牌名，锚点层，全篇≤5处）**

```html
<strong style="color:#991B1B;"><span leaf="">{{文字}}</span></strong>
```

**b. 米金浅底高亮（关键数据）**

```html
<span style="background:#FDF6E3;padding:1px 5px;border-radius:3px;font-weight:600;color:#1C1917;"><span leaf="">{{数据}}</span></span>
```

**c. 金色下划线（正文关键词默认标记）**

```html
<span style="border-bottom:2px solid #E7C878;font-weight:600;"><span leaf="">{{文字}}</span></span>
```

**d. 酒红底白字标签（锚点最强，全篇≤3处）**

```html
<span style="background:#991B1B;color:#FFFFFF;padding:2px 8px;border-radius:4px;font-weight:700;"><span leaf="">{{文字}}</span></span>
```

## 组件 5 提示卡（自查清单/要点列表）

```html
<p style="margin:15px 0;padding:12px 15px;background:#FEF2F2;border-left:4px solid #991B1B;border-radius:0 6px 6px 0;"><span style="font-weight:bold;color:#991B1B;font-size:13px;"><span leaf="">★ 提示：{{标题}}</span></span></p>
```

列表项：

```html
<p style="margin:4px 0 4px 20px;padding-left:20px;font-size:13px;line-height:20px;color:#555;"><span leaf="">• {{条目}}</span></p>
```

## 组件 6 卡片式图片（正文配图专用）

> 品牌图不用此组件（品牌图保持width:100%原生样式）。

```html
<section style="background:#ffffff;border-radius:10px;padding:6px;border:1px solid #E5E7EB;box-shadow:0 4px 12px -2px rgba(0,0,0,0.06);margin:0 0 5px;">
  <section style="margin:0;border-radius:6px;overflow:hidden;"><span leaf=""><img src="{{CDN地址}}" style="max-width:100%;height:auto;display:block;margin:0 auto;"></span></section>
</section>
<p style="text-align:center;font-size:11px;color:#9CA3AF;margin:0 0 20px 0;padding:0;"><span leaf="">— {{图片说明}}</span></p>
```

## 组件 7 渐变分割线

```html
<p style="margin:20px 0;text-align:center;"><span style="display:inline-block;width:60%;height:1px;background:linear-gradient(to right,transparent,#B8860B,#B8860B,transparent);"><span leaf=""><br></span></span></p>
```

## 组件 8 尾部签名区（品牌引导 + 品牌底图）

> 签名区与品牌引导语融合；引导语必含"文映千秋学术网"；品牌底图居中60%宽。

```html
<p style="margin:15px 0 10px;padding:14px 16px;background:#FDF6E3;border-left:4px solid #B8860B;border-radius:0 6px 6px 0;font-size:13px;line-height:20px;color:#374151;"><span leaf="">{{品牌引导语（含文映千秋学术网）}}</span></p>
<p style="text-align:center;margin:15px 0 0 0;padding:0;"><span leaf=""><img src="{{品牌底图CDN}}" style="max-width:60%;height:auto;display:block;margin:0 auto;"></span></p>
```

---

## 完整文章模板骨架

1. 首行品牌图（width:100%，全局容器外）
2. 组件1 引言卡（金句+高亮词+署名）
3. 组件2 三列目录（3+章节时）
4. 章节循环：组件3 章节标题 → 组件4 正文段落若干（每段1-3个下划线）→ 组件6 卡片式图片（穿插，每400-500字一张）→ 组件5 提示卡（按需）
5. 组件7 渐变分割线
6. 组件8 尾部签名区（品牌引导语+品牌底图）

## 文章类型 → 组件组合配方

| 文章类型 | 核心组件 | 点缀组件 |
|---|---|---|
| 政策解读（职称/专利） | 4正文+5提示卡+行内b数据高亮 | 2目录、8签名 |
| 深度分析（期刊/发表） | 4正文+行内c下划线+1引言卡 | 7分割线、5提示卡 |
| 流程指南（申办/出书） | 3章节标题+5提示卡列表 | 2目录、行内b |
| 数据报告 | 4正文+行内b米金高亮 | 2目录、7分割线 |

## Markdown → 组件映射规则

| Markdown元素 | 组件 | 说明 |
|---|---|---|
| 文章开头引言 | 组件1 引言卡 | 金句视角与外标题错开 |
| `## 章节` | 组件3 章节标题 | 01/02/03编号 |
| 普通段落 | 组件4 正文段落 | 每段1-3个金色下划线 |
| `**加粗**` | 行内a 酒红加粗 | 锚点层≤5处 |
| 关键数据 | 行内b 米金浅底 | |
| `> 引用` | 组件5 提示卡 | |
| `![说明](url)` | 组件6 卡片式图片 | 说明文字居中11px |
| `---` | 组件7 渐变分割线 | |
| 文末 | 组件8 签名区 | 品牌引导+底图 |
