import { useEffect, useRef, useState } from 'react'
import { useLocalExecutor } from '../../hooks/useLocalExecutor'

export function LocalExecutorStatusButton() {
  const { status, connectionError, isConnected, connect } = useLocalExecutor()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const downloadUrl = `${import.meta.env.BASE_URL}downloads/oop-local-executor-1.0.0.zip`

  useEffect(() => {
    connect()
  }, [connect])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const config = isConnected
    ? {
        dot: 'bg-emerald-400',
        text: 'Sẵn sàng',
        className: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50',
      }
    : status === 'connecting'
      ? {
          dot: 'bg-amber-300 animate-pulse',
          text: 'Đang kiểm tra',
          className: 'border-amber-300/30 bg-amber-300/10 text-amber-50',
        }
      : {
          dot: 'bg-red-400',
          text: 'Chưa kết nối',
          className: 'border-red-300/30 bg-red-400/10 text-red-50',
        }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => {
          connect()
          setOpen((value) => !value)
        }}
        className={`hidden h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition hover:bg-white/15 md:inline-flex ${config.className}`}
        aria-label="Kiểm tra Local Executor"
        title="Kiểm tra Local Executor"
      >
        <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden="true" />
        <span>Executor</span>
        <span className="font-semibold opacity-85">{config.text}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          connect()
          setOpen((value) => !value)
        }}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:bg-white/15 md:hidden ${config.className}`}
        aria-label="Kiểm tra Local Executor"
        title="Kiểm tra Local Executor"
      >
        <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-xl ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Local Executor</p>
              <p className="mt-0.5 text-xs text-slate-500">ws://127.0.0.1:9876</p>
            </div>
            <span
              className={`rounded-md px-2 py-1 text-xs font-bold ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : status === 'connecting'
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    : 'bg-red-50 text-red-700 ring-1 ring-red-200'
              }`}
            >
              {config.text}
            </span>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Giữ cửa sổ Local Executor đang chạy trong lúc làm bài. Nếu vừa bật executor, bấm
            kiểm tra lại.
          </p>

          {connectionError?.message && (
            <p className="mt-3 rounded-md border border-red-100 bg-red-50 p-2 text-xs leading-5 text-red-700">
              {connectionError.message}
            </p>
          )}

          {connectionError?.setupInstructions && (
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-amber-100 bg-amber-50 p-2 text-xs leading-5 text-amber-800">
              {connectionError.setupInstructions}
            </pre>
          )}

          <pre className="mt-3 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-emerald-300">
            java -jar oop-local-executor-1.0.0.jar
          </pre>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={connect}
              className="btn-primary h-9 px-3 text-xs"
            >
              Kiểm tra lại
            </button>
            <a href={downloadUrl} className="btn-secondary h-9 px-3 text-xs" download>
              Tải bản chạy nhanh
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
