'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../contexts/AuthContext';
import LoginForm from '../components/LoginForm';
import RegisterForm from '../components/RegisterForm';
import ThemeToggle from '../components/ThemeToggle';

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
// Function to get the correct API base URL
const getApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'hangai-six.vercel.app') {
      return 'https://hangai-production.up.railway.app/api';
    }
  }
  
  return 'http://localhost:8000/api';
};

const fetchNotes = async (token: string | null): Promise<Note[]> => {
  const response = await fetch(`${getApiBaseUrl()}/documents/`, {
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch notes');
  }
  return response.json();
};

const createFolder = async (payload: { name: string; parent_folder?: number | null }, token: string | null): Promise<Folder> => {
  const response = await fetch(`${getApiBaseUrl()}/folders/`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to create folder');
  return response.json();
};

const createNote = async (note: { title: string; content: string }, token: string | null): Promise<Note> => {
  const response = await fetch(`${getApiBaseUrl()}/documents/`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(note),
  });
  if (!response.ok) {
    throw new Error('Failed to create note');
  }
  return response.json();
};

const deleteNote = async (uniqueId: string, token: string | null): Promise<void> => {
  const response = await fetch(`${getApiBaseUrl()}/documents/${uniqueId}/`, {
    method: 'DELETE',
    headers: getAuthHeaders(token),
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
  const { user, token, logout, isAuthenticated, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Helpers for uniform previews
  const getFirstImage = (md: string): { src: string; alt: string } | null => {
    if (!md) return null;

    // Try Markdown image: ![alt](src "optional title")
    // Capture src up to a closing ) allowing optional title part
    const mdMatch = md.match(/!\[(.*?)\]\((\S+?)(?:\s+\"[^\"]*\")?\)/);
    if (mdMatch) {
      const [, alt, rawSrc] = mdMatch;
      const src = normalizeImageSrc(rawSrc);
      return { alt: alt || '', src };
    }

    // Try HTML <img src="..." alt="...">
    const htmlMatch = md.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (htmlMatch) {
      const rawSrc = htmlMatch[1];
      const altMatch = md.match(/<img[^>]*alt=["']([^"']*)["'][^>]*>/i);
      const alt = altMatch ? altMatch[1] : '';
      const src = normalizeImageSrc(rawSrc);
      return { alt, src };
    }

    return null;
  };

  const normalizeImageSrc = (raw: string): string => {
    const trimmed = raw.trim();
    // If already absolute http(s), keep
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // Ensure leading slash
    const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    // Prefix backend origin (remove /api from the base URL for image URLs)
    return `${getApiBaseUrl().replace('/api', '')}${withSlash}`;
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
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc' | 'tag_asc' | 'tag_desc'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'note' | 'folder';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'note'
  });
  const [dragOverTrash, setDragOverTrash] = useState(false);

  // Derived, memoized notes list filtered by folder and sorted by selection
  const visibleSortedNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filteredByFolder = notes.filter(n => (activeFolder === null ? !n.folder : n.folder === activeFolder));
    const filteredBySearch = q
      ? filteredByFolder.filter(n => {
          const titleMatch = (n.title || '').toLowerCase().includes(q);
          const tagMatch = (n.tags || []).some(t => (t.name || '').toLowerCase().includes(q));
          return titleMatch || tagMatch;
        })
      : filteredByFolder;
    const sorted = [...filteredBySearch].sort((a, b) => {
      const aCreated = new Date(a.created_at).getTime();
      const bCreated = new Date(b.created_at).getTime();
      const aUpdated = new Date(a.updated_at).getTime();
      const bUpdated = new Date(b.updated_at).getTime();
      const aTitle = (a.title || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();
      const aTag = (a.tags && a.tags[0]?.name ? a.tags[0].name.toLowerCase() : '');
      const bTag = (b.tags && b.tags[0]?.name ? b.tags[0].name.toLowerCase() : '');
      switch (sortBy) {
        case 'newest':
          return bCreated - aCreated;
        case 'oldest':
          return aCreated - bCreated;
        case 'updated_desc':
          return bUpdated - aUpdated;
        case 'updated_asc':
          return aUpdated - bUpdated;
        case 'title_asc':
          return aTitle.localeCompare(bTitle);
        case 'title_desc':
          return bTitle.localeCompare(aTitle);
        case 'tag_asc':
          if (!aTag && bTag) return 1;
          if (aTag && !bTag) return -1;
          return aTag.localeCompare(bTag);
        case 'tag_desc':
          if (!aTag && bTag) return 1;
          if (aTag && !bTag) return -1;
          return bTag.localeCompare(aTag);
        default:
          return 0;
      }
    });
    return sorted;
  }, [notes, activeFolder, sortBy, searchQuery]);

  // Load notes from API on component mount
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    const loadNotes = async () => {
      try {
        setLoading(true);
        const [fetchedNotes, fetchedFolders] = await Promise.all([
          fetchNotes(token),
          fetch(`${getApiBaseUrl()}/folders/`, {
            headers: getAuthHeaders(token),
          }).then(r => r.json())
        ]);
        setNotes(fetchedNotes);
        setFolders(fetchedFolders);
        setError(null);

        // Prefetch first images to warm cache
        try {
          const urls: string[] = [];
          for (const n of fetchedNotes) {
            const img = getFirstImage(n.content || '');
            if (img?.src) urls.push(img.src);
            if (urls.length >= 10) break; // limit prefetches
          }
          await Promise.all(urls.map(u => fetch(u, { method: 'GET', mode: 'no-cors' }).catch(() => null)));
        } catch {}
      } catch (err) {
        setError('Failed to load notes. Please check if the Django server is running.');
        console.error('Error loading notes:', err);
      } finally {
        setLoading(false);
      }
    };

    loadNotes();
  }, [isAuthenticated, token]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownOpen) {
        setDropdownOpen(false);
      }
      if (newDropdownOpen) {
        setNewDropdownOpen(false);
      }
    };

    if (dropdownOpen || newDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [dropdownOpen, newDropdownOpen]);

  // Add note function
  const addNote = async () => {
    if (newNote.title.trim() && token) {
      try {
        const createdNote = await createNote({
          title: newNote.title.trim(),
          content: ''
        }, token);
        
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
    if (!token) return;
    
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

      const res = await fetch(`${getApiBaseUrl()}/documents/${id}/`, {
        method: 'PATCH',
        headers: getAuthHeaders(token),
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
    if (!token) return;
    setConfirmModal({
      show: true,
      title: 'Move to Trash',
      message: 'Move this folder to trash? All notes inside will also be moved to trash. You can restore them later.',
      onConfirm: async () => {
        try {
          const res = await fetch(`${getApiBaseUrl()}/folders/${folderId}/`, { 
            method: 'DELETE',
            headers: getAuthHeaders(token),
          });
          if (!res.ok) throw new Error('Failed to delete folder');
          // Remove the folder and all its subfolders
          const removeFolderAndSubfolders = (folderId: number, folders: Folder[]) => {
            const folderIdsToRemove = new Set([folderId]);
            
            // Find all subfolders recursively
            const findSubfolders = (parentId: number) => {
              folders.forEach(folder => {
                if (folder.parent_folder === parentId) {
                  folderIdsToRemove.add(folder.id);
                  findSubfolders(folder.id);
                }
              });
            };
            
            findSubfolders(folderId);
            return Array.from(folderIdsToRemove);
          };
          
          const folderIdsToRemove = removeFolderAndSubfolders(folderId, folders);
          setFolders(prev => prev.filter(f => !folderIdsToRemove.includes(f.id)));
          // Remove all notes that were in any of the deleted folders
          setNotes(prev => prev.filter(n => !folderIdsToRemove.includes(n.folder)));
        } catch (e) {
          console.error(e);
          setError('Failed to delete folder.');
        }
        setConfirmModal(prev => ({ ...prev, show: false }));
      },
      type: 'folder'
    });
  };

  // Delete note function
  const handleDeleteNote = async (uniqueId: string) => {
    if (!token) return;
    const note = notes.find(n => n.unique_id === uniqueId);
    setConfirmModal({
      show: true,
      title: 'Move to Trash',
      message: `Move "${note?.title || 'this note'}" to trash? You can restore it later.`,
      onConfirm: async () => {
        try {
          await deleteNote(uniqueId, token);
          setNotes(notes.filter(note => note.unique_id !== uniqueId));
          setError(null);
        } catch (err) {
          setError('Failed to delete note. Please try again.');
          console.error('Error deleting note:', err);
        }
        setConfirmModal(prev => ({ ...prev, show: false }));
      },
      type: 'note'
    });
  };

  // Move note to trash (for drag and drop)
  const moveNoteToTrash = async (uniqueId: string) => {
    if (!token) return;
    try {
      await deleteNote(uniqueId, token);
      setNotes(notes.filter(note => note.unique_id !== uniqueId));
      setError(null);
    } catch (err) {
      setError('Failed to move note to trash.');
      console.error('Error moving note to trash:', err);
    }
  };

  // Move folder to trash (for drag and drop)
  const moveFolderToTrash = async (folderId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/folders/${folderId}/`, { 
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to move folder to trash');
      
      // Remove the folder and all its subfolders
      const removeFolderAndSubfolders = (folderId: number, folders: Folder[]) => {
        const folderIdsToRemove = new Set([folderId]);
        
        // Find all subfolders recursively
        const findSubfolders = (parentId: number) => {
          folders.forEach(folder => {
            if (folder.parent_folder === parentId) {
              folderIdsToRemove.add(folder.id);
              findSubfolders(folder.id);
            }
          });
        };
        
        findSubfolders(folderId);
        return Array.from(folderIdsToRemove);
      };
      
      const folderIdsToRemove = removeFolderAndSubfolders(folderId, folders);
      setFolders(prev => prev.filter(f => !folderIdsToRemove.includes(f.id)));
      // Remove all notes that were in any of the deleted folders
      setNotes(prev => prev.filter(n => !folderIdsToRemove.includes(n.folder)));
    } catch (e) {
      console.error(e);
      setError('Failed to move folder to trash.');
    }
  };

  // Move folder into another folder (nesting)
  const moveFolderToFolder = async (folderId: number, targetFolderId: number | null) => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/folders/${folderId}/move_to_folder/`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target_folder_id: targetFolderId }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to move folder');
      }
      
      // Update the folder in the local state
      setFolders(prev => prev.map(f => 
        f.id === folderId ? { ...f, parent_folder: targetFolderId } : f
      ));
      
      setError(null);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to move folder.');
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addNote();
  };

  // Show loading screen while checking authentication
  if (authLoading) {
    return (
      <div className="notes-container">
        <div className="loading-message">Loading...</div>
      </div>
    );
  }

  // Show authentication screen if not logged in
  if (!isAuthenticated) {
  return (
      <div className="notes-container">
        <header className="notes-header">
          <div className="header-left">
            <h1 className="notes-title">hang.ai</h1>
            <p className="notes-subtitle">your thoughts, organized.</p>
          </div>
          <div className="header-right">
            <ThemeToggle />
          </div>
        </header>
        
        <div className="auth-welcome">
          <h2>Welcome to hang.ai</h2>
          <p>Sign in to access your notes, or create a new account to get started.</p>
          
          <div className="auth-buttons">
            <button 
              className="save-btn"
              onClick={() => {
                setAuthMode('login');
                setShowAuth(true);
              }}
            >
              Sign In
            </button>
            <button 
              className="save-btn"
              onClick={() => {
                setAuthMode('register');
                setShowAuth(true);
              }}
            >
              Create Account
            </button>
          </div>
        </div>

        {showAuth && (
          <>
            {authMode === 'login' ? (
              <LoginForm
                onSwitchToRegister={() => setAuthMode('register')}
                onClose={() => setShowAuth(false)}
              />
            ) : (
              <RegisterForm
                onSwitchToLogin={() => setAuthMode('login')}
                onClose={() => setShowAuth(false)}
              />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="notes-container">
      <header className="notes-header">
        <div className="header-left">
          <h1 className="notes-title">hang.ai</h1>
          <p className="notes-subtitle">your thoughts, organized.</p>
        </div>
        <div className="header-right">
          <div className="user-info">
            <span className="user-name">Welcome, {user?.full_name || user?.username}</span>
            <button 
              className="logout-btn"
              onClick={logout}
            >
              Logout
            </button>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="notes-actions-row">
        {/* Search bar on the left */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notes by title or tag..."
          className="form-input"
          style={{ flex: 1, marginRight: '1rem' }}
        />
        
        <div style={{ position: 'relative' }}>
          <div 
            className="custom-select"
            onClick={() => setNewDropdownOpen(!newDropdownOpen)}
            style={{ position: 'relative' }}
          >
            <div className="add-note-btn">
              + new
              <span style={{ marginLeft: '0.5rem' }}>▼</span>
            </div>
            {newDropdownOpen && (
              <div className="custom-dropdown">
                <div 
                  className="dropdown-option"
                  onClick={() => { setShowAddForm(true); setNewDropdownOpen(false); }}
                >
                  Note
                </div>
                <div 
                  className="dropdown-option"
                  onClick={() => { setShowFolderForm(true); setNewDropdownOpen(false); }}
                >
                  Folder
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div style={{ marginLeft: '1rem', position: 'relative' }}>
          <div 
            className="custom-select"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{ position: 'relative' }}
          >
            <div className="sort-select">
              {sortBy === 'newest' && 'Most recent (created)'}
              {sortBy === 'oldest' && 'Least recent (created)'}
              {sortBy === 'updated_desc' && 'Most recent (updated)'}
              {sortBy === 'updated_asc' && 'Least recent (updated)'}
              {sortBy === 'title_asc' && 'Title (A–Z)'}
              {sortBy === 'title_desc' && 'Title (Z–A)'}
              {sortBy === 'tag_asc' && 'Tag (A–Z)'}
              {sortBy === 'tag_desc' && 'Tag (Z–A)'}
              <span style={{ marginLeft: '0.5rem' }}>▼</span>
            </div>
            {dropdownOpen && (
              <div className="custom-dropdown">
                <div 
                  className={`dropdown-option ${sortBy === 'newest' ? 'selected' : ''}`}
                  onClick={() => { setSortBy('newest'); setDropdownOpen(false); }}
                >
                  Most recent (created)
                </div>
                <div 
                  className={`dropdown-option ${sortBy === 'oldest' ? 'selected' : ''}`}
                  onClick={() => { setSortBy('oldest'); setDropdownOpen(false); }}
                >
                  Least recent (created)
                </div>
                <div 
                  className={`dropdown-option ${sortBy === 'updated_desc' ? 'selected' : ''}`}
                  onClick={() => { setSortBy('updated_desc'); setDropdownOpen(false); }}
                >
                  Most recent (updated)
                </div>
                <div 
                  className={`dropdown-option ${sortBy === 'updated_asc' ? 'selected' : ''}`}
                  onClick={() => { setSortBy('updated_asc'); setDropdownOpen(false); }}
                >
                  Least recent (updated)
                </div>
                <div 
                  className={`dropdown-option ${sortBy === 'title_asc' ? 'selected' : ''}`}
                  onClick={() => { setSortBy('title_asc'); setDropdownOpen(false); }}
                >
                  Title (A–Z)
                </div>
                <div 
                  className={`dropdown-option ${sortBy === 'title_desc' ? 'selected' : ''}`}
                  onClick={() => { setSortBy('title_desc'); setDropdownOpen(false); }}
                >
                  Title (Z–A)
                </div>
                <div 
                  className={`dropdown-option ${sortBy === 'tag_asc' ? 'selected' : ''}`}
                  onClick={() => { setSortBy('tag_asc'); setDropdownOpen(false); }}
                >
                  Tag (A–Z)
                </div>
                <div 
                  className={`dropdown-option ${sortBy === 'tag_desc' ? 'selected' : ''}`}
                  onClick={() => { setSortBy('tag_desc'); setDropdownOpen(false); }}
                >
                  Tag (Z–A)
                </div>
              </div>
            )}
          </div>
        </div>
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
            
            // Check if it's a folder being dragged
            const folderDragData = e.dataTransfer.getData('application/x-note-or-folder');
            if (folderDragData) {
              const { type, id } = JSON.parse(folderDragData);
              if (type === 'folder') {
                moveFolderToFolder(parseInt(id), null); // Move to root level
                return;
              }
            }
            
            // Handle note dragging (existing logic)
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
              if (!token) return;
              const folder = await createFolder({ 
                name: newFolder.name.trim(),
                parent_folder: activeFolder
              }, token);
              setNewFolder({ name: '' });
              setShowFolderForm(false);
              // Refresh folders list
              const fetchedFolders = await fetch(`${getApiBaseUrl()}/folders/`, {
                headers: getAuthHeaders(token),
              }).then(r => r.json());
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
        {/* Folders (filtered by context) - Always show if they exist */}
        {folders.filter(f => (activeFolder === null ? !f.parent_folder : f.parent_folder === activeFolder)).map((folder) => (
          <div key={`folder-${folder.id}`} 
               className={`note-card ${dragOverFolder === folder.id ? 'drag-over' : ''}`}
               draggable
               onClick={() => setActiveFolder(folder.id)}
               onDragStart={(e) => {
                 e.dataTransfer.setData('application/x-note-or-folder', JSON.stringify({ type: 'folder', id: folder.id }));
                 e.dataTransfer.setData('text/plain', `folder-${folder.id}`);
               }}
               onDragOver={(e) => {
                 e.preventDefault();
                 setDragOverFolder(folder.id);
               }}
               onDragLeave={() => setDragOverFolder(null)}
               onDrop={(e) => {
                 setDragOverFolder(null);
                 
                 // Check if it's a folder being dragged
                 const folderDragData = e.dataTransfer.getData('application/x-note-or-folder');
                 if (folderDragData) {
                   const { type, id } = JSON.parse(folderDragData);
                   if (type === 'folder') {
                     moveFolderToFolder(parseInt(id), folder.id);
                     return;
                   }
                 }
                 
                 // Handle note dragging (existing logic)
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
        {visibleSortedNotes.map((note) => (
          <Link key={note.id} href={`/notes/${note.unique_id}`} className="note-card-link">
            <div className="note-card" draggable
                 onDragStart={(e) => {
                   e.dataTransfer.setData('application/x-note-id', note.unique_id);
                   e.dataTransfer.setData('application/x-note-or-folder', JSON.stringify({ type: 'note', id: note.unique_id }));
                   e.dataTransfer.setData('text/plain', note.unique_id);
                 }}>
              {(() => {
                const img = getFirstImage(note.content || '');
                if (img) {
                  return (
                    <div className="note-card-media note-card-media-image">
                      <img 
                        src={img.src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
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

        {/* Empty state - only show when there are no folders AND no notes */}
        {folders.filter(f => (activeFolder === null ? !f.parent_folder : f.parent_folder === activeFolder)).length === 0 && 
         notes.filter(n => (activeFolder === null ? !n.folder : n.folder === activeFolder)).length === 0 && 
         !loading && (
          <div className="notes-empty">
            <div className="notes-empty-icon">📝</div>
            <h3 className="notes-empty-title">No notes yet</h3>
            <p className="notes-empty-text">Create your first note to get started!</p>
          </div>
        )}
      </div>

      {/* Custom Confirmation Modal */}
      {confirmModal.show && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <div className="confirm-modal-header">
              <h3>{confirmModal.title}</h3>
            </div>
            <div className="confirm-modal-body">
              <p>{confirmModal.message}</p>
            </div>
            <div className="confirm-modal-actions">
              <button 
                className="confirm-cancel-btn"
                onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
              >
                Cancel
              </button>
              <button 
                className={`confirm-delete-btn ${confirmModal.type}`}
                onClick={confirmModal.onConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Trash Button */}
      {isAuthenticated && (
        <div
          className="floating-trash-btn"
          style={{ 
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            background: dragOverTrash ? '#dc2626' : 'var(--accent)',
            color: 'white',
            textDecoration: 'none',
            padding: '1rem',
            borderRadius: '50%',
            boxShadow: dragOverTrash ? '0 4px 12px rgba(220, 38, 38, 0.5)' : 'var(--shadow-lg)',
            fontSize: '1.5rem',
            width: '3.5rem',
            height: '3.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 1000,
            cursor: 'pointer'
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverTrash(true);
          }}
          onDragLeave={() => {
            setDragOverTrash(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverTrash(false);
            
            const dragData = e.dataTransfer.getData('application/x-note-or-folder');
            if (dragData) {
              const { type, id } = JSON.parse(dragData);
              if (type === 'note') {
                moveNoteToTrash(id);
              } else if (type === 'folder') {
                moveFolderToTrash(parseInt(id));
              }
            }
          }}
          onClick={() => window.location.href = '/trash'}
        >
          🗑️
        </div>
      )}
    </div>
  );
}
