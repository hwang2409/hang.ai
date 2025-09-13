import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface LaTeXRendererProps {
  content: string;
  displayMode?: boolean;
  className?: string;
}

export const LaTeXRenderer: React.FC<LaTeXRendererProps> = ({ 
  content, 
  displayMode = false, 
  className = '' 
}) => {
  const renderLaTeX = (text: string) => {
    // Split content by LaTeX delimiters
    const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/);
    
    return parts.map((part, index) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        // Display mode LaTeX (block)
        try {
          const latexContent = part.slice(2, -2);
          const html = katex.renderToString(latexContent, {
            displayMode: true,
            throwOnError: false,
            strict: false,
          });
          return (
            <div 
              key={index} 
              className={`katex-display ${className}`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch (error) {
          console.error('LaTeX rendering error:', error);
          return <span key={index} className="latex-error">LaTeX Error: {part}</span>;
        }
      } else if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        // Inline mode LaTeX
        try {
          const latexContent = part.slice(1, -1);
          const html = katex.renderToString(latexContent, {
            displayMode: false,
            throwOnError: false,
            strict: false,
          });
          return (
            <span 
              key={index} 
              className={`katex ${className}`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch (error) {
          console.error('LaTeX rendering error:', error);
          return <span key={index} className="latex-error">LaTeX Error: {part}</span>;
        }
      } else {
        // Regular text
        return <span key={index}>{part}</span>;
      }
    });
  };

  return <>{renderLaTeX(content)}</>;
};

export default LaTeXRenderer;
