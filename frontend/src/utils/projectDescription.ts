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

export const DEFAULT_PROJECT_SUBMISSION_REQUIREMENTS = [
  'Yêu cầu nộp bài:',
  '- Nộp URL repository GitHub của nhóm.',
  '- Repository để private và thêm `oasis-uet` làm collaborator.',
  '- Không đẩy thư mục `.idea`, `target`, `out` hoặc file build lên repository.',
].join('\n')

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

function isLikelySubmissionNoteContinuation(line: string) {
  const trimmed = line.trim()
  return /^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed) || isLikelySubmissionNoteLine(trimmed)
}

export function extractProjectSubmissionRequirements(description: string) {
  const lines = description.split(/\r?\n/)
  const extractedLines: string[] = []
  let collectingSubmissionNotes = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (isSubmissionNoteHeading(trimmed)) {
      collectingSubmissionNotes = true
      extractedLines.push(line)
      continue
    }

    if (!collectingSubmissionNotes) continue
    if (!trimmed) {
      if (extractedLines.length > 0 && extractedLines[extractedLines.length - 1].trim()) {
        extractedLines.push(line)
      }
      continue
    }

    if (isLikelySubmissionNoteContinuation(trimmed)) {
      extractedLines.push(line)
      continue
    }

    break
  }

  return extractedLines.join('\n').trim()
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
      if (isLikelySubmissionNoteContinuation(trimmed)) {
        continue
      }
      skippingSubmissionNotes = false
    }

    keptLines.push(line)
  }

  return keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function mergeProjectDescriptionAndRequirements(description: string, requirements: string) {
  const cleanDescription = stripProjectSubmissionNotes(description).trim()
  const cleanRequirements = requirements.trim()

  if (!cleanRequirements) return cleanDescription

  const requirementsWithHeading = isSubmissionNoteHeading(cleanRequirements.split(/\r?\n/)[0] ?? '')
    ? cleanRequirements
    : `Yêu cầu nộp bài:\n${cleanRequirements}`

  return [cleanDescription, requirementsWithHeading].filter(Boolean).join('\n\n')
}
