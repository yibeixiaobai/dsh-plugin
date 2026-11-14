// 模块级动态捕获的用户主目录基准（用于前端渲染进程中缺失 process.env.USERPROFILE 时的自愈探测）
let dynamicDetectedHomeDir: string | undefined

/**
 * 构造跨工作区、用户持久化数据目录及插件规范任务目录的多级候选绝对路径探针
 * 【核心规约】：
 * 1. 严格账号隔离：指定 accountId 时仅探测当前账号，禁止向其它账号扩散；
 * 2. 沙箱物理闭环：位于 tasks/active/ 或 tasks/archive/ 的任务沙箱严禁向全局 ~/.wincode 或其它任务目录 fallback 旧图；
 * 3. 别名互探：支持 pic_1 <-> pic_1_1, cover_1.png <-> cover_1.jpg 等规范别名；
 * 4. 品牌图严格独立：账号品牌图仅探测当前账号专属 brand_assets，账号未配置时绝不 fallback 到历史公共黑框 IT 模板图。
 */
export function resolveCandidatePaths(
  inputPath: string,
  workspacePath?: string,
  accountId?: string,
  scriptsDir?: string,
): string[] {
  const candidates: string[] = []
  const cleanInput = inputPath.replace(/[`"']/g, '').trim()
  const isAbs = /^[a-zA-Z]:[\\/]/.test(cleanInput) || cleanInput.startsWith('/')

  const normClean = cleanInput.replace(/\\/g, '/')
  const normWs = workspacePath ? workspacePath.replace(/\\/g, '/').replace(/\/+$/, '') : undefined
  const normSd = scriptsDir ? scriptsDir.replace(/\\/g, '/').replace(/\/+$/, '') : undefined

  // 【中文修复依据】：严格项目与沙箱边界校验。若绝对路径带有 tasks/ 或 accounts/ 特征，
  // 必须严格属于当前工作区 normWs 或当前任务沙箱 normSd；若属于外部其它项目目录，硬性剔除，彻底杜绝跨项目旧图渗透
  let isAllowedAbs = true
  if (isAbs) {
    const isSandboxRelated = /\/(?:tasks|accounts)\//i.test(normClean)
    if (isSandboxRelated) {
      const belongsToWs = Boolean(normWs && (normClean === normWs || normClean.startsWith(normWs + '/')))
      const belongsToSd = Boolean(normSd && (normClean === normSd || normClean.startsWith(normSd + '/')))
      if (!belongsToWs && !belongsToSd) {
        isAllowedAbs = false
      }
    }
  }

  if (isAbs && isAllowedAbs) {
    candidates.push(cleanInput)
    candidates.push(cleanInput.replace(/\//g, '\\'))
    candidates.push(cleanInput.replace(/\\/g, '/'))
    // 捕获用户真实 Home 根目录
    const homeMatch = cleanInput.match(/^([a-zA-Z]:[\\/]Users[\\/][^\\/]+)/i)
    if (homeMatch && homeMatch[1]) {
      dynamicDetectedHomeDir = homeMatch[1].replace(/\\/g, '/')
    }
  }

  if (scriptsDir) {
    const sHomeMatch = scriptsDir.match(/^([a-zA-Z]:[\\/]Users[\\/][^\\/]+)/i)
    if (sHomeMatch && sHomeMatch[1]) {
      dynamicDetectedHomeDir = sHomeMatch[1].replace(/\\/g, '/')
    }
  }

  const rawFileName = cleanInput.replace(/^.*[\\/]/, '')
  const candidateFileNames = new Set<string>()

  if (rawFileName) {
    candidateFileNames.add(rawFileName)

    // 1. 扩展名互通兼容（png <-> jpg <-> jpeg <-> webp）
    const extMatch = rawFileName.match(/\.(png|jpg|jpeg|webp)$/i)
    const baseName = extMatch ? rawFileName.slice(0, -extMatch[0].length) : rawFileName
    if (extMatch) {
      candidateFileNames.add(`${baseName}.png`)
      candidateFileNames.add(`${baseName}.jpg`)
      candidateFileNames.add(`${baseName}.jpeg`)
      candidateFileNames.add(`${baseName}.webp`)
    }

    // 2. 小绿书竖版卡片命名别名深度互探（【中文修复依据】：严格仅限 cardIdx === "1" 或明确单篇小绿书时互通，严禁将长文篇序号 pic_2/pic_3 映射为 pic_1_2，杜绝跨篇借图）
    const picSingleMatch = baseName.match(/^pic_(\d+)$/i)
    if (picSingleMatch && picSingleMatch[1]) {
      const cardIdx = picSingleMatch[1]
      // 只有 1 允许作为首张卡片兼容别名
      if (cardIdx === '1') {
        candidateFileNames.add('pic_1_1.png')
        candidateFileNames.add('pic_1_1.jpg')
        candidateFileNames.add('xhs_pic_1_1.png')
        candidateFileNames.add('xhs_pic_1_1.jpg')
      }
    }

    const picDoubleMatch = baseName.match(/^(?:pic|xhs_pic)_(\d+)_(\d+)$/i)
    if (picDoubleMatch && picDoubleMatch[1] && picDoubleMatch[2]) {
      const artIdx = picDoubleMatch[1]
      const cardIdx = picDoubleMatch[2]
      candidateFileNames.add(`pic_${artIdx}_${cardIdx}.png`)
      candidateFileNames.add(`pic_${artIdx}_${cardIdx}.jpg`)
      candidateFileNames.add(`xhs_pic_${artIdx}_${cardIdx}.png`)
      candidateFileNames.add(`xhs_pic_${artIdx}_${cardIdx}.jpg`)
      // 仅首篇长文/笔记允许兼容短名 pic_${cardIdx}
      if (artIdx === '1') {
        candidateFileNames.add(`pic_${cardIdx}.png`)
        candidateFileNames.add(`pic_${cardIdx}.jpg`)
      }
    }

    // 3. 正文插图与封面扩展名互探
    const contentMatch = baseName.match(/^content_(\d+)_(\d+)$/i)
    if (contentMatch) {
      candidateFileNames.add(`${baseName}.png`)
      candidateFileNames.add(`${baseName}.jpg`)
    }
    const coverMatch = baseName.match(/^cover_(\d+)$/i)
    if (coverMatch) {
      candidateFileNames.add(`${baseName}.png`)
      candidateFileNames.add(`${baseName}.jpg`)
    }
  }

  // 【修复原因】：严格账号隔离！当明确指定 accountId 时，仅探测该账号，绝不向其它账号扩散
  const uniqueAccs = accountId ? [accountId] : ['default']
  const fileNames = Array.from(candidateFileNames)

  // 判断是否为品牌图（brand_top / brand_bot）
  const isBrandAsset = fileNames.some(fn => /^brand_/i.test(fn))

  // 1. 若明确识别出了构建生成物所在的 scriptsDir 或 imagesDir，最高优先级探测
  if (scriptsDir) {
    const normScripts = scriptsDir.replace(/\\/g, '/').replace(/\/+$/, '')
    // 【中文修复依据】：社媒沙箱多层级穿透探针！当 scriptsDir 为任务根目录时，
    // 真实产物实际落盘在 ${platform}_${accountId}/ 与 ${accountId}/ 子目录中（如 gzh_default-copy/images/cover_2.png）。
    // 将平台账号子目录作为最高优先级优先探测，彻底解决次条长文封面因找不到子目录而误报破图的问题。
    const subDirs: string[] = []
    if (accountId) {
      const cleanAcc = accountId.trim()
      const platforms = ['gzh', 'xiaohongshu', 'zhihu', 'baijiahao', 'toutiao']
      for (const p of platforms) {
        subDirs.push(`${p}_${cleanAcc}`)
      }
      subDirs.push(cleanAcc)
    }
    for (const sd of subDirs) {
      for (const fName of fileNames) {
        candidates.push(`${normScripts}/${sd}/${fName}`)
        candidates.push(`${normScripts}/${sd}/images/${fName}`)
        candidates.push(`${normScripts}/${sd}/articles/${fName}`)
      }
    }

    // 【中文修复依据】：规范化沙箱结构直达。严格沙箱闭环，优先命中当前沙箱及其 images/ 与 articles/ 目录
    for (const fName of fileNames) {
      candidates.push(`${normScripts}/${fName}`)
      candidates.push(`${normScripts}/images/${fName}`)
      candidates.push(`${normScripts}/articles/${fName}`)
      // 【中文修复依据】：沙箱多级结构全覆盖探测，切除 articles/images/scripts 后同时探测父级、images 兄弟目录与根目录
      if (normScripts.endsWith('/articles')) {
        const parent = normScripts.slice(0, -9)
        candidates.push(`${parent}/${fName}`)
        candidates.push(`${parent}/images/${fName}`)
        candidates.push(`${parent}/scripts/${fName}`)
      } else if (normScripts.endsWith('/images')) {
        const parent = normScripts.slice(0, -7)
        candidates.push(`${parent}/${fName}`)
        candidates.push(`${parent}/articles/${fName}`)
        candidates.push(`${parent}/scripts/${fName}`)
      } else if (normScripts.endsWith('/scripts')) {
        const parent = normScripts.slice(0, -8)
        candidates.push(`${parent}/${fName}`)
        candidates.push(`${parent}/images/${fName}`)
        candidates.push(`${parent}/articles/${fName}`)
      }
      const taskBase = normScripts.replace(/accounts[\\/][^\\/]+[\\/]scripts.*$/, '')
      if (taskBase && taskBase !== normScripts) {
        candidates.push(`${taskBase}brand_assets/${fName}`)
        candidates.push(`${taskBase}default-brand/${fName}`)
      }
    }
  }

  // 2. 品牌资产探测通道（仅限 brand_ assets，支持读取账号级专属与默认品牌图）
  if (isBrandAsset) {
    const homeDir =
      (typeof process !== 'undefined' ? ((process.env as any)?.USERPROFILE || (process.env as any)?.HOME) : undefined) ||
      dynamicDetectedHomeDir

    if (homeDir) {
      const normHome = homeDir.replace(/\\/g, '/').replace(/\/+$/, '')
      if (!isAbs && cleanInput.includes('/')) {
        candidates.push(`${normHome}/.wincode/v2/social-publisher/tasks/default/${cleanInput}`)
        candidates.push(`${normHome}/.wincode/v2/social-publisher/${cleanInput}`)
        candidates.push(`${normHome}/.wincode/social-publisher/${cleanInput}`)
      }
      for (const fName of fileNames) {
        for (const acc of uniqueAccs) {
          candidates.push(
            `${normHome}/.wincode/v2/social-publisher/tasks/default/accounts/${acc}/brand_assets/${fName}`,
          )
          candidates.push(
            `${normHome}/.wincode/v2/social-publisher/accounts/${acc}/brand_assets/${fName}`,
          )
          candidates.push(
            `${normHome}/.wincode/social-publisher/accounts/${acc}/brand_assets/${fName}`,
          )
        }
        // 【中文修复依据】：严禁向全局 tasks/default/brand_assets 探测，账号未配置专属品牌图时保持纯净，杜绝跨号错用
      }
    }

    // 工作区级品牌资产探测
    if (workspacePath) {
      const normW = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')
      if (!isAbs && cleanInput.includes('/')) {
        candidates.push(`${normW}/.wincode/social-publisher/${cleanInput}`)
        candidates.push(`${normW}/.social-publisher/tasks/default/${cleanInput}`)
        candidates.push(`${normW}/${cleanInput}`)
      }
      for (const fName of fileNames) {
        for (const acc of uniqueAccs) {
          candidates.push(`${normW}/accounts/${acc}/brand_assets/${fName}`)
          candidates.push(`${normW}/.wincode/social-publisher/accounts/${acc}/brand_assets/${fName}`)
          candidates.push(`${normW}/.social-publisher/tasks/default/accounts/${acc}/brand_assets/${fName}`)
          candidates.push(`${normW}/.social-publisher/accounts/${acc}/brand_assets/${fName}`)
        }
        // 【中文修复依据】：严禁向工作区公共 brand_assets 探测，必须归属于 accounts/<acc>/brand_assets/，杜绝跨号错用
      }
    }
  }

  return [...new Set(candidates)]
}
