'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface SinglePanelEditorProps {
  value: string;
  onChange: (value: string) => void;
  onAutoSave?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SinglePanelEditor({ value, onChange, onAutoSave, placeholder, className = '' }: SinglePanelEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update editValue when value prop changes
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  // Auto-save function with debouncing
  const debouncedAutoSave = useCallback((newValue: string) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      if (onAutoSave && newValue !== value) {
        setIsSaving(true);
        try {
          await onAutoSave(newValue);
        } catch (error) {
          console.error('Auto-save failed:', error);
        } finally {
          setIsSaving(false);
        }
      }
    }, 1000); // Save after 1 second of inactivity
  }, [onAutoSave, value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

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

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setEditValue(newValue);
    onChange(newValue);
    debouncedAutoSave(newValue);
  };

  return (
    <div className={`single-panel-editor ${className}`} ref={containerRef}>
      {isEditing ? (
        <div className="editor-mode">
          <div className="editor-toolbar">
            <span className="editor-hint">
              {isSaving ? 'Saving...' : 'Auto-saves as you type • Press Esc to cancel'}
            </span>
            <div className="editor-actions">
              <button 
                className="editor-cancel-btn"
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
            className="editor-textarea"
            placeholder={placeholder}
            rows={20}
          />
        </div>
      ) : (
        <div 
          className="preview-mode"
          onClick={handleEdit}
        >
          {value.trim() ? (
            <MarkdownRenderer content={value} />
          ) : (
            <div className="editor-placeholder">
              {placeholder || 'Click to start writing...'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
