import { z } from 'zod/v4'
import type { RoundStatus } from '@/types/database'

/** 投票請求驗證 Schema（#14 fix: 至少一個 target 必填） */
export const voteSchema = z.object({
  round_id: z.string().uuid(),
  target_table_id: z.string().uuid().optional(),
  target_group_id: z.string().uuid().optional(),
  score: z.number().int().min(1).max(10).optional(),
  answer: z.string().trim().min(1).max(200).optional(),
}).refine(
  data => !!(data.target_table_id || data.target_group_id),
  { message: '必須指定投票目標' }
)

export type VoteInput = z.infer<typeof voteSchema>

export interface AntiCheatResult {
  passed: boolean
  error?: string
}

export function checkSelfVote(
  voterTableId: string,
  targetTableId: string | undefined,
  targetGroupId: string | undefined,
  voterGroupIds: string[],
  allowSelfVote: boolean
): AntiCheatResult {
  if (allowSelfVote) return { passed: true }

  if (targetTableId && voterTableId === targetTableId) {
    return { passed: false, error: '不能評自己的桌' }
  }

  if (targetGroupId && voterGroupIds.includes(targetGroupId)) {
    return { passed: false, error: '不能評自己的組' }
  }

  return { passed: true }
}

/** #26 fix: 參數型別改為 RoundStatus */
export function checkRoundOpen(roundStatus: RoundStatus): AntiCheatResult {
  if (roundStatus !== 'open') {
    return { passed: false, error: '投票尚未開始或已結束' }
  }
  return { passed: true }
}
