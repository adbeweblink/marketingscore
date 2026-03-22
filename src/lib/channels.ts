/**
 * #11 fix: 統一 Realtime channel 命名常數
 * 所有 subscribe 和 broadcast 都透過此物件，消除手打字串的不一致
 */
export const CHANNELS = {
  /** 分數更新（大螢幕 + 手機排行榜訂閱） */
  scores: (code: string) => `event:${code}`,

  /** 回合狀態變更（所有端訂閱） */
  roundStatus: (code: string) => `round:${code}`,

  /** 主持人指令（所有端訂閱） */
  control: (code: string) => `control:${code}`,
} as const
