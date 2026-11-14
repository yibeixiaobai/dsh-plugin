import fs from 'node:fs'
import path from 'node:path'
/**
 * 稿定设计与真人图文海报排版美学规范 (Gaoding Design & Human-Crafted Poster Style Guide)
 */
export const GAODING_NEGATIVE_PROMPTS = [
  'distorted hands', 'mutated fingers', '3d render', 'fantasy CGI', 'sci-fi glowing neon', 'plastic doll skin', 'oversaturated fake lighting', 'generic stock photo', 'surreal weird artifacts',
  'illegible English gibberish', 'English typography', 'Latin letters', 'English words', 'translated English title', 'English subtitles', 'ugly watermark', 'blurry text',
  'empty boxes', 'blank rectangles', 'unlabelled cards', 'placeholder frames', 'skeleton wireframes', 'meaningless blurred frames',
  'still life', 'podium', 'empty lectern', 'empty auditorium', 'empty classroom', 'stage curtain', 'empty chairs', 'auditorium seats',
  'books and glasses', 'spectacles on book', 'fountain pen and notebook', 'decorative desktop props', 'coffee cup on desk', 'meaningless still life', 'staged still life photography', 'meaningless decorative photography',
  'unrelated delivery rider', 'courier', 'rainy street photography', 'casual cafe lifestyle', 'unrelated fashion portraits', 'unrelated elderly reading', 'irrelevant street snapshots', 'code snippet',
  'young woman posing', 'female scholar portrait', 'female model desk photo', 'glamour portrait', 'lifestyle stock photo', 'unrelated human face close-up', 'influencer portrait', 'fashion model looking at camera', 'staged photo shoot', 'irrelevant human portrait',
].join(', ')
/**
 * 【中文修复依据】：物理清洗 prompt 中混入的连续英文词组与西文标题
 */
export function sanitizePromptLatinWords(prompt: string): string {
  if (!prompt) return ''
  return prompt
    .replace(/\b(?!(?:8k|4k|hd|c4d)\b)[a-zA-Z]{2,}(?:\s+[a-zA-Z]{2,})+\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
/**
 * 稿定风格海报封面图核心美学锚点
 */
export const ARTICLE_STYLE_ANCHORS_COVER = [
  // 风格 1：爆款大字报胶囊标贴风（小红书/公众号头条首选）
  '类似稿定设计的现代爆款运营海报，大字报封面排版，顶部带有高饱和矩形色块胶囊底衬（亮黄与深灰撞色），中间粗黑体中文标题层次分明，配有手绘高光引导箭头与干货便签贴纸，淡米白微颗粒纸张底纹，构图工整开阔，充裕留白',
  // 风格 2：极简莫兰迪卡片知识图解风（深度综述/干货教程）
  '类似稿定设计的极简商务知识卡片海报，米白色素雅质感背景，低饱和莫兰迪蓝绿与暖灰配色，居中模块化便签卡片排版，带有清晰的中文字体层级与圆标序号装饰，优雅手绘虚线框，视觉清爽高级，绝无AI塑料感',
  // 风格 3：复古报纸杂志编辑封面（人文/深度行业评测）
  '类似稿定设计的复古现代杂志特刊封面，报刊编排设计感，左上角期刊期号微排版，粗宋体中文标题，暖燕麦色细腻纤维底纹，搭配复古墨绿与琥珀橙色块，真实印刷品图文质感，层次分明',
  // 风格 4：活力多巴胺色块碰撞风（好物种草/实操避坑）
  '类似稿定设计的活力商业营销海报，清新牛油果绿与活力蜜桃橘色块几何拼接，大号高对比度粗圆黑体中文主标题，带有打勾清单方块与便签便条撕纸边缘微阴影，视觉明快吸睛',
]
/**
 * 正文高清插图核心美学锚点（16:9 宽屏现代化专业科技信息图表、全流程机制拓扑架构图谱与多维对比看板）
 */
export const ARTICLE_STYLE_ANCHORS_CONTENT = [
  // 【中文修复依据】：打破纯场景书桌摄影茧房，全面采用 16:9 宽屏现代化专业科技信息图表与全流程看板
  // 风格 1：16:9 宽屏现代化专业科技信息图解与双栏对比看板
  '16:9 宽屏现代化专业科技信息图表，双栏对比分析看板，模块化知识卡片与清晰的数据流指示，极简莫兰迪素雅配色，严谨工整，全中文排版，严禁纯场景静物摆拍、空讲台与随意生活街拍',
  // 风格 2：16:9 宽屏专业实务全流程机制架构图谱与阶段推进路线图
  '16:9 宽屏开阔工整的专业实务全流程机制架构图谱与阶段推进路线图，模块化信息拆解，高信息密度节点指引，层次分明，全中文排版，严禁纯场景桌面摆拍、空会议室椅子与生活照',
  // 风格 3：16:9 宽屏多维核心指标分析雷达与技术参数图解
  '16:9 宽屏多维核心指标分析雷达与技术参数图解，高清晰度模块看板，矩阵评估表格，浅色高亮对比，全中文排版，严谨工整，严禁纯场景桌面书本眼镜摆拍与随意生活照',
  // 风格 4：16:9 宽屏高水准专业实务数字化工作台与全流程闭环分析看板
  '16:9 宽屏现代化数字化业务工作台与全流程闭环分析看板，模块化卡片布局与结构化信息指示，耐看高级，紧扣文章专业主题，绝无无关路人、空讲台、叠放书本眼镜与千篇一律桌面静物照片',
]

/**
 * 为指定文本生成完整的生图提示词
 */
export function buildGaodingStylePrompt(
  title: string,
  kind: 'cover' | 'content' | 'pic',
  index = 1,
  sub = 1,
): string {
  const isCover = kind === 'cover' || (kind === 'pic' && sub === 1)
  const styleAnchor = isCover
    ? ARTICLE_STYLE_ANCHORS_COVER[(index - 1) % ARTICLE_STYLE_ANCHORS_COVER.length]
    : ARTICLE_STYLE_ANCHORS_CONTENT[(sub - 1) % ARTICLE_STYLE_ANCHORS_CONTENT.length]

  let prompt = `${styleAnchor}；主题内容：「${title}」`
  if (isCover) {
    prompt += `；画面必须包含醒目大字报中文标题「${title}」，并带有胶囊色块底衬与真实设计师手账装饰元素`
  } else {
    // 【中文修复依据】：彻底解除“严禁图表/导图”限制，转为 16:9 专业信息图表与科技图解呈现，杜绝空讲台与书本眼镜等无意义静物
    prompt += '；16:9 宽屏专业信息图表与科技图解呈现，与整套图文色调深度呼应，呈现工整清晰的模块化对比与知识结构，严禁空讲台、会议室空桌椅、叠放书本与老花镜钢笔等无意义静物摆拍'
  }

  prompt += `；【严格负向排版过滤】：${GAODING_NEGATIVE_PROMPTS}，严禁任何英文乱码、虚幻3D建模与伪图表代码块`
  return prompt
}

/**
 * 小红书 4 大视觉美学矩阵（去模板化、多样化画风）
 */
export const XHS_AESTHETICS = [
  {
    name: 'editorial',
    cover:
      '小红书极简杂志封面大片，米白高级质感背景，充裕呼吸感留白，精致中文字体排版构图，高级低饱和配色，现代画报质感',
    card: '小红书极简杂志排版风格，模块化卡片布局，清晰的留白与文字呼吸感，全中文排版，高级现代排版',
  },
  {
    name: 'journal',
    cover:
      '小红书手账日记便签封面海报，浅色网格纸底纹，手绘便签贴纸点缀，马克笔高亮手写标记感，真实记录感与生活感',
    card: '小红书手账便签记录风格，浅色网格背景，模块化便利贴分段，生动手绘小图标，全中文排版',
  },
  {
    name: 'infographic',
    cover:
      '小红书现代信息图谱封面海报，结构分明，现代科技感与学术信息图表融合，高饱和对比色块聚焦核心痛点，高级现代设计',
    card: '小红书现代信息图谱风格，模块化卡片布局，清晰的图表层级与逻辑指示箭头，干净整洁的背景，全中文排版',
  },
  {
    name: 'still_life',
    cover:
      '沉浸式学术学习书桌场景封面，温暖自然光影，翻开的书籍、笔记本电脑与咖啡杯，真实摄影质感，自然散景，高级生活方式',
    card: '温暖书桌场景结合半透明磨砂玻璃卡片悬浮排版，柔和光影，图文层次清晰，全中文标注',
  },
]

import {
  COVER_SIZES,
  type Config,
  XHS_COVER_RATIO,
  ZHIHU_COVER_RATIO,
  BAIJIAHAO_COVER_RATIO,
  TOUTIAO_COVER_RATIO,
  type CoverRatio,
} from '../config.ts'
import { resolveCoverRatio, contentImagesPerArticle } from './shared.ts'
import type { GenItem, ImageItemInput } from './genImagesTypes.ts'
import type { TaskSandboxContext } from '../sandbox/taskSandbox.ts'

/**
 * 【中文依据】：智能回溯并自愈当前任务的真实标题列表，避免单图重绘未传 titles 时出现占位符
 */
export function resolveTaskEffectiveTitles(
  passedTitles: string[],
  sandbox: TaskSandboxContext,
  articlesCount: number,
): string[] {
  const result: string[] = []
  for (let i = 1; i <= articlesCount; i++) {
    const passed = passedTitles[i - 1]
    if (passed && !isInvalidPlaceholderTitle(passed)) {
      result.push(passed.trim())
      continue
    }

    const art = sandbox.targetGroup.articles.find(a => a.index === i)
    if (art?.title && !isInvalidPlaceholderTitle(art.title)) {
      result.push(art.title.trim())
      continue
    }

    try {
      const artFile = path.join(sandbox.targetGroup.articlesDir, 'article_v2_' + i + '.html')
      if (fs.existsSync(artFile)) {
        const html = fs.readFileSync(artFile, 'utf8')
        const h2Match = html.match(/<h2[^>]*>([^<]+)<\/h2>/i)
        if (h2Match?.[1] && !isInvalidPlaceholderTitle(h2Match[1])) {
          result.push(h2Match[1].trim())
          continue
        }
      }
    } catch {}

    result.push('')
  }
  return result
}

/**
 * 组装带有封面/插图/小红书卡片增强提示词及语言约束的生图任务项
 */
/**
 * 【中文依据】：校验标题是否为占位符（如 \"文章_1\", \"article_1\", \"未命名\" 等）
 */
export function isInvalidPlaceholderTitle(title: string | undefined | null): boolean {
  if (!title) return true
  const trimmed = title.trim()
  return (
    !trimmed ||
    /^文章[\_\s\-]?\d+$/i.test(trimmed) ||
    /^article[\_\s\-]?\d+$/i.test(trimmed) ||
    /^(?:未命名|无标题|新建文章|草稿)(?:文章)?[\_\s\-]?\d*$/i.test(trimmed)
  )
}

export function buildEnhancedGenItems(params: {
  rawItems: ImageItemInput[]
  account: { id: string; profile: any }
  titles: string[]
  cfg: Config
}): GenItem[] {
  const { rawItems, account, titles, cfg } = params
  const legacyZhOnly = account.profile.content?.image_lang_zh_only ?? true
  const coverZhOnly = Boolean(account.profile.content?.cover_lang_zh_only ?? legacyZhOnly)
  const contentZhOnly = Boolean(
    account.profile.content?.content_image_lang_zh_only ?? legacyZhOnly,
  )

  return rawItems.map((it) => {
    const rawKind = it.kind || 'cover'
    const index = Number(it.index ?? 1)
    const prompt = (it.prompt || '').trim()
    if (!Number.isInteger(index) || index < 1 || index > 20) {
      throw new Error('index 必须是 1~20')
    }
    if (rawKind === 'pic') {
      const sub = Number(it.sub ?? 1)
      if (!Number.isInteger(sub) || sub < 1 || sub > 20) {
        throw new Error('pic 图 sub 必须是 1~20（按小绿书卡片张数）')
      }
      const isXhs = account.profile.platform === 'xiaohongshu'
      const ratio = isXhs
        ? '3:4'
        : ((account.profile.content.newspic_image_ratio || '3:4') as CoverRatio)
      const picSize = COVER_SIZES[ratio] || COVER_SIZES['3:4']
      const rawPicTitle = titles[index - 1]
      const titleForPic = !isInvalidPlaceholderTitle(rawPicTitle) ? rawPicTitle.trim() : undefined
      const aesthetic = XHS_AESTHETICS[(index - 1) % XHS_AESTHETICS.length]

      let picPrompt = prompt
      // 【中文修复依据】：微信小绿书与小红书多图流卡片防跑偏铁律，卡片 1 为大字报封面，卡片 2~N 强制为干货清单/图文卡片，绝对杜绝无关外卖员与街拍
      if (titleForPic) {
        if (sub <= 1) {
          picPrompt =
            prompt +
            '；【美学风格：' + (isXhs ? aesthetic.cover : '稿定爆款大字报封面') + '】' +
            '；封面卡片画面正中心必须以醒目大字艺术排版印刷中文主标题：「' +
            titleForPic +
            '」，字体粗壮清晰，排版层级分明，视觉冲击力强，绝不可只有背景框而无文字'
        } else {
          picPrompt =
            prompt +
            '；【美学风格：' + (isXhs ? aesthetic.card : '小绿书干货知识清单图文卡片') + '】' +
            '；本卡片是主题「' +
            titleForPic +
            '」的第 ' + sub + ' 张干货要点卡，必须紧扣该选题核心专业要点展开：' +
            '画面采用现代平面设计风格（米白/浅灰纯色质感留白底色），呈现清晰模块化便签清单、正反对比图表或核心论点，全中文排版，' +
            '【杜绝空线框与骨架屏铁律】：画面必须印刷真实清晰的中文干货文字，绝对严禁只有空白背景框、骨架条、灰色占位横线或无字线框图（strictly render real legible Chinese text, absolutely NO empty wireframes, NO placeholder bars, NO skeleton lines），' +
            '绝对严禁任何纯场景桌面摆拍、无关人物生活街拍与咖啡厅休闲日常'
        }
      } else {
        picPrompt =
          prompt +
          '；【美学风格：' +
          (sub <= 1 ? (isXhs ? aesthetic.cover : '大字报封面') : (isXhs ? aesthetic.card : '干货知识卡片')) +
          '】' +
          (sub <= 1
            ? '；封面卡片画面正中心必须以醒目大字艺术排版印刷核心主题中文大字，绝不可只有背景框而无文字'
            : '；卡片内容必须紧扣文章专业要点，呈现清晰便签清单或对比图表，严禁无关人物生活街拍')
      }

      picPrompt +=
        '；【同组卡片统一视觉体系与连续叙事流】：整套卡片严格保持一致的现代平面设计质感、纯净浅色底色与统一调色板，浑然一体；右上角清晰标示连续页码进度（P' + sub + '），各卡片上下逻辑衔接，绝无纯场景书桌背景干扰；' +
        '【排版合规约束】：画面文字全中文排版，严禁英文乱码与伪字符；严禁任何二维码、条形码或外部水印；' +
        '【严格负向排版过滤】：' + GAODING_NEGATIVE_PROMPTS
      const picZhOnly = sub <= 1 ? coverZhOnly : contentZhOnly
      if (picZhOnly) {
        picPrompt +=
          '；【画面文字全中文排版约束】：画面中文字必须全部为规范中文字符，严禁英文单词、英文字母与伪字符乱码'
      } else {
        picPrompt +=
          '；【纯净视觉真实摄影美学】：纯视觉真实实景与场景美学，画面中不强制出现中文，避免强行拼凑中文字符'
      }
      return {
        kind: 'pic',
        index,
        sub,
        prompt: picPrompt,
        zh_only: picZhOnly,
        out: 'pic_' + index + '_' + sub + '.png',
        size: [...picSize] as [number, number],
        // [中文修复依据]：透传显式指定的搜图标记与自定义关键词
        ...(it.source ? { source: it.source } : {}),
        ...(it.search_query ? { search_query: it.search_query } : {}),
      }
    }

    const isCover = rawKind === 'cover' || (!it.sub && rawKind !== 'content')
    if (isCover) {
      if (prompt.length < 10) {
        throw new Error(
          '封面图提示词过短（至少 10 字），请紧扣标题核心关键词描述画面主题与标题文字排版要求',
        )
      }
      const rawTitle = titles[index - 1]
      // 【中文修复依据】：严禁任何「文章_1」等调试占位符渗透进文生图提示词中
      const titleForIndex = !isInvalidPlaceholderTitle(rawTitle) ? rawTitle.trim() : undefined
      const cleanPrompt = coverZhOnly ? sanitizePromptLatinWords(prompt) : prompt
      let enhancedPrompt = cleanPrompt
      if (titleForIndex) {
        enhancedPrompt =
          cleanPrompt +
          '；画面正中心醒目艺术排版印刷中文主标题：「' +
          titleForIndex +
          '」，体现该选题意象与高端学术期刊封面质感'
      } else {
        enhancedPrompt =
          cleanPrompt +
          '；【纯净视觉真实意象美学】：画面正中心呈现大气典雅的学术期刊意象摄影与高端商务美学质感，纯视觉意象传达，严禁在画面中排版任何调试占位符、图表或代码块'
      }
      const coverStyle =
        ARTICLE_STYLE_ANCHORS_COVER[(index - 1) % ARTICLE_STYLE_ANCHORS_COVER.length]
      enhancedPrompt +=
        '；【全篇统一配图风格排版约束】：整篇文章全部配图严格保持统一艺术画风（' +
        coverStyle +
        '），排版规范与光影质感与本篇所有插图高度一致，严禁同一篇内画风突变；【严格负向排版过滤】：' +
        GAODING_NEGATIVE_PROMPTS

      const ratio =
        account.profile.platform === 'zhihu'
          ? ZHIHU_COVER_RATIO
          : account.profile.platform === 'xiaohongshu'
            ? XHS_COVER_RATIO
            : account.profile.platform === 'baijiahao'
              ? BAIJIAHAO_COVER_RATIO
              : account.profile.platform === 'toutiao'
                ? TOUTIAO_COVER_RATIO
                : resolveCoverRatio(cfg, index, account.profile)

      if (coverZhOnly) {
        enhancedPrompt +=
          (titleForIndex
            ? '；【画面文字全中文排版铁律】：画面中排版文字必须且只能为纯中文大标题「' +
              titleForIndex +
              '」，绝对禁止渲染任何英文标题、英文字母、英文单词或将其翻译为英文（strictly render exact Chinese typography only: "' +
              titleForIndex +
              '", absolutely no English letters, no English translation on image）'
            : '；【画面文字全中文排版铁律】：画面中所有文字必须全部为规范中文字符，严禁英文字母、英文单词与西文排版（strictly no English letters, all text in Chinese typography only）') +
          '；字体粗壮清晰，排版层级分明'
      } else {
        enhancedPrompt +=
          '；【纯净视觉真实摄影约束】：纯视觉真实摄影美学，画面中不强制出现中文，严禁强行拼凑或伪造畸变中文字符，画面纯净自然无多余文字标签（pure photography, no artificial text forcing）'
      }
      return {
        kind: 'cover',
        index,
        prompt: enhancedPrompt,
        zh_only: coverZhOnly,
        out: 'cover_' + index + '.png',
        size: [...COVER_SIZES[ratio]] as [number, number],
        // [中文修复依据]：透传显式指定的搜图标记与自定义关键词
        ...(it.source ? { source: it.source } : {}),
        ...(it.search_query ? { search_query: it.search_query } : {}),
      }
    }

    // content 正文图
    const sub = Number(it.sub ?? 1)
    const limit = contentImagesPerArticle(cfg, account.profile)
    if (limit === 0) throw new Error('设置的每篇正文配图数为 0，不生成正文配图（IMG_A*）')
    if (!Number.isInteger(sub) || sub < 1 || sub > limit) throw new Error('content 图 sub 必须是 1~' + limit + '（按设置的每篇正文配图数）')
    const contentStyle =
      ARTICLE_STYLE_ANCHORS_CONTENT[(index - 1) % ARTICLE_STYLE_ANCHORS_CONTENT.length]
    const cleanContentPrompt = contentZhOnly ? sanitizePromptLatinWords(prompt) : prompt
    let contentEnhancedPrompt =
      cleanContentPrompt +
      '；【全篇统一配图风格排版约束】：本插图必须与第 ' +
      index +
      ' 篇封面及其他插图视觉风格严格保持高度一致（艺术画风：' +
      contentStyle +
      '），构图与配色完全融入整篇文章统一视觉体系，严禁同一篇内画风突变；【严格负向排版过滤】：' +
      GAODING_NEGATIVE_PROMPTS

    // 【中文修复依据】：彻底解除「严禁图表」错误负向词，紧扣学术/行业主题，支持 16:9 高保真科技信息图、对比看板与实务流程图解
    // 当图注或提示词体现拓扑图、流程图、指标看板、周期规划、佐证链、矩阵等意图时，强力注入无人物、无静物信息图铁律，杜绝空讲台与书本眼镜摆拍
    const isInfographicIntent =
      /(?:拓扑|流程|架构|看板|图谱|对比|分析|指标|雷达|规划|周期|机制|导图|甘特|矩阵|步骤|阶段|选刊|路线图|闭环|链|模型|漏斗|体系|准则|清单|评估|审查|佐证|infographic|chart|diagram|dashboard|flowchart|topology|workflow|matrix|roadmap|loop)/i.test(
        cleanContentPrompt,
      )
    if (isInfographicIntent) {
      contentEnhancedPrompt +=
        '；【16:9 专业图解看板无人物与无静物铁律】：本插图为 16:9 宽屏专业逻辑架构、全流程拓扑图谱、佐证链矩阵或对比看板，画面主体必须是现代化信息图表、模块化卡片与清晰的数据流指引，绝不可包含任何人物肖像，绝对严禁空讲台、红幕布、礼堂空座椅、叠放书本与老花镜钢笔等无意义静物摆拍（strictly render 16:9 widescreen clean structured infographic / topology diagram / flow chart / comparison dashboard only, absolutely NO human face, NO podium, NO empty auditorium, NO books and glasses, NO staged still life photo）'
    }

    if (contentZhOnly) {
      contentEnhancedPrompt +=
        '；【正文插图纯中文专业排版约束】：若画面中出现任何文字或标牌元素，必须且只能为纯中文字符，绝对严禁出现任何英文字母、英文单词、西文乱码与伪字符；' +
        '插图内容必须与章节论点及图注深度绑定，呈现 16:9 高清晰度模块化科技对比图谱、指标看板或流程图解，绝无外卖员、咖啡厅休闲照与无关生活街拍，' +
        '【杜绝空白框与纯静物铁律】：若画面包含卡片、模块或流程节点，所有框架内部必须印制清晰真实的中文短语文字，绝对严禁只有空背景框、空白矩形或灰色占位横线（strictly render real legible Chinese text in each block, absolutely NO empty boxes, NO blank rectangles, NO placeholder frames）；绝对严禁生成空讲台、会议室空桌椅、叠放书本、老花镜或书桌静物摆拍，必须呈现真实具有信息传递价值的 16:9 专业图解'
    } else {
      contentEnhancedPrompt +=
        '；【正文纯净学术专业美学】：16:9 宽屏高信息密度对比图谱或严谨结构化流程图解，构图工整开阔，绝无无关路人、空讲台与随意静物摆拍'
    }
    const contentRatio = (account.profile.content?.content_image_ratio || '16:9') as CoverRatio
    const contentSize = COVER_SIZES[contentRatio] || COVER_SIZES['16:9']
    return {
      kind: 'content',
      index,
      sub,
      prompt: contentEnhancedPrompt,
      zh_only: contentZhOnly,
      out: 'content_' + index + '_' + sub + '.png',
      ratio: contentRatio,
      size: [...contentSize] as [number, number],
      // [中文修复依据]：透传显式指定的搜图标记与自定义关键词
      ...(it.source ? { source: it.source } : {}), ...(it.search_query ? { search_query: it.search_query } : {}),
    }
  })
}
