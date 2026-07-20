/**
 * Utility functions for sorting Vietnamese names correctly.
 *
 * In Vietnamese, names follow the format: Họ + Đệm + Tên (e.g. "Nguyễn Xuân Minh").
 * The convention is to sort by the last word (Tên/given name), not the first word (Họ/family name).
 */

/**
 * Extracts the given name (last word) from a full Vietnamese name.
 * e.g. "Nguyễn Xuân Minh" → "Minh", "Lê Thị Bảo" → "Bảo"
 */
export function vietnameseGivenName(fullName: string | null | undefined): string {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1]
}

/**
 * Compares two full Vietnamese names by their given name (last word),
 * using Vietnamese locale for correct diacritic ordering.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 *
 * Tiebreak: if given names are equal, compare full names.
 */
export function compareByVietnameseName(
  aName: string | null | undefined,
  bName: string | null | undefined
): number {
  const givenA = vietnameseGivenName(aName)
  const givenB = vietnameseGivenName(bName)
  const cmp = givenA.localeCompare(givenB, 'vi', { sensitivity: 'base' })
  if (cmp !== 0) return cmp
  // Tiebreak: full name comparison
  return (aName || '').localeCompare(bName || '', 'vi', { sensitivity: 'base' })
}
