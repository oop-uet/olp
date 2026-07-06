import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { PageLoader, Spinner } from '../../components/ui'
import { toast } from '../../stores/toast.store'

interface HelpItem {
  id: string
  sectionId: string
  type: 'step' | 'info' | 'faq' | 'checklist'
  title: string | null
  content: string
  orderIndex: number
}

interface HelpSection {
  id: string
  title: string
  description: string | null
  orderIndex: number
  items: HelpItem[]
}

export function HelpEditorPage() {
  const [sections, setSections] = useState<HelpSection[]>([])
  const [activeSectionId, setActiveSectionId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  useEffect(() => {
    fetchHelpGuide()
  }, [])

  async function fetchHelpGuide() {
    try {
      setLoading(true)
      const res = await api.get('/api/help-guide')
      const data = res.data || []
      // Sort items inside sections
      const sorted = data.map((sec: any) => ({
        ...sec,
        items: (sec.items || []).sort((a: any, b: any) => a.orderIndex - b.orderIndex),
      })).sort((a: any, b: any) => a.orderIndex - b.orderIndex)

      setSections(sorted)
      if (sorted.length > 0) {
        setActiveSectionId(sorted[0].id)
      }
    } catch {
      toast.error('Không thể tải nội dung cẩm nang.')
    } finally {
      setLoading(false)
    }
  }

  // Save changes to database
  async function handleSave() {
    try {
      setSaving(true)
      // Normalize orderIndex before saving
      const payload = sections.map((sec, secIdx) => ({
        ...sec,
        orderIndex: secIdx + 1,
        items: sec.items.map((item, itemIdx) => ({
          ...item,
          orderIndex: itemIdx + 1,
        })),
      }))

      await api.put('/api/admin/help-guide', payload)
      toast.success('Đã lưu nội dung cẩm nang thành công!')
      // Refresh
      fetchHelpGuide()
    } catch {
      toast.error('Không thể lưu nội dung cẩm nang.')
    } finally {
      setSaving(false)
    }
  }

  const activeSection = sections.find((s) => s.id === activeSectionId)

  // Section CRUD
  function addSection() {
    const newId = `section_${Date.now()}`
    const newSec: HelpSection = {
      id: newId,
      title: 'Mục hướng dẫn mới',
      description: null,
      orderIndex: sections.length + 1,
      items: [],
    }
    setSections([...sections, newSec])
    setActiveSectionId(newId)
  }

  function deleteSection(id: string) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa mục hướng dẫn này cùng toàn bộ nội dung của nó?')) return
    const filtered = sections.filter((s) => s.id !== id)
    setSections(filtered)
    if (activeSectionId === id && filtered.length > 0) {
      setActiveSectionId(filtered[0].id)
    }
  }

  function updateSectionMeta(field: 'title' | 'description', value: string) {
    setSections(
      sections.map((s) => (s.id === activeSectionId ? { ...s, [field]: value || null } : s))
    )
  }

  function moveSection(index: number, direction: 'up' | 'down') {
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= sections.length) return
    const updated = [...sections]
    const temp = updated[index]
    updated[index] = updated[nextIndex]
    updated[nextIndex] = temp
    setSections(updated)
  }

  // Item CRUD
  function addItem() {
    if (!activeSection) return
    const newItem: HelpItem = {
      id: `item_${Date.now()}`,
      sectionId: activeSection.id,
      type: 'step',
      title: null,
      content: 'Nhập nội dung hướng dẫn tại đây...',
      orderIndex: activeSection.items.length + 1,
    }
    setSections(
      sections.map((s) =>
        s.id === activeSection.id ? { ...s, items: [...s.items, newItem] } : s
      )
    )
  }

  function updateItem(itemId: string, field: keyof HelpItem, value: any) {
    if (!activeSection) return
    setSections(
      sections.map((s) => {
        if (s.id !== activeSection.id) return s
        return {
          ...s,
          items: s.items.map((item) =>
            item.id === itemId ? { ...item, [field]: value } : item
          ),
        }
      })
    )
  }

  function deleteItem(itemId: string) {
    if (!activeSection) return
    setSections(
      sections.map((s) => {
        if (s.id !== activeSection.id) return s
        return {
          ...s,
          items: s.items.filter((item) => item.id !== itemId),
        }
      })
    )
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    if (!activeSection) return
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= activeSection.items.length) return
    const updatedItems = [...activeSection.items]
    const temp = updatedItems[index]
    updatedItems[index] = updatedItems[nextIndex]
    updatedItems[nextIndex] = temp

    setSections(
      sections.map((s) => (s.id === activeSection.id ? { ...s, items: updatedItems } : s))
    )
  }

  if (loading) {
    return <PageLoader label="Đang tải dữ liệu cẩm nang..." />
  }

  const checklistItems = sections.flatMap((sec) => sec.items || []).filter((it) => it.type === 'checklist')

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4 rounded-xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <Link to="/admin/dashboard" className="hover:text-primary">Trang chủ</Link>
            <span>/</span>
            <span className="text-slate-600">Biên tập Cẩm nang Help</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Biên tập Cẩm nang hướng dẫn</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className="px-4 py-2 text-xs font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            {previewMode ? 'Quay lại soạn thảo' : 'Xem trước giao diện (Preview)'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-xs font-bold bg-[#003366] text-white hover:bg-[#002b56] active:scale-[0.98] transition-all rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {saving && <Spinner className="h-3.5 w-3.5" />}
            Lưu thay đổi
          </button>
        </div>
      </div>

      {previewMode ? (
        /* ─── LIVE PREVIEW MODE ─── */
        <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white p-6 space-y-6">
          <div className="bg-[#003366] text-white px-4 py-3 rounded-lg flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider">Màn hình xem trước giao diện của sinh viên</span>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-medium">Chưa lưu vào DB</span>
          </div>

          <div className="min-h-screen bg-slate-50 text-slate-800 font-sans rounded-lg overflow-hidden border border-slate-200">
            <header className="bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 text-white shadow-md border-b border-white/10">
              <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-inner overflow-hidden p-1 select-none shrink-0">
                    <img
                      src={`${import.meta.env.BASE_URL}logo-final.png`}
                      alt="UET Logo"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold tracking-wide text-white flex items-center gap-1.5">
                      UET OASIS <span className="text-[10px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded tracking-wide uppercase border border-white/15">Cẩm nang</span>
                    </h1>
                    <p className="text-xs text-white/80 font-medium">Hướng dẫn sử dụng dành cho sinh viên Lập trình hướng đối tượng</p>
                  </div>
                </div>
                <button className="px-4 py-2 text-xs font-bold text-teal-600 bg-white hover:bg-slate-50 rounded-lg shadow-sm border border-transparent disabled:opacity-50" disabled>
                  Đăng nhập
                </button>
              </div>
            </header>

            <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[260px_1fr]">
              <aside className="hidden lg:block">
                <div className="sticky top-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
                    Mục lục hướng dẫn
                  </p>
                  <nav className="space-y-1">
                    {sections.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-teal-50 hover:text-teal-600 transition-all"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                        {section.title}
                      </a>
                    ))}
                  </nav>
                </div>
              </aside>

              <div className="space-y-6">
                <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-8 shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-widest text-teal-600 select-none">
                    Khởi động nhanh
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-800 leading-snug">
                    Làm bài Java OOP trên website, biên dịch trực tiếp bằng máy cá nhân
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-slate-600 max-w-3xl">
                    Hệ thống UET OASIS cung cấp trình soạn thảo trực tuyến chuyên nghiệp. Trình biên dịch Java sẽ được chạy trực tiếp trên máy tính cá nhân của bạn thông qua phần mềm <strong>Local Executor</strong>, đảm bảo tốc độ biên dịch tối ưu và trải nghiệm làm bài tốt nhất.
                  </p>
                </section>

                {sections.map((sec) => {
                  const steps = sec.items.filter((it) => it.type === 'step')
                  const infos = sec.items.filter((it) => it.type === 'info')
                  const faqs = sec.items.filter((it) => it.type === 'faq')

                  return (
                    <section
                      key={sec.id}
                      id={sec.id}
                      className="scroll-mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm border-l-4 border-l-teal-600"
                    >
                      <h2 className="mb-4 text-base font-bold text-slate-800 border-b border-slate-100 pb-3">
                        {sec.title}
                      </h2>
                      <div className="space-y-3">
                        {sec.description && (
                          <p className="mb-4 text-xs leading-relaxed text-slate-500 font-semibold">{sec.description}</p>
                        )}
                        {steps.length > 0 && (
                          <ol className="space-y-3.5">
                            {steps.map((item, index) => (
                              <li key={item.id} className="flex gap-3.5 text-xs leading-relaxed text-slate-600 font-medium">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white shadow-sm">
                                  {index + 1}
                                </span>
                                <span className="pt-0.5 w-full">{renderContent(item.content)}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {infos.length > 0 && (
                          <div className="mt-5 grid gap-4 md:grid-cols-2">
                            {infos.map((info) => (
                              <div key={info.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 hover:bg-teal-50/30 transition-colors">
                                <h3 className="text-xs font-bold text-slate-800">{info.title}</h3>
                                <p className="mt-2 text-xs leading-relaxed text-slate-500 font-medium">{renderContent(info.content)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {faqs.length > 0 && (
                          <div className="space-y-3">
                            {faqs.map((faq) => (
                              <div key={faq.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 hover:bg-slate-50 transition-colors">
                                <h3 className="text-xs font-bold text-slate-800">{faq.title}</h3>
                                <p className="mt-2 text-xs leading-relaxed text-slate-500 font-medium">{renderContent(faq.content)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>
                  )
                })}

                {checklistItems.length > 0 && (
                  <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-6 shadow-sm">
                    <h2 className="text-base font-bold text-teal-900 flex items-center gap-2">
                      <span className="text-lg">✓</span> Checklist chuẩn bị trước khi làm bài kiểm tra
                    </h2>
                    <div className="mt-4 grid gap-3 text-xs text-teal-900 md:grid-cols-2">
                      {checklistItems.map((item) => (
                        <div key={item.id} className="rounded-lg border border-teal-200/50 bg-white px-4 py-3 font-bold text-teal-800 shadow-sm flex items-center gap-2 select-none">
                          <span className="text-teal-500 font-black text-sm">✓</span>
                          {renderContent(item.content)}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </main>
          </div>
        </div>
      ) : (
        /* ─── EDIT MODE ─── */
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Left list panel: Sections list */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between min-h-[500px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 select-none">Danh mục đầu mục</span>
                <button
                  type="button"
                  onClick={addSection}
                  className="px-2 py-1 text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded transition-colors cursor-pointer"
                >
                  + Thêm mới
                </button>
              </div>

              <div className="space-y-1.5">
                {sections.map((sec, idx) => (
                  <div
                    key={sec.id}
                    className={`flex items-center justify-between rounded-lg p-2 transition-colors ${
                      sec.id === activeSectionId
                        ? 'bg-[#003366]/5 border border-[#003366]/20'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveSectionId(sec.id)}
                      className="text-left font-bold text-xs text-slate-700 truncate w-32 outline-none"
                    >
                      {sec.title}
                    </button>

                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveSection(idx, 'up')}
                        disabled={idx === 0}
                        className="text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1"
                        title="Di chuyển lên"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(idx, 'down')}
                        disabled={idx === sections.length - 1}
                        className="text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer px-1"
                        title="Di chuyển xuống"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSection(sec.id)}
                        className="text-[10px] text-rose-500 hover:text-rose-700 cursor-pointer px-1"
                        title="Xóa đầu mục"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Editor Pane */}
          {activeSection ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
              <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center justify-between">
                <span>Chỉnh sửa: <span className="text-[#003366]">{activeSection.title}</span></span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">ID: {activeSection.id}</span>
              </h2>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Tiêu đề Mục</label>
                  <input
                    type="text"
                    value={activeSection.title}
                    onChange={(e) => updateSectionMeta('title', e.target.value)}
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-[#003366] hover:border-slate-300"
                    placeholder="Nhập tiêu đề mục..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Mô tả Section (Không bắt buộc)</label>
                  <input
                    type="text"
                    value={activeSection.description || ''}
                    onChange={(e) => updateSectionMeta('description', e.target.value)}
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-[#003366] hover:border-slate-300"
                    placeholder="Mô tả tóm tắt..."
                  />
                </div>
              </div>

              {/* Items List in Active Section */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800">Khối nội dung hướng dẫn</h3>
                  <button
                    type="button"
                    onClick={addItem}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-[#003366] hover:bg-[#002b56] rounded-lg transition-colors cursor-pointer"
                  >
                    + Thêm nội dung
                  </button>
                </div>

                <div className="space-y-4">
                  {activeSection.items.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-6 text-center">Chưa có khối nội dung nào. Bấm nút Thêm nội dung phía trên.</p>
                  ) : (
                    activeSection.items.map((item, idx) => (
                      <div key={item.id} className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50 space-y-3 relative hover:border-slate-300 transition-colors">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-400 font-mono">#{idx + 1}</span>
                            <select
                              value={item.type}
                              onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                              className="h-7 rounded border border-slate-300 bg-white px-2 py-0 text-xs font-bold text-slate-700 outline-none cursor-pointer"
                            >
                              <option value="step">Bước thực hiện (Numbered List)</option>
                              <option value="info">Thẻ thông tin (Info Card)</option>
                              <option value="faq">Câu hỏi thường gặp (FAQ Item)</option>
                              <option value="checklist">Checklist chuẩn bị</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveItem(idx, 'up')}
                              disabled={idx === 0}
                              className="text-[11px] border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 rounded px-2 py-0.5 cursor-pointer font-bold"
                            >
                              Lên
                            </button>
                            <button
                              type="button"
                              onClick={() => moveItem(idx, 'down')}
                              disabled={idx === activeSection.items.length - 1}
                              className="text-[11px] border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 rounded px-2 py-0.5 cursor-pointer font-bold"
                            >
                              Xuống
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteItem(item.id)}
                              className="text-[11px] border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded px-2 py-0.5 cursor-pointer font-bold"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>

                        {/* Title input for Info Card / FAQ */}
                        {(item.type === 'info' || item.type === 'faq') && (
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Tiêu đề (Nếu có)</label>
                            <input
                              type="text"
                              value={item.title || ''}
                              onChange={(e) => updateItem(item.id, 'title', e.target.value)}
                              className="block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 shadow-sm outline-none focus:border-[#003366]"
                              placeholder="Tiêu đề..."
                            />
                          </div>
                        )}

                        {/* Content text area */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Nội dung văn bản</label>
                          <textarea
                            value={item.content}
                            onChange={(e) => updateItem(item.id, 'content', e.target.value)}
                            rows={3}
                            className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-[#003366] font-mono leading-relaxed"
                            placeholder="Nhập nội dung hướng dẫn tại đây..."
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center italic text-slate-400 text-xs">
              Chưa chọn mục hướng dẫn nào hoặc không có dữ liệu. Vui lòng bấm nút Thêm mới ở danh mục để bắt đầu.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Custom parser to dynamically render markdown-like images e.g. ![alt](src)
function renderContent(text: string) {
  const imgRegex = /!\[(.*?)\]\((.*?)\)/g
  const parts = []
  let lastIndex = 0
  let match

  while ((match = imgRegex.exec(text)) !== null) {
    const matchIndex = match.index
    if (matchIndex > lastIndex) {
      parts.push(<span key={lastIndex}>{text.substring(lastIndex, matchIndex)}</span>)
    }
    const alt = match[1]
    const src = match[2]
    const resolvedSrc = src.startsWith('http') ? src : `${import.meta.env.BASE_URL}${src.startsWith('/') ? src.slice(1) : src}`
    parts.push(
      <div key={matchIndex} className="my-4 flex flex-col items-center select-none max-w-full">
        <img
          src={resolvedSrc}
          alt={alt}
          className="max-w-full h-auto rounded-lg border border-slate-200 shadow-md max-h-[320px] object-contain bg-white p-1"
        />
        {alt && <span className="mt-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">{alt}</span>}
      </div>
    )
    lastIndex = imgRegex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(<span key={lastIndex}>{text.substring(lastIndex)}</span>)
  }

  return parts.length > 0 ? <span className="inline-block w-full">{parts}</span> : text
}
