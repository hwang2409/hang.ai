import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signup } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await signup(email, username, password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-xs animate-fade-in">
        {/* Brand */}
        <div className="mb-8">
          <h1 className="text-2xl font-light tracking-tight text-text">
            hang.
          </h1>
          <p className="text-xs uppercase tracking-[0.15em] text-text-secondary mt-2">
            create account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <p className="text-xs text-danger mt-2">{error}</p>
          )}

          <div>
            <label htmlFor="email" className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-text text-sm placeholder-text-muted outline-none focus:border-[#333333] transition-colors w-full"
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Choose a username"
              className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-text text-sm placeholder-text-muted outline-none focus:border-[#333333] transition-colors w-full"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="At least 8 characters"
              className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-text text-sm placeholder-text-muted outline-none focus:border-[#333333] transition-colors w-full"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Repeat your password"
              className="bg-bg-secondary border border-border rounded-md px-3 py-2 text-text text-sm placeholder-text-muted outline-none focus:border-[#333333] transition-colors w-full"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-2 transition-colors text-sm w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && (
              <div className="animate-spin h-3.5 w-3.5 rounded-full border-2 border-[#0a0a0a]/20 border-t-[#0a0a0a]" />
            )}
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-xs text-text-muted mt-8">
          already have an account?{' '}
          <Link to="/login" className="text-text-secondary hover:text-text transition-colors">
            sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
