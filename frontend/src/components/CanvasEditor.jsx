import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

export default function CanvasEditor({ initialData, onChange, dark, onApiReady }) {
  const [_excalidrawAPI, setExcalidrawAPI] = useState(null)
  const debounceRef = useRef(null)

  // Parse initial data once
  const initialParsed = useMemo(() => {
    try {
      const parsed = initialData ? JSON.parse(initialData) : null
      return parsed && parsed.elements ? parsed : { elements: [], files: {} }
    } catch {
      return { elements: [], files: {} }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((elements, appState, files) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const scene = {
        elements: elements.filter(el => !el.isDeleted),
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize ?? null,
        },
        files: files || {},
      }
      onChange(JSON.stringify(scene))
    }, 300)
  }, [onChange])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className="w-full h-full canvas-editor-wrapper" style={{ minHeight: 0 }}>
      <Excalidraw
        excalidrawAPI={(api) => { setExcalidrawAPI(api); onApiReady?.(api) }}
        initialData={{
          elements: initialParsed.elements || [],
          appState: {
            ...(initialParsed.appState || {}),
            theme: dark ? 'dark' : 'light',
          },
          files: initialParsed.files || {},
        }}
        theme={dark ? 'dark' : 'light'}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            export: false,
            saveAsImage: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  )
}
