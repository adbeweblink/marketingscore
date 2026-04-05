import type { GameEngine } from '@/types/game'
import type { RoundType } from '@/types/database'

/** 遊戲引擎註冊表 */
const engines: Map<RoundType, GameEngine> = new Map()

export function registerEngine(engine: GameEngine) {
  engines.set(engine.type, engine)
}

export function getEngine(type: RoundType): GameEngine {
  const engine = engines.get(type)
  // custom 類型 fallback 到 scoring engine
  if (!engine) {
    const fallback = engines.get('scoring')
    if (fallback) return fallback
    throw new Error(`未知的遊戲模式: ${type}`)
  }
  return engine
}

export { engines }
