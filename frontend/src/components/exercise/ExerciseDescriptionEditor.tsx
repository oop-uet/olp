import { ChangeEvent, ReactNode, useRef, useState } from 'react'

interface ExerciseDescriptionEditorProps {
  value: string
  onChange: (value: string) => void
  error?: string
  maxLength?: number
}

const DEFAULT_MAX_LENGTH = 5000
const MAX_EMBEDDED_IMAGE_CHARS = 4200

function resolveImageSrc(src: string) {
  const trimmed = src.trim()
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed
  }

  if (trimmed.startsWith('/')) {
    return `${import.meta.env.BASE_URL}${trimmed.slice(1)}`
  }

  return `${import.meta.env.BASE_URL}${trimmed}`
}

function renderImage(alt: string, src: string, key: string | number) {
  return (
    <figure key={key} className="my-4 rounded-lg border border-slate-200 bg-white p-3">
      <img
        src={resolveImageSrc(src)}
        alt={alt}
        className="mx-auto max-h-[420px] max-w-full rounded border border-slate-100 object-contain"
      />
      {alt && (
        <figcaption className="mt-2 text-center text-xs font-semibold text-slate-500">
          {alt}
        </figcaption>
      )}
    </figure>
  )
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(!\[[^\]]*]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const imageMatch = part.match(/^!\[([^\]]*)]\(([^)]+)\)$/)
      if (imageMatch) {
        return renderImage(imageMatch[1], imageMatch[2], index)
      }

      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={index}
            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary"
          >
            {part.slice(1, -1)}
          </code>
        )
      }

      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className="font-bold text-slate-900">
            {renderInlineMarkdown(part.slice(2, -2))}
          </strong>
        )
      }

      return <span key={index}>{part}</span>
    })
}

export function ExerciseMarkdownContent({ value }: { value: string }) {
  const blocks: ReactNode[] = []
  const bulletItems: ReactNode[] = []

  function flushBullets() {
    if (bulletItems.length === 0) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-2 pl-5 text-sm leading-7 text-slate-700">
        {bulletItems.splice(0).map((item, index) => (
          <li key={index} className="list-disc">
            {item}
          </li>
        ))}
      </ul>
    )
  }

  value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) {
      flushBullets()
      return
    }

    const imageOnlyMatch = line.match(/^!\[([^\]]*)]\(([^)]+)\)$/)
    if (imageOnlyMatch) {
      flushBullets()
      blocks.push(renderImage(imageOnlyMatch[1], imageOnlyMatch[2], index))
      return
    }

    if (line.startsWith('### ')) {
      flushBullets()
      blocks.push(
        <h4 key={index} className="pt-2 text-sm font-bold uppercase tracking-wider text-slate-600">
          {renderInlineMarkdown(line.slice(4))}
        </h4>
      )
      return
    }

    if (line.startsWith('## ')) {
      flushBullets()
      blocks.push(
        <h3 key={index} className="pt-3 text-base font-bold text-slate-900">
          {renderInlineMarkdown(line.slice(3))}
        </h3>
      )
      return
    }

    if (line.startsWith('# ')) {
      flushBullets()
      blocks.push(
        <h2 key={index} className="text-lg font-bold text-slate-900">
          {renderInlineMarkdown(line.slice(2))}
        </h2>
      )
      return
    }

    if (line.endsWith(':') && !line.includes('://')) {
      flushBullets()
      blocks.push(
        <p key={index} className="text-sm font-black leading-7 text-slate-900">
          {renderInlineMarkdown(line)}
        </p>
      )
      return
    }

    if (/^[-*]\s+/.test(line)) {
      bulletItems.push(renderInlineMarkdown(line.replace(/^[-*]\s+/, '')))
      return
    }

    const orderedListMatch = line.match(/^\d+\.\s+(.+)$/)
    if (orderedListMatch) {
      flushBullets()
      blocks.push(
        <p key={index} className="text-sm font-semibold leading-7 text-slate-800">
          {renderInlineMarkdown(orderedListMatch[1])}
        </p>
      )
      return
    }

    flushBullets()
    blocks.push(
      <p key={index} className="text-sm leading-7 text-slate-700">
        {renderInlineMarkdown(line)}
      </p>
    )
  })

  flushBullets()

  return <div className="space-y-4">{blocks}</div>
}

export function ExerciseDescriptionEditor({
  value,
  onChange,
  error,
  maxLength = DEFAULT_MAX_LENGTH,
}: ExerciseDescriptionEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('Biểu đồ lớp')
  const [imageError, setImageError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  function insertMarkdown(markdown: string) {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    const prefix = start > 0 && !value.slice(0, start).endsWith('\n') ? '\n\n' : ''
    const suffix = value.slice(end).startsWith('\n') ? '\n' : '\n\n'
    const nextValue = `${value.slice(0, start)}${prefix}${markdown}${suffix}${value.slice(end)}`

    if (nextValue.length > maxLength) {
      setImageError(`Nội dung mô tả sẽ vượt ${maxLength} ký tự. Hãy dùng URL ảnh hoặc ảnh nhỏ hơn.`)
      return
    }

    onChange(nextValue)
    setImageError(null)

    window.requestAnimationFrame(() => {
      textarea?.focus()
      const nextCursor = start + prefix.length + markdown.length
      textarea?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function insertImageUrl() {
    const src = imageUrl.trim()
    if (!src) {
      setImageError('Nhập URL hoặc đường dẫn ảnh trước khi chèn.')
      return
    }

    insertMarkdown(`![${imageAlt.trim() || 'Hình minh họa'}](${src})`)
    setImageUrl('')
  }

  function handleImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setImageError('Chỉ hỗ trợ file ảnh.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      if (dataUrl.length > MAX_EMBEDDED_IMAGE_CHARS) {
        setImageError('Ảnh quá lớn để nhúng trực tiếp. Hãy upload ảnh lên Drive/GitHub/CDN rồi chèn URL.')
        return
      }

      insertMarkdown(`![${imageAlt.trim() || file.name}](${dataUrl})`)
    }
    reader.onerror = () => setImageError('Không đọc được file ảnh.')
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      <textarea
        ref={textareaRef}
        id="description"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setImageError(null)
        }}
        maxLength={maxLength}
        rows={9}
        className={`input font-mono text-sm leading-6 ${error ? 'input-error' : ''}`}
        placeholder={[
          '# Tiêu đề bài',
          '',
          '## Yêu cầu',
          '- Mô tả lớp, thuộc tính và phương thức cần cài đặt.',
          '',
          '![Biểu đồ lớp](https://example.com/class-diagram.png)',
        ].join('\n')}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            🖼️ Chèn hình ảnh / Biểu đồ lớp (UML Class Diagram)
          </span>
          <button
            type="button"
            onClick={() => setPreviewOpen((open) => !open)}
            className="btn-ghost btn-sm text-xs font-bold text-primary hover:bg-primary-50"
          >
            {previewOpen ? '👁️ Ẩn xem trước' : '👁️ Xem trước Markdown'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-full sm:w-48">
            <input
              value={imageAlt}
              onChange={(event) => setImageAlt(event.target.value)}
              className="input h-9 py-1 text-xs"
              placeholder="Chú thích (VD: Biểu đồ lớp)"
            />
          </div>
          <div className="flex-1 min-w-[240px]">
            <input
              value={imageUrl}
              onChange={(event) => {
                setImageUrl(event.target.value)
                setImageError(null)
              }}
              className="input h-9 py-1 text-xs"
              placeholder="URL ảnh (VD: https://... hoặc /downloads/class-diagram.png)"
            />
          </div>
          <button
            type="button"
            onClick={insertImageUrl}
            className="btn-primary btn-sm h-9 px-4 whitespace-nowrap text-xs font-bold"
          >
            Chèn URL
          </button>
          <label className="btn-secondary btn-sm h-9 px-3.5 whitespace-nowrap cursor-pointer text-xs font-bold">
            Tải ảnh nhỏ
            <input type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
          </label>
        </div>

        <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
          <span>💡</span> Khuyến nghị sử dụng URL ảnh (hoặc CDN/GitHub) cho biểu đồ lớp để đề bài gọn nhẹ và dễ bảo trì.
        </p>

        {imageError && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            {imageError}
          </p>
        )}
      </div>

      {previewOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            Xem trước nội dung hiển thị cho sinh viên:
          </div>
          <ExerciseMarkdownContent value={value || 'Chưa có nội dung mô tả.'} />
        </div>
      )}
    </div>
  )
}
