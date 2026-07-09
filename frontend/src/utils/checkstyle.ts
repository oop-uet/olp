export interface CheckstyleViolationLike {
  file?: string | null
  line?: number | null
  column?: number | null
  message?: string | null
}

export function deduplicateCheckstyleViolations<T extends CheckstyleViolationLike>(violations: T[]): T[] {
  const unique = new Map<string, T>()

  for (const violation of violations) {
    const message = violation.message ?? ''
    const key = [
      violation.file ?? '',
      violation.line ?? '',
      violation.column ?? '',
      normalizeMessageForDedup(message),
    ].join('|')
    const existing = unique.get(key)

    if (!existing || message.length < (existing.message ?? '').length) {
      unique.set(key, violation)
    }
  }

  return Array.from(unique.values())
}

function normalizeMessageForDedup(message: string) {
  return message
    .replace(/^[A-Za-z]+(?:Check)?:\s*/, '')
    .replace(/\s+Empty blocks may only be represented.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
