import {
  extractJUnitAssertionSummaries,
  getJavaJUnitTestFileName,
} from '../../utils/junitAssertions'

interface JUnitFunctionalSummaryProps {
  inputData: string
  expectedOutput: string
  actualOutput: string
  passed: boolean
}

export function JUnitFunctionalSummary({
  inputData,
  expectedOutput,
  actualOutput,
  passed,
}: JUnitFunctionalSummaryProps) {
  const assertions = extractJUnitAssertionSummaries(expectedOutput)
  const fileName = getJavaJUnitTestFileName(inputData)
  const hasActualOutput = actualOutput.trim().length > 0

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">
              File kiểm thử JUnit
            </p>
            <p className="mt-1 font-bold text-slate-800 [overflow-wrap:anywhere]">{fileName}</p>
          </div>
          <span className="rounded bg-slate-50 px-2 py-1 font-mono text-xs font-bold text-slate-500">
            {assertions.length} assert
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">
          Yêu cầu kiểm thử
        </p>

        {assertions.length > 0 ? (
          <ol className="mt-3 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/80">
            {assertions.map((assertion, index) => (
              <li
                key={`${assertion.raw}-${index}`}
                className="grid min-w-0 grid-cols-[1.5rem,minmax(0,1fr)] gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 text-[10px] font-black text-primary">
                  {index + 1}
                </span>
                <span className="min-w-0 font-medium leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
                  {assertion.label}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
            Test này dùng JUnit, nhưng chưa trích được dòng assert để hiển thị rút gọn.
          </p>
        )}
      </div>

      {(!passed || hasActualOutput) && (
        <div className={`rounded-lg border p-4 ${passed ? 'border-emerald-100 bg-emerald-50/60' : 'border-rose-100 bg-rose-50/70'}`}>
          <p className={`text-xs font-black uppercase tracking-wider ${passed ? 'text-emerald-700' : 'text-rose-700'}`}>
            Kết quả chạy JUnit
          </p>
          <pre className={`mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-sm leading-6 ${passed ? 'text-emerald-800' : 'text-rose-700'}`}>
            {hasActualOutput ? actualOutput : 'Không có output.'}
          </pre>
        </div>
      )}
    </div>
  )
}
