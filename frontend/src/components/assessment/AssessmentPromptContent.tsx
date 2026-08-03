import { ReactNode } from 'react'

interface AssessmentPromptContentProps {
  text: string | null | undefined
  className?: string
  protectedText?: boolean
}

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\\([{}])/g, '$1')
}

function isLikelyCodeLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  // Explicit code statements / keywords in Java/OOP
  if (
    /^(class\s|interface\s|enum\s|public\s|private\s|protected\s|static\s|void\s|int\s|double\s|float\s|boolean\s|char\s|String\s|import\s|package\s|for\s*\(|while\s*\(|if\s*\(|switch\s*\(|try\s*\{|catch\s*\(|new\s|return\s|@Override)/.test(
      trimmed
    )
  ) {
    return true
  }

  // Statements ending with semicolon or brackets that look like Java code
  if (
    /[;{}]\s*$/.test(trimmed) &&
    (trimmed.includes('System.out') ||
      trimmed.includes('new ') ||
      trimmed.includes('()') ||
      trimmed.includes('=') ||
      trimmed.includes('println') ||
      trimmed.includes('print(') ||
      trimmed.includes('main(') ||
      trimmed.includes('this.') ||
      trimmed.includes('super.'))
  ) {
    return true
  }

  // Variable assignment or method calls like "A obj = new B(); obj.show();"
  if (/\b[A-Za-z0-9_]+\s+[A-Za-z0-9_]+\s*=\s*new\s+[A-Za-z0-9_]+\(/.test(trimmed)) {
    return true
  }

  return false
}

function renderInlineFormatting(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={index}
            className="mx-0.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-teal-800 border border-slate-200/80"
          >
            {part.slice(1, -1)}
          </code>
        )
      }

      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className="font-extrabold text-slate-900">
            {renderInlineFormatting(part.slice(2, -2))}
          </strong>
        )
      }

      return <span key={index}>{part}</span>
    })
}

export function AssessmentPromptContent({
  text,
  className = '',
  protectedText = true,
}: AssessmentPromptContentProps) {
  const cleaned = cleanText(text)
  if (!cleaned) return null

  // 1. Check for explicit triple backtick code blocks (```java ... ```)
  const codeBlockRegex = /```(?:[a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)```/g
  if (codeBlockRegex.test(cleaned)) {
    const elements: ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    codeBlockRegex.lastIndex = 0
    while ((match = codeBlockRegex.exec(cleaned)) !== null) {
      const textBefore = cleaned.slice(lastIndex, match.index)
      if (textBefore.trim()) {
        elements.push(
          <AssessmentPromptContent
            key={`text-${lastIndex}`}
            text={textBefore}
            protectedText={protectedText}
          />
        )
      }

      const codeContent = match[1].trimEnd()
      elements.push(
        <div
          key={`code-${match.index}`}
          className="my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 shadow-sm"
          {...(protectedText ? { 'data-assessment-protected-text': 'true' } : {})}
        >
          <pre className="font-mono">{codeContent}</pre>
        </div>
      )

      lastIndex = match.index + match[0].length
    }

    const textAfter = cleaned.slice(lastIndex)
    if (textAfter.trim()) {
      elements.push(
        <AssessmentPromptContent
          key={`text-${lastIndex}`}
          text={textAfter}
          protectedText={protectedText}
        />
      )
    }

    return (
      <div
        className={`space-y-1.5 ${className}`}
        {...(protectedText ? { 'data-assessment-protected-text': 'true' } : {})}
      >
        {elements}
      </div>
    )
  }

  // 2. Auto-detect line-by-line code blocks vs text paragraphs
  const rawLines = cleaned.split(/\r?\n/)
  const blocks: Array<{ type: 'text' | 'code'; lines: string[] }> = []

  rawLines.forEach((line) => {
    const isCode = isLikelyCodeLine(line)
    const currentBlock = blocks[blocks.length - 1]

    if (!currentBlock) {
      blocks.push({ type: isCode ? 'code' : 'text', lines: [line] })
    } else if (currentBlock.type === (isCode ? 'code' : 'text')) {
      currentBlock.lines.push(line)
    } else {
      blocks.push({ type: isCode ? 'code' : 'text', lines: [line] })
    }
  })

  return (
    <div
      className={`space-y-2 ${className}`}
      {...(protectedText ? { 'data-assessment-protected-text': 'true' } : {})}
    >
      {blocks.map((block, blockIdx) => {
        if (block.type === 'code') {
          return (
            <div
              key={blockIdx}
              className="my-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 shadow-sm"
              {...(protectedText ? { 'data-assessment-protected-text': 'true' } : {})}
            >
              <pre
                className="font-mono whitespace-pre-wrap"
                {...(protectedText ? { 'data-assessment-protected-text': 'true' } : {})}
              >
                {block.lines.join('\n')}
              </pre>
            </div>
          )
        }

        const textContent = block.lines.join('\n').trim()
        if (!textContent) return null

        return (
          <p
            key={blockIdx}
            className="text-sm font-bold text-slate-900 leading-relaxed whitespace-pre-line"
            {...(protectedText ? { 'data-assessment-protected-text': 'true' } : {})}
          >
            {renderInlineFormatting(textContent)}
          </p>
        )
      })}
    </div>
  )
}
