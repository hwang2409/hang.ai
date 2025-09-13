'use client';

import React, { useState } from 'react';

interface FlashcardFormProps {
  onSubmit: (flashcard: { front: string; back: string; difficulty: string; folder?: number | null; tag_ids?: number[] }) => Promise<void>;
  onCancel: () => void;
  initialData?: {
    front: string;
    back: string;
    difficulty: string;
    folder?: number | null;
    tag_ids?: number[];
  };
  folders: Array<{ id: number; name: string; parent_folder?: number | null }>;
  tags: Array<{ id: number; name: string; color: string }>;
  activeFolder?: number | null;
}

export default function FlashcardForm({ 
  onSubmit, 
  onCancel, 
  initialData, 
  folders, 
  tags, 
  activeFolder 
}: FlashcardFormProps) {
  const [formData, setFormData] = useState({
    front: initialData?.front || '',
    back: initialData?.back || '',
    difficulty: initialData?.difficulty || 'medium',
    folder: initialData?.folder ?? activeFolder ?? null,
    tag_ids: initialData?.tag_ids || []
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.front.trim() || !formData.back.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTagToggle = (tagId: number) => {
    setFormData(prev => ({
      ...prev,
      tag_ids: prev.tag_ids.includes(tagId)
        ? prev.tag_ids.filter(id => id !== tagId)
        : [...prev.tag_ids, tagId]
    }));
  };

  const isEditing = !!initialData;

  return (
    <div className="flashcard-form">
      <div className="form-overlay" onClick={onCancel}></div>
      <div className="form-content">
        <h2>{isEditing ? 'Edit Flashcard' : 'Create New Flashcard'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="front">Question</label>
            <textarea
              id="front"
              value={formData.front}
              onChange={(e) => setFormData(prev => ({ ...prev, front: e.target.value }))}
              className="form-textarea"
              placeholder="Question or prompt..."
              rows={3}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="back">Answer</label>
            <textarea
              id="back"
              value={formData.back}
              onChange={(e) => setFormData(prev => ({ ...prev, back: e.target.value }))}
              className="form-textarea"
              placeholder="Answer or explanation..."
              rows={3}
              required
            />
          </div>

          {isEditing && (
            <>
              <div className="form-group">
                <label htmlFor="difficulty">Difficulty Level</label>
                <select
                  id="difficulty"
                  value={formData.difficulty}
                  onChange={(e) => setFormData(prev => ({ ...prev, difficulty: e.target.value }))}
                  className="form-select"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="folder">Folder</label>
                <select
                  id="folder"
                  value={formData.folder || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, folder: e.target.value ? parseInt(e.target.value) : null }))}
                  className="form-select"
                >
                  <option value="">No folder</option>
                  {folders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              {tags.length > 0 && (
                <div className="form-group">
                  <label>Tags</label>
                  <div className="tag-selection">
                    {tags.map(tag => (
                      <button
                        key={tag.id}
                        type="button"
                        className={`tag-option ${formData.tag_ids.includes(tag.id) ? 'selected' : ''}`}
                        style={{ 
                          backgroundColor: formData.tag_ids.includes(tag.id) ? tag.color : 'transparent',
                          borderColor: tag.color,
                          color: formData.tag_ids.includes(tag.id) ? 'white' : tag.color
                        }}
                        onClick={() => handleTagToggle(tag.id)}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="form-actions">
            <button 
              type="button" 
              onClick={onCancel} 
              className="cancel-btn"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="save-btn"
              disabled={isSubmitting || !formData.front.trim() || !formData.back.trim()}
            >
              {isSubmitting ? 'Saving...' : (isEditing ? 'Update Flashcard' : 'Create Flashcard')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
