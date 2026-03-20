import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext()

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'error') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto px-4 py-2.5 rounded-lg text-xs shadow-lg animate-fade-in max-w-xs"
            style={{
              background: t.type === 'error' ? '#2a1a1a' : t.type === 'success' ? '#1a2a1a' : '#1a1a2a',
              color: t.type === 'error' ? '#f87171' : t.type === 'success' ? '#4ade80' : '#60a5fa',
              border: `1px solid ${t.type === 'error' ? '#3a1a1a' : t.type === 'success' ? '#1a3a1a' : '#1a1a3a'}`,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
