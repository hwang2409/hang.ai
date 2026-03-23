import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const WorkspaceContext = createContext(null)

const STORAGE_KEY = 'neuronic_workspace'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function WorkspaceProvider({ children }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelTab, setPanelTab] = useState('chat')  // 'note' | 'chat' | 'flashcards' | 'todos'
  const [panelWidth, setPanelWidth] = useState(380)
  const [panelNoteId, setPanelNoteId] = useState(null)
  const [presets, setPresets] = useState([])

  // Restore state on mount
  useEffect(() => {
    const saved = loadState()
    if (saved) {
      if (saved.panelWidth) setPanelWidth(saved.panelWidth)
      if (saved.panelTab) setPanelTab(saved.panelTab)
      if (saved.presets) setPresets(saved.presets)
      // Don't restore panelOpen — always start closed
    }
  }, [])

  // Persist on change
  useEffect(() => {
    saveState({ panelWidth, panelTab, presets })
  }, [panelWidth, panelTab, presets])

  const openPanel = useCallback((tab, noteId) => {
    if (tab) setPanelTab(tab)
    if (noteId !== undefined) setPanelNoteId(noteId)
    setPanelOpen(true)
  }, [])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
  }, [])

  const togglePanel = useCallback((tab) => {
    if (panelOpen && (!tab || tab === panelTab)) {
      setPanelOpen(false)
    } else {
      if (tab) setPanelTab(tab)
      setPanelOpen(true)
    }
  }, [panelOpen, panelTab])

  const savePreset = useCallback((name) => {
    setPresets(prev => {
      const filtered = prev.filter(p => p.name !== name)
      return [...filtered, {
        name,
        panelTab,
        panelWidth,
        panelNoteId,
        createdAt: Date.now()
      }]
    })
  }, [panelTab, panelWidth, panelNoteId])

  const loadPreset = useCallback((name) => {
    const preset = presets.find(p => p.name === name)
    if (!preset) return
    setPanelTab(preset.panelTab)
    setPanelWidth(preset.panelWidth)
    if (preset.panelNoteId) setPanelNoteId(preset.panelNoteId)
    setPanelOpen(true)
  }, [presets])

  const deletePreset = useCallback((name) => {
    setPresets(prev => prev.filter(p => p.name !== name))
  }, [])

  return (
    <WorkspaceContext.Provider value={{
      panelOpen,
      panelTab,
      panelWidth,
      panelNoteId,
      presets,
      openPanel,
      closePanel,
      togglePanel,
      setPanelTab,
      setPanelWidth,
      setPanelNoteId,
      savePreset,
      loadPreset,
      deletePreset,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
