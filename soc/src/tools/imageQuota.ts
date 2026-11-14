import { getWinCodeHome } from '../wincodeHome.ts'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface DeductionRecord {
  filePath: string
  deductedMonthly: number
  deductedAddOn: number
  profile: any
}

export function resolveMembershipFilePath(): string {
  if (process.env.WINCODE_MEMBERSHIP_DIR) {
    return path.join(process.env.WINCODE_MEMBERSHIP_DIR, 'membership_state.json')
  }
  return path.join(getWinCodeHome(), 'v2', 'membership', 'membership_state.json')
}

export function checkAndDeductQuotaDirect(count: number): DeductionRecord | null {
  const filePath = resolveMembershipFilePath()
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const profile = JSON.parse(raw)
    if (!profile || !profile.imageQuota) return null

    const monthlyAvailable = Math.max(
      0,
      (profile.imageQuota.monthlyTotal || 0) - (profile.imageQuota.monthlyUsed || 0),
    )
    const addOnAvailable = Math.max(
      0,
      (profile.imageQuota.addOnTotal || 0) - (profile.imageQuota.addOnUsed || 0),
    )
    const totalAvail = monthlyAvailable + addOnAvailable

    if (totalAvail < count) {
      throw new Error(
        `[官方生图 T点不足拦截] 当前可用 T点不足 (本次官方生图需扣除 ${count} 点，当前剩余 ${totalAvail} 点)。支持购买 9.9 元 50 点 T点加油包，或升级高级会员畅享月度赠送 T点。您也可以在「模型设置」中配置自备第三方生图模型，自备模型完全免费不消耗任何 T点。`,
      )
    }

    let deductedMonthly = 0
    let deductedAddOn = 0
    if (monthlyAvailable >= count) {
      deductedMonthly = count
      profile.imageQuota.monthlyUsed += count
    } else {
      deductedMonthly = monthlyAvailable
      profile.imageQuota.monthlyUsed += monthlyAvailable
      deductedAddOn = count - monthlyAvailable
      profile.imageQuota.addOnUsed += count - monthlyAvailable
    }
    profile.imageQuota.availableCount = totalAvail - count

    // [中文修复依据]：
    // 生图配额扣减时原子向 profile.transactions 账本追加明细，
    // 包含扣减类型 consume_image_quota、消耗数量、结余快照及时间戳，彻底解决额度流水无记录问题。
    const tx = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'consume_image_quota',
      title: `AI 配图生成 (-${count} 点)`,
      changeValue: -count,
      unit: 'quota',
      balanceSnapshot: profile.imageQuota.availableCount,
      createdAt: new Date().toISOString(),
      meta: { count, deductedMonthly, deductedAddOn },
    }
    if (!Array.isArray(profile.transactions)) {
      profile.transactions = []
    }
    profile.transactions.unshift(tx)
    if (profile.transactions.length > 100) {
      profile.transactions = profile.transactions.slice(0, 100)
    }

    fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8')
    return { filePath, deductedMonthly, deductedAddOn, profile }
  } catch (err: any) {
    if (err.message && err.message.includes('[会员生图额度拦截]')) {
      throw err
    }
    return null
  }
}

export function rollbackQuotaDirect(record: DeductionRecord | null): void {
  if (!record) return
  try {
    const { filePath, deductedMonthly, deductedAddOn, profile } = record
    profile.imageQuota.monthlyUsed = Math.max(
      0,
      (profile.imageQuota.monthlyUsed || 0) - deductedMonthly,
    )
    profile.imageQuota.addOnUsed = Math.max(0, (profile.imageQuota.addOnUsed || 0) - deductedAddOn)
    profile.imageQuota.availableCount =
      Math.max(0, (profile.imageQuota.monthlyTotal || 0) - profile.imageQuota.monthlyUsed) +
      Math.max(0, (profile.imageQuota.addOnTotal || 0) - profile.imageQuota.addOnUsed)

    // [中文修复依据]：生图失败回滚配额时同步追加 rollback_image_quota 返还流水明细
    const refundCount = deductedMonthly + deductedAddOn
    if (refundCount > 0) {
      const rollbackTx = {
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'rollback_image_quota',
        title: `生图失败配额返还 (+${refundCount} 点)`,
        changeValue: refundCount,
        unit: 'quota',
        balanceSnapshot: profile.imageQuota.availableCount,
        createdAt: new Date().toISOString(),
        meta: { refundCount },
      }
      if (!Array.isArray(profile.transactions)) {
        profile.transactions = []
      }
      profile.transactions.unshift(rollbackTx)
      if (profile.transactions.length > 100) {
        profile.transactions = profile.transactions.slice(0, 100)
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8')
  } catch {
    // 忽略回滚写入异常
  }
}
