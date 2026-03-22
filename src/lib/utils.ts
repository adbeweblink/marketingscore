import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 格式化分數（保留一位小數） */
export function formatScore(score: number): string {
  return score % 1 === 0 ? score.toString() : score.toFixed(1)
}

// generateEventCode 已移至 auth.ts（使用 crypto-safe random #17 fix）
