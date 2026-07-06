import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { api } from '../../lib/api'
import { PageLoader } from '../../components/ui'

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

export function StudentGuidePage() {
  const [sections, setSections] = useState<HelpSection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/help-guide')
      .then((res) => {
        const sorted = (res.data || []).map((sec: any) => ({
          ...sec,
          items: (sec.items || []).sort((a: any, b: any) => a.orderIndex - b.orderIndex),
        })).sort((a: any, b: any) => a.orderIndex - b.orderIndex)
        setSections(sorted)
      })
      .catch((err) => {
        console.error('Error fetching help content:', err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <PageLoader label="Đang tải cẩm nang hướng dẫn..." />
  }

  const checklistItems = sections.flatMap((sec) => sec.items || []).filter((it) => it.type === 'checklist')

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
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
          <Link
            to="/login"
            className="px-4 py-2 text-xs font-bold text-teal-600 bg-white hover:bg-slate-50 active:scale-[0.98] transition-all rounded-lg shadow-sm cursor-pointer"
          >
            Đăng nhập
          </Link>
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
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-teal-50 hover:text-teal-600 transition-all duration-150 active:scale-[0.98] cursor-pointer"
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
            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full -mr-8 -mt-8 blur-lg" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full -ml-12 -mb-12 blur-xl" />
            
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
              <GuideSection key={sec.id} id={sec.id} title={sec.title}>
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
                      <InfoCard key={info.id} title={info.title || ''} text={info.content} />
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
              </GuideSection>
            )
          })}

          {checklistItems.length > 0 && (
            <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-6 shadow-sm">
              <h2 className="text-base font-bold text-teal-900 flex items-center gap-2">
                <span className="text-lg">✓</span> Checklist chuẩn bị trước khi làm bài kiểm tra
              </h2>
              <div className="mt-4 grid gap-3 text-xs text-teal-900 md:grid-cols-2">
                {checklistItems.map((item) => (
                  <ChecklistItem key={item.id} text={item.content} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

function GuideSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm border-l-4 border-l-teal-600">
      <h2 className="mb-4 text-base font-bold text-slate-800 border-b border-slate-100 pb-3">{title}</h2>
      <div className="space-y-3">
        {children}
      </div>
    </section>
  )
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 hover:bg-teal-50/30 transition-colors">
      <h3 className="text-xs font-bold text-slate-800">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-500 font-medium">{renderContent(text)}</p>
    </div>
  )
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-teal-200/50 bg-white px-4 py-3 font-bold text-teal-800 shadow-sm flex items-center gap-2 select-none">
      <span className="text-teal-500 font-black text-sm">✓</span>
      {renderContent(text)}
    </div>
  )
}
