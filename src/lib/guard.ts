export interface QueryAnalysis {
  isSelect: boolean
  hasLimit: boolean
  hasTimeFilter: boolean
  isDangerous: boolean
}

/** 去除字符串字面量，避免把字面量内容误判为关键字/时间条件 */
function stripLiterals(sql: string): string {
  return sql.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
}

const DANGEROUS = /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE|INSERT)\b/i

export function analyzeQuery(raw: string): QueryAnalysis {
  const sql = stripLiterals(raw).trim()
  const head = sql.replace(/^\(*\s*/, '').slice(0, 12).toUpperCase()
  const isSelect = head.startsWith('SELECT')
  return {
    isSelect,
    hasLimit: /\bLIMIT\b/i.test(sql),
    hasTimeFilter: /\btime\b\s*(>=|>|<=|<|=|between)/i.test(sql) || /\bWHERE\b[\s\S]*\btime\b/i.test(sql),
    isDangerous: DANGEROUS.test(sql),
  }
}

/** SELECT 且无 LIMIT 时追加 LIMIT，处理末尾分号/空白 */
export function ensureLimit(raw: string, limit: number): string {
  const a = analyzeQuery(raw)
  if (!a.isSelect || a.hasLimit) return raw
  const trimmed = raw.replace(/\s*;\s*$/, '').trimEnd()
  return `${trimmed} LIMIT ${limit}`
}
