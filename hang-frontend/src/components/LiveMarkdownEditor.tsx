'use client';

import { useState, useRef, useEffect } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface LiveMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function LiveMarkdownEditor({ value, onChange, placeholder, className = '' }: LiveMarkdownEditorProps) {
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and preview
  const handleScroll = () => {
    if (textareaRef.current && previewRef.current) {
      const textarea = textareaRef.current;
      const preview = previewRef.current;
      
      // Calculate scroll percentage
      const scrollPercent = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
      
      // Apply same scroll percentage to preview
      const previewScrollTop = scrollPercent * (preview.scrollHeight - preview.clientHeight);
      preview.scrollTop = previewScrollTop;
    }
  };

  // Handle textarea changes
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // Handle composition events for better IME support
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(textarea.scrollHeight, 400) + 'px';
    }
  }, [value]);

  return (
    <div className={`live-markdown-editor ${className}`}>
      <div className="editor-container">
        <div className="editor-panel">
          <div className="panel-header">
            <span>Markdown</span>
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onScroll={handleScroll}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            className="markdown-textarea"
            placeholder={placeholder || 'Start writing your markdown...'}
            spellCheck={false}
          />
        </div>
        
        <div className="preview-panel">
          <div className="panel-header">
            <span>Preview</span>
          </div>
          <div 
            ref={previewRef}
            className="markdown-preview"
            onScroll={handleScroll}
          >
            {value.trim() ? (
              <MarkdownRenderer content={value} />
            ) : (
              <div className="preview-placeholder">
                Your rendered markdown will appear here...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
