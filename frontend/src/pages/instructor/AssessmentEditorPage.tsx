import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { readApiError } from '../../lib/apiError'
import { PageLoader } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import type {
  AssessmentDraft,
  AssessmentGradingMode,
  AssessmentQuestionDraft,
  AssessmentQuestionType,
  AssessmentSectionDraft,
} from '../../types/assessment'

const TYPE_LABELS: Record<AssessmentQuestionType, string> = {
  true_false: 'Đúng / Sai',
  single_choice: 'Một lựa chọn',
  short_text: 'Trả lời ngắn',
  essay: 'Tự luận',
  code_analysis: 'Phân tích mã Java',
}

function newQuestion(type: AssessmentQuestionType = 'true_false'): AssessmentQuestionDraft {
  if (type === 'true_false') {
    return { type, prompt: '', points: 0.2, gradingMode: 'auto', answerKey: true }
  }
  if (type === 'single_choice') {
    return {
      type,
      prompt: '',
      points: 0.4,
      gradingMode: 'auto',
      options: ['', '', ''],
      answerKey: 0,
    }
  }
  return {
    type,
    prompt: '',
    points: 1,
    gradingMode: 'llm_assisted',
    referenceAnswer: '',
    gradingPrompt: '',
    rubric: [{ id: 'criterion-1', criterion: 'Nội dung chính xác theo đáp án gợi ý', points: 1 }],
  }
}

const initialDraft: AssessmentDraft = {
  title: 'Kiểm tra giữa kỳ OOP',
  instructions: 'Thời gian làm bài 90 phút. Không được sử dụng tài liệu.',
  durationMinutes: 90,
  totalPoints: 10,
  sections: [{ title: 'Câu 1', introContent: '', questions: [newQuestion()] }],
}

interface LoadedQuestion {
  type: AssessmentQuestionType
  prompt: string
  points: number
  gradingMode: AssessmentGradingMode
  options?: Array<{ content: string }>
  answerKey?: boolean | number | null
  referenceAnswer?: string | null
  gradingPrompt?: string | null
  rubric?: AssessmentQuestionDraft['rubric']
}

interface LoadedSection {
  title: string
  introContent?: string | null
  questions?: LoadedQuestion[]
}

interface LoadedAssessment {
  title: string
  instructions?: string | null
  durationMinutes: number
  totalPoints: number
  sections?: LoadedSection[]
}

function normalizeLoaded(data: LoadedAssessment): AssessmentDraft {
  return {
    title: data.title,
    instructions: data.instructions ?? '',
    durationMinutes: data.durationMinutes,
    totalPoints: data.totalPoints,
    sections: (data.sections ?? []).map((section) => ({
      title: section.title,
      introContent: section.introContent ?? '',
      questions: (section.questions ?? []).map((question) => ({
        type: question.type,
        prompt: question.prompt,
        points: question.points,
        gradingMode: question.gradingMode,
        options: question.options?.map((option) => option.content) ?? [],
        answerKey: question.answerKey ?? undefined,
        referenceAnswer: question.referenceAnswer ?? '',
        gradingPrompt: question.gradingPrompt ?? '',
        rubric: question.rubric ?? [],
      })),
    })),
  }
}

export function AssessmentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<AssessmentDraft>(initialDraft)
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [importingTemplate, setImportingTemplate] = useState(false)
  const [importWarnings, setImportWarnings] = useState<string[]>([])
  const templateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    api
      .get(`/api/instructor/assessments/${id}`)
      .then((response) => setDraft(normalizeLoaded(response.data.data)))
      .catch(() => toast.error('Không thể tải bản nháp bài kiểm tra.'))
      .finally(() => setLoading(false))
  }, [id])

  const actualTotal = useMemo(
    () =>
      Math.round(
        draft.sections.reduce(
          (sum, section) => sum + section.questions.reduce((part, question) => part + Number(question.points || 0), 0),
          0
        ) * 100
      ) / 100,
    [draft.sections]
  )

  function updateSection(sectionIndex: number, next: AssessmentSectionDraft) {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section, index) => (index === sectionIndex ? next : section)),
    }))
  }

  function addSection() {
    setDraft((current) => ({
      ...current,
      sections: [
        ...current.sections,
        { title: `Câu ${current.sections.length + 1}`, introContent: '', questions: [newQuestion('essay')] },
      ],
    }))
  }

  function removeSection(index: number) {
    if (draft.sections.length === 1) return
    setDraft((current) => ({ ...current, sections: current.sections.filter((_, i) => i !== index) }))
  }

  async function downloadTemplate() {
    setDownloadingTemplate(true)
    try {
      const response = await api.get('/api/instructor/assessments/template', { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = 'uet-oop-midterm-2020-2021-assessment-template.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Đã tải template Excel từ đề giữa kỳ mẫu.')
    } catch {
      toast.error('Không thể tải template bài kiểm tra.')
    } finally {
      setDownloadingTemplate(false)
    }
  }

  function chooseTemplate() {
    if (!window.confirm('Import sẽ thay thế nội dung đang có trong trình soạn thảo. Bạn muốn tiếp tục?')) return
    templateInputRef.current?.click()
  }

  async function importTemplate(file: File) {
    setImportingTemplate(true)
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      const response = await api.post('/api/instructor/assessments/import-template', {
        filename: file.name,
        fileBase64,
      })
      setDraft(response.data.data as AssessmentDraft)
      setImportWarnings(response.data.warnings ?? [])
      toast.success(`Đã import ${response.data.data.sections.length} phần vào trình soạn thảo.`)
    } catch (error: unknown) {
      const apiError = readApiError(error)
      toast.error(
        Array.isArray(apiError.details)
          ? apiError.details.slice(0, 3).join(' ')
          : apiError.message ?? 'Không thể import template Excel.'
      )
    } finally {
      setImportingTemplate(false)
      if (templateInputRef.current) templateInputRef.current.value = ''
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = id
        ? await api.put(`/api/instructor/assessments/${id}`, draft)
        : await api.post('/api/instructor/assessments', draft)
      toast.success('Đã lưu bản nháp bài kiểm tra.')
      if (!id) navigate(`/instructor/exercises/assessments/${response.data.data.id}/edit`, { replace: true })
    } catch (error: unknown) {
      const apiError = readApiError(error)
      toast.error(Array.isArray(apiError.details) ? apiError.details.join(' ') : apiError.message ?? 'Không thể lưu đề.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Đang tải trình tạo đề..." />

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/instructor/exercises?tab=assessments" className="text-sm font-semibold text-primary hover:underline">
            ← Quay lại danh sách
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{id ? 'Sửa bài kiểm tra' : 'Tạo bài kiểm tra'}</h1>
          <p className="mt-1 text-sm text-slate-500">Tải đề mẫu Excel, chỉnh sửa rồi import để nạp toàn bộ câu hỏi vào đây.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={templateInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importTemplate(file)
            }}
          />
          <button type="button" onClick={() => void downloadTemplate()} disabled={downloadingTemplate} className="btn-secondary">
            {downloadingTemplate ? 'Đang tải...' : 'Tải template Excel'}
          </button>
          <button type="button" onClick={chooseTemplate} disabled={importingTemplate} className="btn-secondary">
            {importingTemplate ? 'Đang import...' : 'Import từ Excel'}
          </button>
          <button type="submit" disabled={saving || importingTemplate} className="btn-primary">
            {saving ? 'Đang lưu...' : 'Lưu bản nháp'}
          </button>
        </div>
      </div>

      {importWarnings.length > 0 && (
        <details className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <summary className="cursor-pointer font-bold">
            Template đã được nạp với {importWarnings.length} mục cần GV kiểm tra
          </summary>
          <ul className="mt-3 max-h-56 list-disc space-y-1 overflow-y-auto pl-5 text-xs leading-5">
            {importWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
          </ul>
        </details>
      )}

      <section className="card p-6">
        <h2 className="text-lg font-bold text-slate-800">Thông tin chung</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className="md:col-span-3">
            <span className="label">Tên bài kiểm tra</span>
            <input
              className="input mt-1"
              value={draft.title}
              onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))}
            />
          </label>
          <label>
            <span className="label">Thời lượng (phút)</span>
            <input
              type="number"
              min={1}
              max={600}
              className="input mt-1"
              value={draft.durationMinutes}
              onChange={(event) => setDraft((value) => ({ ...value, durationMinutes: Number(event.target.value) }))}
            />
          </label>
          <label className="md:col-span-3">
            <span className="label">Hướng dẫn</span>
            <textarea
              rows={3}
              className="input mt-1"
              value={draft.instructions}
              onChange={(event) => setDraft((value) => ({ ...value, instructions: event.target.value }))}
            />
          </label>
          <label>
            <span className="label">Tổng điểm đề</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              className="input mt-1"
              value={draft.totalPoints}
              onChange={(event) => setDraft((value) => ({ ...value, totalPoints: Number(event.target.value) }))}
            />
            <span className={`mt-2 block text-xs font-bold ${actualTotal === draft.totalPoints ? 'text-emerald-600' : 'text-rose-600'}`}>
              Tổng câu hỏi: {actualTotal}/{draft.totalPoints}
            </span>
          </label>
        </div>
      </section>

      {draft.sections.map((section, sectionIndex) => (
        <section key={sectionIndex} className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <input
              className="input flex-1 font-bold"
              value={section.title}
              onChange={(event) => updateSection(sectionIndex, { ...section, title: event.target.value })}
              aria-label={`Tên phần ${sectionIndex + 1}`}
            />
            <span className="badge-blue">
              {section.questions.reduce((sum, question) => sum + Number(question.points || 0), 0)} điểm
            </span>
            <button type="button" onClick={() => removeSection(sectionIndex)} className="btn-danger btn-sm">
              Xóa phần
            </button>
          </div>
          <div className="space-y-4 p-5">
            <label>
              <span className="label">Đề dẫn / đoạn mã dùng chung (tùy chọn)</span>
              <textarea
                rows={4}
                className="input mt-1 font-mono text-xs"
                value={section.introContent ?? ''}
                onChange={(event) => updateSection(sectionIndex, { ...section, introContent: event.target.value })}
              />
            </label>

            {section.questions.map((question, questionIndex) => (
              <QuestionEditor
                key={questionIndex}
                question={question}
                number={questionIndex + 1}
                radioGroup={`correct-${sectionIndex}-${questionIndex}`}
                onChange={(next) =>
                  updateSection(sectionIndex, {
                    ...section,
                    questions: section.questions.map((item, index) => (index === questionIndex ? next : item)),
                  })
                }
                onRemove={() =>
                  updateSection(sectionIndex, {
                    ...section,
                    questions: section.questions.filter((_, index) => index !== questionIndex),
                  })
                }
              />
            ))}

            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABELS) as AssessmentQuestionType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    updateSection(sectionIndex, { ...section, questions: [...section.questions, newQuestion(type)] })
                  }
                >
                  + {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        </section>
      ))}

      <div className="flex justify-between">
        <button type="button" onClick={addSection} className="btn-secondary">
          + Thêm phần
        </button>
        <button type="submit" disabled={saving || importingTemplate} className="btn-primary">
          {saving ? 'Đang lưu...' : 'Lưu bản nháp'}
        </button>
      </div>
    </form>
  )
}

function QuestionEditor({
  question,
  number,
  radioGroup,
  onChange,
  onRemove,
}: {
  question: AssessmentQuestionDraft
  number: number
  radioGroup: string
  onChange: (question: AssessmentQuestionDraft) => void
  onRemove: () => void
}) {
  function changeType(type: AssessmentQuestionType) {
    const replacement = newQuestion(type)
    onChange({ ...replacement, prompt: question.prompt, points: question.points })
  }

  function changeMode(mode: AssessmentGradingMode) {
    onChange({ ...question, gradingMode: mode })
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-black text-white">
          {number}
        </span>
        <select className="input w-auto" value={question.type} onChange={(event) => changeType(event.target.value as AssessmentQuestionType)}>
          {(Object.keys(TYPE_LABELS) as AssessmentQuestionType[]).map((type) => (
            <option key={type} value={type}>{TYPE_LABELS[type]}</option>
          ))}
        </select>
        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-600">
          Điểm
          <input
            type="number"
            min={0.1}
            step={0.1}
            className="input w-24"
            value={question.points}
            onChange={(event) => onChange({ ...question, points: Number(event.target.value) })}
          />
        </label>
        <button type="button" onClick={onRemove} className="btn-danger btn-sm">Xóa</button>
      </div>

      <label className="mt-4 block">
        <span className="label">Nội dung câu hỏi</span>
        <textarea
          rows={question.type === 'code_analysis' ? 6 : 3}
          className={`input mt-1 ${question.type === 'code_analysis' ? 'font-mono text-xs' : ''}`}
          value={question.prompt}
          onChange={(event) => onChange({ ...question, prompt: event.target.value })}
        />
      </label>

      {question.type === 'true_false' && (
        <label className="mt-4 block max-w-xs">
          <span className="label">Đáp án đúng</span>
          <select
            className="input mt-1"
            value={question.answerKey === undefined ? '' : String(question.answerKey)}
            onChange={(event) =>
              onChange({
                ...question,
                answerKey: event.target.value === '' ? undefined : event.target.value === 'true',
              })
            }
          >
            <option value="">-- Chọn đáp án --</option>
            <option value="true">Đúng</option>
            <option value="false">Sai</option>
          </select>
        </label>
      )}

      {question.type === 'single_choice' && (
        <div className="mt-4 space-y-2">
          <span className="label">Các phương án — chọn radio cho đáp án đúng</span>
          {(question.options ?? []).map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-2">
              <input
                type="radio"
                name={radioGroup}
                checked={question.answerKey === optionIndex}
                onChange={() => onChange({ ...question, answerKey: optionIndex })}
              />
              <input
                className="input flex-1"
                value={option}
                onChange={(event) =>
                  onChange({
                    ...question,
                    options: (question.options ?? []).map((item, index) => index === optionIndex ? event.target.value : item),
                  })
                }
                placeholder={`Phương án ${optionIndex + 1}`}
              />
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const nextOptions = (question.options ?? []).filter((_, index) => index !== optionIndex)
                  onChange({ ...question, options: nextOptions, answerKey: 0 })
                }}
              >
                Xóa
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onChange({ ...question, options: [...(question.options ?? []), ''] })}
          >
            + Thêm phương án
          </button>
        </div>
      )}

      {!['true_false', 'single_choice'].includes(question.type) && (
        <div className="mt-4 space-y-4 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold text-violet-900">Chấm câu tự luận</p>
              <p className="text-xs text-violet-700">LLM chấm dự kiến; GV duyệt để thành điểm chính thức.</p>
            </div>
            <select className="input w-auto" value={question.gradingMode} onChange={(event) => changeMode(event.target.value as AssessmentGradingMode)}>
              <option value="llm_assisted">LLM chấm nháp</option>
              <option value="manual">GV chấm thủ công</option>
            </select>
          </div>
          <label className="block">
            <span className="label">Đáp án gợi ý</span>
            <textarea
              rows={4}
              className="input mt-1"
              value={question.referenceAnswer ?? ''}
              onChange={(event) => onChange({ ...question, referenceAnswer: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Prompt bổ sung cho LLM</span>
            <textarea
              rows={2}
              className="input mt-1"
              value={question.gradingPrompt ?? ''}
              onChange={(event) => onChange({ ...question, gradingPrompt: event.target.value })}
              placeholder="Ví dụ: Chấp nhận cách giải tương đương nếu giải thích rõ ClassCastException."
            />
          </label>
          <div className="space-y-2">
            <span className="label">Rubric</span>
            {(question.rubric ?? []).map((criterion, criterionIndex) => (
              <div key={criterionIndex} className="flex gap-2">
                <input
                  className="input flex-1"
                  value={criterion.criterion}
                  onChange={(event) =>
                    onChange({
                      ...question,
                      rubric: (question.rubric ?? []).map((item, index) =>
                        index === criterionIndex ? { ...item, criterion: event.target.value } : item
                      ),
                    })
                  }
                  placeholder="Tiêu chí chấm"
                />
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="input w-24"
                  value={criterion.points}
                  onChange={(event) =>
                    onChange({
                      ...question,
                      rubric: (question.rubric ?? []).map((item, index) =>
                        index === criterionIndex ? { ...item, points: Number(event.target.value) } : item
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => onChange({ ...question, rubric: (question.rubric ?? []).filter((_, index) => index !== criterionIndex) })}
                >
                  Xóa
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                onChange({
                  ...question,
                  rubric: [
                    ...(question.rubric ?? []),
                    { id: `criterion-${Date.now()}-${(question.rubric?.length ?? 0) + 1}`, criterion: '', points: 0.5 },
                  ],
                })
              }
            >
              + Thêm tiêu chí
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
