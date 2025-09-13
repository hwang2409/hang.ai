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
  folder?: number | null;
  created_at: string;
  updated_at: string;
}

interface FlashcardListProps {
  flashcards: Flashcard[];
  onEdit: (flashcard: Flashcard) => void;
  onDelete: (id: number) => void;
  onStudy: (flashcards: Flashcard[]) => void;
}

export default function FlashcardList({ flashcards, onEdit, onDelete, onStudy }: FlashcardListProps) {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const toggleExpanded = (id: number) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '#10b981';
      case 'medium': return '#f59e0b';
      case 'hard': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getReviewStatus = (card: Flashcard) => {
    if (card.is_due_for_review) {
      return { text: 'Due now', color: '#ef4444' };
    } else if (card.days_until_review === 0) {
      return { text: 'Due today', color: '#f59e0b' };
    } else if (card.days_until_review <= 3) {
      return { text: `Due in ${card.days_until_review} days`, color: '#f59e0b' };
    } else {
      return { text: `Due in ${card.days_until_review} days`, color: '#10b981' };
    }
  };

  const dueCards = flashcards.filter(card => card.is_due_for_review);
  const newCards = flashcards.filter(card => card.repetitions === 0);

  if (flashcards.length === 0) {
    return (
      <div className="flashcards-empty">
        <div className="empty-icon">🎴</div>
        <h3>No flashcards yet</h3>
        <p>Create your first flashcard to get started with studying!</p>
      </div>
    );
  }

  return (
    <div className="flashcard-list">
      {/* Study Actions */}
      <div className="study-actions">
        {dueCards.length > 0 && (
          <button 
            className="study-btn study-due"
            onClick={() => onStudy(dueCards)}
          >
            📚 Study Due Cards ({dueCards.length})
          </button>
        )}
        {newCards.length > 0 && (
          <button 
            className="study-btn study-new"
            onClick={() => onStudy(newCards)}
          >
            🆕 Study New Cards ({newCards.length})
          </button>
        )}
        <button 
          className="study-btn study-all"
          onClick={() => onStudy(flashcards)}
        >
          📖 Study All Cards ({flashcards.length})
        </button>
      </div>

      {/* Flashcard Grid */}
      <div className="flashcard-grid">
        {flashcards.map(card => {
          const isExpanded = expandedCards.has(card.id);
          const reviewStatus = getReviewStatus(card);
          
          return (
            <div key={card.id} className="flashcard-item">
              <div className="flashcard-header">
                <div className="flashcard-meta">
                  <span 
                    className="difficulty-badge"
                    style={{ backgroundColor: getDifficultyColor(card.difficulty) }}
                  >
                    {card.difficulty}
                  </span>
                  <span 
                    className="review-status"
                    style={{ color: reviewStatus.color }}
                  >
                    {reviewStatus.text}
                  </span>
                </div>
                <div className="flashcard-actions">
                  <button 
                    className="action-btn edit-btn"
                    onClick={() => onEdit(card)}
                    title="Edit flashcard"
                  >
                    ✏️
                  </button>
                  <button 
                    className="action-btn delete-btn"
                    onClick={() => onDelete(card.id)}
                    title="Delete flashcard"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="flashcard-content">
                <div className="card-side">
                  <h4>Front</h4>
                  <div>
                    <LaTeXRenderer content={card.front} />
                  </div>
                </div>
                
                <button 
                  className="expand-btn"
                  onClick={() => toggleExpanded(card.id)}
                >
                  {isExpanded ? '▼' : '▶'} {isExpanded ? 'Hide' : 'Show'} Answer
                </button>
                
                {isExpanded && (
                  <div className="card-side">
                    <h4>Back</h4>
                    <div>
                      <LaTeXRenderer content={card.back} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flashcard-footer">
                <div className="card-stats">
                  <span>Repetitions: {card.repetitions}</span>
                  <span>Interval: {card.interval_days} days</span>
                  <span>Ease: {card.ease_factor.toFixed(1)}</span>
                </div>
                
                {card.tags.length > 0 && (
                  <div className="card-tags">
                    {card.tags.map(tag => (
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
                
                {card.folder && (
                  <div className="card-folder">
                    📁 Folder {card.folder}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
