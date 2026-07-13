import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'
import { formatSectionDisplayName, formatSemesterDisplayName } from '../../utils/semester'
import { ExerciseMarkdownContent } from '../../components/exercise/ExerciseDescriptionEditor'
import { stripProjectSubmissionNotes } from '../../utils/projectDescription'

type TabKey = 'description' | 'groups' | 'stats' | 'history' | 'discussion' | 'grading'

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

interface ProjectStudentScore {
  studentExternalId: string
  studentName: string
  username: string
  groupId: string | null
  groupName: string | null
  repositoryUrl: string | null
  isLeader: boolean
  contributionPercent: number
  groupScore: number | null
  personalScore: number | null
  status: 'draft' | 'submitted' | 'graded' | 'ungrouped'
}

interface ProjectWorkspace {
  section: { id: string; name: string; semester: string }
  exercise: {
    id: string
    title: string
    description: string
    difficulty: 'easy' | 'medium' | 'hard'
    deadline: string | null
  }
  groups: ProjectGroup[]
  students: ProjectStudent[]
  studentScores: ProjectStudentScore[]
  stats: {
    totalGroups: number
    totalStudents: number
    studentsInGroups: number
    submittedGroups: number
    gradedGroups: number
    averageScore: number
  }
  history: Array<{ id: string; groupName: string; action: string; score: number | null; at: string }>
}

interface GroupFormState {
  id?: string
  name: string
  repositoryUrl: string
  members: Record<string, { selected: boolean; isLeader: boolean; contributionPercent: number }>
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'description', label: 'Mô tả' },
  { key: 'groups', label: 'Danh sách nhóm' },
  { key: 'stats', label: 'Thống kê' },
  { key: 'history', label: 'Lịch sử' },
  { key: 'discussion', label: 'Thảo luận' },
  { key: 'grading', label: 'Chấm điểm nhóm' },
]

export function ProjectAssignmentPage() {
  const { sectionId, exerciseId } = useParams<{ sectionId: string; exerciseId: string }>()
  const [data, setData] = useState<ProjectWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('groups')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<GroupFormState>({ name: '', repositoryUrl: '', members: {} })
  const [saving, setSaving] = useState(false)
  const [gradingGroupId, setGradingGroupId] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkspace()
  }, [sectionId, exerciseId])

  async function fetchWorkspace() {
    if (!sectionId || !exerciseId) return
    setLoading(true)
    try {
      const response = await api.get(`/api/instructor/sections/${sectionId}/projects/${exerciseId}`)
      setData(response.data)
    } catch {
      toast.error('Không thể tải bài tập lớn.')
    } finally {
      setLoading(false)
    }
  }

  const filteredGroups = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.groups
    return data.groups.filter((group) => {
      const memberText = group.members.map((member) => `${member.studentExternalId} ${member.studentName}`).join(' ')
      return `${group.name} ${group.repositoryUrl || ''} ${memberText}`.toLowerCase().includes(q)
    })
  }, [data, search])

  function openCreateForm() {
    const members: GroupFormState['members'] = {}
    for (const student of data?.students ?? []) {
      members[student.studentExternalId] = { selected: false, isLeader: false, contributionPercent: 0 }
    }
    setForm({ name: '', repositoryUrl: '', members })
    setShowForm(true)
  }

  function openEditForm(group: ProjectGroup) {
    const members: GroupFormState['members'] = {}
    for (const student of data?.students ?? []) {
      const existing = group.members.find((member) => member.studentExternalId === student.studentExternalId)
      members[student.studentExternalId] = {
        selected: Boolean(existing),
        isLeader: Boolean(existing?.isLeader),
        contributionPercent: existing?.contributionPercent ?? 0,
      }
    }
    setForm({ id: group.id, name: group.name, repositoryUrl: group.repositoryUrl || '', members })
    setShowForm(true)
  }

  async function saveGroup(event: React.FormEvent) {
    event.preventDefault()
    if (!sectionId || !exerciseId) return
    setSaving(true)
    try {
      const members = Object.entries(form.members)
        .filter(([, value]) => value.selected)
        .map(([studentExternalId, value]) => ({
          student_external_id: studentExternalId,
          is_leader: value.isLeader,
          contribution_percent: value.contributionPercent,
        }))

      const payload = {
        name: form.name,
        repository_url: form.repositoryUrl,
        members,
      }

      if (form.id) {
        await api.put(`/api/instructor/sections/${sectionId}/projects/${exerciseId}/groups/${form.id}`, payload)
        toast.success('Đã cập nhật nhóm.')
      } else {
        await api.post(`/api/instructor/sections/${sectionId}/projects/${exerciseId}/groups`, payload)
        toast.success('Đã tạo nhóm.')
      }
      setShowForm(false)
      fetchWorkspace()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Không thể lưu nhóm BTL.'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteGroup(groupId: string) {
    if (!sectionId || !exerciseId) return
    if (!window.confirm('Xóa nhóm BTL này?')) return
    try {
      await api.delete(`/api/instructor/sections/${sectionId}/projects/${exerciseId}/groups/${groupId}`)
      toast.success('Đã xóa nhóm.')
      fetchWorkspace()
    } catch {
      toast.error('Không thể xóa nhóm.')
    }
  }

  async function gradeGroup(group: ProjectGroup, score: number, feedback: string) {
    if (!sectionId || !exerciseId) return
    const normalizedScore = Math.min(10, Math.max(0, Number.isFinite(score) ? score : 0))
    setGradingGroupId(group.id)
    try {
      await api.patch(`/api/instructor/sections/${sectionId}/projects/${exerciseId}/groups/${group.id}/grade`, {
        score: normalizedScore,
        feedback,
      })
      toast.success('Đã lưu điểm nhóm.')
      fetchWorkspace()
    } catch {
      toast.error('Không thể lưu điểm.')
    } finally {
      setGradingGroupId(null)
    }
  }

  function exportCsv() {
    if (!data) return
    const rows = [
      ['STT', 'Tên nhóm', 'MSSV', 'Thành viên', 'URL bài nộp', 'Điểm', 'Nhận xét'],
      ...filteredGroups.map((group, index) => [
        String(index + 1),
        group.name,
        group.members.map((member) => member.studentExternalId).join(', '),
        group.members.map((member) => `${member.studentName} (${member.contributionPercent}%)`).join(', '),
        group.repositoryUrl || '',
        group.score == null ? '' : formatProjectScore(group.score),
        group.feedback || '',
      ]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${formatSectionDisplayName(data.section.name)}-${data.exercise.title}-groups.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportStudentStatsExcel(workspace: ProjectWorkspace) {
    const rows = [
      ['STT', 'MSSV', 'Họ tên', 'Nhóm', 'Vai trò', 'Đóng góp (%)', 'Điểm nhóm', 'Điểm cá nhân', 'URL bài nộp', 'Trạng thái'],
      ...workspace.studentScores.map((student, index) => [
        String(index + 1),
        student.studentExternalId,
        student.studentName,
        student.groupName || 'Chưa có nhóm',
        student.isLeader ? 'Trưởng nhóm' : student.groupName ? 'Thành viên' : '',
        String(student.contributionPercent),
        student.groupScore == null ? '' : formatProjectScore(student.groupScore),
        student.personalScore == null ? '' : formatProjectScore(student.personalScore),
        student.repositoryUrl || '',
        projectStatusLabel(student.status),
      ]),
    ]
    downloadExcelTable(
      `${formatSectionDisplayName(workspace.section.name)}-${workspace.exercise.title}-thong-ke-btl.xls`,
      'Thong ke BTL',
      rows
    )
  }

  if (loading) return <PageLoader label="Đang tải bài tập lớn..." />
  if (!data) {
    return (
      <div className="card p-8 text-center text-slate-500">
        Không tìm thấy bài tập lớn.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to={`/instructor/classes/${data.section.id}`} className="text-sm font-semibold text-primary hover:text-primary-700">
          ← Quay lại lớp
        </Link>
        <div>
          <h1 className="text-4xl font-bold text-slate-900">{data.exercise.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {formatSectionDisplayName(data.section.name)} · {formatSemesterDisplayName(data.section.semester)}
          </p>
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
        {activeTab === 'groups' && (
          <GroupsTab
            groups={filteredGroups}
            search={search}
            onSearch={setSearch}
            onCreate={openCreateForm}
            onEdit={openEditForm}
            onDelete={deleteGroup}
            onExport={exportCsv}
          />
        )}
        {activeTab === 'stats' && <StatsTab data={data} onExport={() => exportStudentStatsExcel(data)} />}
        {activeTab === 'history' && <HistoryTab data={data} />}
        {activeTab === 'discussion' && <DiscussionTab />}
        {activeTab === 'grading' && (
          <GradingTab groups={filteredGroups} onGrade={gradeGroup} savingGroupId={gradingGroupId} />
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveGroup} className="w-full max-w-4xl rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">{form.id ? 'Sửa nhóm BTL' : 'Tạo nhóm BTL'}</h2>
            </div>
            <div className="max-h-[70vh] space-y-5 overflow-y-auto p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Tên nhóm</label>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                    className="input"
                    placeholder="VD: AiroDump-ng"
                  />
                </div>
                <div>
                  <label className="label">URL GitHub bài tập lớn</label>
                  <input
                    value={form.repositoryUrl}
                    onChange={(event) => setForm((prev) => ({ ...prev, repositoryUrl: event.target.value }))}
                    className="input"
                    placeholder="https://github.com/..."
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="label mb-0">Thành viên nhóm</label>
                  <span className="text-xs font-semibold text-slate-500">
                    {Object.values(form.members).filter((member) => member.selected).length} sinh viên được chọn
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold text-slate-600">Chọn</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-600">MSSV</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-600">Tên sinh viên</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-600">Trưởng nhóm</th>
                        <th className="px-4 py-3 text-left font-bold text-slate-600">Đóng góp (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.students.map((student) => {
                        const row = form.members[student.studentExternalId]
                        return (
                          <tr key={student.userId}>
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={row?.selected ?? false}
                                onChange={(event) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    members: {
                                      ...prev.members,
                                      [student.studentExternalId]: {
                                        ...(prev.members[student.studentExternalId] ?? { isLeader: false, contributionPercent: 0 }),
                                        selected: event.target.checked,
                                      },
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td className="px-4 py-2 font-semibold text-sky-600">{student.studentExternalId}</td>
                            <td className="px-4 py-2 text-slate-700">{student.fullName}</td>
                            <td className="px-4 py-2">
                              <input
                                type="radio"
                                name="leader"
                                checked={row?.isLeader ?? false}
                                onChange={() =>
                                  setForm((prev) => {
                                    const next = { ...prev.members }
                                    for (const key of Object.keys(next)) next[key] = { ...next[key], isLeader: false }
                                    next[student.studentExternalId] = {
                                      ...(next[student.studentExternalId] ?? { selected: true, contributionPercent: 0 }),
                                      selected: true,
                                      isLeader: true,
                                    }
                                    return { ...prev, members: next }
                                  })
                                }
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={row?.contributionPercent ?? 0}
                                onChange={(event) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    members: {
                                      ...prev.members,
                                      [student.studentExternalId]: {
                                        ...(prev.members[student.studentExternalId] ?? { selected: true, isLeader: false }),
                                        contributionPercent: Number(event.target.value),
                                      },
                                    },
                                  }))
                                }
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
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Hủy</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? <><Spinner /> Đang lưu...</> : 'Lưu nhóm'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function DescriptionTab({ data }: { data: ProjectWorkspace }) {
  return (
    <div className="max-w-5xl">
      <h2 className="mb-4 text-base font-black uppercase tracking-wide text-slate-800">Đề bài</h2>
      <ExerciseMarkdownContent value={stripProjectSubmissionNotes(data.exercise.description)} />
    </div>
  )
}

function GroupsTab(props: {
  groups: ProjectGroup[]
  search: string
  onSearch: (value: string) => void
  onCreate: () => void
  onEdit: (group: ProjectGroup) => void
  onDelete: (groupId: string) => void
  onExport: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={props.onExport} className="btn-secondary">Xuất File Excel</button>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Search:
            <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} className="input h-9 w-64" />
          </label>
          <button onClick={props.onCreate} className="btn-primary">Tạo nhóm</button>
        </div>
      </div>
      <ProjectGroupTable groups={props.groups} onEdit={props.onEdit} onDelete={props.onDelete} />
    </div>
  )
}

function ProjectGroupTable({
  groups,
  onEdit,
  onDelete,
}: {
  groups: ProjectGroup[]
  onEdit: (group: ProjectGroup) => void
  onDelete: (groupId: string) => void
}) {
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
            <th className="px-4 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {groups.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Chưa có dữ liệu nhóm.</td>
            </tr>
          ) : (
            groups.map((group, index) => (
              <tr key={group.id} className={index % 2 ? 'bg-slate-50/70' : 'bg-white'}>
                <td className="px-4 py-4 align-top">{index + 1}</td>
                <td className="px-4 py-4 align-top font-semibold text-slate-800">{group.name}</td>
                <td className="px-4 py-4 align-top font-semibold text-sky-600">
                  {group.members.map((member) => member.studentExternalId).join(', ')}
                </td>
                <td className="px-4 py-4 align-top">
                  {group.members.map((member) => (
                    <div key={member.id} className="font-semibold text-sky-600">
                      {member.studentName} ({member.contributionPercent}%){member.isLeader ? ' · Trưởng nhóm' : ''}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-4 align-top">
                  {group.repositoryUrl ? (
                    <a href={group.repositoryUrl} target="_blank" rel="noreferrer" className="font-semibold text-sky-600 hover:underline">
                      {group.repositoryUrl}
                    </a>
                  ) : (
                    <span className="text-slate-400">Chưa nộp</span>
                  )}
                </td>
                <td className="px-4 py-4 align-top">
                  {group.score == null ? <span className="text-slate-400">Chưa chấm</span> : <strong>{formatProjectScore(group.score)}/10</strong>}
                </td>
                <td className="px-4 py-4 text-right align-top">
                  <button onClick={() => onEdit(group)} className="mr-3 text-sm font-semibold text-primary hover:text-primary-700">Sửa</button>
                  <button onClick={() => onDelete(group.id)} className="text-sm font-semibold text-danger-600 hover:text-danger-700">Xóa nhóm</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function StatsTab({ data, onExport }: { data: ProjectWorkspace; onExport: () => void }) {
  const rows = [
    ['Tổng số sinh viên', data.stats.totalStudents],
    ['Sinh viên đã có nhóm', data.stats.studentsInGroups],
    ['Tổng số nhóm', data.stats.totalGroups],
    ['Nhóm đã nộp URL GitHub', data.stats.submittedGroups],
    ['Nhóm đã chấm điểm', data.stats.gradedGroups],
    ['Điểm trung bình', data.stats.averageScore],
  ]
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 gap-4 md:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="text-sm font-semibold text-slate-500">{label}</div>
              <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
            </div>
          ))}
        </div>
        <button onClick={onExport} className="btn-primary whitespace-nowrap">Xuất Excel</button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Điểm cá nhân = min(10, điểm nhóm × % đóng góp × số thành viên / 100). BTL được thống kê riêng và không cộng vào tổng điểm bài tập thực hành.
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-slate-700">
              <th className="px-4 py-3">STT</th>
              <th className="px-4 py-3">MSSV</th>
              <th className="px-4 py-3">Họ tên</th>
              <th className="px-4 py-3">Nhóm</th>
              <th className="px-4 py-3">Vai trò</th>
              <th className="px-4 py-3">Đóng góp</th>
              <th className="px-4 py-3">Điểm nhóm</th>
              <th className="px-4 py-3">Điểm cá nhân</th>
              <th className="px-4 py-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {data.studentScores.map((student, index) => (
              <tr key={student.studentExternalId}>
                <td className="px-4 py-3">{index + 1}</td>
                <td className="px-4 py-3 font-semibold text-sky-700">{student.studentExternalId}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{student.studentName}</td>
                <td className="px-4 py-3">{student.groupName || <span className="text-slate-400">Chưa có nhóm</span>}</td>
                <td className="px-4 py-3">{student.isLeader ? 'Trưởng nhóm' : student.groupName ? 'Thành viên' : '—'}</td>
                <td className="px-4 py-3">{student.groupName ? `${student.contributionPercent}%` : '—'}</td>
                <td className="px-4 py-3">{student.groupScore == null ? '—' : `${formatProjectScore(student.groupScore)}/10`}</td>
                <td className="px-4 py-3">
                  {student.personalScore == null ? (
                    <span className="text-slate-400">Chưa có điểm</span>
                  ) : (
                    <strong className="text-primary">{formatProjectScore(student.personalScore)}/10</strong>
                  )}
                </td>
                <td className="px-4 py-3">{projectStatusLabel(student.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HistoryTab({ data }: { data: ProjectWorkspace }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left">Thời gian</th>
            <th className="px-4 py-3 text-left">Nhóm</th>
            <th className="px-4 py-3 text-left">Hoạt động</th>
            <th className="px-4 py-3 text-left">Điểm</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.history.map((item) => (
            <tr key={`${item.id}-${item.at}`}>
              <td className="px-4 py-3 text-slate-600">{formatDateTime(item.at)}</td>
              <td className="px-4 py-3 font-semibold text-slate-800">{item.groupName}</td>
              <td className="px-4 py-3">{item.action}</td>
              <td className="px-4 py-3">{item.score == null ? '—' : `${formatProjectScore(item.score)}/10`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DiscussionTab() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="font-bold text-slate-700">Khu vực thảo luận sẽ được bật khi có module bình luận.</p>
      <p className="mt-1 text-sm text-slate-500">Hiện tại giảng viên có thể quản lý nhóm, URL GitHub và phản hồi điểm ở các tab bên cạnh.</p>
    </div>
  )
}

function GradingTab({
  groups,
  onGrade,
  savingGroupId,
}: {
  groups: ProjectGroup[]
  onGrade: (group: ProjectGroup, score: number, feedback: string) => void
  savingGroupId: string | null
}) {
  const [drafts, setDrafts] = useState<Record<string, { score: string; feedback: string }>>({})

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        groups.map((group) => [
          group.id,
          { score: group.score == null ? '' : String(group.score), feedback: group.feedback || '' },
        ])
      )
    )
  }, [groups])

  return (
    <div className="space-y-3">
      {groups.length === 0 ? (
        <p className="py-8 text-center text-slate-500">Chưa có nhóm để chấm điểm.</p>
      ) : (
        groups.map((group) => {
          const draft = drafts[group.id] ?? { score: '', feedback: '' }
          return (
            <div key={group.id} className="grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[1fr_120px_1fr_auto] md:items-center">
              <div>
                <div className="font-bold text-slate-900">{group.name}</div>
                <div className="text-xs text-slate-500">{group.members.map((member) => member.studentName).join(', ') || 'Chưa có thành viên'}</div>
              </div>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={draft.score}
                onChange={(event) =>
                  setDrafts((prev) => ({ ...prev, [group.id]: { ...draft, score: event.target.value } }))
                }
                className="input"
                placeholder="Điểm /10"
              />
              <input
                value={draft.feedback}
                onChange={(event) =>
                  setDrafts((prev) => ({ ...prev, [group.id]: { ...draft, feedback: event.target.value } }))
                }
                className="input"
                placeholder="Nhận xét"
              />
              <button
                onClick={() => onGrade(group, Number(draft.score || 0), draft.feedback)}
                disabled={savingGroupId === group.id}
                className="btn-primary whitespace-nowrap"
              >
                {savingGroupId === group.id ? <Spinner /> : 'Lưu điểm'}
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

function downloadExcelTable(fileName: string, sheetName: string, rows: string[][]) {
  const htmlRows = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    )
    .join('')
  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          table { border-collapse: collapse; }
          td { border: 1px solid #d1d5db; padding: 6px; mso-number-format:"\\@"; }
        </style>
      </head>
      <body>
        <table><caption>${escapeHtml(sheetName)}</caption>${htmlRows}</table>
      </body>
    </html>
  `
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function projectStatusLabel(status: ProjectStudentScore['status']) {
  if (status === 'graded') return 'Đã chấm'
  if (status === 'submitted') return 'Đã nộp URL'
  if (status === 'draft') return 'Chưa nộp URL'
  return 'Chưa có nhóm'
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN')
}
