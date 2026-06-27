import { useEffect } from 'react'
import { useLocalExecutor, ConnectionStatus, TestCase, ExecutionResult } from '../../hooks/useLocalExecutor'

interface LocalExecutorBridgeProps {
  code: string
  testCases: TestCase[]
  onResult?: (result: ExecutionResult) => void
  onRunningChange?: (isRunning: boolean) => void
  autoConnect?: boolean
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    disconnected: 'bg-gray-400',
    error: 'bg-red-500',
  }

  const labels: Record<ConnectionStatus, string> = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
    error: 'Connection Error',
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`}
        aria-hidden="true"
      />
      <span className="text-xs text-gray-600">{labels[status]}</span>
    </div>
  )
}

export function LocalExecutorBridge({
  code,
  testCases,
  onResult,
  onRunningChange,
  autoConnect = true,
}: LocalExecutorBridgeProps) {
  const { status, connectionError, isConnected, connect, compileAndRun } = useLocalExecutor()

  useEffect(() => {
    if (autoConnect) {
      connect()
    }
  }, [autoConnect, connect])

  async function handleRunCode() {
    if (!isConnected) return

    onRunningChange?.(true)
    try {
      const result = await compileAndRun(code, testCases)
      onResult?.(result)
    } catch (err) {
      onResult?.({
        compiled: false,
        errors: [{ line: 0, message: err instanceof Error ? err.message : 'Unknown error' }],
      })
    } finally {
      onRunningChange?.(false)
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Local Executor</h3>
        <StatusDot status={status} />
      </div>

      {/* Error state with setup instructions */}
      {(status === 'error' || status === 'disconnected') && connectionError && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-3">
          <p className="mb-2 text-sm font-medium text-red-800">{connectionError.message}</p>
          {connectionError.setupInstructions && (
            <pre className="mb-3 whitespace-pre-wrap rounded bg-red-100 p-2 text-xs text-red-700">
              {connectionError.setupInstructions}
            </pre>
          )}
          <button
            onClick={connect}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
          >
            Retry
          </button>
        </div>
      )}

      {/* Disconnected without error */}
      {status === 'disconnected' && !connectionError && (
        <div className="mb-3 rounded border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-sm text-gray-600">
            Local Executor is not connected. Click connect to start.
          </p>
          <button
            onClick={connect}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
          >
            Connect
          </button>
        </div>
      )}

      {/* Connected state - show Run button */}
      {isConnected && (
        <button
          onClick={handleRunCode}
          disabled={!code.trim()}
          className="w-full rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ▶ Run Code
        </button>
      )}

      {/* Connecting state */}
      {status === 'connecting' && (
        <p className="text-center text-xs text-gray-500">Connecting to Local Executor...</p>
      )}
    </div>
  )
}
