import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'

const JWT_SECRET = process.env.PARTICIPANT_JWT_SECRET || process.env.ADMIN_SECRET_KEY || 'dev-fallback-change-me'

interface ParticipantPayload {
  sub: string        // participant_id
  event_id: string
  table_id: string
  table_number: number
}

/** 簽發參與者 JWT（加入活動時呼叫） */
export function signParticipantToken(payload: ParticipantPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' })
}

/** 驗證並解析參與者 JWT */
export function verifyParticipantToken(token: string): ParticipantPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as ParticipantPayload
  } catch {
    return null
  }
}

/** 驗證 admin key */
export function verifyAdminKey(key: string | null): boolean {
  return key === process.env.ADMIN_SECRET_KEY
}

/** 產生密碼學安全的活動代碼 */
export function generateSecureEventCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(bytes[i] % chars.length)
  }
  return code
}
