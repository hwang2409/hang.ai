import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, X as XIcon, ArrowRight, RotateCcw, Shield } from 'lucide-react'
import { api } from '../lib/api'

export default function QuizTake() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const examMode = searchParams.get('mode') === 'exam'
  const [quiz, setQuiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({}) // { questionId: userAnswer }
  const [feedback, setFeedback] = useState(null) // { isCorrect, correctAnswer, explanation }
  const [results, setResults] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Timer
  const [seconds, setSeconds] = useState(0)
  const timerRef = useRef(null)

  // Fill-blank input
  const [fillInput, setFillInput] = useState('')

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const data = await api.get(`/quizzes/${id}`)
        setQuiz(data)
      } catch (err) {
        console.error('Failed to fetch quiz:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchQuiz()
  }, [id])

  // Start timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  const currentQuestion = quiz?.questions?.[currentIndex]
  const totalQuestions = quiz?.questions?.length || 0
  const progress = totalQuestions > 0 ? (currentIndex / totalQuestions) * 100 : 0

  const handleAnswer = useCallback((answer) => {
    if (feedback || !currentQuestion) return

    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: answer }))

    if (examMode) {
      // Exam mode: no feedback, auto-advance
      setFillInput('')
      if (currentIndex + 1 < totalQuestions) {
        setCurrentIndex((prev) => prev + 1)
      } else {
        // Submit immediately
        clearInterval(timerRef.current)
        setSubmitting(true)
        const allAnswers = { ...answers, [currentQuestion.id]: answer }
        const answerList = Object.entries(allAnswers).map(([questionId, userAnswer]) => ({
          question_id: parseInt(questionId),
          user_answer: userAnswer,
        }))
        api.post('/quizzes/submit', {
          quiz_id: quiz.id,
          answers: answerList,
          time_seconds: seconds,
        }).then(setResults).catch(err => console.error('Failed to submit quiz:', err)).finally(() => setSubmitting(false))
      }
    } else {
      const isCorrect = gradeAnswer(currentQuestion, answer)
      setFeedback({
        isCorrect,
        correctAnswer: currentQuestion.correct_answer,
        explanation: currentQuestion.explanation,
      })
    }
  }, [feedback, currentQuestion, examMode, currentIndex, totalQuestions, answers, quiz, seconds])

  const handleNext = useCallback(async () => {
    setFeedback(null)
    setFillInput('')

    if (currentIndex + 1 < totalQuestions) {
      setCurrentIndex((prev) => prev + 1)
    } else {
      // Submit
      clearInterval(timerRef.current)
      setSubmitting(true)
      try {
        const answerList = Object.entries(answers).map(([questionId, userAnswer]) => ({
          question_id: parseInt(questionId),
          user_answer: userAnswer,
        }))
        const result = await api.post('/quizzes/submit', {
          quiz_id: quiz.id,
          answers: answerList,
          time_seconds: seconds,
        })
        setResults(result)
      } catch (err) {
        console.error('Failed to submit quiz:', err)
      } finally {
        setSubmitting(false)
      }
    }
  }, [currentIndex, totalQuestions, answers, quiz, seconds])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!currentQuestion) return

      // In exam mode, don't wait for feedback — answer already advances
      if (feedback && !examMode) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleNext()
        }
        return
      }

      // Don't allow re-answering in non-exam mode if already answered
      if (answers[currentQuestion.id] && !examMode) return

      if (currentQuestion.question_type === 'multiple_choice') {
        if (e.key === '1' && currentQuestion.options[0]) handleAnswer(currentQuestion.options[0])
        if (e.key === '2' && currentQuestion.options[1]) handleAnswer(currentQuestion.options[1])
        if (e.key === '3' && currentQuestion.options[2]) handleAnswer(currentQuestion.options[2])
        if (e.key === '4' && currentQuestion.options[3]) handleAnswer(currentQuestion.options[3])
      }

      if (currentQuestion.question_type === 'true_false') {
        if (e.key === 't' || e.key === 'T') handleAnswer('True')
        if (e.key === 'f' || e.key === 'F') handleAnswer('False')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [feedback, currentQuestion, handleAnswer, handleNext, examMode, answers])

  const formatTimer = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a]">
        <div className="animate-spin h-8 w-8 border-4 border-[#333333] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a]">
        <div className="text-center">
          <p className="text-[#606060] mb-4">quiz not found.</p>
          <button
            onClick={() => navigate('/quizzes')}
            className="border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#2a2a2a] rounded-md px-4 py-2 transition-colors text-sm inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            back to quizzes
          </button>
        </div>
      </div>
    )
  }

  // Results screen
  if (results) {
    const pct = results.total_questions > 0
      ? Math.round(results.score / results.total_questions * 100)
      : 0
    const wrongAnswers = results.results.filter((r) => !r.is_correct)

    return (
      <div className="flex flex-col h-screen bg-[#0a0a0a]">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto animate-fade-in">
            <h1 className="text-2xl font-light text-[#d4d4d4] mb-2 text-center mt-12">results</h1>
            <p className="text-center text-[#606060] mb-8">{quiz.title}</p>

            {/* Score */}
            <div className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-8 text-center mb-6">
              <div className="text-4xl font-semibold text-[#d4d4d4] mb-2">{pct}%</div>
              <p className="text-[#606060] text-sm">{results.score} / {results.total_questions} correct</p>
              <p className="text-[#333333] text-xs mt-2">time: {formatTimer(results.time_seconds)}</p>
            </div>

            {/* Full review in exam mode, wrong answers only in standard mode */}
            {examMode ? (
              <div className="space-y-3 mb-8">
                <h3 className="text-sm font-semibold text-[#d4d4d4]">full review</h3>
                {results.results.map((r) => (
                  <div key={r.question_id} className={`bg-[#111111] border rounded-lg p-4 ${r.is_correct ? 'border-green-500/20' : 'border-red-500/20'}`}>
                    <p className="text-sm text-[#d4d4d4] mb-2">{r.question_text}</p>
                    <div className="flex flex-col gap-1 text-xs">
                      <span className={r.is_correct ? 'text-green-400' : 'text-red-400'}>
                        your answer: {r.user_answer} {r.is_correct ? '✓' : '✗'}
                      </span>
                      {!r.is_correct && (
                        <span className="text-green-400">correct: {r.correct_answer}</span>
                      )}
                      {r.explanation && (
                        <span className="text-[#606060] mt-1">{r.explanation}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : wrongAnswers.length > 0 ? (
              <div className="space-y-3 mb-8">
                <h3 className="text-sm font-semibold text-[#d4d4d4]">review wrong answers</h3>
                {wrongAnswers.map((r) => (
                  <div key={r.question_id} className="bg-[#111111] border border-[#1c1c1c] rounded-lg p-4">
                    <p className="text-sm text-[#d4d4d4] mb-2">{r.question_text}</p>
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="text-red-400">your answer: {r.user_answer}</span>
                      <span className="text-green-400">correct: {r.correct_answer}</span>
                      {r.explanation && (
                        <span className="text-[#606060] mt-1">{r.explanation}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  setCurrentIndex(0)
                  setAnswers({})
                  setFeedback(null)
                  setFillInput('')
                  setResults(null)
                  setSeconds(0)
                  timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
                }}
                className="border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#2a2a2a] rounded-md px-4 py-2 transition-colors text-sm inline-flex items-center gap-2"
              >
                <RotateCcw size={16} />
                retake
              </button>
              <button
                onClick={() => navigate('/quizzes')}
                className="border border-[#1c1c1c] text-[#606060] hover:text-[#d4d4d4] hover:border-[#2a2a2a] rounded-md px-4 py-2 transition-colors text-sm inline-flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                back to quizzes
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 flex-shrink-0">
        <button
          onClick={() => navigate('/quizzes')}
          className="text-[#333333] hover:text-[#606060] transition-colors duration-200 p-1"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="h-1 rounded-full overflow-hidden bg-[#111111]">
            <div
              className="h-full rounded-full transition-all duration-500 bg-[#d4d4d4]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {examMode && (
          <span className="text-[10px] uppercase tracking-wider text-[#c4a759] flex items-center gap-1">
            <Shield size={10} />
            exam
          </span>
        )}
        <span className="text-xs text-[#333333] whitespace-nowrap font-mono">
          {currentIndex + 1} / {totalQuestions}
        </span>
        <span className="text-xs text-[#333333] whitespace-nowrap font-mono">
          {formatTimer(seconds)}
        </span>
      </div>

      {/* Question area */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl animate-fade-in" key={currentIndex}>
          {/* Question type badge */}
          <div className="text-xs text-[#333333] uppercase tracking-widest mb-4 text-center font-mono">
            {currentQuestion?.question_type === 'multiple_choice' && 'multiple choice'}
            {currentQuestion?.question_type === 'true_false' && 'true or false'}
            {currentQuestion?.question_type === 'fill_blank' && 'fill in the blank'}
          </div>

          {/* Question text */}
          <p className="text-lg text-[#d4d4d4] text-center font-light leading-relaxed mb-8">
            {currentQuestion?.question_text}
          </p>

          {/* Multiple choice options */}
          {currentQuestion?.question_type === 'multiple_choice' && (
            <div className="space-y-3">
              {currentQuestion.options.map((option, i) => {
                const isSelected = answers[currentQuestion.id] === option
                const isCorrect = !examMode && feedback && option === feedback.correctAnswer
                const isWrong = !examMode && feedback && isSelected && !feedback.isCorrect

                let borderClass = 'border-[#1c1c1c]'
                let textClass = 'text-[#d4d4d4]'
                if (isCorrect) { borderClass = 'border-green-500/50'; textClass = 'text-green-400' }
                if (isWrong) { borderClass = 'border-red-500/50'; textClass = 'text-red-400' }

                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(option)}
                    disabled={!!feedback && !examMode}
                    className={`w-full border ${borderClass} rounded-lg p-4 text-left text-sm ${textClass} transition-colors ${
                      !feedback || examMode ? 'hover:border-[#2a2a2a] hover:text-white' : ''
                    } flex items-center gap-3`}
                  >
                    <span className="text-xs font-mono text-[#333333] flex-shrink-0">{i + 1}</span>
                    <span className="flex-1">{option}</span>
                    {isCorrect && <Check size={16} className="text-green-400 flex-shrink-0" />}
                    {isWrong && <XIcon size={16} className="text-red-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* True/False */}
          {currentQuestion?.question_type === 'true_false' && (
            <div className="flex gap-4 justify-center">
              {['True', 'False'].map((option) => {
                const isSelected = answers[currentQuestion.id] === option
                const isCorrect = !examMode && feedback && option === feedback.correctAnswer
                const isWrong = !examMode && feedback && isSelected && !feedback.isCorrect

                let borderClass = 'border-[#1c1c1c]'
                let textClass = 'text-[#d4d4d4]'
                if (isCorrect) { borderClass = 'border-green-500/50'; textClass = 'text-green-400' }
                if (isWrong) { borderClass = 'border-red-500/50'; textClass = 'text-red-400' }

                return (
                  <button
                    key={option}
                    onClick={() => handleAnswer(option)}
                    disabled={!!feedback && !examMode}
                    className={`border ${borderClass} rounded-lg px-8 py-4 text-sm ${textClass} transition-colors ${
                      !feedback || examMode ? 'hover:border-[#2a2a2a] hover:text-white' : ''
                    } flex items-center gap-2 min-w-[120px] justify-center`}
                  >
                    <span className="text-xs font-mono text-[#333333]">{option[0]}</span>
                    <span>{option}</span>
                    {isCorrect && <Check size={16} className="text-green-400" />}
                    {isWrong && <XIcon size={16} className="text-red-400" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* Fill in the blank */}
          {currentQuestion?.question_type === 'fill_blank' && !feedback && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (fillInput.trim()) handleAnswer(fillInput.trim())
              }}
              className="flex gap-3 max-w-md mx-auto"
            >
              <input
                type="text"
                value={fillInput}
                onChange={(e) => setFillInput(e.target.value)}
                placeholder="type your answer..."
                autoFocus
                className="flex-1 bg-[#111111] border border-[#1c1c1c] rounded-md px-4 py-3 text-sm text-[#d4d4d4] placeholder-[#333333] outline-none focus:border-[#333333] transition-colors"
              />
              <button
                type="submit"
                disabled={!fillInput.trim()}
                className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-4 py-3 transition-colors text-sm disabled:opacity-50"
              >
                submit
              </button>
            </form>
          )}

          {/* Fill blank feedback display */}
          {currentQuestion?.question_type === 'fill_blank' && feedback && !examMode && (
            <div className="max-w-md mx-auto">
              <div className={`border ${feedback.isCorrect ? 'border-green-500/50' : 'border-red-500/50'} rounded-lg p-4 text-center`}>
                <p className={`text-sm ${feedback.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                  your answer: {answers[currentQuestion.id]}
                </p>
                {!feedback.isCorrect && (
                  <p className="text-sm text-green-400 mt-1">correct: {feedback.correctAnswer}</p>
                )}
              </div>
            </div>
          )}

          {/* Feedback */}
          {feedback && !examMode && (
            <div className="mt-6 text-center animate-fade-in">
              {feedback.explanation && (
                <p className="text-sm text-[#606060] mb-4">{feedback.explanation}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Next button */}
      {feedback && !examMode && (
        <div className="flex items-center justify-center p-6 flex-shrink-0 animate-fade-in">
          <button
            onClick={handleNext}
            disabled={submitting}
            className="bg-[#d4d4d4] text-[#0a0a0a] hover:bg-white font-medium rounded-md px-6 py-3 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full" />
                submitting...
              </>
            ) : currentIndex + 1 < totalQuestions ? (
              <>
                next
                <ArrowRight size={16} />
              </>
            ) : (
              <>
                finish
                <Check size={16} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

function gradeAnswer(question, answer) {
  if (question.question_type === 'true_false') {
    return answer.toLowerCase() === question.correct_answer.toLowerCase()
  }
  if (question.question_type === 'fill_blank') {
    return answer.trim().toLowerCase() === question.correct_answer.trim().toLowerCase()
  }
  // multiple_choice: exact match
  return answer === question.correct_answer
}
