export interface JUnitAssertionSummary {
  assertion: string
  label: string
  expected?: string
  actual?: string
  condition?: string
  raw: string
}

const ASSERT_CALL_PATTERN = /\b(?:[A-Za-z_][\w]*\.)?(assert[A-Z][A-Za-z0-9_]*)\s*\(/g
const JAVA_TEST_MARKER = '__OOP_JAVA_TEST__'

export function isJavaJUnitTestInput(inputData: string | null | undefined): boolean {
  return Boolean(inputData?.startsWith(JAVA_TEST_MARKER))
}

export function getJavaJUnitTestFileName(inputData: string | null | undefined): string {
  if (!inputData) return 'MyTest.java'
  const [, fileName] = inputData.split(/\r?\n/, 2)
  return fileName?.trim() || 'MyTest.java'
}

export function extractJUnitAssertionSummaries(
  source: string,
  maxItems = 8
): JUnitAssertionSummary[] {
  const summaries: JUnitAssertionSummary[] = []
  let match: RegExpExecArray | null

  ASSERT_CALL_PATTERN.lastIndex = 0
  while ((match = ASSERT_CALL_PATTERN.exec(source)) && summaries.length < maxItems) {
    const assertion = match[1]
    const openParenIndex = source.indexOf('(', match.index)
    const closeParenIndex = findMatchingParen(source, openParenIndex)
    if (closeParenIndex < 0) continue

    const args = splitTopLevelArgs(source.slice(openParenIndex + 1, closeParenIndex))
    const summary = buildSummary(assertion, args, source.slice(match.index, closeParenIndex + 1))
    if (summary) summaries.push(summary)
    ASSERT_CALL_PATTERN.lastIndex = closeParenIndex + 1
  }

  return summaries
}

function buildSummary(
  assertion: string,
  rawArgs: string[],
  raw: string
): JUnitAssertionSummary | null {
  const args = dropOptionalMessage(assertion, rawArgs).map(compactExpression)

  switch (assertion) {
    case 'assertEquals':
      return comparisonSummary(assertion, args, raw, 'phải bằng')
    case 'assertNotEquals':
      return comparisonSummary(assertion, args, raw, 'phải khác')
    case 'assertArrayEquals':
      return comparisonSummary(assertion, args, raw, 'phải có cùng phần tử với')
    case 'assertSame':
      return comparisonSummary(assertion, args, raw, 'phải cùng tham chiếu với')
    case 'assertNotSame':
      return comparisonSummary(assertion, args, raw, 'phải khác tham chiếu với')
    case 'assertTrue':
      return booleanConditionSummary(assertion, args, raw, true)
    case 'assertFalse':
      return booleanConditionSummary(assertion, args, raw, false)
    case 'assertNull':
      return nullConditionSummary(assertion, args, raw, true)
    case 'assertNotNull':
      return nullConditionSummary(assertion, args, raw, false)
    case 'assertThrows':
      return throwsSummary(args, raw)
    default:
      if (assertion.startsWith('assert')) {
        return {
          assertion,
          label: `${assertion}: ${args.join(', ')}`,
          raw: compactExpression(raw),
        }
      }
      return null
  }
}

function comparisonSummary(
  assertion: string,
  args: string[],
  raw: string,
  relation: string
): JUnitAssertionSummary | null {
  if (args.length < 2) return null

  const [expected, actual] = args
  const readableExpected = humanizeExpression(expected)
  const readableActual = humanizeExpression(actual)
  return {
    assertion,
    label: `${readableActual} ${relation} ${readableExpected}`,
    expected: readableExpected,
    actual: readableActual,
    raw: compactExpression(raw),
  }
}

function booleanConditionSummary(
  assertion: string,
  args: string[],
  raw: string,
  expectedValue: boolean
): JUnitAssertionSummary | null {
  if (args.length < 1) return null
  const condition = args[0]
  const readableCondition = describeKnownBooleanCondition(condition, expectedValue)
  const fallbackValue = expectedValue ? 'true' : 'false'

  return {
    assertion,
    label: readableCondition ?? `${humanizeExpression(condition)} phải trả về ${fallbackValue}`,
    condition,
    raw: compactExpression(raw),
  }
}

function nullConditionSummary(
  assertion: string,
  args: string[],
  raw: string,
  expectsNull: boolean
): JUnitAssertionSummary | null {
  if (args.length < 1) return null
  const condition = args[0]
  const readableCondition = humanizeExpression(condition)
  return {
    assertion,
    label: expectsNull
      ? `${readableCondition} phải là null`
      : `${readableCondition} không được null`,
    condition,
    raw: compactExpression(raw),
  }
}

function throwsSummary(args: string[], raw: string): JUnitAssertionSummary | null {
  if (args.length < 2) return null
  const [expected, executable] = args
  const readableExpected = humanizeExpression(expected)
  const readableExecutable = humanizeExpression(executable)
  return {
    assertion: 'assertThrows',
    label: `${readableExecutable} phải ném ${readableExpected}`,
    expected: readableExpected,
    actual: readableExecutable,
    raw: compactExpression(raw),
  }
}

function describeKnownBooleanCondition(condition: string, expectedValue: boolean): string | null {
  const fieldModifierMatch = condition.match(
    /^(?:[A-Za-z_$][\w$]*\.)?Modifier\.is(Private|Public|Protected|Static|Final)\(([A-Za-z_$][\w$]*)\.class\.getDeclaredField\("([^"]+)"\)\.getModifiers\(\)\)$/
  )
  if (fieldModifierMatch) {
    const [, modifier, className, fieldName] = fieldModifierMatch
    const phrase = `Thuộc tính ${fieldName} của lớp ${className}`
    return `${phrase} ${expectedValue ? 'phải' : 'không được'} là ${modifier.toLowerCase()}`
  }

  const methodModifierMatch = condition.match(
    /^(?:[A-Za-z_$][\w$]*\.)?Modifier\.is(Private|Public|Protected|Static|Final)\(([A-Za-z_$][\w$]*)\.class\.getDeclaredMethod\("([^"]+)"(?:,\s*.*)?\)\.getModifiers\(\)\)$/
  )
  if (methodModifierMatch) {
    const [, modifier, className, methodName] = methodModifierMatch
    const phrase = `Phương thức ${methodName} của lớp ${className}`
    return `${phrase} ${expectedValue ? 'phải' : 'không được'} là ${modifier.toLowerCase()}`
  }

  return null
}

function humanizeExpression(expression: string): string {
  return expression.replace(/([A-Za-z_$][\w$]*)\.class\b/g, '$1')
}

function dropOptionalMessage(assertion: string, args: string[]): string[] {
  if (args.length < 2) return args

  const minimumWithoutMessage =
    assertion === 'assertTrue' ||
    assertion === 'assertFalse' ||
    assertion === 'assertNull' ||
    assertion === 'assertNotNull'
      ? 1
      : 2

  if (args.length > minimumWithoutMessage && isStringLiteral(args[0].trim())) {
    return args.slice(1)
  }

  return args
}

function isStringLiteral(value: string): boolean {
  return /^"([^"\\]|\\.)*"$/.test(value)
}

function compactExpression(value: string): string {
  const compacted = value.replace(/\s+/g, ' ').trim()
  return compacted.length > 120 ? `${compacted.slice(0, 117)}...` : compacted
}

function splitTopLevelArgs(argsSource: string): string[] {
  const args: string[] = []
  let start = 0
  let depth = 0
  let inString = false
  let inChar = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let i = 0; i < argsSource.length; i += 1) {
    const char = argsSource[i]
    const next = argsSource[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }

    if (inString || inChar) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (inString && char === '"') {
        inString = false
      } else if (inChar && char === "'") {
        inChar = false
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === "'") {
      inChar = true
      continue
    }

    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1)

    if (char === ',' && depth === 0) {
      args.push(argsSource.slice(start, i).trim())
      start = i + 1
    }
  }

  const last = argsSource.slice(start).trim()
  if (last) args.push(last)
  return args
}

function findMatchingParen(source: string, openParenIndex: number): number {
  let depth = 0
  let inString = false
  let inChar = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let i = openParenIndex; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }

    if (inString || inChar) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (inString && char === '"') {
        inString = false
      } else if (inChar && char === "'") {
        inChar = false
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === "'") {
      inChar = true
      continue
    }

    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }

  return -1
}
