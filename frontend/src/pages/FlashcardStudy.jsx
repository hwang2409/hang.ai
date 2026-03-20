import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shuffle } from 'lucide-react'
import { api } from '../lib/api'
import MarkdownRenderer from '../components/MarkdownRenderer'

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function FlashcardStudy() {
  const navigate = useNavigate()
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionComplete, setSessionComplete] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [ratings, setRatings] = useState({ again: 0, hard: 0, good: 0, easy: 0 })
  const [interleaved, setInterleaved] = useState(true)

  useEffect(() => {
    const fetchDue = async () => {
      try {
        const data = await api.get('/flashcards/due')
        const cardList = Array.isArray(data) ? data : data.results || []
        setCards(interleaved ? shuffleArray(cardList) : cardList)
        if (cardList.length === 0) setSessionComplete(true)
      } catch (err) {
        console.error('Failed to fetch due cards:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchDue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentCard = cards[currentIndex]

  const handleFlip = useCallback(() => {
    if (!flipped && currentCard) {
      setFlipped(true)
    }
  }, [flipped, currentCard])

  const handleRate = useCallback(async (quality) => {
    if (!currentCard) return

    const ratingNames = { 0: 'again', 2: 'hard', 4: 'good', 5: 'easy' }
    setRatings((prev) => ({ ...prev, [ratingNames[quality]]: prev[ratingNames[quality]] + 1 }))
    setReviewed((prev) => prev + 1)

    try {
      await api.post(`/flashcards/${currentCard.id}/review`, { quality })
    } catch (err) {
      console.error('Failed to submit review:', err)
    }

    setFlipped(false)
    if (currentIndex + 1 < cards.length) {
      setCurrentIndex((prev) => prev + 1)
    } else {
      setSessionComplete(true)
    }
  }, [currentCard, currentIndex, cards.length])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        if (!flipped) {
          handleFlip()
        }
      }
      if (flipped) {
        if (e.key === '1') handleRate(0)
        if (e.key === '2') handleRate(2)
        if (e.key === '3') handleRate(4)
        if (e.key === '4') handleRate(5)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [flipped, handleFlip, handleRate])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="animate-spin h-8 w-8 border-4 border-text-muted border-t-transparent rounded-full" />
      </div>
    )
  }

  // Session complete
  if (sessionComplete) {
    return (
      <div className="flex items-center justify-center h-screen p-4 bg-bg">
        <div className="text-center max-w-md w-full animate-fade-in">
          <h1 className="text-2xl font-light text-text mb-4">done.</h1>
          <p className="text-text-secondary mb-8">
            {reviewed === 0 ? 'no cards were due for review.' : `reviewed ${reviewed} card${reviewed !== 1 ? 's' : ''}.`}
          </p>

          {reviewed > 0 && (
            <p className="text-text-muted mb-10 font-mono text-sm">
              again: {ratings.again} &nbsp; hard: {ratings.hard} &nbsp; good: {ratings.good} &nbsp; easy: {ratings.easy}
            </p>
          )}

          <button
            onClick={() => navigate('/flashcards')}
            className="border border-border text-text-secondary hover:text-text hover:border-border rounded-md px-4 py-2 transition-colors text-sm inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            back to flashcards
          </button>
        </div>
      </div>
    )
  }

  const progress = cards.length > 0 ? ((currentIndex) / cards.length) * 100 : 0

  return (
    <div className="flex flex-col h-screen bg-bg">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 flex-shrink-0">
        <button
          onClick={() => navigate('/flashcards')}
          className="text-text-muted hover:text-text-secondary transition-colors duration-200 p-1"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="h-1 rounded-full overflow-hidden bg-bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-500 bg-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <button
          onClick={() => {
            setInterleaved(v => !v)
            setCards(prev => interleaved ? [...prev].sort((a, b) => new Date(a.next_review) - new Date(b.next_review)) : shuffleArray(prev))
          }}
          className={`p-1.5 rounded-md transition-colors ${interleaved ? 'text-[#c4a759]' : 'text-text-muted hover:text-text-secondary'}`}
          title={interleaved ? 'interleaved (shuffled)' : 'sequential (by due date)'}
        >
          <Shuffle size={14} />
        </button>
        <span className="text-xs text-text-muted whitespace-nowrap font-mono">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div
          className="w-full max-w-xl cursor-pointer"
          style={{ perspective: '1000px' }}
          onClick={handleFlip}
        >
          <div
            className="relative w-full transition-transform duration-700"
            style={{
              transformStyle: 'preserve-3d',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              minHeight: '320px',
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 bg-bg-secondary border border-border rounded-lg p-10 flex flex-col items-center justify-center"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div className="text-xs text-text-muted uppercase tracking-widest mb-6 font-mono">question</div>
              <p className="text-lg text-text text-center font-light leading-relaxed">
                {currentCard?.front}
              </p>
              <div className="mt-10 text-xs text-text-muted">
                press space to reveal
              </div>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 bg-bg-secondary border border-border rounded-lg p-10 flex flex-col items-center justify-center overflow-y-auto"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <div className="text-xs text-text-muted uppercase tracking-widest mb-6 font-mono">answer</div>
              <div className="text-text text-center w-full">
                <MarkdownRenderer content={currentCard?.back || ''} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rating buttons */}
      {flipped && (
        <div className="flex items-center justify-center gap-3 p-6 flex-shrink-0 animate-fade-in">
          <button
            onClick={() => handleRate(0)}
            className="flex flex-col items-center gap-1 border border-border rounded-md px-6 py-3 text-sm transition-colors hover:border-border hover:text-text text-text-secondary min-w-[80px] focus:outline-none focus-visible:ring-1 focus-visible:ring-border"
          >
            <span className="text-sm">again</span>
            <span className="text-xs text-text-muted font-mono">1</span>
          </button>
          <button
            onClick={() => handleRate(2)}
            className="flex flex-col items-center gap-1 border border-border rounded-md px-6 py-3 text-sm transition-colors hover:border-border hover:text-text text-text-secondary min-w-[80px] focus:outline-none focus-visible:ring-1 focus-visible:ring-border"
          >
            <span className="text-sm">hard</span>
            <span className="text-xs text-text-muted font-mono">2</span>
          </button>
          <button
            onClick={() => handleRate(4)}
            className="flex flex-col items-center gap-1 border border-border rounded-md px-6 py-3 text-sm transition-colors hover:border-border hover:text-text text-text-secondary min-w-[80px] focus:outline-none focus-visible:ring-1 focus-visible:ring-border"
          >
            <span className="text-sm">good</span>
            <span className="text-xs text-text-muted font-mono">3</span>
          </button>
          <button
            onClick={() => handleRate(5)}
            className="flex flex-col items-center gap-1 border border-border rounded-md px-6 py-3 text-sm transition-colors hover:border-border hover:text-text text-text-secondary min-w-[80px] focus:outline-none focus-visible:ring-1 focus-visible:ring-border"
          >
            <span className="text-sm">easy</span>
            <span className="text-xs text-text-muted font-mono">4</span>
          </button>
        </div>
      )}
    </div>
  )
}
