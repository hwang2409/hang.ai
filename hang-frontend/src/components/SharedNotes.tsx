import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface SharedNote {
  id: number;
  unique_id: string;
  title: string;
  content: string;
  tags: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  created_at: string;
  updated_at: string;
  shared_by: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
  };
  share_id: number;
  permission: 'view' | 'edit';
  share_message: string;
  shared_at: string;
}

interface SharedNotesProps {
  onClose: () => void;
}

const SharedNotes: React.FC<SharedNotesProps> = ({ onClose }) => {
  const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSharedNotes = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/note-shares/shared_with_me/', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSharedNotes(data);
        } else {
          setError('Failed to load shared notes');
        }
      } catch (err) {
        setError('Failed to load shared notes');
        console.error('Error fetching shared notes:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSharedNotes();
  }, []);

  const getDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getPermissionBadge = (permission: string) => {
    return permission === 'edit' ? 'Edit' : 'View';
  };

  const getPermissionColor = (permission: string) => {
    return permission === 'edit' ? '#10b981' : '#6b7280';
  };

  if (loading) {
    return (
      <div className="shared-notes-overlay">
        <div className="shared-notes-content">
          <div className="shared-notes-header">
            <h2>Shared Notes</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="loading">Loading shared notes...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-notes-overlay">
      <div className="shared-notes-content">
        <div className="shared-notes-header">
          <h2>Shared Notes</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="shared-notes-body">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {sharedNotes.length === 0 ? (
            <div className="empty-state">
              <p>No notes have been shared with you yet.</p>
            </div>
          ) : (
            <div className="shared-notes-grid">
              {sharedNotes.map((note) => (
                <div key={note.id} className="shared-note-card">
                  <div className="shared-note-header">
                    <div className="note-title">
                      <Link href={`/notes/${note.unique_id}`}>
                        {note.title}
                      </Link>
                    </div>
                    <div 
                      className="permission-badge"
                      style={{ backgroundColor: getPermissionColor(note.permission) }}
                    >
                      {getPermissionBadge(note.permission)}
                    </div>
                  </div>

                  <div className="shared-note-meta">
                    <div className="shared-by">
                      <span className="label">Shared by:</span>
                      <span className="value">{note.shared_by.full_name || note.shared_by.username}</span>
                    </div>
                    <div className="shared-date">
                      <span className="label">Shared:</span>
                      <span className="value">{getDate(note.shared_at)}</span>
                    </div>
                    <div className="note-date">
                      <span className="label">Created:</span>
                      <span className="value">{getDate(note.created_at)}</span>
                    </div>
                  </div>

                  {note.share_message && (
                    <div className="share-message">
                      <span className="label">Message:</span>
                      <span className="value">"{note.share_message}"</span>
                    </div>
                  )}

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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SharedNotes;