import { z } from 'zod/v4'

/** 投票請求驗證 Schema */
export const voteSchema = z.object({
  round_id: z.string().uuid(),
  target_table_id: z.string().uuid().optional(),
  target_group_id: z.string().uuid().optional(),
  score: z.number().int().min(1).max(10).optional(),
  answer: z.string().max(200).optional(),
})

export type VoteInput = z.infer<typeof voteSchema>

/** 防作弊檢查結果 */
export interface AntiCheatResult {
  passed: boolean
  error?: string
}

/**
 * 檢查投票者是否在試圖評自己的桌/組
 */
export function checkSelfVote(
  voterTableId: string,
  targetTableId: string | undefined,
  targetGroupId: string | undefined,
  voterGroupIds: string[],
  allowSelfVote: boolean
): AntiCheatResult {
  if (allowSelfVote) return { passed: true }

  // 桌級檢查
  if (targetTableId && voterTableId === targetTableId) {
    return { passed: false, error: '不能評自己的桌' }
  }

  // 組級檢查
  if (targetGroupId && voterGroupIds.includes(targetGroupId)) {
    return { passed: false, error: '不能評自己的組' }
  }

  return { passed: true }
}

/**
 * 驗證回合是否開放投票
 */
export function checkRoundOpen(roundStatus: string): AntiCheatResult {
  if (roundStatus !== 'open') {
    return { passed: false, error: '投票尚未開始或已結束' }
  }
  return { passed: true }
}
