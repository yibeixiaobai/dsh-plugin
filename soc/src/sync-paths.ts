import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config.ts'
import { pluginDir, runtimeResourceDir } from './py.ts'
import {
  getGlobalSocialPublisherDir,
  getGlobalAccountsDir,
} from './wincodeHome.ts'

/** 确保工作区项目专属产物目录已配置安全 .gitignore，防止意外提交临时缓存与登录态 */
export function ensureWorkspaceGitignore(dir: string): void {
  try {
    const gitignorePath = path.join(dir, '.gitignore')
    if (!fs.existsSync(gitignorePath)) {
      const gitignoreContent = [
        '# WinCode Social Publisher Local Project Artifacts',
        '# 忽略浏览器运行时临时缓存、调试日志与登录态',
        'accounts/*/profile/',
        'accounts/*/*_profile/',
        '*.log',
        '*.tmp*',
        'chrome_debug/',
        'browser_data/',
        '',
      ].join('\n')
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8')
    }
  } catch {}
}

/**
 * 插件默认任务工作区：
 * 【中文依据】：社媒发布模块的所有产物默认设计放到工作区的项目文件夹。
 * 优先级：显式指定的工作区 > 环境变量 WINCODE_WORKSPACE_PATH / WINCODE_WORKSPACE_PATH > 当前工作目录 process.cwd() > 全局用户目录兜底
 */
export function defaultWorkspaceDir(explicitWorkspace?: string): string {
  // 1. 最高优先级：显式指定的工作区或工作区环境变量
  const projectRoot = (
    explicitWorkspace ||
    process.env.WINCODE_WORKSPACE_PATH
  )?.trim()

  if (projectRoot && path.isAbsolute(projectRoot) && fs.existsSync(projectRoot)) {
    const projectArtifactDir = projectRoot.endsWith('.social-publisher')
      ? projectRoot
      : path.join(projectRoot, '.social-publisher')
    fs.mkdirSync(projectArtifactDir, { recursive: true })
    ensureWorkspaceGitignore(projectArtifactDir)
    return projectArtifactDir
  }

  // 2. 其次读取显式配置的全局社媒任务目录环境变量
  if (process.env.WINCODE_SOCIAL_PUBLISHER_DIR) {
    return path.resolve(process.env.WINCODE_SOCIAL_PUBLISHER_DIR)
  }

  return getGlobalSocialPublisherDir()
}

export function workspaceDir(cfg: Partial<Config> | undefined, explicitWorkspace?: string): string {
  if (explicitWorkspace && path.isAbsolute(explicitWorkspace.trim())) {
    return defaultWorkspaceDir(explicitWorkspace.trim())
  }
  const configured = String(cfg?.runtime?.project_root ?? '').trim()
  if (
    !configured ||
    configured.toLowerCase() === 'default' ||
    configured.toLowerCase() === 'plugin-default' ||
    configured.toLowerCase() === 'workspace'
  ) {
    return defaultWorkspaceDir(explicitWorkspace)
  }
  if (!path.isAbsolute(configured)) throw new Error('任务工作区必须是绝对路径: ' + configured)
  return path.resolve(configured)
}

/** 账号 ID 同时用作目录名，必须是安全字符 */
export function assertAccountId(accountId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(accountId)) throw new Error('非法账号 ID: ' + accountId)
  return accountId
}

/** 按账号隔离的任务产物与配置目录（优先全局单点真值，兼容读取本地旧路径） */
export function accountScriptsDir(cfg: Config, accountId: string): string {
  const localDir = path.join(workspaceDir(cfg), 'accounts', assertAccountId(accountId), 'scripts')
  if (fs.existsSync(localDir)) {
    return localDir
  }
  return path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'scripts')
}

/** 知乎账号的浏览器用户数据目录（系统全局唯一持久化，全项目共享，严禁在项目文件夹建立副本） */
export function zhihuProfileDir(cfg: Config, accountId: string): string {
  void cfg
  return path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'zhihu_profile')
}

/** 微信公众号账号的浏览器用户数据目录（系统全局唯一持久化，全项目共享，严禁在项目文件夹建立副本） */
export function wechatProfileDir(cfg: Config, accountId: string): string {
  void cfg
  return path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'wechat_profile')
}

/** 小红书账号的浏览器用户数据目录（系统全局唯一持久化，全项目共享，严禁在项目文件夹建立副本） */
export function xhsProfileDir(cfg: Config, accountId: string): string {
  void cfg
  return path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'xhs_profile')
}

/** 百家号账号的浏览器用户数据目录（系统全局唯一持久化，全项目共享，严禁在项目文件夹建立副本） */
export function baijiahaoProfileDir(cfg: Config, accountId: string): string {
  void cfg
  return path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'baijiahao_profile')
}

/** 头条号账号的浏览器用户数据目录（系统全局唯一持久化，全项目共享，严禁在项目文件夹建立副本） */
export function toutiaoProfileDir(cfg: Config, accountId: string): string {
  void cfg
  return path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'toutiao_profile')
}

/** 创建任务数据目录；只补插件默认品牌图，不迁移任何旧工作区文件。 */
export function ensureWorkspace(cfg: Config): string {
  const workspace = workspaceDir(cfg)
  const scripts = path.join(workspace, 'scripts')
  const brands = path.join(workspace, 'brand_assets')
  const tests = path.join(workspace, 'gzh_test_images')
  fs.mkdirSync(scripts, { recursive: true })
  fs.mkdirSync(brands, { recursive: true })
  fs.mkdirSync(tests, { recursive: true })
  const isGlobalWorkspace = workspace === getGlobalSocialPublisherDir()
  if (isGlobalWorkspace) {
    for (const id of Object.keys(cfg.accounts)) {
      fs.mkdirSync(accountScriptsDir(cfg, id), { recursive: true })
      fs.mkdirSync(wechatProfileDir(cfg, id), { recursive: true })
      fs.mkdirSync(zhihuProfileDir(cfg, id), { recursive: true })
      fs.mkdirSync(xhsProfileDir(cfg, id), { recursive: true })
      fs.mkdirSync(baijiahaoProfileDir(cfg, id), { recursive: true })
      fs.mkdirSync(toutiaoProfileDir(cfg, id), { recursive: true })
    }
  }
  const defaults = path.join(runtimeResourceDir(), 'default-brand')
  for (const name of ['brand_top.jpg', 'brand_bot.jpg']) {
    const source = path.join(defaults, name)
    const destination = path.join(brands, name)
    if (fs.existsSync(source)) {
      if (!fs.existsSync(destination)) fs.copyFileSync(source, destination)
    } else {
      // 容灾兜底：若源素材不存在，先尝试从上一级备用目录寻找，绝不让默认素材缺失引发致命异常
      const altSource = path.resolve(
        pluginDir(),
        '..',
        '..',
        'packages',
        'social-publisher-plugin',
        'runtime',
        'default-brand',
        name,
      )
      if (fs.existsSync(altSource)) {
        if (!fs.existsSync(destination)) fs.copyFileSync(altSource, destination)
      } else if (!fs.existsSync(destination)) {
        try {
          fs.writeFileSync(destination, Buffer.from([]))
        } catch {}
      }
    }
  }
  return workspace
}

export function scriptsDir(cfg: Config): string {
  return path.join(workspaceDir(cfg), 'scripts')
}

export function brandDir(cfg: Config): string {
  const globalBrand = path.join(getGlobalSocialPublisherDir(), 'brand_assets')
  if (fs.existsSync(globalBrand)) {
    return globalBrand
  }
  return path.join(workspaceDir(cfg), 'brand_assets')
}

export function gzhDesignScriptsDir(cfg: Config): string {
  void cfg
  return path.join(runtimeResourceDir(), 'gzh_design', 'scripts')
}

/** 工作区全量配置文件路径 */
export function publisherConfigPath(cfg: Config): string {
  return path.join(workspaceDir(cfg), 'publisher_config.json')
}

/** 插件根目录任务文件夹兜底全量配置文件路径 */
export function fallbackPublisherConfigPath(): string {
  return path.join(defaultWorkspaceDir(), 'publisher_config.json')
}
