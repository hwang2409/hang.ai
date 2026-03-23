import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import PrivateRoute from './components/PrivateRoute'
import AdminRoute from './components/AdminRoute'
import SearchModal from './components/SearchModal'
import ApiKeyModal from './components/ApiKeyModal'
import DailyBoot from './components/DailyBoot'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { PluginProvider } from './contexts/PluginContext'
import { FocusProvider } from './contexts/FocusContext'
import FocusMode from './components/FocusMode'
import Login from './pages/Login'
import Signup from './pages/Signup'
import { api, getToken } from './lib/api'

const Home = lazy(() => import('./pages/Home'))
const NoteEdit = lazy(() => import('./pages/NoteEdit'))
const Flashcards = lazy(() => import('./pages/Flashcards'))
const FlashcardStudy = lazy(() => import('./pages/FlashcardStudy'))
const Feynman = lazy(() => import('./pages/Feynman'))
const Chat = lazy(() => import('./pages/Chat'))
const ImageSearch = lazy(() => import('./pages/ImageSearch'))
const Pomodoro = lazy(() => import('./pages/Pomodoro'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Todos = lazy(() => import('./pages/Todos'))
const Library = lazy(() => import('./pages/Library'))
const FileView = lazy(() => import('./pages/FileView'))
const StudyPlan = lazy(() => import('./pages/StudyPlan'))
const KnowledgeGraph = lazy(() => import('./pages/KnowledgeGraph'))
const Quizzes = lazy(() => import('./pages/Quizzes'))
const QuizTake = lazy(() => import('./pages/QuizTake'))
const Wiki = lazy(() => import('./pages/Wiki'))
const Settings = lazy(() => import('./pages/Settings'))
const Integrations = lazy(() => import('./pages/Integrations'))
const SharedNote = lazy(() => import('./pages/SharedNote'))
const StudyGroups = lazy(() => import('./pages/StudyGroups'))
const Forum = lazy(() => import('./pages/Forum'))
const UserProfile = lazy(() => import('./pages/UserProfile'))
const Automations = lazy(() => import('./pages/Automations'))
const Timeline = lazy(() => import('./pages/Timeline'))
const ReviewQueue = lazy(() => import('./pages/ReviewQueue'))

function deriveLabel(path) {
  if (path.startsWith('/notes/')) return 'Note'
  if (path === '/flashcards/study') return 'Flashcard review'
  if (path === '/flashcards') return 'Flashcards'
  if (path.startsWith('/quizzes/take/')) return 'Quiz'
  if (path === '/quizzes') return 'Quizzes'
  if (path === '/feynman') return 'Feynman technique'
  if (path === '/chat') return 'AI Chat'
  if (path === '/library') return 'Library'
  if (path === '/pomodoro') return 'Pomodoro'
  if (path === '/studyplan') return 'Study plan'
  if (path === '/todos') return 'Todos'
  if (path === '/dashboard') return 'Dashboard'
  if (path === '/reviews') return 'Note review'
  if (path === '/knowledge-graph') return 'Knowledge graph'
  if (path === '/automations') return 'Automations'
  if (path === '/timeline') return 'Timeline'
  if (path === '/forum') return 'Forum'
  if (path === '/groups') return 'Study groups'
  if (path === '/wiki') return 'Wiki'
  if (path === '/settings') return 'Settings'
  return null
}

export default function App() {
  const location = useLocation()

  // Track session for "continue where you left off"
  useEffect(() => {
    const label = deriveLabel(location.pathname)
    if (label) {
      localStorage.setItem('neuronic_last_session', JSON.stringify({
        path: location.pathname,
        label,
        timestamp: Date.now()
      }))
    }
  }, [location.pathname])

  // Fire-and-forget nudge generation once per session
  useEffect(() => {
    if (sessionStorage.getItem('neuronic_nudges_triggered')) return
    const token = getToken()
    if (!token) return
    sessionStorage.setItem('neuronic_nudges_triggered', '1')
    api.post('/dashboard/generate-nudges', {}).catch(() => {})
  }, [])

  return (
    <PluginProvider>
      <WorkspaceProvider>
        <FocusProvider>
        <FocusMode />
        <DailyBoot />
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-border border-t-text-muted rounded-full animate-spin" />
          </div>
        }>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/shared/:token" element={<SharedNote />} />
            <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
            <Route path="/notes/:id" element={<PrivateRoute><NoteEdit /></PrivateRoute>} />
            <Route path="/flashcards" element={<PrivateRoute><Flashcards /></PrivateRoute>} />
            <Route path="/flashcards/study" element={<PrivateRoute><FlashcardStudy /></PrivateRoute>} />
            <Route path="/feynman" element={<PrivateRoute><Feynman /></PrivateRoute>} />
            <Route path="/quizzes" element={<PrivateRoute><Quizzes /></PrivateRoute>} />
            <Route path="/quizzes/take/:id" element={<PrivateRoute><QuizTake /></PrivateRoute>} />
            <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
            <Route path="/pomodoro" element={<PrivateRoute><Pomodoro /></PrivateRoute>} />
            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/todos" element={<PrivateRoute><Todos /></PrivateRoute>} />
            <Route path="/library" element={<PrivateRoute><Library /></PrivateRoute>} />
            <Route path="/files/:id" element={<PrivateRoute><FileView /></PrivateRoute>} />
            <Route path="/studyplan" element={<PrivateRoute><StudyPlan /></PrivateRoute>} />
            <Route path="/knowledge-graph" element={<PrivateRoute><KnowledgeGraph /></PrivateRoute>} />
            <Route path="/groups" element={<PrivateRoute><StudyGroups /></PrivateRoute>} />
            <Route path="/groups/:id" element={<PrivateRoute><StudyGroups /></PrivateRoute>} />
            <Route path="/forum" element={<PrivateRoute><Forum /></PrivateRoute>} />
            <Route path="/forum/:questionId" element={<PrivateRoute><Forum /></PrivateRoute>} />
            <Route path="/profile/:userId" element={<PrivateRoute><UserProfile /></PrivateRoute>} />
            <Route path="/wiki" element={<PrivateRoute><Wiki /></PrivateRoute>} />
            <Route path="/automations" element={<PrivateRoute><Automations /></PrivateRoute>} />
            <Route path="/timeline" element={<PrivateRoute><Timeline /></PrivateRoute>} />
            <Route path="/reviews" element={<PrivateRoute><ReviewQueue /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
            <Route path="/integrations" element={<PrivateRoute><Integrations /></PrivateRoute>} />
            <Route path="/admin/imagesearch" element={<AdminRoute><ImageSearch /></AdminRoute>} />
          </Routes>
        </Suspense>
        <SearchModal />
        <ApiKeyModal />
        </FocusProvider>
      </WorkspaceProvider>
    </PluginProvider>
  )
}
