import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName, formatSemesterDisplayName } from '../../utils/semester'
import { ExerciseMarkdownContent } from '../../components/exercise/ExerciseDescriptionEditor'
import { extractProjectSubmissionRequirements, stripProjectSubmissionNotes } from '../../utils/projectDescription'

type TabKey = 'description' | 'submission' | 'groups' | 'discussion'

interface ProjectStudent {
  userId: string
  studentExternalId: string
  fullName: string
  username: string
  email: string
}

interface ProjectMember {
  id: string
  studentId: string | null
  studentExternalId: string
  studentName: string
  isLeader: boolean
  contributionPercent: number
}

interface ProjectGroup {
  id: string
  name: string
  repositoryUrl: string | null
  score: number | null
  feedback: string | null
  status: 'draft' | 'submitted' | 'graded'
  createdAt: string
  updatedAt: string
  gradedAt: string | null
  members: ProjectMember[]
}

interface StudentProjectWorkspace {
  section: { id: string; name: string; semester: string }
  exercise: {
    id: string
    title: string
    description: string
    difficulty: 'easy' | 'medium' | 'hard'
    deadline: string | null
    allowSubmission: boolean
  }
  students: ProjectStudent[]
  groups: ProjectGroup[]
  myGroup: ProjectGroup | null
  currentStudent: ProjectStudent
  stats: {
    totalGroups: number
    totalStudents: number
    studentsInGroups: number
    submittedGroups: number
    gradedGroups: number
  }
}

interface MemberDraft {
  id: string
  studentExternalId: string
  isLeader: boolean
  contributionPercent: number
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'description', label: 'Mô tả' },
  { key: 'submission', label: 'Bài nộp' },
  { key: 'groups', label: 'Danh sách nhóm' },
  { key: 'discussion', label: 'Thảo luận' },
]

const difficultyLabel = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
}

export function StudentProjectPage() {
  const { sectionId, exerciseId } = useParams<{ sectionId: string; exerciseId: string }>()
  const [data, setData] = useState<StudentProjectWorkspace | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('description')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [memberRows, setMemberRows] = useState<MemberDraft[]>([])

  useEffect(() => {
    fetchWorkspace()
  }, [sectionId, exerciseId])

  async function fetchWorkspace() {
    if (!sectionId || !exerciseId) return
    setLoading(true)
    try {
      const response = await api.get<StudentProjectWorkspace>(`/api/students/sections/${sectionId}/projects/${exerciseId}`)
      setData(response.data)
      hydrateForm(response.data)
    } catch {
      toast.error('Không thể tải bài tập lớn.')
    } finally {
      setLoading(false)
    }
  }

  function hydrateForm(workspace: StudentProjectWorkspace) {
    const myGroup = workspace.myGroup
    const rows: MemberDraft[] =
      myGroup?.members.length
        ? myGroup.members.map((member, index) => ({
            id: `${member.studentExternalId}-${index}`,
            studentExternalId: member.studentExternalId,
            isLeader: member.isLeader,
            contributionPercent: member.contributionPercent,
          }))
        : [
            {
              id: `${workspace.currentStudent.studentExternalId}-self`,
              studentExternalId: workspace.currentStudent.studentExternalId,
              isLeader: true,
              contributionPercent: 100,
            },
          ]
    setGroupName(myGroup?.name ?? '')
    setRepositoryUrl(myGroup?.repositoryUrl ?? '')
    setMemberRows(rows)
  }

  const studentByExternalId = useMemo(
    () => new Map((data?.students ?? []).map((student) => [student.studentExternalId, student])),
    [data?.students]
  )
  const canEditSubmission = useMemo(() => {
    if (!data?.myGroup) return true
    return data.myGroup.members.some(
      (member) => member.studentExternalId === data.currentStudent.studentExternalId && member.isLeader
    )
  }, [data])
  const submissionRequirements = useMemo(
    () => extractProjectSubmissionRequirements(data?.exercise.description ?? ''),
    [data?.exercise.description]
  )

  function addMemberRow() {
    setMemberRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${prev.length}`,
        studentExternalId: '',
        isLeader: prev.length === 0,
        contributionPercent: 0,
      },
    ])
  }

  function removeMemberRow(rowId: string) {
    setMemberRows((prev) => {
      const removed = prev.find((row) => row.id === rowId)
      if (data && removed?.studentExternalId.trim() === data.currentStudent.studentExternalId) {
        toast.warning('Nhóm của bạn phải có chính bạn là thành viên.')
        return prev
      }
      const next = prev.filter((row) => row.id !== rowId)
      if (!next.some((row) => row.isLeader) && next.length > 0) {
        next[0] = { ...next[0], isLeader: true }
      }
      return next
    })
  }

  function updateMemberExternalId(rowId: string, studentExternalId: string) {
    setMemberRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, studentExternalId } : row))
    )
  }

  function chooseLeader(rowId: string) {
    setMemberRows((prev) =>
      prev.map((row) => ({
        ...row,
        isLeader: row.id === rowId,
      }))
    )
  }

  function updateContribution(rowId: string, contributionPercent: number) {
    setMemberRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, contributionPercent } : row))
    )
  }

  function validateRepositoryUrl(showToast = true) {
    const trimmed = repositoryUrl.trim()
    if (!trimmed) {
      if (showToast) toast.warning('Vui lòng nhập URL GitHub.')
      return false
    }
    const ok = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/.test(trimmed)
    if (showToast) {
      if (ok) toast.success('URL GitHub hợp lệ.')
      else toast.warning('URL cần có dạng https://github.com/<owner>/<repo>.')
    }
    return ok
  }

  async function saveSubmission(event: React.FormEvent) {
    event.preventDefault()
    if (!sectionId || !exerciseId || !data) return
    if (!groupName.trim()) {
      toast.warning('Vui lòng nhập tên nhóm.')
      return
    }
    if (!validateRepositoryUrl(false)) {
      toast.warning('URL GitHub chưa hợp lệ.')
      return
    }
    const filledRows = memberRows
      .map((row) => ({ ...row, studentExternalId: row.studentExternalId.trim() }))
      .filter((row) => row.studentExternalId)
    if (filledRows.length === 0) {
      toast.warning('Vui lòng nhập ít nhất một MSSV thành viên.')
      return
    }
    const invalidRow = filledRows.find((row) => !studentByExternalId.has(row.studentExternalId))
    if (invalidRow) {
      toast.warning(`MSSV ${invalidRow.studentExternalId} không thuộc lớp này.`)
      return
    }
    const uniqueIds = new Set(filledRows.map((row) => row.studentExternalId))
    if (uniqueIds.size !== filledRows.length) {
      toast.warning('Danh sách thành viên bị trùng MSSV.')
      return
    }
    if (!filledRows.some((row) => row.isLeader)) {
      toast.warning('Vui lòng chọn trưởng nhóm.')
      return
    }

    setSaving(true)
    try {
      await api.put(`/api/students/sections/${sectionId}/projects/${exerciseId}/my-group`, {
        name: groupName,
        repository_url: repositoryUrl,
        members: filledRows.map((member) => ({
          student_external_id: member.studentExternalId,
          is_leader: member.isLeader,
          contribution_percent: member.contributionPercent,
        })),
      })
      toast.success('Đã lưu bài nộp BTL.')
      await fetchWorkspace()
      setActiveTab('groups')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Không thể lưu bài nộp BTL.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Đang tải bài tập lớn..." />

  if (!data) {
    return (
      <div className="card p-8 text-center text-slate-500">
        Không tìm thấy bài tập lớn hoặc bài chưa được mở.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to={`/student/classes/${data.section.id}`} className="text-sm font-semibold text-primary hover:text-primary-700">
          ← Quay lại lớp
        </Link>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">
            {formatSectionDisplayName(data.section.name)} · {formatSemesterDisplayName(data.section.semester)}
          </p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900">{data.exercise.title}</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Nộp repository GitHub theo nhóm, giảng viên chấm điểm trực tiếp trên hệ thống.
              </p>
            </div>
            <div className="grid min-w-56 gap-1 text-sm">
              <InfoRow label="Mức độ" value={difficultyLabel[data.exercise.difficulty]} />
              <InfoRow label="Số nhóm" value={String(data.stats.totalGroups)} />
              <InfoRow label="Đã nộp" value={String(data.stats.submittedGroups)} />
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-t-lg border px-5 py-3 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'border-slate-300 border-b-white bg-white text-slate-900'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-slate-300 bg-white p-6 shadow-sm">
        {activeTab === 'description' && <DescriptionTab data={data} />}
        {activeTab === 'submission' && (
          <SubmissionTab
            data={data}
            groupName={groupName}
            repositoryUrl={repositoryUrl}
            memberRows={memberRows}
            studentByExternalId={studentByExternalId}
            submissionRequirements={submissionRequirements}
            saving={saving}
            canEdit={canEditSubmission}
            onGroupName={setGroupName}
            onRepositoryUrl={setRepositoryUrl}
            onAddMember={addMemberRow}
            onRemoveMember={removeMemberRow}
            onMemberExternalId={updateMemberExternalId}
            onChooseLeader={chooseLeader}
            onContribution={updateContribution}
            onSubmit={saveSubmission}
          />
        )}
        {activeTab === 'groups' && <GroupsTab groups={data.groups} />}
        {activeTab === 'discussion' && <DiscussionTab />}
      </div>
    </div>
  )
}

function DescriptionTab({ data }: { data: StudentProjectWorkspace }) {
  return (
    <div className="max-w-5xl">
      <h2 className="mb-4 text-base font-black uppercase tracking-wide text-slate-800">Đề bài</h2>
      <ExerciseMarkdownContent value={stripProjectSubmissionNotes(data.exercise.description)} />
    </div>
  )
}

function SubmissionTab({
  data,
  groupName,
  repositoryUrl,
  memberRows,
  studentByExternalId,
  submissionRequirements,
  saving,
  canEdit,
  onGroupName,
  onRepositoryUrl,
  onAddMember,
  onRemoveMember,
  onMemberExternalId,
  onChooseLeader,
  onContribution,
  onSubmit,
}: {
  data: StudentProjectWorkspace
  groupName: string
  repositoryUrl: string
  memberRows: MemberDraft[]
  studentByExternalId: Map<string, ProjectStudent>
  submissionRequirements: string
  saving: boolean
  canEdit: boolean
  onGroupName: (value: string) => void
  onRepositoryUrl: (value: string) => void
  onAddMember: () => void
  onRemoveMember: (rowId: string) => void
  onMemberExternalId: (rowId: string, value: string) => void
  onChooseLeader: (rowId: string) => void
  onContribution: (rowId: string, value: number) => void
  onSubmit: (event: React.FormEvent) => void
}) {
  const myGroup = data.myGroup
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {!canEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Chỉ trưởng nhóm được cập nhật URL bài nộp và phần trăm đóng góp. Bạn vẫn có thể xem thông tin nhóm ở tab Danh sách nhóm.
        </div>
      )}

      {!data.exercise.allowSubmission && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          Bài tập lớn hiện đã tắt nhận bài nộp. Bạn có thể xem thông tin nhóm nhưng không thể lưu URL mới.
        </div>
      )}

      {myGroup?.status === 'graded' && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-800">Nhóm đã được chấm: {formatProjectScore(myGroup.score ?? 0)}/10</p>
          {myGroup.feedback && <p className="mt-1 text-sm text-emerald-700">{myGroup.feedback}</p>}
        </div>
      )}

      <div className="space-y-3">
        <button type="button" onClick={onAddMember} disabled={!canEdit} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
          + Thêm thành viên
        </button>
      <div className="rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">MSSV</th>
              <th className="px-4 py-3 text-left">Tên sinh viên</th>
              <th className="px-4 py-3 text-left">Trưởng nhóm</th>
              <th className="px-4 py-3 text-left">Đóng góp (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {memberRows.map((row, index) => {
              const studentId = row.studentExternalId.trim()
              const student = studentByExternalId.get(studentId)
              const hasLookupError = studentId.length > 0 && !student
              return (
                <tr key={row.id}>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => onRemoveMember(row.id)}
                      disabled={!canEdit}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-sm font-black text-rose-600 hover:bg-rose-200"
                      title="Xóa thành viên"
                    >
                      -
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={row.studentExternalId}
                      onChange={(event) => onMemberExternalId(row.id, event.target.value)}
                      disabled={!canEdit}
                      className={`input h-10 ${hasLookupError ? 'border-rose-300 bg-rose-50' : ''}`}
                      placeholder="Nhập MSSV"
                    />
                  </td>
                  <td className="px-4 py-2">
                    {student ? (
                      <span className="font-semibold text-sky-600">{student.fullName}</span>
                    ) : hasLookupError ? (
                      <span className="font-semibold text-rose-600">Không tìm thấy trong lớp</span>
                    ) : (
                      <span className="text-slate-400">Nhập MSSV để hiển thị tên</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="radio"
                      name="project-leader"
                      checked={row.isLeader}
                      onChange={() => onChooseLeader(row.id)}
                      disabled={!canEdit}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row.contributionPercent ?? (index === 0 ? 100 : 0)}
                      onChange={(event) => onContribution(row.id, Number(event.target.value))}
                      disabled={!canEdit}
                      className="input h-9 w-24"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </div>

      <div className="grid gap-4">
        <div>
          <label className="label">Tên nhóm</label>
          <input value={groupName} onChange={(event) => onGroupName(event.target.value)} className="input" required disabled={!canEdit} />
        </div>
        <div>
          <label className="label">URL GitHub bài tập lớn</label>
          <input
            value={repositoryUrl}
            onChange={(event) => onRepositoryUrl(event.target.value)}
            className="input"
            placeholder="https://github.com/owner/repository"
            required
            disabled={!canEdit}
          />
        </div>
      </div>

      {submissionRequirements && (
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <ExerciseMarkdownContent value={submissionRequirements} />
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !data.exercise.allowSubmission || !canEdit}
        className="btn-primary"
        title={!data.exercise.allowSubmission ? 'Bài tập lớn hiện đã tắt nhận bài nộp' : undefined}
      >
        {saving ? <><Spinner /> Đang kiểm tra...</> : 'Lưu bài nộp'}
      </button>
    </form>
  )
}

function GroupsTab({ groups }: { groups: ProjectGroup[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-300 text-sm">
        <thead>
          <tr className="text-left text-slate-900">
            <th className="px-4 py-3">STT</th>
            <th className="px-4 py-3">Tên nhóm</th>
            <th className="px-4 py-3">MSSV</th>
            <th className="px-4 py-3">Thành viên</th>
            <th className="px-4 py-3">URL bài nộp</th>
            <th className="px-4 py-3">Điểm</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {groups.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Chưa có dữ liệu.</td>
            </tr>
          ) : (
            groups.map((group, index) => (
              <tr key={group.id}>
                <td className="px-4 py-4">{index + 1}</td>
                <td className="px-4 py-4 font-semibold text-slate-900">{group.name}</td>
                <td className="px-4 py-4 font-semibold text-sky-600">
                  {group.members.map((member) => member.studentExternalId).join(', ')}
                </td>
                <td className="px-4 py-4">
                  {group.members.map((member) => (
                    <div key={member.id} className="font-semibold text-sky-600">
                      {member.studentName}{member.isLeader ? ' · Trưởng nhóm' : ''} ({member.contributionPercent}%)
                    </div>
                  ))}
                </td>
                <td className="px-4 py-4">
                  {group.repositoryUrl ? (
                    <a href={group.repositoryUrl} target="_blank" rel="noreferrer" className="font-semibold text-sky-600 hover:underline">
                      {group.repositoryUrl}
                    </a>
                  ) : (
                    <span className="text-slate-400">Chưa nộp</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {group.score == null ? <span className="text-slate-400">Chưa chấm</span> : <strong>{formatProjectScore(group.score)}/10</strong>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function DiscussionTab() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="font-bold text-slate-700">Khu vực thảo luận sẽ được bật khi có module bình luận.</p>
      <p className="mt-1 text-sm text-slate-500">Hiện tại sinh viên trao đổi qua lớp học và cập nhật URL GitHub tại tab Bài nộp.</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50">
      <div className="px-3 py-2 font-semibold text-slate-600">{label}:</div>
      <div className="px-3 py-2 font-bold text-slate-800">{value}</div>
    </div>
  )
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response
    return response?.data?.error?.message || fallback
  }
  return fallback
}

function formatProjectScore(value: number) {
  return value.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}
