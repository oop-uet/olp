import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestResultsPanel } from './TestResultsPanel'
import { ExecutionResult } from '../../hooks/useLocalExecutor'

describe('TestResultsPanel', () => {
  it('shows placeholder when no result is available', () => {
    render(<TestResultsPanel result={null} />)
    expect(screen.getByText('Run your code to see test results')).toBeInTheDocument()
  })

  it('shows loading spinner when running', () => {
    render(<TestResultsPanel result={null} isRunning={true} />)
    expect(screen.getByText('Running tests...')).toBeInTheDocument()
  })

  it('displays compilation errors with line numbers', () => {
    const result: ExecutionResult = {
      compiled: false,
      errors: [
        { line: 3, message: '; expected' },
        { line: 7, message: 'cannot find symbol' },
      ],
    }

    render(<TestResultsPanel result={result} />)

    expect(screen.getByText('Compilation Errors')).toBeInTheDocument()
    expect(screen.getByText('Line 3')).toBeInTheDocument()
    expect(screen.getByText('; expected')).toBeInTheDocument()
    expect(screen.getByText('Line 7')).toBeInTheDocument()
    expect(screen.getByText('cannot find symbol')).toBeInTheDocument()
  })

  it('displays test results with pass/fail counts', () => {
    const result: ExecutionResult = {
      compiled: true,
      testResults: [
        { id: 'test-1', status: 'passed', actualOutput: 'hello', executionTimeMs: 50 },
        { id: 'test-2', status: 'failed', actualOutput: 'wrong', executionTimeMs: 30 },
        { id: 'test-3', status: 'timeout', executionTimeMs: 5000 },
      ],
    }

    render(<TestResultsPanel result={result} />)

    expect(screen.getByText('Test Results')).toBeInTheDocument()
    expect(screen.getByText('1/3 passed')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Timeout')).toBeInTheDocument()
  })

  it('shows execution time for each test case', () => {
    const result: ExecutionResult = {
      compiled: true,
      testResults: [
        { id: 'test-1', status: 'passed', actualOutput: 'ok', executionTimeMs: 120 },
      ],
    }

    render(<TestResultsPanel result={result} />)
    expect(screen.getByText('120ms')).toBeInTheDocument()
  })

  it('shows actual output for failed tests', () => {
    const result: ExecutionResult = {
      compiled: true,
      testResults: [
        { id: 'test-1', status: 'failed', actualOutput: 'unexpected value', executionTimeMs: 10 },
      ],
    }

    render(<TestResultsPanel result={result} />)
    expect(screen.getByText('unexpected value')).toBeInTheDocument()
  })
})
