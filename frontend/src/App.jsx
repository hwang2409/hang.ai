import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import PrivateRoute from './components/PrivateRoute'
import AdminRoute from './components/AdminRoute'
import SearchModal from './components/SearchModal'
import Login from './pages/Login'
import Signup from './pages/Signup'

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

export default function App() {
  return (
    <>
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
          <Route path="/wiki" element={<PrivateRoute><Wiki /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/integrations" element={<PrivateRoute><Integrations /></PrivateRoute>} />
          <Route path="/admin/imagesearch" element={<AdminRoute><ImageSearch /></AdminRoute>} />
        </Routes>
      </Suspense>
      <SearchModal />
    </>
  )
}
