import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { toast } from '../../stores/toast.store'

type Difficulty = 'easy' | 'medium' | 'hard'

interface AiStatus {
  enabled: boolean
  provider: 'openai' | 'anthropic' | 'gemini'
  model: string
  reason: string | null
}

interface ExerciseAiGeneratorProps {
  difficulty: Difficulty
  tags: string[]
  template: unknown
  onApply: (draft: unknown) => void
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
}

export function ExerciseAiGenerator({
  difficulty,
  tags,
  template,
  onApply,
}: ExerciseAiGeneratorProps) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(difficulty)
  const [testCount, setTestCount] = useState(6)
  const [tagText, setTagText] = useState(tags.join(', '))
  const [lectureContext, setLectureContext] = useState('')
  const [additionalRequirements, setAdditionalRequirements] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [])

  useEffect(() => {
    setSelectedDifficulty(difficulty)
  }, [difficulty])

  useEffect(() => {
    setTagText(tags.join(', '))
  }, [tags])

  const parsedTags = useMemo(
    () =>
      tagText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 5),
    [tagText]
  )

  async function fetchStatus() {
    try {
      setStatusLoading(true)
      const response = await api.get('/api/exercises/ai/status')
      setStatus(response.data.data)
    } catch {
      setStatus({
        enabled: false,
        provider: 'openai',
        model: '',
        reason: 'Không thể kiểm tra trạng thái AI.',
      })
    } finally {
      setStatusLoading(false)
    }
  }

  async function handleGenerate() {
    if (!topic.trim()) {
      toast.error('Vui lòng nhập chủ đề bài tập.')
      return
    }

    setGenerating(true)
    try {
      const response = await api.post('/api/exercises/ai/generate', {
        topic: topic.trim(),
        difficulty: selectedDifficulty,
        test_count: testCount,
        oop_tags: parsedTags,
        lecture_context: lectureContext.trim(),
        additional_requirements: additionalRequirements.trim(),
        template,
      })

      onApply(response.data.data.draft)
      setOpen(false)
      toast.success('AI đã tạo draft bài tập. Hãy rà soát trước khi lưu.')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      toast.error(
        axiosErr.response?.data?.error?.message ||
          'Không thể tạo bài tập bằng AI. Vui lòng thử lại.'
      )
    } finally {
      setGenerating(false)
    }
  }

  const disabled = statusLoading || !status?.enabled

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? status?.reason || 'Đang kiểm tra trạng thái AI...' : undefined}
        className="btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {statusLoading ? 'Kiểm tra AI...' : 'Tạo bằng AI'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Tạo bài tập bằng AI</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    AI chỉ tạo draft theo template. Giảng viên cần rà soát đề, starter code và test case trước khi lưu.
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost btn-sm">
                  Đóng
                </button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                Đang dùng {status?.provider.toUpperCase()} {status?.model ? `(${status.model})` : ''}.
              </div>

              <div>
                <label htmlFor="ai-topic" className="label">
                  Chủ đề <span className="text-danger-500">*</span>
                </label>
                <input
                  id="ai-topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className="input"
                  maxLength={300}
                  placeholder="Ví dụ: quản lý giỏ hàng, thư viện sách, đặt vé xem phim..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ai-difficulty" className="label">Độ khó</label>
                  <select
                    id="ai-difficulty"
                    value={selectedDifficulty}
                    onChange={(event) => setSelectedDifficulty(event.target.value as Difficulty)}
                    className="input"
                  >
                    {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ai-test-count" className="label">Số lượng test mong muốn</label>
                  <input
                    id="ai-test-count"
                    type="number"
                    min={1}
                    max={20}
                    value={testCount}
                    onChange={(event) => setTestCount(Number(event.target.value))}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ai-tags" className="label">Chủ điểm OOP</label>
                <input
                  id="ai-tags"
                  value={tagText}
                  onChange={(event) => setTagText(event.target.value)}
                  className="input"
                  placeholder="class, encapsulation, inheritance..."
                />
                <p className="mt-1 text-xs text-slate-400">Tối đa 5 tag, phân tách bằng dấu phẩy.</p>
              </div>

              <div>
                <label htmlFor="ai-lecture-context" className="label">Bài giảng hoặc ngữ cảnh liên quan</label>
                <textarea
                  id="ai-lecture-context"
                  value={lectureContext}
                  onChange={(event) => setLectureContext(event.target.value)}
                  rows={5}
                  className="input"
                  placeholder="Dán đoạn bài giảng, mục tiêu học tập, hoặc yêu cầu kiến thức cần bám theo..."
                />
              </div>

              <div>
                <label htmlFor="ai-extra" className="label">Yêu cầu bổ sung</label>
                <textarea
                  id="ai-extra"
                  value={additionalRequirements}
                  onChange={(event) => setAdditionalRequirements(event.target.value)}
                  rows={4}
                  className="input"
                  placeholder="Ví dụ: bắt buộc dùng interface, có 2 hidden test về ngoại lệ, tránh trùng bài cũ..."
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">
                Hủy
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? 'Đang tạo...' : 'Tạo draft và áp dụng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
