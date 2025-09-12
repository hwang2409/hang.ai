'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MarkdownRenderer from '../../../components/MarkdownRenderer';
import { useAuth } from '../../../contexts/AuthContext';
import { getAuthHeaders } from '../../../contexts/AuthContext';
import ContentEditableEditor from '../../../components/ContentEditableEditor';
import CMMarkdownEditor from '../../../components/CMMarkdownEditor';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface Note {
  id: number;
  unique_id: string;
  title: string;
  content: string;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

// API functions
const API_BASE_URL = 'http://localhost:8000/api';

const fetchNote = async (id: string, token: string | null): Promise<Note> => {
  const response = await fetch(`${API_BASE_URL}/documents/${id}/`, {
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch note');
  }
  return response.json();
};

const updateNote = async (uniqueId: string, note: { title?: string; content?: string; tag_ids?: number[] }, token: string | null): Promise<Note> => {
  const response = await fetch(`${API_BASE_URL}/documents/${uniqueId}/`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(token),
      'Accept': 'application/json',
    },
    body: JSON.stringify(note),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to update note: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
  }
  return response.json();
};

const fetchTags = async (token: string | null): Promise<Tag[]> => {
  const response = await fetch(`${API_BASE_URL}/tags/`, {
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch tags');
  }
  return response.json();
};

const createTag = async (name: string, color: string = '#3b82f6', token: string | null): Promise<Tag> => {
  const response = await fetch(`${API_BASE_URL}/tags/`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ name, color }),
  });
  if (!response.ok) {
    throw new Error('Failed to create tag');
  }
  return response.json();
};

const deleteNote = async (uniqueId: string, token: string | null): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/documents/${uniqueId}/`, {
    method: 'DELETE',
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error('Failed to delete note');
  }
};

// Helper function to format date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) return 'Just now';
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
};

const getTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};



export default function NoteDetail() {
  const params = useParams();
  const router = useRouter();
  const noteUniqueId = params.id as string;
  const { token, isAuthenticated, loading: authLoading } = useAuth();

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '' });
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  // Extract image URLs from note content
  const extractImageUrls = (content: string): string[] => {
    const imageRegex = /!\[.*?\]\((.*?)\)/g;
    const urls: string[] = [];
    let match;
    while ((match = imageRegex.exec(content)) !== null) {
      urls.push(match[1]);
    }
    return [...new Set(urls)]; // Remove duplicates
  };

  const imageUrls = note ? extractImageUrls(note.content) : [];

  // PDF Export function
  const handleExportPDF = async () => {
    if (!note) return;
    
    try {
      // Create a temporary container for the PDF content
      const pdfContainer = document.createElement('div');
      pdfContainer.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        width: 800px;
        background: white;
        color: black;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 40px;
        line-height: 1.6;
      `;
      
      // Add KaTeX CSS for LaTeX rendering
      const katexCSS = document.createElement('link');
      katexCSS.rel = 'stylesheet';
      katexCSS.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css';
      document.head.appendChild(katexCSS);
      
      // Wait for CSS to load
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Add title
      const titleElement = document.createElement('h1');
      titleElement.textContent = note.title;
      titleElement.style.cssText = `
        font-size: 24px;
        font-weight: bold;
        margin-bottom: 20px;
        color: #333;
        border-bottom: 2px solid #333;
        padding-bottom: 10px;
      `;
      pdfContainer.appendChild(titleElement);
      
      // Add metadata
      const metaElement = document.createElement('div');
      metaElement.style.cssText = `
        font-size: 12px;
        color: #666;
        margin-bottom: 30px;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 4px;
      `;
      metaElement.innerHTML = `
        <strong>Created:</strong> ${new Date(note.created_at).toLocaleDateString()} at ${new Date(note.created_at).toLocaleTimeString()}<br>
        <strong>Last Updated:</strong> ${new Date(note.updated_at).toLocaleDateString()} at ${new Date(note.updated_at).toLocaleTimeString()}
        ${note.tags.length > 0 ? `<br><strong>Tags:</strong> ${note.tags.map(tag => tag.name).join(', ')}` : ''}
      `;
      pdfContainer.appendChild(metaElement);
      
      // Add content (convert markdown to HTML for better PDF rendering)
      const contentElement = document.createElement('div');
      contentElement.style.cssText = `
        font-size: 14px;
        line-height: 1.6;
        color: #333;
      `;
      
      // Enhanced markdown to HTML conversion for PDF with LaTeX and image positioning
      let htmlContent = note.content;
      
      // Handle LaTeX rendering first ($$...$$ and $...$)
      // Import katex directly since it's already installed
      const katex = await import('katex');
      
      htmlContent = htmlContent.replace(/\$\$(.*?)\$\$/g, (match, latex) => {
        try {
          return katex.renderToString(latex, { displayMode: true, throwOnError: false });
        } catch (e) {
          return `<div style="text-align: center; font-style: italic; color: #666; padding: 10px; border: 1px solid #ddd; background: #f9f9f9;">$$${latex}$$</div>`;
        }
      });
      
      htmlContent = htmlContent.replace(/\$(.*?)\$/g, (match, latex) => {
        try {
          return katex.renderToString(latex, { displayMode: false, throwOnError: false });
        } catch (e) {
          return `<span style="font-style: italic; color: #666; background: #f9f9f9; padding: 2px 4px; border-radius: 3px;">$${latex}$</span>`;
        }
      });
      
      // Handle images with positioning data - need to process each image individually
      console.log('Original content for PDF:', note.content);
      
      // First, let's find all images with their positioning data
      const imageRegex = /!\[(.*?)\]\((.*?)\)(?:<!--(pos|inline|size):(.*?)-->)*/g;
      const imageMatches = [];
      let match;
      
      while ((match = imageRegex.exec(note.content)) !== null) {
        imageMatches.push(match);
      }
      
      console.log('Found images:', imageMatches);
      
      for (const match of imageMatches) {
        const [fullMatch, alt, src, posType, posData] = match;
        console.log('Processing image:', { fullMatch, alt, src, posType, posData });
        
        let imageStyle = 'max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px;';
        let containerStyle = 'margin: 10px 0; text-align: center;'; // Default to center
        
        // Parse positioning data if present
        if (posData) {
          try {
            const data = JSON.parse(posData);
            console.log('Parsed positioning data:', data);
            
            if (posType === 'pos' && data.alignment) {
              if (data.alignment === 'left') {
                containerStyle = 'margin: 10px 0; text-align: left;';
              } else if (data.alignment === 'right') {
                containerStyle = 'margin: 10px 0; text-align: right;';
              } else if (data.alignment === 'center') {
                containerStyle = 'margin: 10px 0; text-align: center;';
              }
            } else if (posType === 'inline') {
              containerStyle = 'margin: 5px 8px; display: inline-block; vertical-align: middle;';
              imageStyle += ' max-width: 200px;';
            } else if (posType === 'size' && data.width && data.height) {
              imageStyle += ` width: ${data.width}px; height: ${data.height}px;`;
            }
          } catch (e) {
            console.log('Failed to parse positioning data:', posData, e);
            // Keep default center alignment
          }
        }
        
        const fullSrc = src.startsWith('http') ? src : `http://localhost:8000${src}`;
        const replacement = `<div style="${containerStyle}"><img src="${fullSrc}" alt="${alt}" style="${imageStyle}" /></div>`;
        console.log('Replacing with:', replacement);
        htmlContent = htmlContent.replace(fullMatch, replacement);
      }
      
      // Handle other markdown elements
      htmlContent = htmlContent
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
        .replace(/^- \[ \] (.*$)/gim, '<div style="margin: 5px 0;">☐ $1</div>')
        .replace(/^- \[x\] (.*$)/gim, '<div style="margin: 5px 0;">☑ $1</div>')
        .replace(/\n/g, '<br>');
      
      contentElement.innerHTML = htmlContent;
      pdfContainer.appendChild(contentElement);
      
      // Add to DOM temporarily
      document.body.appendChild(pdfContainer);
      
      // Generate PDF
      const canvas = await html2canvas(pdfContainer, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Clean up
      document.body.removeChild(pdfContainer);
      if (document.head.contains(katexCSS)) {
        document.head.removeChild(katexCSS);
      }
      
      // Download PDF
      const fileName = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      pdf.save(fileName);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  // Load note and tags on component mount
  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated || !token || !noteUniqueId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [fetchedNote, fetchedTags] = await Promise.all([
          fetchNote(noteUniqueId, token),
          fetchTags(token)
        ]);
        setNote(fetchedNote);
        setEditForm({ title: fetchedNote.title, content: fetchedNote.content });
        setAllTags(fetchedTags);
        setError(null);
      } catch (err) {
        setError('Failed to load note. Please check if the note exists.');
        console.error('Error loading note:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [noteUniqueId, isAuthenticated, token]);

  // Handle auto-save
  const handleAutoSave = async (content: string) => {
    if (!note || !token) return;
    
    try {
      const updatedNote = await updateNote(noteUniqueId, {
        title: editForm.title.trim(),
        content: content.trim()
      }, token);
      
      setNote(updatedNote);
      setError(null);
    } catch (err) {
      setError('Failed to auto-save note. Please try again.');
      console.error('Error auto-saving note:', err);
    }
  };

  // Save title when pressing Enter in the title input
  const handleTitleSave = async () => {
    if (!note || !token) return;
    try {
      const updated = await updateNote(noteUniqueId, { title: editForm.title.trim() }, token);
      setNote(updated);
      setError(null);
    } catch (err) {
      console.error('Error saving title:', err);
      setError('Failed to save title. Please try again.');
    }
  };

  // Handle back navigation with forced save of both title and content
  const handleBack = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!note || !token) {
      router.push('/');
      return;
    }
    try {
      const updated = await updateNote(noteUniqueId, {
        title: editForm.title.trim(),
        content: editForm.content.trim(),
      }, token);
      setNote(updated);
      setError(null);
      router.push('/');
    } catch (err) {
      console.error('Error saving before leaving:', err);
      setError('Failed to save changes before leaving. Fix and try again.');
    }
  };

  // Handle adding a tag to the note
  const handleAddTag = async (tagId: number) => {
    if (!note || !token) return;
    try {
      const currentTagIds = note.tags.map(tag => tag.id);
      const updated = await updateNote(noteUniqueId, {
        tag_ids: [...currentTagIds, tagId]
      }, token);
      setNote(updated);
      setError(null);
    } catch (err) {
      console.error('Error adding tag:', err);
      setError('Failed to add tag. Please try again.');
    }
  };

  // Handle removing a tag from the note
  const handleRemoveTag = async (tagId: number) => {
    if (!note || !token) return;
    try {
      const currentTagIds = note.tags.map(tag => tag.id);
      const updated = await updateNote(noteUniqueId, {
        tag_ids: currentTagIds.filter(id => id !== tagId)
      }, token);
      setNote(updated);
      setError(null);
    } catch (err) {
      console.error('Error removing tag:', err);
      setError('Failed to remove tag. Please try again.');
    }
  };

  // Handle creating a new tag
  const handleCreateTag = async () => {
    if (!newTagName.trim() || !token) return;
    try {
      const newTag = await createTag(newTagName.trim(), '#3b82f6', token);
      setAllTags(prev => [...prev, newTag]);
      await handleAddTag(newTag.id);
      setNewTagName('');
      setShowTagInput(false);
      setError(null);
    } catch (err) {
      console.error('Error creating tag:', err);
      setError('Failed to create tag. Please try again.');
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!note || !token) return;
    
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await deleteNote(noteUniqueId, token);
        router.push('/');
      } catch (err) {
        setError('Failed to delete note. Please try again.');
        console.error('Error deleting note:', err);
      }
    }
  };


  if (authLoading) {
    return (
      <div className="note-detail-container">
        <div className="loading-message">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="note-detail-container">
        <div className="loading-message">Redirecting to login...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="note-detail-container">
        <div className="loading-message">Loading note...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="note-detail-container">
        <div className="error-message">{error}</div>
        <Link href="/" className="back-link">← Back to Notes</Link>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="note-detail-container">
        <div className="error-message">Note not found</div>
        <Link href="/" className="back-link">← Back to Notes</Link>
      </div>
    );
  }

  return (
    <div className="note-detail-container">
      <div className="note-detail-header">
        <Link href="/" className="back-link" onClick={handleBack}>← Back to Notes</Link>
        
        <div className="note-actions">
          <button 
            className="delete-btn"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="note-detail-content">
        <div className="edit-form">
          <input
            type="text"
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                await handleTitleSave();
              }
            }}
            onBlur={async () => {
              // Save title when clicking away from the input
              await handleTitleSave();
            }}
            className="edit-title-input"
            placeholder="Note title..."
          />

          {/* Tags Section */}
          <div className="tags-section">
            {/* Current Tags */}
            <div className="current-tags">
              {note.tags.map(tag => (
                <span 
                  key={tag.id} 
                  className="tag"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                  <button 
                    className="tag-remove"
                    onClick={() => handleRemoveTag(tag.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button 
                className="add-tag-btn-small"
                onClick={() => setShowTagInput(!showTagInput)}
              >
                +
              </button>
            </div>

            {/* Add Tag Input */}
            {showTagInput && (
              <div className="add-tag-form">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateTag();
                    } else if (e.key === 'Escape') {
                      setShowTagInput(false);
                      setNewTagName('');
                    }
                  }}
                  placeholder="Tag name..."
                  className="tag-input"
                  autoFocus
                />
                <button 
                  className="create-tag-btn"
                  onClick={handleCreateTag}
                >
                  Create
                </button>
                <button 
                  className="cancel-tag-btn"
                  onClick={() => {
                    setShowTagInput(false);
                    setNewTagName('');
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Available Tags */}
            {allTags.filter(tag => !note.tags.some(noteTag => noteTag.id === tag.id)).length > 0 && (
              <div className="available-tags">
                <div className="available-tags-header">
                  <span className="available-tags-label">Suggested tags:</span>
                  <span className="available-tags-hint">Based on other notes</span>
                </div>
                <div className="tag-list">
                  {allTags
                    .filter(tag => !note.tags.some(noteTag => noteTag.id === tag.id))
                    .map(tag => (
                      <button
                        key={tag.id}
                        className="available-tag suggested-tag"
                        style={{ backgroundColor: tag.color }}
                        onClick={() => handleAddTag(tag.id)}
                        title="Click to add this tag"
                      >
                        {tag.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

            <CMMarkdownEditor
              value={editForm.content}
              onChange={(content) => setEditForm({ ...editForm, content })}
              onAutoSave={handleAutoSave}
              className="cm-editor"
              token={token}
              placeholder="Write your note here..."
            />

            {/* Attachments Section */}
            {imageUrls.length > 0 && (
              <div className="attachments-section">
                <h3 className="attachments-header">attachments</h3>
                <div className="attachments-grid">
                  {imageUrls.map((url, index) => (
                    <a
                      key={index}
                      href={url.startsWith('http') ? url : `http://localhost:8000${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="attachment-item"
                    >
                      <div className="attachment-preview">
                        <img 
                          src={url.startsWith('http') ? url : `http://localhost:8000${url}`} 
                          alt={`Attachment ${index + 1}`}
                          className="attachment-thumbnail"
                          onError={(e) => {
                            // Fallback for broken images
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                        <div className="attachment-fallback hidden">
                          <div className="attachment-icon">📎</div>
                          <span className="attachment-filename">
                            {url.split('/').pop()?.split('?')[0] || 'attachment'}
                          </span>
                        </div>
                      </div>
                      <div className="attachment-info">
                        <span className="attachment-url">
                          {url.replace(/^https?:\/\/[^\/]+/, '')}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
