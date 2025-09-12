'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface NotionStyleEditorProps {
  value: string;
  onChange: (value: string) => void;
  onAutoSave?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function NotionStyleEditor({ value, onChange, onAutoSave, placeholder, className = '' }: NotionStyleEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
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
    }, 1000);
  }, [onAutoSave, value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Sync scroll between textarea and preview
  const handleScroll = useCallback(() => {
    if (textareaRef.current && previewRef.current) {
      previewRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(value);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
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

  // Parse markdown and render inline elements
  const renderInlineMarkdown = (text: string) => {
    // Split by lines to handle block elements
    const lines = text.split('\n');
    const renderedLines = lines.map((line, lineIndex) => {
      // Handle headers
      if (line.match(/^#{1,6}\s/)) {
        const level = line.match(/^(#{1,6})/)?.[1].length || 1;
        const content = line.replace(/^#{1,6}\s/, '');
        return (
          <div key={lineIndex} className={`inline-h${level}`}>
            {content}
          </div>
        );
      }
      
      // Handle images
      if (line.match(/!\[.*?\]\(.*?\)/)) {
        const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
        if (imageMatch) {
          const [, alt, src] = imageMatch;
          return (
            <div key={lineIndex} className="inline-image-container">
              <img src={src} alt={alt} className="inline-image" />
            </div>
          );
        }
      }
      
      // Handle code blocks
      if (line.startsWith('```')) {
        return (
          <div key={lineIndex} className="inline-code-block">
            <code>{line.replace(/^```/, '')}</code>
          </div>
        );
      }
      
      // Handle regular text with inline formatting
      let processedLine = line;
      const elements = [];
      let key = 0;
      
      // Process bold text
      processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, (match, content) => {
        elements.push(<strong key={key++}>{content}</strong>);
        return `__BOLD_${elements.length - 1}__`;
      });
      
      // Process italic text
      processedLine = processedLine.replace(/\*(.*?)\*/g, (match, content) => {
        elements.push(<em key={key++}>{content}</em>);
        return `__ITALIC_${elements.length - 1}__`;
      });
      
      // Process inline code
      processedLine = processedLine.replace(/`(.*?)`/g, (match, content) => {
        elements.push(<code key={key++} className="inline-code">{content}</code>);
        return `__CODE_${elements.length - 1}__`;
      });
      
      // Process links
      processedLine = processedLine.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
        elements.push(
          <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="inline-link">
            {text}
          </a>
        );
        return `__LINK_${elements.length - 1}__`;
      });
      
      // Split by placeholders and reconstruct
      const parts = processedLine.split(/(__(?:BOLD|ITALIC|CODE|LINK)_\d+__)/);
      const finalElements = parts.map((part, partIndex) => {
        const match = part.match(/^__(BOLD|ITALIC|CODE|LINK)_(\d+)__$/);
        if (match) {
          const [, type, index] = match;
          return elements[parseInt(index)];
        }
        return part;
      });
      
      return (
        <div key={lineIndex} className="inline-text">
          {finalElements}
        </div>
      );
    });
    
    return renderedLines;
  };

  return (
    <div className={`notion-style-editor ${className}`} ref={containerRef}>
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
          <div className="editor-content">
            <div className="editor-wrapper">
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                className="editor-textarea"
                placeholder={placeholder}
                rows={20}
                spellCheck={false}
              />
              <div 
                ref={previewRef}
                className="inline-preview"
              >
                {renderInlineMarkdown(editValue)}
              </div>
            </div>
          </div>
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
