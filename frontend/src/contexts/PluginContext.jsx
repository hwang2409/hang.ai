import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, getToken } from '../lib/api'

const PluginContext = createContext(null)

export function PluginProvider({ children }) {
  const [plugins, setPlugins] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPlugins = useCallback(async () => {
    try {
      const data = await api.get('/plugins')
      setPlugins(data)
    } catch {
      // not logged in or server down
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (getToken()) fetchPlugins()
    else setLoading(false)
  }, [fetchPlugins])

  const togglePlugin = useCallback(async (pluginId, enabled) => {
    await api.patch(`/plugins/${pluginId}/toggle`, { enabled })
    setPlugins(prev => prev.map(p => p.id === pluginId ? { ...p, enabled } : p))
  }, [])

  const updatePluginSettings = useCallback(async (pluginId, settings) => {
    await api.put(`/plugins/${pluginId}/settings`, { settings })
    setPlugins(prev => prev.map(p => p.id === pluginId ? { ...p, settings } : p))
  }, [])

  const enabledPlugins = plugins.filter(p => p.enabled)

  const getNavItems = useCallback((section) => {
    return enabledPlugins.flatMap(p =>
      (p.frontend?.nav_items || []).filter(item => item.section === section)
    )
  }, [enabledPlugins])

  const getDashboardWidgets = useCallback(() => {
    return enabledPlugins.flatMap(p => p.frontend?.dashboard_widgets || [])
  }, [enabledPlugins])

  const getSelectionActions = useCallback(() => {
    return enabledPlugins.flatMap(p => p.frontend?.selection_actions || [])
  }, [enabledPlugins])

  const getSettingsSections = useCallback(() => {
    return enabledPlugins.flatMap(p =>
      (p.frontend?.settings_sections || []).map(s => ({ ...s, pluginId: p.id }))
    )
  }, [enabledPlugins])

  return (
    <PluginContext.Provider value={{
      plugins, loading, enabledPlugins,
      togglePlugin, updatePluginSettings, fetchPlugins,
      getNavItems, getDashboardWidgets, getSelectionActions, getSettingsSections,
    }}>
      {children}
    </PluginContext.Provider>
  )
}

export function usePlugins() {
  return useContext(PluginContext)
}
