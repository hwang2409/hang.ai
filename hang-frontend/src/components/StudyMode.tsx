'use client';

import React, { useState, useEffect } from 'react';
import LaTeXRenderer from '../utils/latexRenderer';

interface Flashcard {
  id: number;
  front: string;
  back: string;
  difficulty: string;
  interval_days: number;
  repetitions: number;
  ease_factor: number;
  next_review: string;
  is_due_for_review: boolean;
  days_until_review: number;
  tags: Array<{ id: number; name: string; color: string }>;
  created_at: string;
  updated_at: string;
}

interface StudyModeProps {
  flashcards: Flashcard[];
  onReview: (cardId: number, qualityRating: number) => Promise<void>;
  onClose: () => void;
}

export default function StudyMode({ flashcards, onReview, onClose }: StudyModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [completedCards, setCompletedCards] = useState<number[]>([]);
  const [userAnswer, setUserAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);

  const currentCard = flashcards[currentIndex];
  const progress = ((currentIndex + 1) / flashcards.length) * 100;

  useEffect(() => {
    setIsFlipped(false);
    setShowRating(false);
    setUserAnswer('');
    setShowAnswer(false);
  }, [currentIndex]);

  const handleShowAnswer = () => {
    setShowAnswer(true);
    setShowRating(true);
  };

  const handleRating = async (rating: number) => {
    if (!currentCard) return;
    
    try {
      await onReview(currentCard.id, rating);
      setCompletedCards(prev => [...prev, currentCard.id]);
      
      if (currentIndex < flashcards.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        // Study session complete
        onClose();
      }
    } catch (error) {
      console.error('Error recording review:', error);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '#10b981';
      case 'medium': return '#f59e0b';
      case 'hard': return '#ef4444';
      default: return '#6b7280';
    }
  };

  if (!currentCard) {
    return (
      <div className="study-mode">
        <div className="study-overlay" onClick={onClose}></div>
        <div className="study-content">
          <div className="study-complete">
            <h2>🎉 Study Session Complete!</h2>
            <p>You've reviewed all {flashcards.length} flashcards.</p>
            <button onClick={onClose} className="save-btn">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="study-mode">
      <div className="study-overlay" onClick={onClose}></div>
      <div className="study-content">
        <div className="study-header">
          <div className="study-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <span className="progress-text">
              {currentIndex + 1} of {flashcards.length}
            </span>
          </div>
          <button onClick={onClose} className="study-close-btn">×</button>
        </div>

        <div className="flashcard-container">
          <div className="flashcard">
            <div className="card-header">
              <span 
                className="difficulty-badge"
                style={{ backgroundColor: getDifficultyColor(currentCard.difficulty) }}
              >
                {currentCard.difficulty}
              </span>
              {currentCard.tags.length > 0 && (
                <div className="card-tags">
                  {currentCard.tags.map(tag => (
                    <span 
                      key={tag.id} 
                      className="card-tag"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            <div className="card-content">
              <h3>Question</h3>
              <div className="question-text">
                <LaTeXRenderer content={currentCard.front} />
              </div>
              
              {!showAnswer ? (
                <div className="answer-input-section">
                  <label htmlFor="user-answer">Your Answer:</label>
                  <textarea
                    id="user-answer"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    className="answer-textarea"
                    rows={4}
                  />
                  <button 
                    onClick={handleShowAnswer}
                    className="show-answer-btn"
                    disabled={!userAnswer.trim()}
                  >
                    Show Answer
                  </button>
                </div>
              ) : (
                <div className="answer-comparison">
                  <div className="user-answer-section">
                    <h4>Your Answer:</h4>
                    <div className="user-answer-text">
                      <LaTeXRenderer content={userAnswer} />
                    </div>
                  </div>
                  <div className="correct-answer-section">
                    <h4>Correct Answer:</h4>
                    <div className="correct-answer-text">
                      <LaTeXRenderer content={currentCard.back} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {showRating && (
          <div className="rating-section">
            <h4>How well did you know this card?</h4>
            <div className="rating-buttons">
              <button 
                className="rating-btn rating-0"
                onClick={() => handleRating(0)}
                title="Complete blackout"
              >
                <span className="rating-number">0</span>
                <span className="rating-label">Blackout</span>
              </button>
              <button 
                className="rating-btn rating-1"
                onClick={() => handleRating(1)}
                title="Incorrect response; correct one remembered"
              >
                <span className="rating-number">1</span>
                <span className="rating-label">Wrong</span>
              </button>
              <button 
                className="rating-btn rating-2"
                onClick={() => handleRating(2)}
                title="Incorrect response; correct one remembered"
              >
                <span className="rating-number">2</span>
                <span className="rating-label">Hard</span>
              </button>
              <button 
                className="rating-btn rating-3"
                onClick={() => handleRating(3)}
                title="Correct response with hesitation"
              >
                <span className="rating-number">3</span>
                <span className="rating-label">Good</span>
              </button>
              <button 
                className="rating-btn rating-4"
                onClick={() => handleRating(4)}
                title="Correct response with hesitation"
              >
                <span className="rating-number">4</span>
                <span className="rating-label">Easy</span>
              </button>
              <button 
                className="rating-btn rating-5"
                onClick={() => handleRating(5)}
                title="Perfect response"
              >
                <span className="rating-number">5</span>
                <span className="rating-label">Perfect</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
