import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { history } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { vim, Vim, getCM, CodeMirror } from '@replit/codemirror-vim'
import { autocompletion } from '@codemirror/autocomplete'

const themeCompartment = new Compartment()

function buildTheme(dark) {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '14px',
      fontFamily: "'JetBrains Mono', monospace",
      background: dark ? '#111111' : '#ffffff',
      color: dark ? '#d4d4d4' : '#2a2a2a',
    },
    '.cm-content': {
      padding: '16px',
      caretColor: dark ? '#c4a759' : '#8b7a3d',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: dark ? '#c4a759' : '#8b7a3d',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: dark ? '#c4a759' : '#8b7a3d',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-activeLine': {
      background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      background: dark ? 'rgba(196,167,89,0.18)' : 'rgba(180,150,60,0.18)',
    },
    '.cm-searchMatch': {
      background: dark ? 'rgba(196,167,89,0.25)' : 'rgba(180,150,60,0.25)',
      outline: `1px solid ${dark ? 'rgba(196,167,89,0.4)' : 'rgba(180,150,60,0.4)'}`,
      borderRadius: '1px',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      background: dark ? 'rgba(196,167,89,0.4)' : 'rgba(180,150,60,0.4)',
    },
    '.cm-fat-cursor': {
      background: dark ? 'rgba(196,167,89,0.35) !important' : 'rgba(140,122,61,0.35) !important',
      color: dark ? '#d4d4d4 !important' : '#2a2a2a !important',
    },
    '&:not(.cm-focused) .cm-fat-cursor': {
      background: 'none !important',
      outline: dark ? '1px solid rgba(196,167,89,0.35)' : '1px solid rgba(140,122,61,0.35)',
    },
  }, { dark })
}

const VimEditor = forwardRef(function VimEditor(
  { initialContent, onChange, onVimModeChange, onSave, onQuit, onSearchNotes, dark, className },
  ref
) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onQuitRef = useRef(onQuit)
  const onSearchNotesRef = useRef(onSearchNotes)

  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onQuitRef.current = onQuit
  onSearchNotesRef.current = onSearchNotes

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus()
    },
    getContent() {
      return viewRef.current?.state.doc.toString() ?? ''
    },
  }))

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return

    // Ex commands
    Vim.defineEx('write', 'w', () => { onSaveRef.current?.() })
    Vim.defineEx('quit', 'q', () => { onQuitRef.current?.() })
    Vim.defineEx('wq', 'wq', () => { onSaveRef.current?.(); onQuitRef.current?.() })

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current?.(update.state.doc.toString())
      }
    })

    const wikiLinkCompletions = async (context) => {
      if (!onSearchNotesRef.current) return null
      const line = context.state.doc.lineAt(context.pos)
      const textBefore = line.text.slice(0, context.pos - line.from)
      const match = textBefore.match(/\[\[([^\]]*?)$/)
      if (!match) return null
      const partial = match[1]
      const from = context.pos - partial.length
      try {
        const results = await onSearchNotesRef.current(partial)
        if (!results || results.length === 0) return null
        return {
          from,
          options: results.map((n) => ({
            label: n.title || 'Untitled',
            apply: `${n.title || 'Untitled'}]]`,
          })),
        }
      } catch {
        return null
      }
    }

    const state = EditorState.create({
      doc: initialContent || '',
      extensions: [
        vim(),
        history(),
        themeCompartment.of(buildTheme(dark)),
        markdown({ codeLanguages: languages }),
        autocompletion({ override: [wikiLinkCompletions] }),
        updateListener,
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    // Vim mode change listener — use static CodeMirror.on with the adapter
    const cm = getCM(view)
    const handleModeChange = (e) => {
      const mode = (e.mode || 'normal').toUpperCase()
      const subMode = e.subMode ? ` ${e.subMode.toUpperCase()}` : ''
      onVimModeChange?.(mode === 'NORMAL' ? 'NORMAL' : mode + subMode)
    }
    if (cm) {
      CodeMirror.on(cm, 'vim-mode-change', handleModeChange)
    }

    return () => {
      if (cm) {
        CodeMirror.off(cm, 'vim-mode-change', handleModeChange)
      }
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reconfigure theme on dark prop change
  useEffect(() => {
    if (!viewRef.current) return
    viewRef.current.dispatch({
      effects: themeCompartment.reconfigure(buildTheme(dark)),
    })
  }, [dark])

  return (
    <div
      ref={containerRef}
      className={className}
    />
  )
})

export default VimEditor
