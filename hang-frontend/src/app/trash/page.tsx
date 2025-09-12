'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthHeaders } from '../../contexts/AuthContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';

interface Note {
  id: number;
  unique_id: string;
  title: string;
  content: string;
  folder: number | null;
  tags: Array<{ id: number; name: string; color: string }>;
  created_at: string;
  updated_at: string;
  deleted_at: string;
}

interface Folder {
  id: number;
  name: string;
  parent_folder: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string;
}

export default function TrashPage() {
  const { user, token, isAuthenticated, loading: authLoading } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'note' | 'folder';
    action: 'restore' | 'permanent';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'note',
    action: 'restore'
  });

  // Load trash items from API
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    const loadTrash = async () => {
      try {
        setLoading(true);
        const [notesRes, foldersRes] = await Promise.all([
          fetch(`${API_BASE_URL}/documents/trash/`, {
            headers: getAuthHeaders(token),
          }),
          fetch(`${API_BASE_URL}/folders/trash/`, {
            headers: getAuthHeaders(token),
          })
        ]);

        if (notesRes.ok && foldersRes.ok) {
          const [notesData, foldersData] = await Promise.all([
            notesRes.json(),
            foldersRes.json()
          ]);
          setNotes(notesData);
          setFolders(foldersData);
          setError(null);
        } else {
          setError('Failed to load trash items');
        }
      } catch (err) {
        setError('Failed to load trash items');
        console.error('Error loading trash:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTrash();
  }, [isAuthenticated, token]);

  // Restore note
  const restoreNote = async (uniqueId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/documents/${uniqueId}/restore/`, {
        method: 'POST',
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        setNotes(notes.filter(note => note.unique_id !== uniqueId));
        setError(null);
      } else {
        setError('Failed to restore note');
      }
    } catch (err) {
      setError('Failed to restore note');
      console.error('Error restoring note:', err);
    }
  };

  // Permanently delete note
  const permanentDeleteNote = async (uniqueId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/documents/${uniqueId}/permanent_delete/`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        setNotes(notes.filter(note => note.unique_id !== uniqueId));
        setError(null);
      } else {
        setError('Failed to permanently delete note');
      }
    } catch (err) {
      setError('Failed to permanently delete note');
      console.error('Error permanently deleting note:', err);
    }
  };

  // Restore folder
  const restoreFolder = async (folderId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/folders/${folderId}/restore/`, {
        method: 'POST',
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        setFolders(folders.filter(folder => folder.id !== folderId));
        setError(null);
      } else {
        setError('Failed to restore folder');
      }
    } catch (err) {
      setError('Failed to restore folder');
      console.error('Error restoring folder:', err);
    }
  };

  // Permanently delete folder
  const permanentDeleteFolder = async (folderId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/folders/${folderId}/permanent_delete/`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        setFolders(folders.filter(folder => folder.id !== folderId));
        setError(null);
      } else {
        setError('Failed to permanently delete folder');
      }
    } catch (err) {
      setError('Failed to permanently delete folder');
      console.error('Error permanently deleting folder:', err);
    }
  };

  // Show loading while authentication is being determined
  if (authLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  // Show login prompt only after authentication loading is complete
  if (!isAuthenticated) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Please log in to view trash</h1>
        <Link href="/" style={{ color: '#3b82f6' }}>Go to homepage</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading trash...</p>
      </div>
    );
  }

  return (
    <div className="notes-container">
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/" className="back-link" style={{ marginBottom: '1rem', display: 'block' }}>← Back to Notes</Link>
        <h1 className="notes-title" style={{ margin: 0 }}>Trash</h1>
      </div>

      {error && (
        <div style={{ 
          background: '#fef2f2', 
          border: '1px solid #fecaca', 
          color: '#dc2626', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          marginBottom: '1rem' 
        }}>
          {error}
        </div>
      )}

      {/* Folders */}
      {folders.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Deleted Folders</h2>
          <div className="notes-grid">
            {folders.map((folder) => (
              <div key={folder.id} className="note-card">
                <h3 className="note-title">
                  📁 {folder.name}
                </h3>
                <p className="note-meta">
                  Deleted on {new Date(folder.deleted_at).toLocaleDateString()}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    onClick={() => setConfirmModal({
                      show: true,
                      title: 'Restore Folder',
                      message: `Restore "${folder.name}" and all its notes?`,
                      onConfirm: () => {
                        restoreFolder(folder.id);
                        setConfirmModal(prev => ({ ...prev, show: false }));
                      },
                      type: 'folder',
                      action: 'restore'
                    })}
                    className="save-btn"
                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => setConfirmModal({
                      show: true,
                      title: 'Permanently Delete',
                      message: `Permanently delete "${folder.name}" and all its notes? This action cannot be undone.`,
                      onConfirm: () => {
                        permanentDeleteFolder(folder.id);
                        setConfirmModal(prev => ({ ...prev, show: false }));
                      },
                      type: 'folder',
                      action: 'permanent'
                    })}
                    style={{
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      cursor: 'pointer'
                    }}
                  >
                    Delete Forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Notes */}
      {notes.length > 0 && (
        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Deleted Notes</h2>
          <div className="notes-grid">
            {notes.map((note) => (
              <div key={note.unique_id} className="note-card">
                <h3 className="note-title">
                  📝 {note.title}
                </h3>
                <p className="note-meta">
                  Deleted on {new Date(note.deleted_at).toLocaleDateString()}
                </p>
                {note.tags.length > 0 && (
                  <div className="note-tags">
                    {note.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="note-tag"
                        style={{ background: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    onClick={() => setConfirmModal({
                      show: true,
                      title: 'Restore Note',
                      message: `Restore "${note.title}"?`,
                      onConfirm: () => {
                        restoreNote(note.unique_id);
                        setConfirmModal(prev => ({ ...prev, show: false }));
                      },
                      type: 'note',
                      action: 'restore'
                    })}
                    className="save-btn"
                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => setConfirmModal({
                      show: true,
                      title: 'Permanently Delete',
                      message: `Permanently delete "${note.title}"? This action cannot be undone.`,
                      onConfirm: () => {
                        permanentDeleteNote(note.unique_id);
                        setConfirmModal(prev => ({ ...prev, show: false }));
                      },
                      type: 'note',
                      action: 'permanent'
                    })}
                    style={{
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      cursor: 'pointer'
                    }}
                  >
                    Delete Forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {folders.length === 0 && notes.length === 0 && (
        <div className="notes-empty">
          <div className="notes-empty-icon">🗑️</div>
          <h3 className="notes-empty-title">Trash is empty</h3>
          <p className="notes-empty-text">Deleted notes and folders will appear here</p>
        </div>
      )}

      {/* Confirmation Modal */}
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
                className={`confirm-delete-btn ${confirmModal.action === 'restore' ? 'restore' : confirmModal.type}`}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.action === 'restore' ? 'Restore' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
