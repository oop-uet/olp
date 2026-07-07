const ROMAN_SEMESTERS: Record<number, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
}

export function parseSemesterId(semester: string): { startYear: number; endYear: number; hk: number } | null {
  const canonical = semester.match(/^(\d{4})-(\d{4})-HK([123])$/i)
  if (canonical) {
    return {
      startYear: Number(canonical[1]),
      endYear: Number(canonical[2]),
      hk: Number(canonical[3]),
    }
  }

  const readable = semester.match(/Học kỳ (I|II|III|[123])(?: năm học)? (\d{4})-(\d{4})/i)
  if (readable) {
    const raw = readable[1].toUpperCase()
    const hk = raw === 'I' || raw === '1' ? 1 : raw === 'II' || raw === '2' ? 2 : 3
    return {
      startYear: Number(readable[2]),
      endYear: Number(readable[3]),
      hk,
    }
  }

  return null
}

export function formatSemesterDisplayName(semester: string, uppercase = false): string {
  const parsed = parseSemesterId(semester)
  if (!parsed) return uppercase ? semester.toUpperCase() : semester

  const label = `Học kỳ ${ROMAN_SEMESTERS[parsed.hk] ?? parsed.hk} năm học ${parsed.startYear}-${parsed.endYear}`
  return uppercase ? label.toUpperCase() : label
}

export function getSemesterCompactPrefix(semester: string): string {
  const parsed = parseSemesterId(semester)
  if (!parsed) return ''
  return `${ROMAN_SEMESTERS[parsed.hk] ?? parsed.hk}${String(parsed.startYear).slice(2)}${String(parsed.endYear).slice(2)}`
}

export function stripSemesterCompactPrefix(sectionName: string): string {
  return sectionName.trim().replace(/^(?:I|II|III)\d{4}\s+/i, '').trim()
}

export function formatSectionDisplayName(sectionName: string): string {
  const withoutSemester = stripSemesterCompactPrefix(sectionName).replace(/\s+/g, ' ').trim()
  const duplicateCode = withoutSemester.match(/^(.+?)\s*-\s*\1\s*-\s*(.+)$/i)
  if (duplicateCode) return `${duplicateCode[1]} - ${duplicateCode[2]}`
  return withoutSemester
}

export function normalizePreviewSectionName(sectionName: string, semester: string): string {
  const prefix = getSemesterCompactPrefix(semester)
  const baseName = stripSemesterCompactPrefix(sectionName)
  if (!prefix || !baseName) return sectionName.trim()
  return `${prefix} ${baseName}`
}
