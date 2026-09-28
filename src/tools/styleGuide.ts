import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { THEME_NAMES, XHS_COVER_RATIO, XHS_CONTENT_MAX, XHS_IMAGES_MAX, XHS_TITLE_MAX, ZHIHU_COVER_RATIO, type Config, type ThemeKey } from '../config.ts'
import { resolveAccount } from '../config-runtime.ts'
import {
  accountScriptsDir, contentImagesPerArticle, expectedArticleImageCount, renderJson, resolveCoverRatio, resolveTheme, resolveTypography, runtimeResourceDir,
} from './shared.ts'

// 与 gzh_components.py THEMES 一致的色板
const THEME_PALETTES: Record<ThemeKey, Record<string, string>> = {
  wenying: { main: '#991B1B', light: '#FEF2F2', ul: '#E7C878', gold: '#B8860B', name: '文映学术（品牌专属）' },
  olive: { main: '#1e1f23', light: '#eeefe9', ul: '#ed7b2f', gold: '#ed7b2f', name: '橄榄手记' },
  graphite: { main: '#52525B', light: '#FAFAFA', ul: '#52525B', gold: '#F97316', name: '石墨极简' },
  moyu: { main: '#059669', light: '#ECFDF5', ul: '#A7F3D0', gold: '#059669', name: '摸鱼绿' },
  redwhite: { main: '#DC2626', light: '#FEF2F2', ul: '#FECACA', gold: '#DC2626', name: '红白色系' },
  zen: { main: '#4A5D52', light: '#F4F6F3', ul: '#B5C8BC', gold: '#4A5D52', name: '留白禅意' },
}

const THEME_FILE_HINTS: Record<ThemeKey, string[]> = {
  wenying: ['wenying', '文映'],
  olive: ['olive', '橄榄'],
  graphite: ['graphite', '石墨'],
  moyu: ['moyu', '摸鱼绿'],
  redwhite: ['redwhite', '红白'],
  zen: ['zen', '禅意'],
}

const DOC_SPEC_EXAMPLE = {
  index: 1,
  theme: 'wenying',
  intro: { pre: '金句前半句', hl: '核心关键词', post: '金句后半句' },
  toc: ['要点1：背景与趋势', '要点2：关键实操细节', '要点3：避坑与建议'],
  sections: [
    {
      h2: '01',
      text: '章节标题（实操中依此类推规划 4~6 个长章节）',
      blocks: [
        { p: ['普通文字段落...', ['kw', '关键词下划线'], ['b', '主题色加粗'], ['hl', '浅底高亮']] },
        { card: '单条重点提示卡内容' },
        { card_ul: { title: '核心清单', items: ['要点1', '要点2', '要点3'] } },
        { img: { src: 'IMG_A1_1', caption: '示意图' } },
        { hr: true },
      ],
    },
  ],
  sign_off: '结尾引导语（自然融入品牌名）',
}

export interface StyleGuide {
  account_id: string
  account_name: string
  platform: string
  theme: ThemeKey | 'markdown'
  palette: Record<string, string>
  typography_rules: Record<string, string>
  doc_spec: unknown
  parts_format: string[]
  hard_rules: string[]
  forbidden_words: string[]
  articles_per_day: number
  newspic_articles_per_day?: number
  topics: string[]
  enable_hot_tracking?: boolean
  seasonal_context?: { month: number; focus: string; seasonal_keywords: string[] }
  content_images_per_article: number
  theme_plan: Record<string, ThemeKey>
  references: string[]
  sync_newspic?: boolean
  newspic_spec?: unknown
  recent_titles?: string[]
}

export function getSeasonalContext(): { month: number; focus: string; seasonal_keywords: string[] } {
  const month = new Date().getMonth() + 1
  const map: Record<number, { focus: string; keywords: string[] }> = {
    1: { focus: '国自然基金申报冲刺期、考研初试结束复盘、春招科研岗启动', keywords: ['基金申报', '开题立项', '春招', '课题标书'] },
    2: { focus: '基金标书形式审查与打磨、考研初试查分前瞻、寒假论文集中修改', keywords: ['基金评审', '考研查分', '论文润色', '降重误区'] },
    3: { focus: '国自然基金系统提交截止、考研国家线与复试线出炉、毕业论文预答辩', keywords: ['基金截止', '考研复试', '调剂策略', '毕业答辩'] },
    4: { focus: '高校春季职称申报材料摸底、硕士博士毕业论文盲审送审高峰、夏令营通知', keywords: ['盲审送审', '毕业查重', '职称材料', '保研夏令营'] },
    5: { focus: '毕业论文正式答辩季、学术不端倒查与抽检预警、各省软课题申报', keywords: ['答辩问答', '抽检预警', '毕业致谢', '课题申报'] },
    6: { focus: '年中毕业离校季、最新JCR期刊影响因子(IF)年度重磅发布、年中科研总结', keywords: ['影响因子', 'JCR分区', 'IF暴涨', '中科院分区'] },
    7: { focus: '暑期集中写论文攻关、高校保研夏令营考核、国家社科基金评审动向', keywords: ['暑期攻关', '夏令营考核', '论文撰写', '文献精读'] },
    8: { focus: '国家自然科学基金/国家社科放榜月、开学前投稿准备、专著书号申报窗口', keywords: ['基金放榜', '专著出版', '专著书号', 'SCI催稿'] },
    9: { focus: '秋季新学期开学、各省市高校职称评审材料申报启动高峰、考研大纲发布', keywords: ['职称评审', '职称论文', '专著截稿', '考研大纲'] },
    10: { focus: '职称评审公示与答辩期、考研正式报名缴费、秋招名企/高校教师试讲', keywords: ['职称答辩', '考研报名', '高校教师招聘', '核心版面'] },
    11: { focus: '各省职称评审结果公示期、年终专著出版赶末班车、中科院新分区前瞻', keywords: ['职称公示', '出版截稿', '分区预测', '预警期刊名单'] },
    12: { focus: '中科院最新《期刊分区表》与预警名单重磅发布、全国硕士研究生统考、年终科研绩效核算', keywords: ['中科院分区', '预警名单公布', '考研初试', '科研绩效'] },
  }
  const curr = map[month] || { focus: '常规科研成果推进与发表规划', keywords: ['期刊发表', '专著出版'] }
  return { month, focus: curr.focus, seasonal_keywords: curr.keywords }
}

function getRecentTitles(cfg: Config, accountId: string, limit = 20): string[] {
  const dir = accountScriptsDir(cfg, accountId)
  const titles: string[] = []
  const historyPath = path.join(dir, 'publish_history.json')
  if (fs.existsSync(historyPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
      if (Array.isArray(data)) {
        for (const item of data) {
          const t = item?.title || item?.topic
          if (typeof t === 'string' && t.trim()) titles.push(t.trim())
        }
      }
    } catch {}
  }
  const resultPath = path.join(dir, 'publish_result.json')
  if (fs.existsSync(resultPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(resultPath, 'utf-8'))
      const articles = data?.articles || data?.items || []
      if (Array.isArray(articles)) {
        for (const a of articles) {
          const t = a?.title
          if (typeof t === 'string' && t.trim()) titles.push(t.trim())
        }
      }
    } catch {}
  }
  return Array.from(new Set(titles)).slice(-limit)
}

// 知乎 doc spec：与公众号同一骨架（intro/toc/sections/blocks/sign_off），theme 字段被忽略
const ZHIHU_DOC_SPEC_EXAMPLE = {
  index: 1,
  intro: { pre: '开篇观点', hl: '核心词', post: '收束' },
  toc: ['章节1核心趋势', '章节2实操要点', '章节3高频避坑'],
  sections: [
    {
      h2: '01',
      text: '章节标题（实操中依此类推规划 4~6 个长章节）',
      blocks: [
        { p: ['普通文字段落...', ['kw', '关键词'], ['b', '加粗'], ['hl', '强调']] },
        { card: '单条重点提示' },
        { card_ul: { title: '核心清单', items: ['要点1', '要点2'] } },
        { img: { src: 'IMG_A1_1', caption: '示意图' } },
      ],
    },
  ],
  sign_off: '结尾引导语（自然融入品牌名）',
}

// 小绿书（图片消息 newspic）doc spec 紧凑骨架：
// 卡片按角色分工：cover（封面吸睛）→ overview（核心速览）→ key_points（干货要点）→ cta（引导关注）
const NEWSPIC_DOC_SPEC_EXAMPLE = {
  index: 1,
  article_type: 'newspic',
  title: '爆款小绿书标题（严格≤32字，数字+痛点+解决方案结构）',
  content: '📌 核心速览：\n提炼核心干货，3~5 个要点分段呈现，每段搭配 emoji 导读。\n\n✅ 要点一：xxx\n✅ 要点二：xxx\n✅ 要点三：xxx\n\n💡 避坑提醒：xxx\n\n关注文映千秋学术网获取更多干货！\n#学术攻略 #避坑指南',
  cards: [
    { sub: 1, role: 'cover', prompt: '封面海报：大标题视觉冲击，3:4竖版，扁平现代设计，高饱和配色，画面中心预留标题文字排版空间，禁止英文' },
    { sub: 2, role: 'content', prompt: '核心速览卡片：3~5 个要点清单式排列，图标+短句，信息层次分明，扁平信息图风格，全中文排版' },
    { sub: 3, role: 'content', prompt: '干货详解卡片：重点流程/步骤图解，箭头引导，模块化布局，配色统一，干净背景，全中文标注' },
    { sub: 4, role: 'content', prompt: '总结引导卡片：核心结论提炼+关注引导，品牌色点缀，简约大气，底部留白，全中文' },
  ],
}

// 小红书 5 大原生爆款叙事体裁骨架示例（去模板化、去套路化体系）
const XHS_ARCHETYPES = [
  {
    type: 'story_trap',
    name: '避坑经历型',
    title: '开题千万别这么写！我踩过的3个大坑',
    structure: '个人挫折切入（真实痛点） → 核心症结复盘 → 3条避坑指南 → 交流互动',
    example: '🚨 真实踩坑自白：\n研一开题时我自以为选题宏大，结果答辩被导师连环质问，差点延毕...今天掏心窝子跟大家分享3个千万不能踩的坑：\n\n❌ 误区一：题目假大空，缺乏具体研究边界\n❌ 误区二：文献综述变成简单的论文罗列\n❌ 误区三：研究方法与核心结论无法闭环\n\n💡 翻盘复盘：\n后来把切入点收窄到具体场景，答辩导师直接给优！开题关键不是做多大，而是把一个点挖透。',
    visual_aesthetic: '真实手账便签记录风（网格纸底纹、手绘便签贴纸、马克笔高亮笔触）',
  },
  {
    type: 'step_checklist',
    name: '保姆级实操清单型',
    title: '保姆级文献精读法！照着做不拖延',
    structure: '目标与准备 → 阶段一宏观速览 → 阶段二精读笔记 → 阶段三输出卡片 → 行动清单',
    example: '📋 拯救拖延的精读清单：\n文献读完总记不住？建议大家告别从头读到尾的低效模式，照着这份清单逐项打勾执行：\n\n阶段一：10分钟宏观扫读\n◽ 细读 Abstract 与 Conclusion，判断关联度\n◽ 快速过一遍图表 Caption\n\n阶段二：20分钟结构精读\n◽ 标出作者的核心假设与实验创新点\n◽ 用不同颜色马克笔标注研究局限\n\n阶段三：5分钟卡片归档\n◽ 提炼一句话核心收获录入知识库',
    visual_aesthetic: '现代数据图解/脑图风（模块化卡片布局、清晰的清单勾选符号与逻辑流程箭头）',
  },
  {
    type: 'comparison_matrix',
    name: '横向对比测评型',
    title: '这3款学术工具谁更好用？一图看懂',
    structure: '选型困扰痛点 → 维度横向打分（功能/门槛/性价比） → 适用人群对照 → 最终选型建议',
    example: '⚖️ 纠结文献管理工具看这篇就够了：\n很多同学在 Zotero、EndNote 和 NoteExpress 之间纠结，结合我4年的深度使用体验，做个纯主观横向对比：\n\n1️⃣ Zotero（推荐指数 ⭐⭐⭐⭐⭐）\n◽ 优势：开源免费、插件生态极其强大、跨平台同步丝滑\n◽ 痛点：需要花半小时配置插件\n◽ 适合：追求高效自由度的研究生\n\n2️⃣ EndNote（推荐指数 ⭐⭐⭐⭐）\n◽ 优势：各大期刊官方模板兼容度第一、老牌稳定\n◽ 痛点：界面相对古早、购买正版成本高\n◽ 适合：纯医学/生物生信发SCI老手',
    visual_aesthetic: '极简杂志风（米白高级底色、呼吸感留白、精致中文字体排版、高级低饱和配色）',
  },
  {
    type: 'myth_buster',
    name: '认知反转破局型',
    title: '文献不是读得越多越好！90%人搞错了',
    structure: '抛出反直觉真相 → 传统误区错在哪 → 认知升级逻辑 → 高效破局解法',
    example: '💡 颠覆认知的学术真相：\n你是不是也有一周下载上百篇文献，放在文件夹里吃灰的经历？其实文献不是越多越好，盲目贪多反而是科研内耗的根源：\n\n❌ 假勤奋：收藏即学会，只下载不吸收\n❌ 伪精读：字斟句酌读完全文却提炼不出核心论点\n\n🔑 认知破局：\n真正高效的学者都在做“按需逆向检索”——以要解决的科研痛点为导向，只读能为你的论证提供证据的段落。读透10篇顶刊Benchmark，远胜走马观花刷100篇普通文章！',
    visual_aesthetic: '极简杂志画报风（强烈视觉焦点、反差色彩对比、大号标题字排版）',
  },
  {
    type: 'toolkit_resources',
    name: '实用工具库盘点型',
    title: '自用私藏！5个效率翻倍的科研神器',
    structure: '核心场景痛点 → 工具1亮点 → 工具2亮点 → 工具3亮点 → 组合提效秘籍',
    example: '🧰 研究生私藏效率工具库：\n工欲善其事必先利其器！整理了5个每天都在用的高赞科研工具，建议直接码住：\n\n1. Connected Papers：顺藤摸瓜找关联文献的视觉关系图谱\n2. Research Rabbit：学术界的Spotify，根据已读文章智能推荐\n3. Overleaf：多人实时协作LaTeX写论文，免本地复杂环境配置\n4. SciFlow：自带各种期刊参考文献排版模板的学术写作排版器\n5. DeepL：地道学术英语翻译，语法润色体验极佳',
    visual_aesthetic: '现代模块图解风（网格式卡片、工具专属图标位、清晰功能标注）',
  },
]

const XHS_DOC_SPEC_EXAMPLE = {
  index: 1,
  archetype: 'story_trap',
  title: '开题千万别这么写！我踩过的3个大坑',
  content: '🚨 真实踩坑自白：\n研一开题时我自以为选题宏大，结果答辩被导师连环质问...今天掏心窝子跟大家分享3个千万不能踩的坑：\n\n❌ 误区一：题目假大空，缺乏具体研究边界\n❌ 误区二：文献综述变成简单的论文罗列\n❌ 误区三：研究方法与核心结论无法闭环\n\n💡 翻盘复盘：\n后来把切入点收窄到具体场景，答辩导师直接给优！开题关键不是做多大，而是把一个点挖透。\n\n#研究生日常 #开题报告 #科研避坑',
  images: [
    { sub: 1, role: 'cover', prompt: '3:4竖版封面海报：真实手账日记风，浅色网格纸纹理，手绘便签贴纸点缀，画面中心预留醒目大标题排版空间，全中文' },
    { sub: 2, role: 'content', prompt: '3:4内容卡片：3大误区避坑图解，模块化卡片布局，红色叉号图标，手绘便签质感，全中文标注' },
    { sub: 3, role: 'content', prompt: '3:4内容卡片：翻盘心法与实操路径图，清晰递进步骤箭头，全中文排版' },
  ],
  tags: ['研究生日常', '开题报告', '科研避坑'],
}

function cleanXhsBrand(brand: string): string {
  return brand.replace(/(https?:\/\/\S+|[a-zA-Z0-9-]+\.(?:cn|com|net|org|top|xyz)\b)/gi, '').trim()
}

function xhsStyleGuide(cfg: Config, accountId: string): StyleGuide {
  const account = resolveAccount(cfg, accountId)
  const content = account.profile.content
  const n = content.articles_per_day
  const imgPerNote = content.xhs_images_per_note || 4
  const minWords = content.xhs_min_words ?? 200
  const tags = content.xhs_tags ?? []
  const recentTitles = getRecentTitles(cfg, account.id)
  const cleanBrandName = cleanXhsBrand(account.profile.brand_name) || '学术知识分享'
  const cleanAuthorName = cleanXhsBrand(account.profile.author_name) || cleanBrandName

  // 去模板化：按篇序号为同批次笔记分配互不雷同的叙事体裁与画风
  const archetypePlan: Record<string, string> = {}
  for (let i = 1; i <= n; i++) {
    const arch = XHS_ARCHETYPES[(i - 1) % XHS_ARCHETYPES.length]
    archetypePlan['note_' + i] = arch.name + '（' + arch.type + '，画风：' + arch.visual_aesthetic + '）'
  }

  return {
    account_id: account.id,
    account_name: account.profile.name,
    platform: 'xiaohongshu',
    theme: 'wenying',
    palette: {},
    typography_rules: {
      format: '纯文本笔记（article_v2_{index}_xhs.txt），支持 emoji 与换行分段',
      title_limit: '标题必须严格 ≤ ' + XHS_TITLE_MAX + ' 字（小红书平台硬性限制）',
      content_limit: '正文（含话题标签）必须 ≤ ' + XHS_CONTENT_MAX + ' 字',
      image_format: '每篇配 ' + imgPerNote + ' 张图，统一 3:4 竖版（1080×1440px），最多 ' + XHS_IMAGES_MAX + ' 张',
      compliance_standard: '必须严格遵守《小红书社区规范》（协议编号：ZXXY20221213003），严禁导流，真实分享',
      anti_formulaic: '杜绝模板化套路化！同批次多篇笔记必须使用不同叙事体裁与不同视觉画风',
    },
    doc_spec: XHS_DOC_SPEC_EXAMPLE,
    parts_format: [
      'archetype → 叙事体裁标识（story_trap / step_checklist / comparison_matrix / myth_buster / toolkit_resources）',
      'title → 爆款短标题（严格≤' + XHS_TITLE_MAX + '字，痛点+数字+解决方案，拒绝极限词与单一模板）',
      'content → 纯文案正文（' + minWords + '~' + XHS_CONTENT_MAX + '字，第一人称真诚分享口吻，分段精炼+emoji导读+文末合规互动，拒绝AI八股套话）',
      'images → 生图提示词列表（每张 sub 从 1 到 ' + imgPerNote + '）',
      '  图片角色分工：sub1=cover（封面海报，中心预留标题文字位）→ sub2~' + (imgPerNote - 1) + '=content（干货要点图解）→ sub' + imgPerNote + '=cta（总结引导交流）',
      '  生图提示词铁律：必须围绕【本篇标题的具体主题关键词】展开，融合该篇推荐的美学画风（杂志风/手账风/图解风/实景风），全中文排版，严禁英文乱码，严禁二维码、水印与商标侵权',
      'tags → 话题标签列表（如 ["学术干货", "论文写作"]），自动以 #话题 格式附加在文末，建议 3~5 个精准中文标签',
    ],
    hard_rules: [
      '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、字数、配图、风格等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则继续严格生效。',
      '【去模板化铁律：5大体裁轮换】：同批次批量产出多篇笔记时，严禁全部采用“速览+原则+避坑”三板斧！必须根据 archetype_plan 分配的体裁写作（如第1篇踩坑自白、第2篇实操清单、第3篇对比测评等），行文逻辑、分段结构必须截然不同！',
      '【AI去油去八股铁律】：严禁使用假大空机械套话（如“不可否认”、“毋庸置疑”、“显而易见”、“随着时代发展”、“洞悉规律”等）！必须使用第一人称博主真实在场口吻（“我亲测”、“真的建议大家”、“踩过的坑”）。',
      '【小红书社区规范红线一：严禁任何导流行为（规范 3.2）】：严禁发布微信号、微信、加V、VX、QQ、手机号、邮箱、二维码、暗号、外部网址域名（.cn/.com/http/https等）、外站平台（淘宝/京东/公众号/知乎等）或“私信领资料”。一律合规于社区内自然互动。',
      '【小红书社区规范红线二：严禁违规交易与学术不端（规范 2.3 & 3.1）】：严禁出现“代写”、“代办”、“代发”、“保过”、“包过”、“买卖论文”、“枪手”等任何学术不端或虚假承诺词汇。',
      '【小红书社区规范红线三：真实体验与杜绝虚假夸大（规范 4.1.3 & 4.1.4）】：提倡第一人称“真诚分享”与利他干货，结构清晰，emoji 导读；标题严格 ≤ ' + XHS_TITLE_MAX + ' 字；严禁标题党与广告极限词（如“全网第一”、“绝密”、“100%包过”等）。',
      '【小红书社区规范红线四：知识产权与肖像保护（规范 5.1 & 5.2）】：生图提示词严禁使用知名真实人物肖像，严禁侵犯商业商标/企业Logo，画面现代美观，全中文，严禁低俗恐怖。',
      '平台形态：小红书图文笔记（纯文本文案 + 3:4 竖版多图卡片）',
      '正文（含话题标签）字数区间：' + minWords + ' ~ ' + XHS_CONTENT_MAX + ' 字纯文本，建议分段精炼（每段不超过3-4行），善用 📌💡✅🔍🎯 等 emoji 导读',
      '正文禁占位符铁律：content 必须是不含任何 IMG_A{i}_{j} 占位符的纯文案——小红书图片由上传区单独提交，正文严禁残留占位符标记',
      '作者/博主名：' + cleanAuthorName + '（已自动脱敏过滤外部域名网址）',
      content.ending_guide_required
        ? '正文结尾自然融入博主IP专栏名「' + cleanBrandName + '」，并配合合规社区互动（如“欢迎在评论区交流探讨~”、“持续分享干货，点击关注不迷路”）'
        : '正文结尾引导语可选，须为纯净社区互动语',
      '配图规格：每篇 ' + imgPerNote + ' 张，尺寸统一 1080×1440px（3:4 竖版），第 1 张为封面海报，画面中心预留标题文字排版空间',
      '禁词表全文生效：严禁出现任何违规禁词与敏感导流词',
      '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
      '选题避让铁律：recent_titles 列出了本账号最近已发布的文章标题，新选题必须在主题角度、核心论点、实操方法上与之显著区分',
    ],
    forbidden_words: content.forbidden_words,
    articles_per_day: n,
    topics: [...content.topics],
    enable_hot_tracking: content.enable_hot_tracking !== false,
    seasonal_context: getSeasonalContext(),
    content_images_per_article: imgPerNote,
    theme_plan: archetypePlan as any,
    references: [],
    recent_titles: recentTitles,
  }
}

function newspicStyleGuide(cfg: Config, accountId: string): StyleGuide {
  const account = resolveAccount(cfg, accountId)
  const content = account.profile.content
  const n = content.newspic_articles_per_day || 1
  const cardCount = content.newspic_images_per_article || 4
  const minWords = content.newspic_min_words ?? Math.min(content.min_words, 100)
  return {
    account_id: account.id,
    account_name: account.profile.name,
    platform: 'gzh',
    theme: 'wenying',
    palette: THEME_PALETTES.wenying,
    typography_rules: {
      format: '小绿书图片消息（article_v2_{index}_pic.json），多图轮播+纯文本说明',
      title_limit: '标题必须严格 ≤ 32 字（微信官方强制限制）',
      content_format: '纯文本内容，支持换行和 emoji，严禁任何 HTML 标签',
      image_format: '每篇配 ' + cardCount + ' 张卡片图，第 1 张自动作为封面，统一尺寸比例 3:4 竖版',
    },
    doc_spec: NEWSPIC_DOC_SPEC_EXAMPLE,
    parts_format: [
      'title → 爆款短标题（≤32字，数字+痛点+解决方案结构，如「3步搞定xxx」「xxx避坑指南」）',
      'content → 纯文案正文（150~500字，分段+emoji导读+文末引导+话题标签 #xxx）',
      'cards → 多图生图提示词列表（每张 sub 从 1 到 ' + cardCount + '）',
      '  卡片角色分工：sub1=cover（封面吸睛）→ sub2=overview（核心速览）→ sub3~' + (cardCount - 1) + '=key_points（干货要点/流程图解）→ sub' + cardCount + '=cta（总结引导关注）',
      '  每张卡片 prompt 须明确：① 卡片类型/角色 ② 内容要点 ③ 视觉风格 ④ 全中文约束',
    ],
    hard_rules: [
      '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、文章形态、字数、配图、主题色板等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则（如单行HTML零换行、禁词表、防重复发布、生图尺寸比例等）继续严格生效。',
      '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
      '平台形态：微信公众号小绿书（图片消息 newspic）',
      '标题严格 ≤ 32 字，超出微信接口报错拒绝；标题须含数字或痛点词，避免纯陈述句',
      '作者名固定 ' + account.profile.author_name,
      '数量铁律：默认本次正好 ' + n + ' 篇小绿书（每篇包含 ' + cardCount + ' 张卡片图片 sub 1~' + cardCount + '）；若用户在补充要求中指定了篇数，以补充要求为准',
      '发布铁律：小绿书严格只需调用 1 次 gzh_publish_draft（article_type: "newspic"），单次提交全部 ' + n + ' 篇小绿书标题与摘要，底层会自动逐篇创建独立草稿并完成官方核验，严禁由 Agent 循环多次重复调用发布！',
      '卡片尺寸：1080×1440px（3:4 竖版），第 1 张卡片自动作为封面，无需额外封面图',
      '卡片逻辑递进：封面（视觉冲击+标题意象）→ 速览（核心要点概览）→ 详解（干货/流程/对比）→ 收尾（结论+关注引导），禁止卡片内容重复或无序堆砌',
      '封面卡片（sub1）：画面中心须预留标题文字排版空间，避免关键元素居中导致标题遮挡',
      '内容卡片（sub2~' + cardCount + '）：每张聚焦一个子主题，信息密度均匀，禁止空白过多或文字堆叠',
      '正文字数：不低于 ' + minWords + ' 字纯文本，建议 150~500 字，分段清晰，每段以 emoji 导读（如 📌✅💡🔑🎯）',
      '禁词表全文生效：严禁出现任何禁词',
      content.ending_guide_required
        ? '正文结尾必须自然包含品牌名「' + account.profile.brand_name + '」'
        : '正文结尾引导语可选',
      '图片中所有文字必须全部中文，禁止英文残留、禁止二维码',
    ],
    forbidden_words: content.forbidden_words,
    articles_per_day: n,
    topics: [...content.topics],
    enable_hot_tracking: content.enable_hot_tracking !== false,
    seasonal_context: getSeasonalContext(),
    content_images_per_article: cardCount,
    theme_plan: {},
    references: [],
  }
}

function zhihuStyleGuide(cfg: Config, accountId: string): StyleGuide {
  const account = resolveAccount(cfg, accountId)
  const content = account.profile.content
  const n = content.articles_per_day
  const contentImgs = contentImagesPerArticle(cfg, account.profile)
  return {
    account_id: account.id,
    account_name: account.profile.name,
    platform: 'zhihu',
    theme: 'markdown',
    palette: {},
    typography_rules: {
      format: '标准 Markdown 多行文本（article_v2_{index}.md）',
      heading: '章节标题构建为 "## 序号 标题"，禁止自行使用一级标题',
      emphasis: 'kw/b/hl 标注一律渲染为 **加粗**（Markdown 无下划线/高亮语义）',
      no_html: '禁止输出任何 HTML 标签或内联样式',
    },
    doc_spec: ZHIHU_DOC_SPEC_EXAMPLE,
    parts_format: [
      '字符串 → 普通文字',
      '["kw", 文字] → **加粗关键词**（每段 1-3 个）',
      '["b", 文字] → **加粗**',
      '["hl", 文字] → **加粗强调**',
    ],
    hard_rules: [
      '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、文章形态、字数、配图、主题色板等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则（如标准 Markdown、禁词表、防重复发布、生图尺寸比例等）继续严格生效。',
      '平台：知乎专栏；产出为标准 Markdown，无主题色板/引言卡/三列目录/品牌头尾图等公众号组件',
      '作者名固定 ' + account.profile.author_name,
      '数量铁律：默认本次正好 ' + n + ' 篇（index 1~' + n + '）；若用户在补充要求中指定了篇数，以补充要求为准；知乎每篇是独立文章草稿（不是多图文组合）；每篇正好 ' + contentImgs + ' 张正文配图' + (contentImgs === 0 ? '（本次为 0：不要生成任何 IMG_A* 占位）' : '（必须在 sections 中分布占位符 IMG_A{index}_1 ~ IMG_A{index}_' + contentImgs + '，系统构建会自动自愈补齐）'),
      '选题铁律（全账号统一）：若用户在本次任务补充要求中明确给出了特定主题/选题或业务方向，以补充要求为最高第一优先级执行；仅在未指定特定选题时，才必须围绕下方 topics 业务关键词深度检索并拓展强相关联的优质选题（如直击读者痛点、实操避坑、政策解读、流程指南等）；严禁机械式将关键词直接作为标题开头词语或前缀（❌ 严禁出现“北大核心：...”、“【SCI】...”等冒号或括号前缀；✅ 必须是自然陈述句或疑问句，如“投稿前先看准这四项刊物信息，避开盲投陷阱”）；标题应自然吸睛',
      '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
      '字数铁律：每篇设定下限不少于 ' + content.min_words + ' 字（构建时严格去除标记与空白统计）。因大模型 token 估算普遍偏少，撰写时请务必按 ' + Math.max(content.min_words + 400, Math.ceil(content.min_words * 1.2)) + ' 字以上标准充分展开！规划 4~6 个长章节，每章节 3~5 个长段落，搭配 card/清单深度展开，确保纯汉字充实达标，杜绝断言失败重写浪费 token（构建工具设有容差底线）',
      '标题不超过 100 字，禁词表全文生效（构建与校验时断言）',
      content.ending_guide_required
        ? '结尾自然引导关注「' + account.profile.brand_name + '」（构建时断言）'
        : '结尾引导语可选；如使用需自然融入，不堆砌广告感',
      '封面比例统一 ' + ZHIHU_COVER_RATIO + '（知乎账号固定，按账号平台机器强制）',
      '图片中所有文字必须全部中文，禁止英文残留、禁止二维码',
    ],
    forbidden_words: content.forbidden_words,
    articles_per_day: n,
    topics: [...content.topics],
    enable_hot_tracking: content.enable_hot_tracking !== false,
    seasonal_context: getSeasonalContext(),
    content_images_per_article: contentImgs,
    theme_plan: {},
    references: [],
  }
}

export function styleGuideTool(cfg: Config) {
  return defineTool<{ theme?: string; account_id?: string; article_type?: 'news' | 'newspic' }, StyleGuide>({
    name: 'gzh_get_style_guide',
    description:
      '获取写作与排版规范（按账号平台返回）：公众号=主题色板/doc_spec 格式/13px 排版铁律/禁词表/硬性规则/' +
      '主题计划 theme_plan；小绿书=图片消息 doc_spec 与硬性规则；知乎=Markdown 形态的 doc_spec 与硬性规则。' +
      '返回值自包含，写文无需读参考文档、源码或历史文章。每日写文前必读一次获取基础排版规范与默认参数。' +
      '注意：若本次任务包含用户补充要求（如指定选题、篇数、形态、字数、配图或主题等），补充要求为第一最高优先级，优先遵循补充要求执行；未被补充要求覆盖的基础合规与格式铁律按返回值严格执行。',
    parameters: {
      theme: {
        type: 'string',
        description: '主题键（仅公众号长文生效，缺省用设置的头条主题）',
        enum: Object.keys(THEME_NAMES),
      },
      article_type: {
        type: 'string',
        description: '可选：指定文章形态（news=长图文，newspic=小绿书图片消息）；缺省按账号设置',
        enum: ['news', 'newspic'],
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省使用默认账号',
      },
    },
    output: { schema: { type: 'json' }, render: renderJson },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      const articleType = args.article_type || account.profile.content.article_type || 'news'
      if (articleType === 'newspic' && account.profile.platform !== 'zhihu') {
        return newspicStyleGuide(cfg, account.id)
      }
      if (account.profile.platform === 'xiaohongshu') {
        return xhsStyleGuide(cfg, account.id)
      }
      if (account.profile.platform === 'zhihu') {
        return zhihuStyleGuide(cfg, account.id)
      }
      const content = account.profile.content
      const isBoth = content.article_type === 'both' || content.sync_newspic === true
      const n = content.articles_per_day
      const contentImgs = contentImagesPerArticle(cfg, account.profile)
      const theme = (args.theme && args.theme in THEME_NAMES ? args.theme : resolveTheme(cfg, 1, account.profile)) as ThemeKey
      const themePlan: Record<string, ThemeKey> = {}
      for (let i = 1; i <= n; i++) themePlan[String(i)] = resolveTheme(cfg, i, account.profile)
      const refsDir = path.join(runtimeResourceDir(), 'references')
      const references: string[] = []
      // 主题文件：按 hints 模糊匹配 theme-*.md
      let themeDoc: string | null = null
      try {
        for (const f of fs.readdirSync(refsDir)) {
          if (!f.startsWith('theme-') || !f.endsWith('.md')) continue
          if (THEME_FILE_HINTS[theme].some((h) => f.toLowerCase().includes(h))) {
            themeDoc = path.join(refsDir, f)
            break
          }
        }
      } catch {
        /* 参考目录缺失时仅返回内置规范 */
      }
      for (const p of [themeDoc, path.join(refsDir, 'theme-index.md'), path.join(refsDir, 'common-components.md'), path.join(refsDir, 'format-normalize.md')].filter(Boolean) as string[]) {
        if (fs.existsSync(p)) references.push(p)
      }
      const typo = resolveTypography(cfg, account.profile)
      const headlineRatio = resolveCoverRatio(cfg, 1, account.profile)
      const secondaryRatio = resolveCoverRatio(cfg, 2, account.profile)
      return {
        account_id: account.id,
        account_name: account.profile.name,
        platform: 'gzh',
        theme,
        palette: THEME_PALETTES[theme],
        typography_rules: {
          font_size: typo.font_size,
          line_height: typo.line_height,
          paragraph_margin: typo.paragraph_margin,
          text_indent: typo.text_indent,
          no_blank_line: '纯单行 HTML，组件自动保证零换行符',
        },
        doc_spec: DOC_SPEC_EXAMPLE,
        parts_format: [
          '字符串 → 普通文字（自动 span leaf 包裹）',
          '["kw", 文字] → 主题色下划线关键词（每段 1-3 个）',
          '["b", 文字] → 主题色加粗',
          '["hl", 文字] → 浅底色高亮',
        ],
        hard_rules: [
          '【最高第一优先级】：若本次任务包含补充要求（如指定特定选题/主题、篇数、文章形态、字数、配图、主题色板等），补充要求具有最高裁决权，优先于本规范返回的默认配置值！未被补充要求修改的底层合规与格式规则（如单行HTML零换行、禁词表、防重复发布、生图尺寸比例等）继续严格生效。',
          '作者名固定 ' + account.profile.author_name,
          '数量铁律：默认本次正好 ' + n + ' 篇（index 1~' + n + '），组合为 1 个多图文草稿；若用户在补充要求中指定了篇数，以补充要求为准；每篇正好 1 张封面；每篇正好 ' + contentImgs + ' 张正文配图，禁止增减' + (contentImgs === 0 ? '（本次为 0：不要生成任何 IMG_A* 正文图占位）' : '（必须在 sections 中分布占位符 IMG_A{index}_1 ~ IMG_A{index}_' + contentImgs + '，系统构建会自动校验并自愈补位）'),
          ...(isBoth
            ? ['小绿书同步更新铁律：当前账号已配置「长文 + 小绿书」同步更新（article_type: both 或 sync_newspic: true）。在生成长文 article_v2_{index}.html（共 ' + n + ' 篇合并为1个草稿）的同时，必须从长文提炼核心干货并同步生成 ' + (content.newspic_articles_per_day || 1) + ' 篇小绿书卡片图文 article_v2_{index}_pic.json（规范参考 newspic_spec），生成 3:4 竖版卡片图（kind: "pic"）。发布时，小绿书严格只需调用 1 次 gzh_publish_draft(article_type: "newspic") 单次提交（底层会自动逐篇创建草稿并完成官方核验），严禁由 Agent 循环或多次重复发布！']
            : []),
          '选题铁律（全账号统一）：若用户在本次任务补充要求中明确给出了特定主题/选题或业务方向，以补充要求为最高第一优先级执行；仅在未指定特定选题时，才必须围绕下方 topics 业务关键词深度检索并拓展强相关联的优质选题（如直击读者痛点、实操避坑、政策解读、流程指南等）；严禁机械式将关键词直接作为标题开头词语或前缀（❌ 严禁出现“北大核心：...”、“【SCI】...”等冒号或括号前缀；✅ 必须是自然陈述句或疑问句，如“投稿前先看准这四项刊物信息，避开盲投陷阱”）；标题应自然吸睛',
          '【动态热点与搜索雷达铁律】：若用户未在任务中指定具体选题，必须优先调用 gzh_discover_topics 嗅探当前领域的全网搜索热点、时令节点与实时行业突发，选取高评分爆款切角；若宿主环境具备通用网络搜索工具（如 search_web），可先检索行业最新资讯并传入 gzh_discover_topics 进行转化；确立候选题目后再提交 gzh_check_topics 查重。',
          '主题铁律：默认按 theme_plan 对应主题撰写；若用户在补充要求或 doc spec 中指定了有效主题（如 "moyu"、"olive" 等），以指定主题为准',
          '每篇正文共 ' + expectedArticleImageCount(cfg, account.profile) + ' 张 img' +
            (account.profile.brand_images.header.enabled ? '，含头部品牌图' : '') +
            (account.profile.brand_images.footer.enabled ? '，含尾部品牌图' : ''),
          '字数铁律：每篇设定下限不少于 ' + content.min_words + ' 字（纯单行 HTML 去标签及空格后统计）。因大模型 token 估算普遍偏少，撰写时请务必按 ' + Math.max(content.min_words + 400, Math.ceil(content.min_words * 1.2)) + ' 字以上标准充分展开！规划 4~6 个长章节，每章节 3~5 个长段落，搭配 card/card_ul，确保纯汉字充实达标，杜绝断言失败重写浪费 token（构建工具设有容差底线）',
          '封面：第 1 篇头条 ' + headlineRatio + '，其余 ' + secondaryRatio + '；封面图提示词必须紧扣本篇标题核心关键词，将标题主题视觉化呈现（如标题讲"SCI论文润色"则画面需体现论文/润色相关意象），禁止泛化抽象或与选题无关的通用素材；画面中心区域需预留标题文字排版空间，适配不同设备裁剪',
          '正文配图：提示词应强调学术信息图表或概念结构呈现，清晰现代设计，结构分明，干净背景，极简信息美学',
          '生图铁律：画面中文字必须全部是中文，禁止出现任何英文单词、英文字母，禁止二维码、乱码字符与水印；系统已内置多线程并发与本地优雅保底',
          content.ending_guide_required ? '结尾引导语为硬性要求' : '结尾引导语可选',
        ],
        forbidden_words: content.forbidden_words,
        articles_per_day: n,
        newspic_articles_per_day: isBoth ? (content.newspic_articles_per_day || 1) : undefined,
        topics: [...content.topics],
        enable_hot_tracking: content.enable_hot_tracking !== false,
        seasonal_context: getSeasonalContext(),
        content_images_per_article: contentImgs,
        theme_plan: themePlan,
        references,
        sync_newspic: isBoth,
        ...(isBoth ? { newspic_spec: NEWSPIC_DOC_SPEC_EXAMPLE } : {}),
      }
    },
  })
}
