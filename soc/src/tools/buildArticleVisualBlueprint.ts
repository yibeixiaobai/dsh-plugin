/**
 * 文章视觉蓝图构建与自愈辅助模块
 * 用于在文章构建时，将正文各段落关键论点与卡片槽位映射为可实体化的视觉蓝图插槽
 */
import type { VisualSlotBlueprint } from '../sandbox/taskSandboxTypes.ts'

/**
 * 【中文修复依据】：从 section 节点中安全提炼核心干货短句（20~50 字），
 * 确保小绿书各卡片注入真实文本，彻底杜绝无文字空白骨架条
 */
function extractSectionKeySummary(sec: any): string {
  if (!sec || typeof sec !== 'object') return ''
  const candidates: string[] = []

  if (Array.isArray(sec.blocks)) {
    for (const b of sec.blocks) {
      if (!b || typeof b !== 'object') continue
      if (b.lead && typeof b.lead === 'string' && b.lead.trim()) {
        candidates.push(b.lead.trim())
      }
      if (b.card && typeof b.card === 'string' && b.card.trim()) {
        candidates.push(b.card.trim())
      }
      if (b.versus && typeof b.versus === 'object') {
        const v = b.versus as any
        if (v.wrong && v.right) {
          candidates.push(`误区：${v.wrong}；规范：${v.right}`)
        }
      }
      if (b.checklist && typeof b.checklist === 'object' && Array.isArray((b.checklist as any).items)) {
        const items = (b.checklist as any).items.filter((it: any) => typeof it === 'string' && it.trim())
        if (items.length > 0) {
          candidates.push(items.slice(0, 2).join('；'))
        }
      }
      if (b.p) {
        if (typeof b.p === 'string' && b.p.trim()) {
          candidates.push(b.p.trim())
        } else if (Array.isArray(b.p)) {
          const str = b.p.map((seg: any) => (typeof seg === 'string' ? seg : Array.isArray(seg) && seg[1] ? String(seg[1]) : '')).join('').trim()
          if (str) candidates.push(str)
        }
      }
    }
  }

  for (const c of candidates) {
    const clean = c.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (clean.length >= 10) {
      return clean.length > 60 ? clean.slice(0, 58) + '...' : clean
    }
  }

  return ''
}

/**
 * 【中文修复依据】：从 section 节点中提取适合信息图表/流程节点/对比维度的核心文字短语（3~4个短词），
 * 作为文生图模型的文字渲染锚点，彻底杜绝生成有框架无文字的空卡片
 */
function extractDiagramAnchors(sec: any, caption: string): string {
  const anchors: string[] = []
  if (sec && typeof sec === 'object' && Array.isArray(sec.blocks)) {
    for (const b of sec.blocks) {
      if (!b || typeof b !== 'object') continue
      if (b.checklist && typeof b.checklist === 'object' && Array.isArray((b.checklist as any).items)) {
        for (const item of (b.checklist as any).items) {
          if (typeof item === 'string' && item.trim()) {
            const clean = item.replace(/^[0-9一二三四\.\、\:\：\s]+/, '').replace(/<[^>]+>/g, '').trim()
            const shortWord = clean.split(/[，,。；;：:]/)[0]?.trim() || clean.slice(0, 10)
            if (shortWord && shortWord.length >= 2 && shortWord.length <= 12) {
              anchors.push(shortWord)
            }
          }
        }
      }
      if (b.versus && typeof b.versus === 'object') {
        const v = b.versus as any
        if (v.wrong && v.right) {
          anchors.push(`误区：${String(v.wrong).slice(0, 8)}`, `规范：${String(v.right).slice(0, 8)}`)
        }
      }
    }
  }

  // 若从 blocks 中提炼到了 2~4 个短标签，格式化为带引号的步骤指令
  const unique = Array.from(new Set(anchors)).filter(Boolean).slice(0, 4)
  if (unique.length >= 2) {
    return unique.map((w, i) => `节点${i + 1}印制「${w}」`).join('、')
  }

  // 否则根据 caption 意图智能自愈提供 3~4 个契合专业主题的标准节点短语
  const c = caption || ''
  if (/流程|节点|时序|周期|阶段|把控|步骤/.test(c)) {
    return '节点框内分别印制「前期初审」、「专家外审」、「退修定稿」、「录用排期」等具体流程词'
  }
  if (/维度|导向|评价|审读|指标|标准/.test(c)) {
    return '标牌内分别印制「立意导向」、「审读维度」、「学术价值」、「合规标准」等具体短语'
  }
  if (/对比|误区|避坑|辨析|差异/.test(c)) {
    return '双栏内分别印制「❌ 常见误区诊断」与「✅ 规范实践指南」等明确对比文本'
  }
  return `模块内清晰印制围绕「${(c.slice(0, 10) || '核心要点')}」的 3~4 个具体专业中文标签`
}

export function resolveArticleVisualBlueprint(params: {
  doc: Record<string, unknown>
  idx: number
  platform: string
  isNewspic: boolean
  targetImgCount: number
  effectiveTitle: string
}): VisualSlotBlueprint[] {
  const { doc, idx, platform, isNewspic, targetImgCount, effectiveTitle } = params
  const targetSlots: VisualSlotBlueprint[] = []

  if (Array.isArray((doc as any).visual_blueprint) && (doc as any).visual_blueprint.length > 0) {
    for (const vb of (doc as any).visual_blueprint) {
      targetSlots.push({
        slotId: vb.slot_id || vb.slotId || `${platform}_${idx}_${vb.kind || 'content'}_${vb.sub || 1}`,
        index: idx,
        sub: vb.sub,
        kind: vb.kind || (isNewspic ? (vb.sub === 1 ? 'cover' : 'pic') : 'content'),
        ratio: vb.ratio || (isNewspic ? '3:4' : (vb.kind === 'cover' ? (idx === 1 ? '2.35:1' : '1:1') : '16:9')),
        title: effectiveTitle,
        contextText: vb.context_text || vb.contextText || '',
        intentDescription: vb.intent_description || vb.intentDescription || vb.desc || '',
        generationPrompt: vb.generation_prompt || vb.generationPrompt || vb.prompt || '',
        searchKeywords: Array.isArray(vb.search_keywords || vb.searchKeywords)
          ? (vb.search_keywords || vb.searchKeywords)
          : [effectiveTitle],
        status: 'planned',
      })
    }
  } else {
    if (isNewspic) {
      // 【中文修复依据】：小绿书 3:4 竖版多图连贯叙事体系（P1 黄金封面 -> P2 痛点根因 -> P3 正反避坑 -> P4 落地指南）
      // 彻底剔除纯场景书桌背景与无字空骨架框，每张卡片强制印制真实中文大标题与真实干货要点
      const sections = Array.isArray(doc.sections) ? doc.sections : []
      const cardCount = Math.max(3, Math.min(6, targetImgCount || 4))

      // P1 黄金痛点封面
      targetSlots.push({
        slotId: `pic_${idx}_1`,
        index: idx,
        sub: 1,
        kind: 'cover',
        ratio: '3:4',
        title: effectiveTitle,
        intentDescription: `小绿书 3:4 竖版现代爆款大字报封面，排版印刷主标题「${effectiveTitle}」，右上角标示 P1/0${cardCount}，底部引导「👉 下滑查看深度拆解」`,
        generationPrompt: `小红书现代爆款大字报封面海报，3:4 竖版构图，米白高级纯色背景，顶部高饱和胶囊色块标签，正中心艺术排版印刷中文主标题「${effectiveTitle}」，粗黑体层次分明，右上角清晰标示「P1/0${cardCount} 核心论纲」，底部带有手绘「👉 左翻/下滑看干货」引导箭头，现代平面设计感，全中文排版，严禁任何纯场景书桌摆拍、生活街拍与空白线框`,
        searchKeywords: [effectiveTitle, '大字报封面', '核对清单'],
        status: 'planned',
      })

      for (let c = 2; c <= cardCount; c++) {
        const secIndex = c - 2
        const targetSec = sections[secIndex] || sections[secIndex % Math.max(1, sections.length)]
        const secTitle = targetSec ? String(targetSec.text || targetSec.title || `核心要点 0${c - 1}`).trim() : `关键规范 0${c - 1}`
        const keySummary = extractSectionKeySummary(targetSec) || `围绕「${secTitle}」的标准化实操流程与合规核对细节`

        let cardRole = '深度拆解'
        let cardPromptTheme = ''
        if (c === 2) {
          cardRole = '核心根因'
          cardPromptTheme = `顶部清晰标示「P2/0${cardCount} ${cardRole}」与小标题「${secTitle}」，画面排版印刷真实中文干货论点「${keySummary}」，模块化便签与序号圆标排列工整`
        } else if (c === 3) {
          cardRole = '正反避坑'
          cardPromptTheme = `顶部清晰标示「P3/0${cardCount} ${cardRole}」，红绿双栏对比看板，排版印刷真实中文「❌ 常见误区」与「✅ 规范正解」，针对「${secTitle}：${keySummary}」深度比对`
        } else {
          cardRole = '落地指南'
          cardPromptTheme = `顶部清晰标示「P4/0${cardCount} ${cardRole}」，清晰排版印刷真实中文自查清单「${secTitle}：${keySummary}」，底部附带「🔖 建议收藏备查」印章标贴`
        }

        targetSlots.push({
          slotId: `pic_${idx}_${c}`,
          index: idx,
          sub: c,
          kind: 'pic',
          ratio: '3:4',
          title: effectiveTitle,
          contextText: secTitle,
          intentDescription: `小绿书第 ${c} 张干货卡片（P${c}/0${cardCount} ${cardRole}）：紧扣「${secTitle}」，印制真实中文干货「${keySummary}」`,
          generationPrompt: `小绿书干货知识卡片，3:4 竖版排版，现代平面图文设计，米白色纯净底色，${cardPromptTheme}，全中文清晰排版，绝对严禁只有空背景框、骨架条或灰色占位横线，绝对严禁任何纯场景书桌摆拍与生活散景，字迹端正清晰`,
          searchKeywords: [effectiveTitle, secTitle, cardRole],
          status: 'planned',
        })
      }
    } else {
      // 微信公众号长文封面与正文插图
      const coverRatio = idx === 1 ? '2.35:1' : '1:1'
      targetSlots.push({
        slotId: `cover_${idx}`,
        index: idx,
        kind: 'cover',
        ratio: coverRatio,
        title: effectiveTitle,
        intentDescription: `微信公众号${idx === 1 ? '头条大图' : '次条方形'}封面，醒目艺术排版印刷「${effectiveTitle}」`,
        generationPrompt: `${effectiveTitle}，高端学术科技期刊封面质感，现代极简莫兰迪色调，醒目印刷中文大字标题「${effectiveTitle}」，排版层级分明，严禁英文乱码与虚浮建模`,
        searchKeywords: [effectiveTitle, '学术期刊封面'],
        status: 'planned',
      })

      // 【中文修复依据】：16:9 宽屏多样化正文插图矩阵（对比看板、流程图谱、数据雷达与实操闭环分析），打破纯场景书桌翻书与讲台摆拍摄影茧房，注入真实文字节点并杜绝空白框
      const CONTENT_IMAGE_STYLES = [
        (topic: string, textAnchors: string) =>
          `16:9 宽屏现代化专业科技信息图表，双栏多维对比分析看板，模块化知识卡片与清晰数据流指示，围绕「${topic}」，极简素雅配色，严谨工整，全中文排版，严禁纯场景静物摆拍、空讲台与随意生活街拍，【卡片文字印制与杜绝空框铁律】：画面必须在对比卡片内清晰印制具体中文评读维度与论点短语（${textAnchors}），绝对严禁只有空背景框、骨架条或灰色占位横线，绝对严禁叠放书本与老花镜等无意义静物`,
        (topic: string, textAnchors: string) =>
          `16:9 宽屏专业实务全流程机制架构图谱与阶段路线图，开阔工整的阶段节点指引，模块化信息拆解，围绕「${topic}」，层次分明，呈现严谨深刻的学术与实操底蕴，全中文排版，严禁纯场景桌面摆拍、空会议室椅子与生活照，【流程节点文字印制与杜绝空框铁律】：画面必须在各流程步骤框内清晰印制具体中文步骤短语（${textAnchors}），排版层次分明，绝对严禁只有空框无文字的骨架线框，严禁红幕布与空讲台摆件`,
        (topic: string, textAnchors: string) =>
          `16:9 宽屏多维核心指标分析雷达与技术参数图解，围绕「${topic}」，高清晰度模块看板，浅色高亮对比，全中文排版，严禁纯场景桌面书本眼镜摆拍、空讲台与随意生活照，【指标卡片文字与杜绝空框铁律】：卡片内必须印制具体中文指标名称（${textAnchors}），绝对严禁无文字空白框`,
        (topic: string, textAnchors: string) =>
          `16:9 宽屏高水准专业实务数字化工作场景与模块化分析看板，聚焦「${topic}」，模块化卡片清晰呈现核心要点（${textAnchors}），极简工整，现代平面设计感，全中文排版，严禁千篇一律翻开书本静物、叠放卷宗与老花镜钢笔等无意义静物照，严禁空白线框`,
      ]

      let subCount = 0
      if (Array.isArray(doc.sections)) {
        for (const sec of doc.sections) {
          const secTitle = String(sec.text || sec.title || '').trim()
          for (const b of (sec.blocks || [])) {
            if (b && typeof b === 'object' && b.img) {
              subCount++
              const caption = String(b.img.caption || '').trim()
              const focusTopic = caption || secTitle || effectiveTitle
              const textAnchors = extractDiagramAnchors(sec, focusTopic)
              const styleFn = CONTENT_IMAGE_STYLES[(subCount - 1) % CONTENT_IMAGE_STYLES.length]!

              targetSlots.push({
                slotId: `content_${idx}_${subCount}`,
                index: idx,
                sub: subCount,
                kind: 'content',
                ratio: '16:9',
                title: effectiveTitle,
                contextText: secTitle,
                intentDescription: `正文插图第 ${subCount} 张：围绕「${focusTopic}」展示高信息密度图解`,
                generationPrompt: styleFn(focusTopic, textAnchors),
                searchKeywords: [focusTopic, effectiveTitle, '信息图表', '对比看板'],
                status: 'planned',
              })
            }
          }
        }
      }
    }
  }

  return targetSlots
}
