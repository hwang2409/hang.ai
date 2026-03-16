import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useTheme } from './ThemeContext'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const { setThemeFromProfile } = useTheme()

  const syncTheme = (userData) => {
    if (userData?.theme) {
      setThemeFromProfile(userData.theme)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.get('/auth/me').then((me) => {
        setUser(me)
        syncTheme(me)
      }).catch(() => {
        localStorage.removeItem('token')
      }).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.access_token)
    const me = await api.get('/auth/me')
    setUser(me)
    syncTheme(me)
    return me
  }

  const signup = async (email, username, password) => {
    const data = await api.post('/auth/register', { email, username, password })
    localStorage.setItem('token', data.access_token)
    const me = await api.get('/auth/me')
    setUser(me)
    syncTheme(me)
    return me
  }

  const updateUser = async (updates) => {
    const updated = await api.patch('/auth/me', updates)
    setUser(updated)
    return updated
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
