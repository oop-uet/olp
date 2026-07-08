import { useEffect, useMemo, useRef } from 'react'
import Editor from '@monaco-editor/react'

export interface StyleViewerViolation {
  file: string
  line: number | null
  column: number | null
  severity: string
  message: string
  source?: string
  ruleId?: string
  ruleLabel?: string
  category?: string
}

interface StyleAnnotatedCodeViewerProps {
  fileName: string
  code: string
  violations?: StyleViewerViolation[]
  focusLine?: number | null
  fontSize?: number
}

function basename(path: string) {
  return path.replace(/\\/g, '/').split('/').pop() ?? path
}

function matchesFile(violationFile: string, fileName: string) {
  return violationFile === fileName || basename(violationFile) === basename(fileName)
}

function markerMessage(violation: StyleViewerViolation) {
  const title = violation.ruleLabel ?? violation.ruleId ?? 'Checkstyle'
  return `${title}: ${violation.message}`
}

function clampLine(line: number | null, lineCount: number) {
  if (!line || line < 1) return 1
  return Math.min(line, Math.max(1, lineCount))
}

export function StyleAnnotatedCodeViewer({
  fileName,
  code,
  violations = [],
  focusLine,
  fontSize = 14,
}: StyleAnnotatedCodeViewerProps) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const decorationsRef = useRef<any>(null)

  const fileViolations = useMemo(
    () => violations.filter((violation) => matchesFile(violation.file, fileName)),
    [violations, fileName]
  )

  useEffect(() => {
    applyMarkers()
  }, [fileViolations, code, fileName])

  useEffect(() => {
    if (!focusLine || !editorRef.current) return
    editorRef.current.revealLineInCenter(focusLine)
    editorRef.current.setPosition({ lineNumber: focusLine, column: 1 })
    editorRef.current.focus()
  }, [focusLine, fileName])

  function applyMarkers() {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel?.()
    if (!editor || !monaco || !model) return

    const markers = fileViolations
      .filter((violation) => violation.line && violation.line > 0)
      .map((violation) => {
        const line = clampLine(violation.line, model.getLineCount())
        const column = Math.max(1, violation.column ?? 1)
        return {
          startLineNumber: line,
          startColumn: column,
          endLineNumber: line,
          endColumn: Math.max(column + 1, model.getLineMaxColumn(line)),
          message: markerMessage(violation),
          severity:
            violation.severity === 'error'
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
          source: violation.ruleId ?? 'checkstyle',
        }
      })

    monaco.editor.setModelMarkers(model, 'checkstyle', markers)
    decorationsRef.current?.clear?.()
    decorationsRef.current = editor.createDecorationsCollection(
      fileViolations
        .filter((violation) => violation.line && violation.line > 0)
        .map((violation) => {
          const line = clampLine(violation.line, model.getLineCount())
          return {
            range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
            options: {
              isWholeLine: true,
              className: 'checkstyle-line-decoration',
              glyphMarginClassName: 'checkstyle-glyph-decoration',
              hoverMessage: { value: markerMessage(violation).replace(/\n/g, '\n\n') },
            },
          }
        })
    )
  }

  return (
    <Editor
      key={fileName}
      height="100%"
      language="java"
      value={code}
      theme="uet-oasis-dark"
      onMount={(editor, monaco) => {
        editorRef.current = editor
        monacoRef.current = monaco
        applyMarkers()
        if (focusLine) {
          editor.revealLineInCenter(focusLine)
          editor.setPosition({ lineNumber: focusLine, column: 1 })
        }
      }}
      beforeMount={(monaco) => {
        monaco.editor.defineTheme('uet-oasis-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'editorWarning.foreground': '#fbbf24',
            'editorMarkerNavigationWarning.background': '#f59e0b',
          },
        })
      }}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize,
        lineHeight: fontSize + 9,
        lineNumbers: 'on',
        wordWrap: 'on',
        automaticLayout: true,
        glyphMargin: true,
      }}
    />
  )
}
