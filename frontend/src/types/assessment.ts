export type AssessmentQuestionType =
  | 'true_false'
  | 'single_choice'
  | 'short_text'
  | 'essay'
  | 'code_analysis'

export type AssessmentGradingMode = 'auto' | 'llm_assisted' | 'manual'

export interface RubricCriterion {
  id?: string
  criterion: string
  points: number
}
export interface AssessmentQuestionDraft {
  id?: string
  type: AssessmentQuestionType
  prompt: string
  points: number
  gradingMode: AssessmentGradingMode
  options?: string[]
  answerKey?: boolean | number
  referenceAnswer?: string
  gradingPrompt?: string
  rubric?: RubricCriterion[]
}

export interface AssessmentSectionDraft {
  id?: string
  title: string
  introContent?: string
  questions: AssessmentQuestionDraft[]
}

export interface AssessmentDraft {
  title: string
  instructions: string
  durationMinutes: number
  totalPoints: number
  shuffleQuestions: boolean
  sections: AssessmentSectionDraft[]
}

export interface AssessmentAssignmentSummary {
  id: string
  sectionId: string
  sectionName: string
  opensAt: string
  closesAt: string
  durationMinutes?: number
  showPredictedScore?: number
  maxAttempts: number
  hasPassword?: boolean
}

export interface InstructorAssessmentListItem {
  id: string
  title: string
  instructions: string
  durationMinutes: number
  totalPoints: number
  creatorUsername?: string | null
  updatedAt: string
  assignments: AssessmentAssignmentSummary[]
}

export interface StudentAssessmentListItem {
  id: string
  title: string
  instructions: string
  sectionId: string
  sectionName: string
  opensAt: string
  closesAt: string
  durationMinutes: number
  totalPoints: number
  maxAttempts: number
  attemptsUsed: number
  requiresPassword?: boolean
  hasPassword?: boolean
  week: number | null
  session: {
    id: string
    status: string
    reviewStatus: string
    predictedScore: number | null
    officialScore: number | null
    attemptNumber: number
  } | null
}
