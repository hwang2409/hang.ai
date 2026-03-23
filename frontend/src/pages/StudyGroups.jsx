import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { api } from '../lib/api'

const permStyles = {
  edit:    { color: '#6a9a6a', bg: 'rgba(106,154,106,0.10)', border: 'rgba(106,154,106,0.25)' },
  view:    { color: '#808080', bg: 'rgba(128,128,128,0.08)', border: 'rgba(128,128,128,0.20)' },
  suggest: { color: '#c4a759', bg: 'rgba(196,167,89,0.10)', border: 'rgba(196,167,89,0.25)' },
}

function PermDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const s = permStyles[value] || permStyles.edit
  const light = typeof document !== 'undefined' && document.documentElement.classList.contains('light')

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const inactiveColor = light ? '#999999' : '#606060'
  const panelBg = light
    ? 'linear-gradient(180deg, #ffffff 0%, #f7f5f0 100%)'
    : 'linear-gradient(180deg, #141414 0%, #0f0f0f 100%)'
  const panelShadow = light
    ? '0 8px 30px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04), 0 1px 0 0 rgba(255,255,255,0.6) inset'
    : '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(196,167,89,0.04), 0 1px 0 0 rgba(255,255,255,0.02) inset'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-all duration-150 border cursor-pointer"
        style={{ color: s.color, background: s.bg, borderColor: open ? s.border : 'transparent' }}
      >
        {value}
        <svg width="7" height="4" viewBox="0 0 7 4" fill="none" style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
          <path d="M0.5 0.5L3.5 3.5L6.5 0.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-lg overflow-hidden"
          style={{
            background: panelBg,
            boxShadow: panelShadow,
            minWidth: '80px',
            animation: 'pop-in 0.15s cubic-bezier(0.34, 1.56, 0.64, 1) both',
          }}
        >
          {['edit', 'view', 'suggest'].map(perm => {
            const ps = permStyles[perm]
            const active = perm === value
            return (
              <button
                key={perm}
                onClick={() => { onChange(perm); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-[10px] flex items-center gap-2 transition-colors duration-100"
                style={{
                  color: active ? ps.color : inactiveColor,
                  background: active ? ps.bg : 'transparent',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = ps.bg; e.currentTarget.style.color = ps.color } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = inactiveColor } }}
              >
                <span
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ background: active ? ps.color : 'transparent' }}
                />
                {perm}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TimeAgo({ date }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15000)
    return () => clearInterval(id)
  }, [])
  // Backend returns naive UTC datetimes — append Z if missing
  const raw = String(date)
  const d = new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z')
  const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (diff < 5) return <span>just now</span>
  if (diff < 60) return <span>{diff}s ago</span>
  if (diff < 3600) return <span>{Math.floor(diff / 60)}m ago</span>
  if (diff < 86400) return <span>{Math.floor(diff / 3600)}h ago</span>
  return <span>{Math.floor(diff / 86400)}d ago</span>
}

function ThreadReplyInput({ parentId, groupId, onSent }) {
  const [text, setText] = useState('')
  const handleSend = async () => {
    if (!text.trim()) return
    const content = text.trim()
    setText('')
    try {
      await api.post(`/social/groups/${groupId}/messages`, {
        content,
        parent_id: parentId,
      })
      onSent()
    } catch {}
  }
  return (
    <div className="flex gap-2 mt-3 pt-2">
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
        placeholder="reply in thread..."
        className="flex-1 bg-bg-secondary border border-border rounded px-2 py-1.5 text-[11px] text-text placeholder:text-text-muted focus:outline-none focus:border-text-secondary"
      />
      <button
        onClick={handleSend}
        className="px-3 py-1.5 text-[11px] bg-bg-secondary border border-border rounded text-text-secondary hover:text-text transition-colors"
      >
        reply
      </button>
    </div>
  )
}

export default function StudyGroups() {
  const { id: groupIdParam } = useParams()
  const navigate = useNavigate()
  const [leftTab, setLeftTab] = useState('friends')
  const [rightTab, setRightTab] = useState('forum')

  // Friends state
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [addUsername, setAddUsername] = useState('')
  const [friendStatus, setFriendStatus] = useState(null)

  // Groups state
  const [groups, setGroups] = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState(groupIdParam ? parseInt(groupIdParam) : null)
  const [groupDetail, setGroupDetail] = useState(null)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // Messages state
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [replies, setReplies] = useState({})
  const [expandedThread, setExpandedThread] = useState(null)
  const messagesEndRef = useRef(null)

  // Pinned messages state
  const [pinnedMessages, setPinnedMessages] = useState([])

  // Shared notes state
  const [sharedNotes, setSharedNotes] = useState([])
  const [showSharePicker, setShowSharePicker] = useState(false)
  const [userNotes, setUserNotes] = useState([])
  const [notePerms, setNotePerms] = useState({})

  // Stats state
  const [groupLeaderboard, setGroupLeaderboard] = useState([])
  const [flashcardStats, setFlashcardStats] = useState([])

  // Leaderboard state (no group selected)
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('week')

  // Feed state
  const [feed, setFeed] = useState([])

  // Direct messages state
  const [dmConversations, setDmConversations] = useState([])
  const [dmSelectedUser, setDmSelectedUser] = useState(null)
  const [dmThread, setDmThread] = useState([])
  const [dmNewMessage, setDmNewMessage] = useState('')
  const dmThreadEndRef = useRef(null)

  // Study room state
  const [studyRoom, setStudyRoom] = useState(null)
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomFocusMinutes, setRoomFocusMinutes] = useState(25)
  const [roomBreakMinutes, setRoomBreakMinutes] = useState(5)
  const [roomStatus, setRoomStatus] = useState('focusing')

  // ── Data fetching ──────────────────────────────────────────────────────

  const loadFriends = useCallback(async () => {
    try {
      const [f, r, o] = await Promise.all([
        api.get('/social/friends'),
        api.get('/social/friends/requests'),
        api.get('/social/friends/outgoing'),
      ])
      setFriends(f)
      setFriendRequests(r)
      setOutgoingRequests(o)
    } catch {}
  }, [])

  const loadGroups = useCallback(async () => {
    try {
      const g = await api.get('/social/groups')
      setGroups(g)
    } catch {}
  }, [])

  const loadGroupDetail = useCallback(async (gid) => {
    try {
      const d = await api.get(`/social/groups/${gid}`)
      setGroupDetail(d)
    } catch {}
  }, [])

  const loadMessages = useCallback(async (gid) => {
    try {
      const m = await api.get(`/social/groups/${gid}/messages`)
      setMessages(m)
    } catch {}
  }, [])

  const loadSharedNotes = useCallback(async (gid) => {
    try {
      const n = await api.get(`/social/groups/${gid}/shared-notes`)
      setSharedNotes(n)
    } catch {}
  }, [])

  const loadGroupStats = useCallback(async (gid) => {
    try {
      const [lb, fs] = await Promise.all([
        api.get(`/social/groups/${gid}/leaderboard`),
        api.get(`/social/groups/${gid}/flashcard-stats`),
      ])
      setGroupLeaderboard(lb)
      setFlashcardStats(fs)
    } catch {}
  }, [])

  const loadLeaderboard = useCallback(async () => {
    try {
      const lb = await api.get(`/social/leaderboard?period=${leaderboardPeriod}`)
      setLeaderboard(lb)
    } catch {}
  }, [leaderboardPeriod])

  const loadFeed = useCallback(async () => {
    try {
      const f = await api.get('/social/feed')
      setFeed(f)
    } catch {}
  }, [])

  const loadPinnedMessages = useCallback(async (gid) => {
    try {
      const p = await api.get(`/social/groups/${gid}/pinned-messages`)
      setPinnedMessages(p)
    } catch {}
  }, [])

  const loadDmConversations = useCallback(async () => {
    try {
      const c = await api.get('/social/dm/conversations')
      setDmConversations(c)
    } catch {}
  }, [])

  const loadDmThread = useCallback(async (userId) => {
    try {
      const t = await api.get(`/social/dm/${userId}`)
      setDmThread(t)
    } catch {}
  }, [])

  const loadStudyRoom = useCallback(async (gid) => {
    try {
      const r = await api.get(`/social/groups/${gid}/study-room`)
      setStudyRoom(r)
    } catch {
      setStudyRoom(null)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadFriends()
    loadGroups()
    loadLeaderboard()
    loadFeed()
  }, [loadFriends, loadGroups, loadLeaderboard, loadFeed])

  // When group selected
  useEffect(() => {
    if (selectedGroupId) {
      loadGroupDetail(selectedGroupId)
      loadMessages(selectedGroupId)
      loadSharedNotes(selectedGroupId)
      loadGroupStats(selectedGroupId)
      loadPinnedMessages(selectedGroupId)
      loadStudyRoom(selectedGroupId)
    }
  }, [selectedGroupId, loadGroupDetail, loadMessages, loadSharedNotes, loadGroupStats, loadPinnedMessages, loadStudyRoom])

  // Poll messages every 5s when forum is active
  useEffect(() => {
    if (!selectedGroupId || rightTab !== 'forum') return
    const interval = setInterval(() => loadMessages(selectedGroupId), 5000)
    return () => clearInterval(interval)
  }, [selectedGroupId, rightTab, loadMessages])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-scroll DM thread
  useEffect(() => {
    dmThreadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [dmThread])

  // Load DM conversations when messages tab is active
  useEffect(() => {
    if (rightTab !== 'messages') return
    loadDmConversations()
    const interval = setInterval(loadDmConversations, 10000)
    return () => clearInterval(interval)
  }, [rightTab, loadDmConversations])

  // Poll DM thread when viewing a conversation
  useEffect(() => {
    if (rightTab !== 'messages' || !dmSelectedUser) return
    const interval = setInterval(() => loadDmThread(dmSelectedUser), 5000)
    return () => clearInterval(interval)
  }, [rightTab, dmSelectedUser, loadDmThread])

  // Study room polling + ping every 15s
  useEffect(() => {
    if (!selectedGroupId || rightTab !== 'study room') return
    const interval = setInterval(async () => {
      loadStudyRoom(selectedGroupId)
      if (studyRoom?.id) {
        try {
          await api.post(`/social/study-room/${studyRoom.id}/ping`, { status: roomStatus })
        } catch {}
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [selectedGroupId, rightTab, studyRoom?.id, roomStatus, loadStudyRoom])

  // Leaderboard period change
  useEffect(() => {
    loadLeaderboard()
  }, [leaderboardPeriod, loadLeaderboard])

  // Sync URL param
  useEffect(() => {
    if (groupIdParam) {
      setSelectedGroupId(parseInt(groupIdParam))
      setLeftTab('groups')
    }
  }, [groupIdParam])

  // ── Actions ────────────────────────────────────────────────────────────

  const handleAddFriend = async () => {
    if (!addUsername.trim()) return
    try {
      await api.post('/social/friends/add', { username: addUsername.trim() })
      setFriendStatus(`request sent to ${addUsername.trim()}`)
      setAddUsername('')
      loadFriends()
      setTimeout(() => setFriendStatus(null), 4000)
    } catch (e) {
      setFriendStatus(e.message)
      setTimeout(() => setFriendStatus(null), 4000)
    }
  }

  const handleAccept = async (id) => {
    try {
      await api.post(`/social/friends/${id}/accept`)
      loadFriends()
      loadLeaderboard()
      loadFeed()
    } catch {}
  }

  const handleReject = async (id) => {
    try {
      await api.post(`/social/friends/${id}/reject`)
      loadFriends()
    } catch {}
  }

  const handleUnfriend = async (userId) => {
    try {
      await api.delete(`/social/friends/${userId}`)
      loadFriends()
      loadLeaderboard()
    } catch {}
  }

  const handleSearchUsers = async (q) => {
    setSearchQuery(q)
    if (q.length < 1) { setSearchResults([]); return }
    try {
      const r = await api.get(`/social/friends/search?q=${encodeURIComponent(q)}`)
      setSearchResults(r)
    } catch {}
  }

  const handleCreateGroup = async () => {
    if (!createName.trim()) return
    try {
      const g = await api.post('/social/groups', { name: createName.trim(), description: createDesc.trim() || null })
      setCreateName('')
      setCreateDesc('')
      setShowCreate(false)
      loadGroups()
      setSelectedGroupId(g.id)
      navigate(`/groups/${g.id}`)
    } catch (e) { alert(e.message) }
  }

  const handleJoinGroup = async () => {
    if (!joinCode.trim()) return
    try {
      const g = await api.post('/social/groups/join', { invite_code: joinCode.trim() })
      setJoinCode('')
      loadGroups()
      setSelectedGroupId(g.id)
      navigate(`/groups/${g.id}`)
    } catch (e) { alert(e.message) }
  }

  const handleLeaveGroup = async () => {
    if (!selectedGroupId) return
    try {
      await api.delete(`/social/groups/${selectedGroupId}/leave`)
      setSelectedGroupId(null)
      setGroupDetail(null)
      navigate('/groups')
      loadGroups()
    } catch (e) { alert(e.message) }
  }

  const handleDeleteGroup = async () => {
    if (!selectedGroupId || !confirm('Delete this group?')) return
    try {
      await api.delete(`/social/groups/${selectedGroupId}`)
      setSelectedGroupId(null)
      setGroupDetail(null)
      navigate('/groups')
      loadGroups()
    } catch (e) { alert(e.message) }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedGroupId) return
    const content = newMessage.trim()
    setNewMessage('')
    try {
      const msg = await api.post(`/social/groups/${selectedGroupId}/messages`, {
        content,
      })
      setMessages(prev => [...prev, msg])
    } catch {}
  }

  const handleDeleteMessage = async (msgId) => {
    try {
      await api.delete(`/social/groups/${selectedGroupId}/messages/${msgId}`)
      loadMessages(selectedGroupId)
    } catch {}
  }

  const handleLoadReplies = async (msgId) => {
    if (expandedThread === msgId) { setExpandedThread(null); return }
    try {
      const r = await api.get(`/social/groups/${selectedGroupId}/messages/${msgId}/replies`)
      setReplies(prev => ({ ...prev, [msgId]: r }))
      setExpandedThread(msgId)
    } catch {}
  }

  const handleExpandThread = async (msgId) => {
    try {
      const r = await api.get(`/social/groups/${selectedGroupId}/messages/${msgId}/replies`)
      setReplies(prev => ({ ...prev, [msgId]: r }))
      setExpandedThread(msgId)
    } catch {}
  }

  // Reactions
  const handleReaction = async (msgId, emoji) => {
    try {
      await api.post(`/social/groups/${selectedGroupId}/messages/${msgId}/react`, { emoji })
      loadMessages(selectedGroupId)
    } catch {}
  }

  // Pin / Unpin
  const handlePinMessage = async (msgId) => {
    try {
      await api.post(`/social/groups/${selectedGroupId}/messages/${msgId}/pin`)
      loadMessages(selectedGroupId)
      loadPinnedMessages(selectedGroupId)
    } catch {}
  }

  const handleUnpinMessage = async (msgId) => {
    try {
      await api.post(`/social/groups/${selectedGroupId}/messages/${msgId}/unpin`)
      loadMessages(selectedGroupId)
      loadPinnedMessages(selectedGroupId)
    } catch {}
  }

  // Direct messages
  const handleSelectDmUser = async (userId) => {
    setDmSelectedUser(userId)
    try {
      await api.post(`/social/dm/${userId}/read`)
    } catch {}
    loadDmThread(userId)
  }

  const handleSendDm = async () => {
    if (!dmNewMessage.trim() || !dmSelectedUser) return
    const body = dmNewMessage.trim()
    setDmNewMessage('')
    try {
      await api.post(`/social/dm/${dmSelectedUser}`, { body })
      loadDmThread(dmSelectedUser)
      loadDmConversations()
    } catch {}
  }

  // Study rooms
  const handleCreateStudyRoom = async () => {
    if (!roomName.trim()) return
    try {
      const r = await api.post(`/social/groups/${selectedGroupId}/study-room`, {
        name: roomName.trim(),
        focus_minutes: roomFocusMinutes,
        break_minutes: roomBreakMinutes,
      })
      setStudyRoom(r)
      setShowCreateRoom(false)
      setRoomName('')
      setRoomFocusMinutes(25)
      setRoomBreakMinutes(5)
    } catch (e) { alert(e.message) }
  }

  const handleJoinStudyRoom = async (roomId) => {
    try {
      await api.post(`/social/study-room/${roomId}/join`)
      loadStudyRoom(selectedGroupId)
    } catch (e) { alert(e.message) }
  }

  const handleLeaveStudyRoom = async (roomId) => {
    try {
      await api.delete(`/social/study-room/${roomId}/leave`)
      loadStudyRoom(selectedGroupId)
    } catch {}
  }

  const handleEndStudyRoom = async (roomId) => {
    if (!confirm('End this study room?')) return
    try {
      await api.delete(`/social/study-room/${roomId}`)
      setStudyRoom(null)
    } catch (e) { alert(e.message) }
  }

  const handleShareNote = async (noteId, permission = 'view') => {
    try {
      await api.post(`/social/groups/${selectedGroupId}/share-note`, { note_id: noteId, permission })
      setShowSharePicker(false)
      loadSharedNotes(selectedGroupId)
      loadMessages(selectedGroupId)
    } catch (e) { alert(e.message) }
  }

  const handleUnshareNote = async (noteId) => {
    try {
      await api.delete(`/social/groups/${selectedGroupId}/shared-notes/${noteId}`)
      loadSharedNotes(selectedGroupId)
    } catch {}
  }

  const openSharePicker = async () => {
    try {
      const notes = await api.get('/notes')
      setUserNotes(notes)
      setShowSharePicker(true)
    } catch {}
  }

  const selectGroup = (gid) => {
    setSelectedGroupId(gid)
    navigate(`/groups/${gid}`)
  }

  // ── Event type formatting ──────────────────────────────────────────────

  const formatEvent = (e) => {
    const detail = JSON.parse(e.detail_json || '{}')
    switch (e.event_type) {
      case 'study_session':
        return `studied for ${detail.duration_minutes || '?'}min`
      case 'flashcard_review':
        return `reviewed a flashcard`
      case 'quiz_complete':
        return `scored ${detail.score}/${detail.total} on ${detail.title || 'a quiz'}`
      case 'note_created':
        return `created note "${detail.title || 'Untitled'}"`
      case 'note_shared':
        return `shared a note`
      default:
        return e.event_type
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="flex flex-1 min-h-0 overflow-hidden p-4 sm:p-8">
        {/* Left Panel */}
        <div className="w-[280px] flex-shrink-0 border-r border-border flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {['friends', 'groups'].map(tab => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={`flex-1 py-3 text-xs uppercase tracking-wider transition-colors ${
                  leftTab === tab
                    ? 'text-text border-b-2 border-text'
                    : 'text-text-secondary hover:text-text'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {leftTab === 'friends' ? (
              <>
                {/* Add friend */}
                <div className="flex gap-2">
                  <input
                    value={addUsername}
                    onChange={e => setAddUsername(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
                    placeholder="add by username"
                    className="flex-1 bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-text-secondary"
                  />
                  <button
                    onClick={handleAddFriend}
                    className="px-3 py-1.5 text-xs bg-bg-secondary border border-border rounded text-text-secondary hover:text-text hover:border-text-secondary transition-colors"
                  >
                    add
                  </button>
                </div>
                {friendStatus && (
                  <div className="text-[11px] text-text-secondary py-1 animate-[fade-in_0.2s]">{friendStatus}</div>
                )}

                {/* Search users */}
                <input
                  value={searchQuery}
                  onChange={e => handleSearchUsers(e.target.value)}
                  placeholder="search users..."
                  className="w-full bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-text-secondary"
                />
                {searchResults.length > 0 && (
                  <div className="space-y-1">
                    {searchResults.map(u => (
                      <div key={u.id} className="flex items-center justify-between py-1">
                        <span className="text-xs text-text">{u.username}</span>
                        <button
                          onClick={() => { setAddUsername(u.username); setSearchResults([]) }}
                          className="text-[10px] text-text-secondary hover:text-text"
                        >
                          add
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending requests */}
                {friendRequests.length > 0 && (
                  <div>
                    <span className="block text-[10px] uppercase tracking-widest text-text-muted mb-2">pending requests</span>
                    {friendRequests.map(r => (
                      <div key={r.id} className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-text">{r.requester_username}</span>
                        <div className="flex gap-1">
                          <button onClick={() => handleAccept(r.id)} className="text-[10px] text-success hover:underline">accept</button>
                          <button onClick={() => handleReject(r.id)} className="text-[10px] text-danger hover:underline">reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Outgoing requests */}
                {outgoingRequests.length > 0 && (
                  <div>
                    <span className="block text-[10px] uppercase tracking-widest text-text-muted mb-2">sent requests</span>
                    {outgoingRequests.map(r => (
                      <div key={r.id} className="flex items-center justify-between py-1.5">
                        <span className="text-xs text-text-secondary">{r.addressee_username}</span>
                        <span className="text-[10px] text-text-muted">pending</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Friend list */}
                <div>
                  <span className="block text-[10px] uppercase tracking-widest text-text-muted mb-2">friends</span>
                  {friends.length === 0 ? (
                    <p className="text-xs text-text-secondary">no friends yet</p>
                  ) : (
                    friends.map(f => (
                      <div key={f.user_id} className="flex items-center justify-between py-2 group">
                        <div>
                          <span className="text-xs text-text">{f.username}</span>
                          <div className="text-[10px] text-text-muted">
                            {Math.round(f.weekly_stats.study_minutes / 60 * 10) / 10}h this week
                            {f.weekly_stats.streak > 0 && ` · ${f.weekly_stats.streak}d streak`}
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnfriend(f.user_id)}
                          className="text-[10px] text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Create group / Join by code */}
                <div className="space-y-2">
                  <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="w-full py-2 text-xs bg-bg-secondary border border-border rounded text-text-secondary hover:text-text hover:border-text-secondary transition-colors"
                  >
                    create group
                  </button>
                  {showCreate && (
                    <div className="space-y-2 p-2 bg-bg-secondary rounded border border-border">
                      <input
                        value={createName}
                        onChange={e => setCreateName(e.target.value)}
                        placeholder="group name"
                        className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none"
                      />
                      <input
                        value={createDesc}
                        onChange={e => setCreateDesc(e.target.value)}
                        placeholder="description (optional)"
                        className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none"
                      />
                      <button
                        onClick={handleCreateGroup}
                        className="w-full py-1.5 text-xs bg-bg border border-border rounded text-text-secondary hover:text-text transition-colors"
                      >
                        create
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleJoinGroup()}
                      placeholder="invite code"
                      className="flex-1 bg-bg-secondary border border-border rounded px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none"
                    />
                    <button
                      onClick={handleJoinGroup}
                      className="px-3 py-1.5 text-xs bg-bg-secondary border border-border rounded text-text-secondary hover:text-text transition-colors"
                    >
                      join
                    </button>
                  </div>
                </div>

                {/* Group list */}
                <div>
                  <span className="block text-[10px] uppercase tracking-widest text-text-muted mb-2">your groups</span>
                  {groups.length === 0 ? (
                    <p className="text-xs text-text-secondary">no groups yet</p>
                  ) : (
                    groups.map(g => (
                      <button
                        key={g.id}
                        onClick={() => selectGroup(g.id)}
                        className={`w-full text-left py-2.5 px-2 rounded transition-colors ${
                          selectedGroupId === g.id
                            ? 'bg-bg-secondary text-text'
                            : 'text-text-secondary hover:text-text hover:bg-bg-secondary'
                        }`}
                      >
                        <div className="text-xs font-medium">{g.name}</div>
                        <div className="text-[10px] text-text-muted">{g.member_count} member{g.member_count !== 1 ? 's' : ''}</div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedGroupId ? (
            /* No group selected — show leaderboard + feed */
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Leaderboard */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-text">friend leaderboard</h2>
                  <div className="flex gap-1">
                    {['week', 'month'].map(p => (
                      <button
                        key={p}
                        onClick={() => setLeaderboardPeriod(p)}
                        className={`px-2 py-1 text-[10px] rounded transition-colors ${
                          leaderboardPeriod === p
                            ? 'bg-bg-secondary text-text'
                            : 'text-text-muted hover:text-text-secondary'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                {leaderboard.length === 0 ? (
                  <p className="text-xs text-text-secondary">add friends to see the leaderboard</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted text-[10px] uppercase tracking-wider">
                        <th className="text-left py-2 font-normal">#</th>
                        <th className="text-left py-2 font-normal">user</th>
                        <th className="text-right py-2 font-normal">hours</th>
                        <th className="text-right py-2 font-normal">streak</th>
                        <th className="text-right py-2 font-normal">retention</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((entry, i) => (
                        <tr key={entry.user_id} className="border-t border-border">
                          <td className="py-2 text-text-muted">{i + 1}</td>
                          <td className="py-2 text-text">{entry.username}</td>
                          <td className="py-2 text-right text-text-secondary">{Math.round(entry.study_minutes / 60 * 10) / 10}h</td>
                          <td className="py-2 text-right text-text-secondary">{entry.streak}d</td>
                          <td className="py-2 text-right text-text-secondary">{entry.retention_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Activity Feed */}
              <div>
                <h2 className="text-sm font-medium text-text mb-4">activity feed</h2>
                {feed.length === 0 ? (
                  <p className="text-xs text-text-secondary">no recent activity</p>
                ) : (
                  <div className="space-y-2">
                    {feed.map(e => (
                      <div key={e.id} className="flex items-start gap-3 py-2 border-b border-border">
                        <div className="w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center text-[10px] text-text-secondary font-medium flex-shrink-0">
                          {e.username[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs text-text">{e.username}</span>
                          <span className="text-xs text-text-secondary"> {formatEvent(e)}</span>
                          <div className="text-[10px] text-text-muted"><TimeAgo date={e.created_at} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Group selected — sub-tabs */
            <>
              {/* Group header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-border">
                <div>
                  <h2 className="text-sm font-medium text-text">{groupDetail?.name || 'Loading...'}</h2>
                  {groupDetail?.description && (
                    <p className="text-[10px] text-text-muted mt-0.5">{groupDetail.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {groupDetail?.invite_code && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(groupDetail.invite_code); }}
                      className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                      title="Copy invite code"
                    >
                      code: {groupDetail.invite_code}
                    </button>
                  )}
                  {groupDetail && groupDetail.members?.find(m => m.role === 'owner')?.user_id !== undefined && (
                    <button
                      onClick={groupDetail.members?.find(m => m.role === 'owner')?.user_id === groupDetail.created_by ? handleDeleteGroup : handleLeaveGroup}
                      className="text-[10px] text-text-muted hover:text-danger transition-colors"
                    >
                      {groupDetail.created_by === groupDetail.members?.find(m => m.role === 'owner')?.user_id ? 'delete' : 'leave'}
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-tabs */}
              <div className="flex border-b border-border px-6">
                {['forum', 'shared notes', 'messages', 'study room', 'stats'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className={`py-2.5 px-4 text-xs transition-colors ${
                      rightTab === tab
                        ? 'text-text border-b-2 border-text'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {rightTab === 'forum' && (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Pinned messages */}
                  {pinnedMessages.length > 0 && (
                    <div className="border-b border-border bg-bg-secondary px-6 py-3 space-y-2">
                      <span className="text-[10px] uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                        <span>📌</span> pinned messages
                      </span>
                      {pinnedMessages.map(pm => (
                        <div key={pm.id} className="flex items-start gap-2 py-1.5 group/pin">
                          <div className="w-5 h-5 rounded-full bg-bg-tertiary flex items-center justify-center text-[9px] text-text-secondary font-medium flex-shrink-0">
                            {pm.username[0].toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] font-medium text-text">{pm.username}</span>
                              <span className="text-[10px] text-text-muted"><TimeAgo date={pm.created_at} /></span>
                            </div>
                            <p className="text-[11px] text-text-secondary whitespace-pre-wrap">{pm.content}</p>
                          </div>
                          <button
                            onClick={() => handleUnpinMessage(pm.id)}
                            className="text-[10px] text-text-muted hover:text-text-secondary opacity-0 group-hover/pin:opacity-100 transition-all cursor-pointer flex-shrink-0"
                            title="Unpin"
                          >
                            📌
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.length === 0 ? (
                      <p className="text-xs text-text-secondary text-center py-8">no messages yet — start the conversation</p>
                    ) : (
                      messages.map(m => (
                        <div key={m.id}>
                          <div className="flex items-start gap-3 group">
                            <div className="w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center text-[10px] text-text-secondary font-medium flex-shrink-0">
                              {m.username[0].toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-medium text-text">{m.username}</span>
                                <span className="text-[10px] text-text-muted"><TimeAgo date={m.created_at} /></span>
                                {m.is_pinned && <span className="text-[10px]" title="Pinned">📌</span>}
                              </div>
                              {m.message_type === 'note_share' ? (
                                <div
                                  onClick={() => m.resource_id && navigate(`/notes/${m.resource_id}`)}
                                  className="mt-1 p-2.5 bg-bg-secondary rounded border border-border inline-flex items-center gap-2 cursor-pointer hover:border-text-secondary transition-colors"
                                >
                                  <span className="text-[10px] text-text-muted">shared a note:</span>
                                  {(() => {
                                    const match = m.content.match(/^Shared note:\s*\*\*(.+?)\*\*(?:\s*\((.+?)\))?$/)
                                    if (match) {
                                      return (
                                        <>
                                          <span className="text-xs text-text hover:underline">{match[1]}</span>
                                          {match[2] && <span className="text-[10px] text-text-muted">({match[2]})</span>}
                                        </>
                                      )
                                    }
                                    return <span className="text-xs text-text hover:underline">{m.content}</span>
                                  })()}
                                </div>
                              ) : (
                                <p className="text-xs text-text-secondary mt-0.5 whitespace-pre-wrap">{m.content}</p>
                              )}
                              {/* Reaction counts */}
                              {m.reactions && m.reactions.length > 0 && (
                                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                  {m.reactions.map(r => (
                                    <button
                                      key={r.emoji}
                                      onClick={() => handleReaction(m.id, r.emoji)}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors cursor-pointer ${
                                        r.user_reacted
                                          ? 'border-[#c4a759] bg-[rgba(196,167,89,0.12)] text-text'
                                          : 'border-border bg-bg-secondary text-text-muted hover:border-text-secondary'
                                      }`}
                                    >
                                      <span>{r.emoji}</span>
                                      <span>{r.count}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-3 mt-1.5 items-center">
                                {/* Reaction buttons */}
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                                  {['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F4A1}', '\u{1F389}', '\u{2705}'].map(emoji => (
                                    <button
                                      key={emoji}
                                      onClick={() => handleReaction(m.id, emoji)}
                                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-bg-tertiary transition-colors cursor-pointer text-[12px]"
                                      title={`React with ${emoji}`}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                                {/* Pin/unpin button */}
                                <button
                                  onClick={() => m.is_pinned ? handleUnpinMessage(m.id) : handlePinMessage(m.id)}
                                  className="text-[10px] text-text-muted hover:text-text-secondary opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                  title={m.is_pinned ? 'Unpin message' : 'Pin message'}
                                >
                                  {m.is_pinned ? 'unpin' : 'pin'}
                                </button>
                                {m.reply_count > 0 && (
                                  <button
                                    onClick={() => handleLoadReplies(m.id)}
                                    className="text-[10px] text-text-secondary hover:text-text transition-colors cursor-pointer"
                                  >
                                    {expandedThread === m.id ? 'hide thread' : `${m.reply_count} ${m.reply_count === 1 ? 'reply' : 'replies'}`}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleExpandThread(m.id)}
                                  className="text-[10px] text-text-muted hover:text-text-secondary opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                >
                                  reply
                                </button>
                                <button
                                  onClick={() => handleDeleteMessage(m.id)}
                                  className="text-[10px] text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                >
                                  delete
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Thread replies */}
                          {expandedThread === m.id && replies[m.id] && (
                            <div className="ml-10 mt-2 border-l-2 border-border pl-4">
                              <div className="space-y-2">
                                {replies[m.id].map(r => (
                                  <div key={r.id} className="flex items-start gap-2">
                                    <div className="w-5 h-5 rounded-full bg-bg-tertiary flex items-center justify-center text-[9px] text-text-secondary font-medium flex-shrink-0">
                                      {r.username[0].toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-baseline gap-2">
                                        <span className="text-[11px] font-medium text-text">{r.username}</span>
                                        <span className="text-[10px] text-text-muted"><TimeAgo date={r.created_at} /></span>
                                      </div>
                                      <p className="text-[11px] text-text-secondary whitespace-pre-wrap">{r.content}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <ThreadReplyInput parentId={m.id} groupId={selectedGroupId} onSent={() => {
                                handleLoadReplies(m.id)
                                loadMessages(selectedGroupId)
                              }} />
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Compose */}
                  <div className="border-t border-border p-4">
                    <div className="flex gap-2">
                      <input
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                        placeholder="type a message..."
                        className="flex-1 bg-bg-secondary border border-border rounded px-3 py-2 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-text-secondary"
                      />
                      <button
                        onClick={openSharePicker}
                        className="px-3 py-2 text-xs bg-bg-secondary border border-border rounded text-text-secondary hover:text-text transition-colors"
                        title="Share a note"
                      >
                        share note
                      </button>
                      <button
                        onClick={handleSendMessage}
                        className="px-4 py-2 text-xs bg-bg-secondary border border-border rounded text-text-secondary hover:text-text transition-colors"
                      >
                        send
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {rightTab === 'shared notes' && (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">shared notes</h3>
                    <button
                      onClick={openSharePicker}
                      className="px-3 py-1.5 text-xs bg-bg-secondary border border-border rounded text-text-secondary hover:text-text transition-colors"
                    >
                      share a note
                    </button>
                  </div>
                  {sharedNotes.length === 0 ? (
                    <p className="text-xs text-text-secondary text-center py-8">no shared notes yet</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sharedNotes.map(n => (
                        <div
                          key={n.id}
                          className="p-4 bg-bg-secondary rounded border border-border group cursor-pointer hover:border-text-secondary transition-colors"
                          onClick={() => navigate(`/notes/${n.note_id}`)}
                        >
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-medium text-text truncate flex-1">{n.note_title}</h4>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                              n.permission === 'edit' ? 'bg-[rgba(106,154,106,0.1)] text-success' :
                              n.permission === 'suggest' ? 'bg-[rgba(196,167,89,0.1)] text-[#c4a759]' :
                              'bg-bg-tertiary text-text-muted'
                            }`}>
                              {n.permission || 'view'}
                            </span>
                          </div>
                          <p className="text-[10px] text-text-muted mt-1">
                            shared by {n.shared_by_username} · <TimeAgo date={n.shared_at} />
                          </p>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUnshareNote(n.note_id) }}
                            className="text-[10px] text-text-muted hover:text-danger mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            unshare
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {rightTab === 'stats' && (
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  {/* Group leaderboard */}
                  <div>
                    <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">group leaderboard</h3>
                    {groupLeaderboard.length === 0 ? (
                      <p className="text-xs text-text-secondary">no data</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-text-muted text-[10px] uppercase tracking-wider">
                            <th className="text-left py-2 font-normal">#</th>
                            <th className="text-left py-2 font-normal">member</th>
                            <th className="text-right py-2 font-normal">hours</th>
                            <th className="text-right py-2 font-normal">streak</th>
                            <th className="text-right py-2 font-normal">retention</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupLeaderboard.map((entry, i) => (
                            <tr key={entry.user_id} className="border-t border-border">
                              <td className="py-2 text-text-muted">{i + 1}</td>
                              <td className="py-2 text-text">{entry.username}</td>
                              <td className="py-2 text-right text-text-secondary">{Math.round(entry.study_minutes / 60 * 10) / 10}h</td>
                              <td className="py-2 text-right text-text-secondary">{entry.streak}d</td>
                              <td className="py-2 text-right text-text-secondary">{entry.retention_pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Flashcard accuracy */}
                  <div>
                    <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">flashcard accuracy (shared decks)</h3>
                    {flashcardStats.length === 0 ? (
                      <p className="text-xs text-text-secondary">no shared flashcard data</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-text-muted text-[10px] uppercase tracking-wider">
                            <th className="text-left py-2 font-normal">member</th>
                            <th className="text-right py-2 font-normal">reviews</th>
                            <th className="text-right py-2 font-normal">correct</th>
                            <th className="text-right py-2 font-normal">accuracy</th>
                          </tr>
                        </thead>
                        <tbody>
                          {flashcardStats.map(s => (
                            <tr key={s.user_id} className="border-t border-border">
                              <td className="py-2 text-text">{s.username}</td>
                              <td className="py-2 text-right text-text-secondary">{s.total_reviews}</td>
                              <td className="py-2 text-right text-text-secondary">{s.correct_reviews}</td>
                              <td className="py-2 text-right text-text-secondary">{s.accuracy_pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {rightTab === 'messages' && (
                <div className="flex-1 flex min-h-0">
                  {/* Conversation list */}
                  <div className="w-[220px] flex-shrink-0 border-r border-border flex flex-col">
                    <div className="px-4 py-3 border-b border-border">
                      <span className="text-[10px] uppercase tracking-widest text-text-muted">conversations</span>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {dmConversations.length === 0 ? (
                        <p className="text-xs text-text-secondary text-center py-6">no conversations yet</p>
                      ) : (
                        dmConversations.map(c => (
                          <button
                            key={c.user_id}
                            onClick={() => handleSelectDmUser(c.user_id)}
                            className={`w-full text-left px-4 py-3 border-b border-border transition-colors cursor-pointer ${
                              dmSelectedUser === c.user_id
                                ? 'bg-bg-secondary text-text'
                                : 'text-text-secondary hover:bg-bg-secondary hover:text-text'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">{c.username}</span>
                              {c.unread_count > 0 && (
                                <span className="w-4 h-4 rounded-full bg-[#c4a759] text-[9px] text-bg font-medium flex items-center justify-center flex-shrink-0">
                                  {c.unread_count}
                                </span>
                              )}
                            </div>
                            {c.last_message && (
                              <p className="text-[10px] text-text-muted truncate mt-0.5">{c.last_message}</p>
                            )}
                            {c.last_message_at && (
                              <span className="text-[9px] text-text-muted"><TimeAgo date={c.last_message_at} /></span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* DM thread */}
                  <div className="flex-1 flex flex-col min-w-0">
                    {!dmSelectedUser ? (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-xs text-text-secondary">select a conversation</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 overflow-y-auto p-6 space-y-3">
                          {dmThread.length === 0 ? (
                            <p className="text-xs text-text-secondary text-center py-8">no messages yet</p>
                          ) : (
                            dmThread.map(msg => (
                              <div key={msg.id} className="flex items-start gap-3">
                                <div className="w-6 h-6 rounded-full bg-bg-tertiary flex items-center justify-center text-[9px] text-text-secondary font-medium flex-shrink-0">
                                  {(msg.sender_username || '?')[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-[11px] font-medium text-text">{msg.sender_username}</span>
                                    <span className="text-[10px] text-text-muted"><TimeAgo date={msg.created_at} /></span>
                                  </div>
                                  <p className="text-xs text-text-secondary mt-0.5 whitespace-pre-wrap">{msg.body}</p>
                                </div>
                              </div>
                            ))
                          )}
                          <div ref={dmThreadEndRef} />
                        </div>
                        <div className="border-t border-border p-4">
                          <div className="flex gap-2">
                            <input
                              value={dmNewMessage}
                              onChange={e => setDmNewMessage(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendDm())}
                              placeholder="type a message..."
                              className="flex-1 bg-bg-secondary border border-border rounded px-3 py-2 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-text-secondary"
                            />
                            <button
                              onClick={handleSendDm}
                              className="px-4 py-2 text-xs bg-bg-secondary border border-border rounded text-text-secondary hover:text-text transition-colors cursor-pointer"
                            >
                              send
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {rightTab === 'study room' && (
                <div className="flex-1 overflow-y-auto p-6">
                  {!studyRoom ? (
                    /* No active room */
                    <div className="max-w-md mx-auto">
                      {!showCreateRoom ? (
                        <div className="text-center py-12">
                          <p className="text-xs text-text-secondary mb-4">no active study room</p>
                          <button
                            onClick={() => setShowCreateRoom(true)}
                            className="px-4 py-2 text-xs bg-bg-secondary border border-border rounded text-text-secondary hover:text-text hover:border-text-secondary transition-colors cursor-pointer"
                          >
                            create study room
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4 p-6 bg-bg-secondary rounded-lg border border-border">
                          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">create study room</h3>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-[10px] text-text-muted mb-1">room name</label>
                              <input
                                value={roomName}
                                onChange={e => setRoomName(e.target.value)}
                                placeholder="e.g. evening study session"
                                className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-text-secondary"
                              />
                            </div>
                            <div className="flex gap-3">
                              <div className="flex-1">
                                <label className="block text-[10px] text-text-muted mb-1">focus (minutes)</label>
                                <input
                                  type="number"
                                  value={roomFocusMinutes}
                                  onChange={e => setRoomFocusMinutes(parseInt(e.target.value) || 25)}
                                  min={1}
                                  className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text focus:outline-none focus:border-text-secondary"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="block text-[10px] text-text-muted mb-1">break (minutes)</label>
                                <input
                                  type="number"
                                  value={roomBreakMinutes}
                                  onChange={e => setRoomBreakMinutes(parseInt(e.target.value) || 5)}
                                  min={1}
                                  className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text focus:outline-none focus:border-text-secondary"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={handleCreateStudyRoom}
                                className="flex-1 py-2 text-xs bg-bg border border-border rounded text-text-secondary hover:text-text hover:border-text-secondary transition-colors cursor-pointer"
                              >
                                create
                              </button>
                              <button
                                onClick={() => setShowCreateRoom(false)}
                                className="px-4 py-2 text-xs bg-bg border border-border rounded text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                              >
                                cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Active room */
                    <div className="max-w-lg mx-auto space-y-6">
                      {/* Room header */}
                      <div className="p-5 bg-bg-secondary rounded-lg border border-border">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-medium text-text">{studyRoom.name}</h3>
                            <p className="text-[10px] text-text-muted mt-0.5">
                              {studyRoom.focus_minutes}min focus · {studyRoom.break_minutes}min break
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-text-muted">
                              {studyRoom.participants?.length || 0} participant{(studyRoom.participants?.length || 0) !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleJoinStudyRoom(studyRoom.id)}
                            className="px-4 py-2 text-xs bg-bg border border-border rounded text-text-secondary hover:text-text hover:border-[#c4a759] transition-colors cursor-pointer"
                          >
                            join room
                          </button>
                          <button
                            onClick={() => handleLeaveStudyRoom(studyRoom.id)}
                            className="px-4 py-2 text-xs bg-bg border border-border rounded text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                          >
                            leave room
                          </button>
                          {studyRoom.created_by === groupDetail?.created_by && (
                            <button
                              onClick={() => handleEndStudyRoom(studyRoom.id)}
                              className="px-4 py-2 text-xs bg-bg border border-border rounded text-text-muted hover:text-danger transition-colors cursor-pointer"
                            >
                              end room
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Participants */}
                      <div>
                        <h4 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">participants</h4>
                        {(!studyRoom.participants || studyRoom.participants.length === 0) ? (
                          <p className="text-xs text-text-secondary">no one has joined yet</p>
                        ) : (
                          <div className="space-y-2">
                            {studyRoom.participants.map(p => (
                              <div key={p.user_id} className="flex items-center gap-3 py-2 px-3 bg-bg-secondary rounded border border-border">
                                <div className="relative">
                                  <div className="w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center text-[10px] text-text-secondary font-medium">
                                    {(p.username || '?')[0].toUpperCase()}
                                  </div>
                                  <span
                                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary ${
                                      p.is_online ? 'bg-[#6a9a6a]' : 'bg-[#555]'
                                    }`}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs text-text">{p.username}</span>
                                  {p.status && (
                                    <span className="text-[10px] text-text-muted ml-2">{p.status}</span>
                                  )}
                                </div>
                                <span className={`text-[10px] ${p.is_online ? 'text-[#6a9a6a]' : 'text-text-muted'}`}>
                                  {p.is_online ? 'online' : 'offline'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Share Note Picker Modal */}
      {showSharePicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.6)]"
          onClick={() => setShowSharePicker(false)}
        >
          <div
            className="bg-bg-secondary border border-border rounded-lg w-full max-w-md max-h-[60vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-text">share a note</h3>
              <button
                onClick={() => setShowSharePicker(false)}
                className="text-text-muted hover:text-text text-sm"
              >
                close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {userNotes.length === 0 ? (
                <p className="text-xs text-text-secondary text-center py-4">no notes found</p>
              ) : (
                userNotes.map(n => (
                  <div
                    key={n.id}
                    className="group flex items-center justify-between px-3 py-2 rounded hover:bg-bg-tertiary transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-text">{n.title || 'Untitled'}</div>
                      <div className="text-[10px] text-text-muted truncate">{n.preview}</div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      <PermDropdown
                        value={notePerms[n.id] || 'edit'}
                        onChange={perm => setNotePerms(p => ({ ...p, [n.id]: perm }))}
                      />
                      <button
                        onClick={() => handleShareNote(n.id, notePerms[n.id] || 'edit')}
                        className="text-[10px] text-text-muted hover:text-text transition-colors"
                      >
                        share
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
