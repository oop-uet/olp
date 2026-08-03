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

function renderHighlightedJavaLine(line: string, key: number | string): ReactNode {
  const regex =
    /(\/\/.*|\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|record|sealed|non-sealed|permits)\b|\b(?:System\.out\.println|System\.out\.print|System\.err\.println|System\.out|System|String|Object|Integer|Double|Float|Boolean|Math|Scanner|List|ArrayList|Map|HashMap|Set|HashSet|Exception|Override)\b|\b\d+(?:\.\d+)?\b)/g

  const tokens: ReactNode[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null

  regex.lastIndex = 0
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      tokens.push(
        <span key={tokens.length} className="text-slate-200">
          {line.slice(lastIdx, match.index)}
        </span>
      )
    }

    const token = match[0]
    if (token.startsWith('//') || token.startsWith('/*')) {
      tokens.push(
        <span key={tokens.length} className="text-slate-400 italic font-normal">
          {token}
        </span>
      )
    } else if (token.startsWith('"') || token.startsWith("'")) {
      tokens.push(
        <span key={tokens.length} className="text-amber-300 font-medium">
          {token}
        </span>
      )
    } else if (/^\d/.test(token)) {
      tokens.push(
        <span key={tokens.length} className="text-purple-300 font-bold">
          {token}
        </span>
      )
    } else if (
      [
        'System.out.println',
        'System.out.print',
        'System.err.println',
        'System.out',
        'System',
        'String',
        'Object',
        'Integer',
        'Double',
        'Float',
        'Boolean',
        'Math',
        'Scanner',
        'List',
        'ArrayList',
        'Map',
        'HashMap',
        'Set',
        'HashSet',
        'Exception',
        'Override',
      ].includes(token)
    ) {
      tokens.push(
        <span key={tokens.length} className="text-cyan-300 font-bold">
          {token}
        </span>
      )
    } else {
      // Keyword
      tokens.push(
        <span key={tokens.length} className="text-emerald-400 font-black">
          {token}
        </span>
      )
    }

    lastIdx = match.index + token.length
  }

  if (lastIdx < line.length) {
    tokens.push(
      <span key={tokens.length} className="text-slate-200">
        {line.slice(lastIdx)}
      </span>
    )
  }

  return <div key={key}>{tokens.length > 0 ? tokens : ' '}</div>
}

function renderCodeBlock(codeText: string, key: number | string, protectedText = true): ReactNode {
  const lines = codeText.split(/\r?\n/)
  return (
    <div
      key={key}
      className="my-3 overflow-x-auto rounded-2xl border border-slate-800/80 bg-[#0b132b] p-4 font-mono text-xs leading-relaxed text-slate-100 shadow-md"
      {...(protectedText ? { 'data-assessment-protected-text': 'true' } : {})}
    >
      <pre
        className="font-mono whitespace-pre"
        {...(protectedText ? { 'data-assessment-protected-text': 'true' } : {})}
      >
        {lines.map((line, idx) => renderHighlightedJavaLine(line, idx))}
      </pre>
    </div>
  )
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
      elements.push(renderCodeBlock(codeContent, `code-${match.index}`, protectedText))

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
          return renderCodeBlock(block.lines.join('\n'), blockIdx, protectedText)
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
