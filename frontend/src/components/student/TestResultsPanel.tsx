import { ExecutionResult, TestResult, CompilationError } from '../../hooks/useLocalExecutor'

interface TestResultsPanelProps {
  result: ExecutionResult | null
  isRunning?: boolean
}

function CompilationErrorsView({ errors }: { errors: CompilationError[] }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 p-3">
      <h4 className="mb-2 text-sm font-medium text-red-800">Compilation Errors</h4>
      <ul className="space-y-1">
        {errors.map((error, index) => (
          <li key={index} className="text-xs text-red-700">
            {error.line > 0 && (
              <span className="mr-1 inline-block rounded bg-red-200 px-1.5 py-0.5 font-mono text-red-800">
                Line {error.line}
              </span>
            )}
            <span>{error.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TestCaseResult({ testResult }: { testResult: TestResult }) {
  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    passed: { color: 'text-green-800', bg: 'bg-green-100 border-green-200', label: 'Passed' },
    failed: { color: 'text-red-800', bg: 'bg-red-100 border-red-200', label: 'Failed' },
    timeout: { color: 'text-yellow-800', bg: 'bg-yellow-100 border-yellow-200', label: 'Timeout' },
    error: { color: 'text-red-800', bg: 'bg-red-100 border-red-200', label: 'Error' },
  }

  const config = statusConfig[testResult.status] || statusConfig.error

  return (
    <div className={`rounded border p-2 ${config.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${config.color}`}>
            {config.label}
          </span>
          <span className="text-xs text-gray-500">
            Test: {testResult.id}
          </span>
        </div>
        {testResult.executionTimeMs !== undefined && (
          <span className="text-xs text-gray-500">
            {testResult.executionTimeMs}ms
          </span>
        )}
      </div>
      {testResult.status === 'failed' && testResult.actualOutput && (
        <div className="mt-1">
          <p className="text-xs text-gray-600">
            <span className="font-medium">Actual output:</span>
          </p>
          <pre className="mt-0.5 rounded bg-white/50 p-1 text-xs text-gray-700">
            {testResult.actualOutput}
          </pre>
        </div>
      )}
      {testResult.status === 'error' && testResult.error && (
        <p className="mt-1 text-xs text-red-600">{testResult.error}</p>
      )}
    </div>
  )
}

export function TestResultsPanel({ result, isRunning }: TestResultsPanelProps) {
  if (isRunning) {
    return (
      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-gray-600">Running tests...</span>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="rounded border border-gray-200 bg-white p-4">
        <p className="text-center text-sm text-gray-400">
          Run your code to see test results
        </p>
      </div>
    )
  }

  // Compilation errors
  if (!result.compiled && result.errors && result.errors.length > 0) {
    return (
      <div className="rounded border border-gray-200 bg-white p-4">
        <CompilationErrorsView errors={result.errors} />
      </div>
    )
  }

  // Test results
  if (result.compiled && result.testResults) {
    const passed = result.testResults.filter((r) => r.status === 'passed').length
    const total = result.testResults.length

    return (
      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700">Test Results</h4>
          <span
            className={`text-xs font-medium ${
              passed === total ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {passed}/{total} passed
          </span>
        </div>
        <div className="space-y-2">
          {result.testResults.map((testResult) => (
            <TestCaseResult key={testResult.id} testResult={testResult} />
          ))}
        </div>
      </div>
    )
  }

  return null
}
