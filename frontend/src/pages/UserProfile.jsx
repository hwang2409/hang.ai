import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Layers, HelpCircle, BookOpen, Play, Upload, CheckSquare, Calendar, Flame, Clock, Timer, UserPlus, UserCheck } from 'lucide-react'
import Layout from '../components/Layout'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const TYPE_CONFIG = {
  note:              { icon: FileText,    color: '#c4a759' },
  flashcard_review:  { icon: Layers,      color: '#8b9cf7' },
  quiz:              { icon: HelpCircle,  color: '#f78b8b' },
  feynman:           { icon: BookOpen,    color: '#8bf7a4' },
  pomodoro:          { icon: Play,        color: '#f7c48b' },
  file:              { icon: Upload,      color: '#8bd4f7' },
  todo:              { icon: CheckSquare, color: '#d48bf7' },
  study_plan:        { icon: Calendar,    color: '#f7f08b' },
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function UserProfile() {
  const { userId } = useParams()
  const { user: currentUser } = useAuth()
  const { dark } = useTheme()
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(true)
  const [timeline, setTimeline] = useState([])
  const [leaderboardEntry, setLeaderboardEntry] = useState(null)
  const [isFriend, setIsFriend] = useState(null)
  const [friendLoading, setFriendLoading] = useState(false)

  const isOwn = currentUser && String(currentUser.id) === String(userId)

  useEffect(() => {
    setLoading(true)
    api.get(`/auth/users/${userId}/profile`)
      .then(data => {
        setProfile(data)
        setBio(data.bio || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    // Fetch leaderboard stats
    api.get('/social/leaderboard?period=week')
      .then(data => {
        const entry = (data || []).find(e => String(e.user_id) === String(userId))
        setLeaderboardEntry(entry || null)
      })
      .catch(() => {})

    // Fetch timeline only for own profile
    if (currentUser && String(currentUser.id) === String(userId)) {
      api.get('/timeline?days=30&limit=15')
        .then(data => setTimeline(data.events || []))
        .catch(() => {})
    }

    // Check friend status for other users
    if (currentUser && String(currentUser.id) !== String(userId)) {
      api.get('/social/friends')
        .then(data => {
          const friends = data || []
          const found = friends.some(f => String(f.friend_id || f.user_id || f.id) === String(userId))
          setIsFriend(found)
        })
        .catch(() => setIsFriend(false))
    }
  }, [userId, currentUser])

  const saveBio = async () => {
    try {
      await api.patch('/auth/me', { bio })
      setProfile(prev => ({ ...prev, bio }))
      setEditing(false)
    } catch {}
  }

  const addFriend = async () => {
    setFriendLoading(true)
    try {
      await api.post('/social/friend-request', { to_user_id: Number(userId) })
      setIsFriend(true)
    } catch {}
    setFriendLoading(false)
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-border border-t-text-muted rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  if (!profile) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-6 py-12 text-center text-text-muted">
          User not found
        </div>
      </Layout>
    )
  }

  const memberSince = new Date(
    String(profile.created_at).endsWith('Z') || String(profile.created_at).includes('+')
      ? profile.created_at
      : profile.created_at + 'Z'
  ).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-bg-tertiary border border-border flex items-center justify-center text-2xl font-semibold text-text-secondary flex-shrink-0">
            {profile.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-text">{profile.username}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-[#c4a759] font-medium">{profile.reputation} rep</span>
              <span className="text-xs text-text-muted">Member since {memberSince}</span>
            </div>
          </div>
          {/* Friend button for other users */}
          {!isOwn && isFriend !== null && (
            <div className="flex-shrink-0 pt-1">
              {isFriend ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted"
                  style={{
                    background: dark ? 'rgba(196,167,89,0.06)' : 'rgba(196,167,89,0.04)',
                    border: `1px solid ${dark ? 'rgba(196,167,89,0.15)' : 'rgba(196,167,89,0.25)'}`,
                  }}>
                  <UserCheck size={12} style={{ color: '#c4a759' }} />
                  friends
                </span>
              ) : (
                <button
                  onClick={addFriend}
                  disabled={friendLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
                  style={{
                    background: dark ? 'rgba(196,167,89,0.1)' : 'rgba(196,167,89,0.08)',
                    border: `1px solid ${dark ? 'rgba(196,167,89,0.25)' : 'rgba(196,167,89,0.3)'}`,
                    color: '#c4a759',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(196,167,89,0.15)' : 'rgba(196,167,89,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.background = dark ? 'rgba(196,167,89,0.1)' : 'rgba(196,167,89,0.08)'}
                >
                  <UserPlus size={12} />
                  {friendLoading ? 'sending...' : 'add friend'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bio */}
        <div className="mb-6 p-4 rounded-lg bg-bg-secondary border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-text-muted">Bio</span>
            {isOwn && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-[10px] text-[#c4a759] hover:underline cursor-pointer"
              >
                edit
              </button>
            )}
          </div>
          {editing ? (
            <div>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={3}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-text resize-none focus:outline-none focus:border-[#c4a759]"
                placeholder="Tell others about yourself..."
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={saveBio}
                  className="px-3 py-1 text-xs bg-[#c4a759] text-black rounded hover:bg-[#b3963e] transition-colors cursor-pointer"
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditing(false); setBio(profile.bio || '') }}
                  className="px-3 py-1 text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              {profile.bio || (isOwn ? 'No bio yet. Click edit to add one.' : 'No bio yet.')}
            </p>
          )}
        </div>

        {/* Study Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {leaderboardEntry ? (
            <>
              <div className="rounded-xl px-4 py-3 border bg-bg-secondary border-border">
                <p className="text-[10px] uppercase tracking-wider mb-1 text-text-muted">this week</p>
                <p className="text-lg font-semibold flex items-center gap-1 text-text">
                  <Timer size={14} style={{ color: '#c4a759' }} />
                  {formatMinutes(leaderboardEntry.study_minutes)}
                </p>
                <p className="text-[11px] text-text-muted">study time</p>
              </div>
              <div className="rounded-xl px-4 py-3 border bg-bg-secondary border-border">
                <p className="text-[10px] uppercase tracking-wider mb-1 text-text-muted">streak</p>
                <p className="text-lg font-semibold flex items-center gap-1 text-text">
                  <Flame size={14} style={{ color: '#c4a759' }} />
                  {leaderboardEntry.streak}d
                </p>
                <p className="text-[11px] text-text-muted">{leaderboardEntry.streak > 0 ? 'keep going' : 'start today'}</p>
              </div>
              <div className="rounded-xl px-4 py-3 border bg-bg-secondary border-border">
                <p className="text-[10px] uppercase tracking-wider mb-1 text-text-muted">retention</p>
                <p className="text-lg font-semibold text-text">{leaderboardEntry.retention_pct}%</p>
                <p className="text-[11px] text-text-muted">flashcard accuracy</p>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 rounded-lg bg-bg-secondary border border-border text-center">
                <div className="text-2xl font-semibold text-text">{profile.question_count}</div>
                <div className="text-xs text-text-muted mt-1">Questions</div>
              </div>
              <div className="p-4 rounded-lg bg-bg-secondary border border-border text-center">
                <div className="text-2xl font-semibold text-text">{profile.answer_count}</div>
                <div className="text-xs text-text-muted mt-1">Answers</div>
              </div>
              <div className="p-4 rounded-lg bg-bg-secondary border border-border text-center">
                <div className="text-2xl font-semibold text-text">{profile.accepted_answer_count}</div>
                <div className="text-xs text-text-muted mt-1">Accepted</div>
              </div>
            </>
          )}
        </div>

        {/* Forum Stats (always show when leaderboard is available) */}
        {leaderboardEntry && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="p-4 rounded-lg bg-bg-secondary border border-border text-center">
              <div className="text-2xl font-semibold text-text">{profile.question_count}</div>
              <div className="text-xs text-text-muted mt-1">Questions</div>
            </div>
            <div className="p-4 rounded-lg bg-bg-secondary border border-border text-center">
              <div className="text-2xl font-semibold text-text">{profile.answer_count}</div>
              <div className="text-xs text-text-muted mt-1">Answers</div>
            </div>
            <div className="p-4 rounded-lg bg-bg-secondary border border-border text-center">
              <div className="text-2xl font-semibold text-text">{profile.accepted_answer_count}</div>
              <div className="text-xs text-text-muted mt-1">Accepted</div>
            </div>
          </div>
        )}

        {/* Recent Activity (own profile only) */}
        {isOwn && timeline.length > 0 && (
          <div className="rounded-xl border p-4 bg-bg-secondary border-border">
            <p className="text-[10px] uppercase tracking-wider mb-3 text-text-muted">
              recent activity
            </p>
            <div className="space-y-1 relative">
              {/* Timeline line */}
              <div className="absolute left-[11px] top-3 bottom-3 w-px"
                style={{ background: dark ? '#1c1c1c' : '#e0ddd6' }} />

              {timeline.map((event, i) => {
                const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.note
                const Icon = cfg.icon
                return (
                  <div
                    key={`${event.type}-${i}`}
                    className="flex items-center gap-3 py-1.5 px-1"
                  >
                    {/* Icon dot */}
                    <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 relative z-[1]"
                      style={{ background: `${cfg.color}10`, border: `1px solid ${cfg.color}25` }}>
                      <Icon size={10} style={{ color: cfg.color }} />
                    </div>

                    {/* Title */}
                    <span className="text-xs truncate flex-1 min-w-0 text-text">
                      {event.title}
                    </span>

                    {/* Relative time */}
                    <span className="text-[10px] flex-shrink-0 text-text-muted tabular-nums">
                      {relativeTime(event.timestamp)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
