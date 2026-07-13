const SUBMISSION_NOTE_KEYWORDS = [
  'repository',
  'github',
  'collaborator',
  'oasis-uet',
  'giảng viên thực hành',
  '.idea',
  'target',
  'out',
]

function isSubmissionNoteHeading(line: string) {
  const normalized = line.trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ')
  return (
    normalized === 'yêu cầu nộp bài:' ||
    normalized === 'yêu cầu nộp bài' ||
    (normalized.startsWith('chú ý') && normalized.includes('nộp bài'))
  )
}

function isLikelySubmissionNoteLine(line: string) {
  const normalized = line.trim().toLocaleLowerCase('vi-VN')
  return SUBMISSION_NOTE_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

export function stripProjectSubmissionNotes(description: string) {
  const lines = description.split(/\r?\n/)
  const keptLines: string[] = []
  let skippingSubmissionNotes = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (isSubmissionNoteHeading(trimmed)) {
      skippingSubmissionNotes = true
      continue
    }

    if (skippingSubmissionNotes) {
      if (!trimmed) continue
      if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed) || isLikelySubmissionNoteLine(trimmed)) {
        continue
      }
      skippingSubmissionNotes = false
    }

    keptLines.push(line)
  }

  return keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
