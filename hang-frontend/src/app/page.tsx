'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MarkdownRenderer from '../components/MarkdownRenderer';

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
  folder?: number | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

interface Folder {
  id: number;
  name: string;
  parent_folder?: number | null;
  created_at: string;
  updated_at: string;
}

// API functions
const API_BASE_URL = 'http://localhost:8000/api';

const fetchNotes = async (): Promise<Note[]> => {
  const response = await fetch(`${API_BASE_URL}/documents/`);
  if (!response.ok) {
    throw new Error('Failed to fetch notes');
  }
  return response.json();
};

const createFolder = async (payload: { name: string; parent_folder?: number | null }): Promise<Folder> => {
  const response = await fetch(`${API_BASE_URL}/folders/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to create folder');
  return response.json();
};

const createNote = async (note: { title: string; content: string }): Promise<Note> => {
  const response = await fetch(`${API_BASE_URL}/documents/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(note),
  });
  if (!response.ok) {
    throw new Error('Failed to create note');
  }
  return response.json();
};

const deleteNote = async (uniqueId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/documents/${uniqueId}/`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete note');
  }
};

const getDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
};

export default function Home() {
  // Helpers for uniform previews
  const getFirstImage = (md: string): { src: string; alt: string } | null => {
    const match = md.match(/!\[(.*?)\]\((.*?)\)/);
    if (!match) return null;
    const [, alt, src] = match;
    return { alt, src };
  };

  const getFirstLines = (text: string, maxLines: number): string[] => {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const picked: string[] = [];
    for (let i = 0; i < lines.length && picked.length < maxLines; i++) {
      picked.push(lines[i]);
    }
    while (picked.length < maxLines) picked.push('');
    return picked;
  };

  const getFolderPath = (folderId: number): Folder[] => {
    const path: Folder[] = [];
    let currentId: number | null = folderId;
    
    while (currentId !== null) {
      const folder = folders.find(f => f.id === currentId);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parent_folder || null;
    }
    
    return path;
  };

  // State management
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<number | null>(null);
  const [dragOverBreadcrumb, setDragOverBreadcrumb] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '' });
  const [newFolder, setNewFolder] = useState({ name: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load notes from API on component mount
  useEffect(() => {
    const loadNotes = async () => {
      try {
        setLoading(true);
        const [fetchedNotes, fetchedFolders] = await Promise.all([
          fetchNotes(),
          fetch(`${API_BASE_URL}/folders/`).then(r => r.json())
        ]);
        setNotes(fetchedNotes);
        setFolders(fetchedFolders);
        setError(null);
      } catch (err) {
        setError('Failed to load notes. Please check if the Django server is running.');
        console.error('Error loading notes:', err);
      } finally {
        setLoading(false);
      }
    };

    loadNotes();
  }, []);

  // Add note function
  const addNote = async () => {
    if (newNote.title.trim()) {
      try {
        const createdNote = await createNote({
          title: newNote.title.trim(),
          content: ''
        });
        
        setNotes([createdNote, ...notes]); // Add to beginning of array
        setNewNote({ title: '', content: '' }); // Reset form
        setShowAddForm(false); // Close form
        setError(null);
      } catch (err) {
        setError('Failed to create note. Please try again.');
        console.error('Error creating note:', err);
      }
    }
  };

  // Update note folder (drag & drop)
  const moveNoteToFolder = async (noteUniqueId: string, folderId: number | null) => {
    try {
      console.log('moveNoteToFolder called with noteUniqueId:', noteUniqueId);
      // Normalize in case a full URL was dragged (e.g., from a Link)
      let id = noteUniqueId.trim();
      try {
        // If it's a URL, extract the last non-empty segment
        const url = new URL(id);
        const parts = url.pathname.split('/').filter(Boolean);
        id = parts[parts.length - 1] || id;
      } catch (_) {
        // Not a URL; if it contains slashes, take the last segment
        if (id.includes('/')) {
          const parts = id.split('/').filter(Boolean);
          id = parts[parts.length - 1];
        }
      }

      const res = await fetch(`${API_BASE_URL}/documents/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folderId })
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('Move note error', res.status, text);
        throw new Error('Failed to move note');
      }
      const updated: Note = await res.json();
      setNotes(prev => prev.map(n => n.unique_id === updated.unique_id ? updated : n));
    } catch (e) {
      console.error(e);
      setError('Failed to move note to folder.');
    }
  };

  // Delete folder
  const deleteFolder = async (folderId: number) => {
    if (!confirm('Delete this folder? Notes inside will not be deleted.')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/folders/${folderId}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete folder');
      setFolders(prev => prev.filter(f => f.id !== folderId));
      // Notes pointing to this folder will show up as uncategorized after backend SET_NULL
      setNotes(prev => prev.map(n => (n.folder === folderId ? { ...n, folder: null } : n)));
    } catch (e) {
      console.error(e);
      setError('Failed to delete folder.');
    }
  };

  // Delete note function
  const handleDeleteNote = async (uniqueId: string) => {
    try {
      await deleteNote(uniqueId);
      setNotes(notes.filter(note => note.unique_id !== uniqueId));
      setError(null);
    } catch (err) {
      setError('Failed to delete note. Please try again.');
      console.error('Error deleting note:', err);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addNote();
  };

  return (
    <div className="notes-container">
      <header className="notes-header">
        <h1 className="notes-title">hang.ai</h1>
        <p className="notes-subtitle">your thoughts, organized.</p>
      </header>

      <div className="notes-actions-row">
        <button 
          className="add-note-btn"
          onClick={() => setShowChooser(true)}
        >
          + new
        </button>
      </div>

      {activeFolder !== null && (
        <div 
          className={`breadcrumb-container ${dragOverBreadcrumb ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverBreadcrumb(true);
          }}
          onDragLeave={() => setDragOverBreadcrumb(false)}
          onDrop={(e) => {
            setDragOverBreadcrumb(false);
            const raw = e.dataTransfer.getData('application/x-note-id') || e.dataTransfer.getData('text/plain');
            if (!raw) return;
            let noteId = raw.trim();
            try {
              const url = new URL(noteId);
              const parts = url.pathname.split('/').filter(Boolean);
              noteId = parts[parts.length - 1] || noteId;
            } catch (_) {
              if (noteId.includes('/')) {
                const parts = noteId.split('/').filter(Boolean);
                noteId = parts[parts.length - 1];
              }
            }
            if (noteId) moveNoteToFolder(noteId, null);
          }}
        >
          <button className="note-action-btn" onClick={() => setActiveFolder(null)}>← Back</button>
          <span style={{ color: 'var(--text-muted)' }}>
            .{getFolderPath(activeFolder).map(folder => `/${folder.name}`).join('')}
          </span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="loading-message">
          Loading notes...
        </div>
      )}

      {/* New Item Chooser */}
      {showChooser && (
        <div className="add-note-form">
          <div className="form-overlay" onClick={() => setShowChooser(false)}></div>
          <div className="form-content">
            <h2>Create</h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="save-btn" onClick={() => { setShowChooser(false); setShowAddForm(true); }}>Note</button>
              <button className="save-btn" onClick={() => { setShowChooser(false); setShowFolderForm(true); }}>Folder</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Note Form (title only) */}
      {showAddForm && (
        <div className="add-note-form">
          <div className="form-overlay" onClick={() => setShowAddForm(false)}></div>
          <div className="form-content">
            <h2>Add New Note</h2>
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Note title..."
                value={newNote.title}
                onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                className="form-input"
                required
              />
              <div className="form-actions">
                <button type="button" onClick={() => setShowAddForm(false)} className="cancel-btn">
                  Cancel
                </button>
                <button type="submit" className="save-btn">
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Folder Form */}
      {showFolderForm && (
        <div className="add-note-form">
          <div className="form-overlay" onClick={() => setShowFolderForm(false)}></div>
          <div className="form-content">
            <h2>Add New Folder</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const folder = await createFolder({ 
                name: newFolder.name.trim(),
                parent_folder: activeFolder
              });
              setNewFolder({ name: '' });
              setShowFolderForm(false);
              // Refresh folders list
              const fetchedFolders = await fetch(`${API_BASE_URL}/folders/`).then(r => r.json());
              setFolders(fetchedFolders);
            }}>
              <input
                type="text"
                placeholder="Folder name..."
                value={newFolder.name}
                onChange={(e) => setNewFolder({ name: e.target.value })}
                className="form-input"
                required
              />
              <div className="form-actions">
                <button type="button" onClick={() => setShowFolderForm(false)} className="cancel-btn">
                  Cancel
                </button>
                <button type="submit" className="save-btn">
                  Save Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="notes-grid">
        {notes.length === 0 && !loading ? (
          <div className="notes-empty">
            <div className="notes-empty-icon">📝</div>
            <h3 className="notes-empty-title">No notes yet</h3>
            <p className="notes-empty-text">Create your first note to get started!</p>
          </div>
        ) : (
          <>
          {/* Folders (filtered by context) */}
          {folders.filter(f => (activeFolder === null ? !f.parent_folder : f.parent_folder === activeFolder)).map((folder) => (
            <div key={`folder-${folder.id}`} 
                 className={`note-card ${dragOverFolder === folder.id ? 'drag-over' : ''}`}
                 onClick={() => setActiveFolder(folder.id)}
                 onDragOver={(e) => {
                   e.preventDefault();
                   setDragOverFolder(folder.id);
                 }}
                 onDragLeave={() => setDragOverFolder(null)}
                 onDrop={(e) => {
                   setDragOverFolder(null);
                   const raw = e.dataTransfer.getData('application/x-note-id') || e.dataTransfer.getData('text/plain');
                   if (!raw) return;
                   let noteId = raw.trim();
                   try {
                     const url = new URL(noteId);
                     const parts = url.pathname.split('/').filter(Boolean);
                     noteId = parts[parts.length - 1] || noteId;
                   } catch (_) {
                     if (noteId.includes('/')) {
                       const parts = noteId.split('/').filter(Boolean);
                       noteId = parts[parts.length - 1];
                     }
                   }
                   if (noteId) moveNoteToFolder(noteId, folder.id);
                 }}>
              <h2 className="note-title">📁 {folder.name}</h2>
              <div className="note-meta">
                <span className="note-date">Folder</span>
                <div className="note-actions">
                  <button className="note-action-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteFolder(folder.id); }}>Delete</button>
                </div>
              </div>
            </div>
          ))}

          {/* Notes (filtered by folder context) */}
          {notes.filter(n => (activeFolder === null ? !n.folder : n.folder === activeFolder)).map((note) => (
            <Link key={note.id} href={`/notes/${note.unique_id}`} className="note-card-link">
              <div className="note-card" draggable
                   onDragStart={(e) => {
                     e.dataTransfer.setData('application/x-note-id', note.unique_id);
                     e.dataTransfer.setData('text/plain', note.unique_id);
                   }}>
                {(() => {
                  const img = getFirstImage(note.content || '');
                  if (img) {
                    return (
                      <div className="note-card-media note-card-media-image">
                        <img src={img.src} alt={img.alt} />
                      </div>
                    );
                  }
                  // No image — show a blank spacer to keep uniform height
                  return (
                    <div className="note-card-media note-card-media-blank" aria-hidden="true" />
                  );
                })()}

                <h2 className="note-title">{note.title}</h2>
                
                {/* Tags */}
                {note.tags && note.tags.length > 0 && (
                  <div className="note-tags">
                    {note.tags.slice(0, 3).map(tag => (
                      <span 
                        key={tag.id} 
                        className="note-tag"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {note.tags.length > 3 && (
                      <span className="note-tag-more">
                        +{note.tags.length - 3} more
                      </span>
                    )}
                  </div>
                )}
                
                <div className="note-meta">
                  <span className="note-date">{getDate(note.created_at)}</span>
                  <div className="note-actions">
                    <button 
                      className="note-action-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Edit functionality will be handled on detail page
                      }}
                    >
                      Edit
                    </button>
                    <button 
                      className="note-action-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteNote(note.unique_id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          </>
        )}
      </div>
    </div>
  );
}
