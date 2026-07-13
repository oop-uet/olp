import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName, formatSemesterDisplayName } from '../../utils/semester'

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
  selected: boolean
  isLeader: boolean
  contributionPercent: number
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'description', label: 'Mô tả' },
  { key: 'submission', label: 'Bài nộp' },
  { key: 'groups', label: 'Danh sách nhóm BTL' },
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
  const [members, setMembers] = useState<Record<string, MemberDraft>>({})

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
    const nextMembers: Record<string, MemberDraft> = {}
    const myGroup = workspace.myGroup
    for (const student of workspace.students) {
      const existing = myGroup?.members.find((member) => member.studentExternalId === student.studentExternalId)
      const isCurrent = student.studentExternalId === workspace.currentStudent.studentExternalId
      nextMembers[student.studentExternalId] = {
        selected: Boolean(existing) || isCurrent,
        isLeader: Boolean(existing?.isLeader) || (!myGroup && isCurrent),
        contributionPercent: existing?.contributionPercent ?? (isCurrent ? 100 : 0),
      }
    }
    setGroupName(myGroup?.name ?? '')
    setRepositoryUrl(myGroup?.repositoryUrl ?? '')
    setMembers(nextMembers)
  }

  const selectedMembers = useMemo(
    () =>
      Object.entries(members)
        .filter(([, member]) => member.selected)
        .map(([studentExternalId, member]) => ({ studentExternalId, ...member })),
    [members]
  )

  function toggleMember(student: ProjectStudent, selected: boolean) {
    if (!data) return
    if (student.studentExternalId === data.currentStudent.studentExternalId && !selected) {
      toast.warning('Nhóm của bạn phải có chính bạn là thành viên.')
      return
    }

    setMembers((prev) => ({
      ...prev,
      [student.studentExternalId]: {
        ...(prev[student.studentExternalId] ?? { isLeader: false, contributionPercent: 0 }),
        selected,
      },
    }))
  }

  function chooseLeader(studentExternalId: string) {
    setMembers((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([key, value]) => [
          key,
          {
            ...value,
            selected: key === studentExternalId ? true : value.selected,
            isLeader: key === studentExternalId,
          },
        ])
      )
    )
  }

  function updateContribution(studentExternalId: string, contributionPercent: number) {
    setMembers((prev) => ({
      ...prev,
      [studentExternalId]: {
        ...(prev[studentExternalId] ?? { selected: true, isLeader: false }),
        contributionPercent,
      },
    }))
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

    setSaving(true)
    try {
      await api.put(`/api/students/sections/${sectionId}/projects/${exerciseId}/my-group`, {
        name: groupName,
        repository_url: repositoryUrl,
        members: selectedMembers.map((member) => ({
          student_external_id: member.studentExternalId,
          is_leader: member.isLeader,
          contribution_percent: member.contributionPercent,
        })),
      })
      toast.success('Đã lưu bài nộp BTL.')
      await fetchWorkspace()
      setActiveTab('groups')
    } catch {
      toast.error('Không thể lưu bài nộp BTL.')
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
            members={members}
            saving={saving}
            onGroupName={setGroupName}
            onRepositoryUrl={setRepositoryUrl}
            onToggleMember={toggleMember}
            onChooseLeader={chooseLeader}
            onContribution={updateContribution}
            onValidateRepositoryUrl={() => validateRepositoryUrl(true)}
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
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="prose max-w-none prose-slate">
        <h2>Đề bài</h2>
        <div className="whitespace-pre-line text-sm leading-7 text-slate-700">{data.exercise.description}</div>
        <h3>Chú ý khi nộp bài</h3>
        <ul>
          <li>Repository để private và thêm giảng viên thực hành làm collaborator.</li>
          <li>Không đẩy thư mục `.idea`, `target`, `out` hoặc file build lên repository.</li>
          <li>Nhóm cần commit thường xuyên; repository chỉ có một commit cuối kỳ sẽ không được chấp nhận.</li>
        </ul>
      </div>
      <div className="space-y-1 text-sm">
        <InfoRow label="Mức độ" value={difficultyLabel[data.exercise.difficulty]} />
        <InfoRow label="Tổng số nhóm" value={String(data.stats.totalGroups)} />
        <InfoRow label="Nhóm đã nộp" value={String(data.stats.submittedGroups)} />
        <InfoRow label="Nhóm đã chấm" value={String(data.stats.gradedGroups)} />
      </div>
    </div>
  )
}

function SubmissionTab({
  data,
  groupName,
  repositoryUrl,
  members,
  saving,
  onGroupName,
  onRepositoryUrl,
  onToggleMember,
  onChooseLeader,
  onContribution,
  onValidateRepositoryUrl,
  onSubmit,
}: {
  data: StudentProjectWorkspace
  groupName: string
  repositoryUrl: string
  members: Record<string, MemberDraft>
  saving: boolean
  onGroupName: (value: string) => void
  onRepositoryUrl: (value: string) => void
  onToggleMember: (student: ProjectStudent, selected: boolean) => void
  onChooseLeader: (studentExternalId: string) => void
  onContribution: (studentExternalId: string, value: number) => void
  onValidateRepositoryUrl: () => void
  onSubmit: (event: React.FormEvent) => void
}) {
  const myGroup = data.myGroup
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {myGroup?.status === 'graded' && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-800">Nhóm đã được chấm: {myGroup.score}/100</p>
          {myGroup.feedback && <p className="mt-1 text-sm text-emerald-700">{myGroup.feedback}</p>}
        </div>
      )}

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
            {data.students.map((student, index) => {
              const row = members[student.studentExternalId]
              return (
                <tr key={student.userId}>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={row?.selected ?? false}
                      onChange={(event) => onToggleMember(student, event.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-2 font-semibold text-sky-600">{student.studentExternalId}</td>
                  <td className="px-4 py-2 text-slate-700">{student.fullName}</td>
                  <td className="px-4 py-2">
                    <input
                      type="radio"
                      name="project-leader"
                      checked={row?.isLeader ?? false}
                      onChange={() => onChooseLeader(student.studentExternalId)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row?.contributionPercent ?? (index === 0 ? 100 : 0)}
                      onChange={(event) => onContribution(student.studentExternalId, Number(event.target.value))}
                      className="input h-9 w-24"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4">
        <div>
          <label className="label">Tên nhóm</label>
          <input value={groupName} onChange={(event) => onGroupName(event.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">URL GitHub bài tập lớn</label>
          <div className="flex gap-2">
            <input
              value={repositoryUrl}
              onChange={(event) => onRepositoryUrl(event.target.value)}
              className="input"
              placeholder="https://github.com/owner/repository"
              required
            />
            <button type="button" onClick={onValidateRepositoryUrl} className="btn-secondary whitespace-nowrap">
              Kiểm tra
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-black text-danger-600">Chú ý:</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Cần đăng nhập GitHub và đảm bảo URL repository truy cập được với giảng viên.</li>
          <li>Không đẩy thư mục `.idea`, `target`, `out` lên repository.</li>
          <li>Repository để private, thêm giảng viên thực hành làm collaborator.</li>
        </ol>
      </div>

      <button type="submit" disabled={saving || !data.exercise.allowSubmission} className="btn-primary">
        {saving ? <><Spinner /> Đang lưu...</> : 'Lưu bài nộp'}
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
                  {group.score == null ? <span className="text-slate-400">Chưa chấm</span> : <strong>{group.score}/100</strong>}
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
