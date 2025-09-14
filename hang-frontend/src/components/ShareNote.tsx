import React, { useState, useEffect } from 'react';
import { getAuthHeaders, useAuth } from '../contexts/AuthContext';

// Function to get the correct API base URL
const getApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== 'undefined') {
    return window.location.hostname === 'localhost' ? 'http://localhost:8000/api' : 'http://localhost:8000/api';
  }
  return 'http://localhost:8000/api';
};

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
}

interface ShareNoteProps {
  noteId: number;
  noteTitle: string;
  onClose: () => void;
  onShare: () => void;
}

const ShareNote: React.FC<ShareNoteProps> = ({ noteId, noteTitle, onClose, onShare }) => {
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');

  // Search for users
  useEffect(() => {
    if (searchQuery.length >= 2 && token) {
      const searchUsers = async () => {
        try {
          const response = await fetch(`${getApiBaseUrl()}/users/search/?q=${encodeURIComponent(searchQuery)}`, {
            headers: getAuthHeaders(token),
          });
          
          if (response.ok) {
            const data = await response.json();
            setUsers(data);
          }
        } catch (err) {
          console.error('Error searching users:', err);
        }
      };

      const timeoutId = setTimeout(searchUsers, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setUsers([]);
    }
  }, [searchQuery, token]);

  const handleShare = async () => {
    if (!selectedUser) {
      setError('Please select a user to share with');
      return;
    }

    if (!token) {
      setError('Authentication required');
      return;
    }

    setSharing(true);
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/note-shares/`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          note_id: noteId,
          shared_with_id: selectedUser.id,
          permission: permission,
          message: message.trim() || null,
        }),
      });

      if (response.ok) {
        onShare();
        onClose();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to share note');
      }
    } catch (err) {
      setError('Failed to share note');
      console.error('Error sharing note:', err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="share-note-overlay">
      <div className="share-note-content">
        <div className="share-note-header">
          <h2>Share Note</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="share-note-body">
          <div className="note-info">
            <h3>"{noteTitle}"</h3>
          </div>

          <div className="form-group">
            <label htmlFor="user-search">Share with:</label>
            <div className="user-search-container">
              <input
                id="user-search"
                type="text"
                placeholder="Search by email or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
              />
              
              {users.length > 0 && (
                <div className="user-search-results">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className={`user-option ${selectedUser?.id === user.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedUser(user);
                        setSearchQuery(user.email);
                        setUsers([]);
                      }}
                    >
                      <div className="user-info">
                        <div className="user-name">{user.full_name || user.username}</div>
                        <div className="user-email">{user.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {selectedUser && (
            <div className="selected-user">
              <div className="user-info">
                <div className="user-name">{selectedUser.full_name || selectedUser.username}</div>
                <div className="user-email">{selectedUser.email}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setSearchQuery('');
                }}
                className="remove-user-btn"
              >
                ×
              </button>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="permission">Permission:</label>
            <select
              id="permission"
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
              className="form-input"
            >
              <option value="view">View Only</option>
              <option value="edit">View and Edit</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="message">Message (optional):</label>
            <textarea
              id="message"
              placeholder="Add a personal message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="form-input"
              rows={3}
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              className="cancel-btn"
              disabled={sharing}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="save-btn"
              disabled={!selectedUser || sharing}
            >
              {sharing ? 'Sharing...' : 'Share Note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareNote;