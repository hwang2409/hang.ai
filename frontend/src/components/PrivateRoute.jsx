import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function PrivateRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="animate-spin h-6 w-6 rounded-full border-2 border-[#333333] border-t-[#d4d4d4]" />
      </div>
    )
  }

  return user ? children : <Navigate to="/login" />
}
