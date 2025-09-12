'use client';

import { useState, useRef, useEffect } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface WysiwygEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function WysiwygEditor({ value, onChange, placeholder, className = '' }: WysiwygEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update editValue when value prop changes
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(value);
    // Focus the textarea after a brief delay to ensure it's rendered
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        // Move cursor to end
        const length = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }, 0);
  };

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditValue(e.target.value);
  };

  return (
    <div className={`wysiwyg-editor ${className}`} ref={containerRef}>
      {isEditing ? (
        <div className="wysiwyg-edit-mode">
          <div className="wysiwyg-toolbar">
            <span className="wysiwyg-hint">Press Ctrl+Enter to save, Esc to cancel</span>
            <div className="wysiwyg-actions">
              <button 
                className="wysiwyg-save-btn"
                onClick={handleSave}
              >
                Save
              </button>
              <button 
                className="wysiwyg-cancel-btn"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            className="wysiwyg-textarea"
            placeholder={placeholder}
            rows={20}
          />
        </div>
      ) : (
        <div 
          className="wysiwyg-preview-mode"
          onClick={handleEdit}
        >
          {value.trim() ? (
            <MarkdownRenderer content={value} />
          ) : (
            <div className="wysiwyg-placeholder">
              {placeholder || 'Click to start writing...'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
