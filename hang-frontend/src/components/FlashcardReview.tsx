'use client';

import React, { useState } from 'react';
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

interface FlashcardReviewProps {
  flashcard: Flashcard;
  onClose: () => void;
}

export default function FlashcardReview({ flashcard, onClose }: FlashcardReviewProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);

  const handleShowAnswer = () => {
    setShowAnswer(true);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '#10b981';
      case 'medium': return '#f59e0b';
      case 'hard': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="flashcard-review">
      <div className="review-overlay" onClick={onClose}></div>
      <div className="review-content">
        <div className="review-header">
          <h2>Flashcard Review</h2>
          <button onClick={onClose} className="review-close-btn">×</button>
        </div>

        <div className="flashcard-container">
          <div className="flashcard">
            <div className="card-header">
              <span 
                className="difficulty-badge"
                style={{ backgroundColor: getDifficultyColor(flashcard.difficulty) }}
              >
                {flashcard.difficulty}
              </span>
              {flashcard.tags.length > 0 && (
                <div className="card-tags">
                  {flashcard.tags.map(tag => (
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
                <LaTeXRenderer content={flashcard.front} />
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
                      <LaTeXRenderer content={flashcard.back} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
