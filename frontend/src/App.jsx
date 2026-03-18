import { Routes, Route } from 'react-router-dom'
import PrivateRoute from './components/PrivateRoute'
import AdminRoute from './components/AdminRoute'
import SearchModal from './components/SearchModal'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import NoteEdit from './pages/NoteEdit'
import Flashcards from './pages/Flashcards'
import FlashcardStudy from './pages/FlashcardStudy'
import Feynman from './pages/Feynman'
import Chat from './pages/Chat'
import ImageSearch from './pages/ImageSearch'
import Pomodoro from './pages/Pomodoro'
import Dashboard from './pages/Dashboard'
import Todos from './pages/Todos'
import Library from './pages/Library'
import FileView from './pages/FileView'
import StudyPlan from './pages/StudyPlan'
import KnowledgeGraph from './pages/KnowledgeGraph'
import Quizzes from './pages/Quizzes'
import QuizTake from './pages/QuizTake'
import Wiki from './pages/Wiki'
import Settings from './pages/Settings'
import SharedNote from './pages/SharedNote'

export default function App() {
  return (
    <>
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
        <Route path="/admin/imagesearch" element={<AdminRoute><ImageSearch /></AdminRoute>} />
      </Routes>
      <SearchModal />
    </>
  )
}
