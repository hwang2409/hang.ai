'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ThemeToggle from '../../components/ThemeToggle';
import LaTeXRenderer from '../../utils/latexRenderer';
import Link from 'next/link';

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

interface TranscriptionResult {
  id: string | number;
  timestamp: string;
  created_at?: string;
  formatted_created_at?: string;
  speech_text: string;
  latex?: string;
  latex_output?: string; // Backend field name
  status: 'transcribing' | 'translating' | 'complete' | 'completed' | 'error' | 'failed';
  processing_time?: number;
  is_favorite?: boolean;
  audio_file_name?: string;
  audio_format?: string;
  success?: boolean;
}

export default function VoicePage() {
  const { user, token, logout, isAuthenticated } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionResult[]>([]);
  const [currentTranscription, setCurrentTranscription] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [browserSupport, setBrowserSupport] = useState<{
    mediaRecorder: boolean;
    getUserMedia: boolean;
    supportedMimeTypes: string[];
  }>({
    mediaRecorder: false,
    getUserMedia: false,
    supportedMimeTypes: []
  });
  const [backendStatus, setBackendStatus] = useState<string>('');
  const [editingTranscription, setEditingTranscription] = useState<string | number | null>(null);
  const [editingLatex, setEditingLatex] = useState<string>('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load transcription history from database
  const loadTranscriptionHistory = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/voice/history/recent/`, {
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const historyData = await response.json();
        
        // Convert backend format to frontend format
        const formattedTranscriptions: TranscriptionResult[] = historyData.map((item: any) => ({
          id: item.id,
          timestamp: item.formatted_created_at || new Date(item.created_at).toLocaleTimeString(),
          created_at: item.created_at,
          formatted_created_at: item.formatted_created_at,
          speech_text: item.speech_text,
          latex: item.latex_output || '',
          latex_output: item.latex_output,
          status: item.status === 'completed' ? 'complete' : item.status === 'failed' ? 'error' : item.status,
          processing_time: item.processing_time,
          is_favorite: item.is_favorite,
          audio_file_name: item.audio_file_name,
          audio_format: item.audio_format,
          success: item.success
        }));

        setTranscriptions(formattedTranscriptions);
      }
    } catch (err) {
      console.error('Failed to load transcription history:', err);
    }
  };

  // Toggle favorite status
  const toggleFavorite = async (transcriptionId: string | number) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/voice/history/${transcriptionId}/toggle_favorite/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const updatedItem = await response.json();
        
        // Update local state
        setTranscriptions(prev => 
          prev.map(item => 
            item.id === transcriptionId 
              ? { ...item, is_favorite: updatedItem.is_favorite }
              : item
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  // Delete individual transcription
  const deleteTranscription = async (transcriptionId: string | number) => {
    // Show confirmation dialog
    const confirmed = window.confirm('Are you sure you want to permanently delete this transcription?');
    if (!confirmed) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/voice/history/${transcriptionId}/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        // Remove from local state
        setTranscriptions(prev => 
          prev.filter(item => item.id !== transcriptionId)
        );
        
        console.log('Transcription deleted successfully');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete transcription');
      }
    } catch (err) {
      console.error('Failed to delete transcription:', err);
      setError(`Failed to delete transcription: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Start editing LaTeX
  const startEditingLatex = (transcriptionId: string | number, currentLatex: string) => {
    setEditingTranscription(transcriptionId);
    setEditingLatex(currentLatex || '');
  };

  // Cancel editing LaTeX
  const cancelEditingLatex = () => {
    setEditingTranscription(null);
    setEditingLatex('');
  };

  // Save edited LaTeX
  const saveEditedLatex = async (transcriptionId: string | number) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/voice/history/${transcriptionId}/update_latex/`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          latex_output: editingLatex
        })
      });

      if (response.ok) {
        const updatedItem = await response.json();
        
        // Update local state
        setTranscriptions(prev => 
          prev.map(item => 
            item.id === transcriptionId 
              ? { 
                  ...item, 
                  latex: updatedItem.latex_output || '', 
                  latex_output: updatedItem.latex_output 
                }
              : item
          )
        );
        
        // Exit edit mode
        setEditingTranscription(null);
        setEditingLatex('');
        
        console.log('LaTeX updated successfully');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update LaTeX');
      }
    } catch (err) {
      console.error('Failed to update LaTeX:', err);
      setError(`Failed to update LaTeX: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Clear all history from database
  const clearHistoryFromDatabase = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/voice/history/clear_history/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setTranscriptions([]);
        setError('');
      }
    } catch (err) {
      console.error('Failed to clear history:', err);
      setError('Failed to clear history from database');
    }
  };

  // Check browser support on component mount and load history
  useEffect(() => {
    const checkSupport = () => {
      const mediaRecorderSupported = typeof MediaRecorder !== 'undefined';
      const getUserMediaSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/wav',
        'audio/ogg'
      ];
      
      const supportedMimeTypes = mediaRecorderSupported 
        ? mimeTypes.filter(type => MediaRecorder.isTypeSupported(type))
        : [];

      setBrowserSupport({
        mediaRecorder: mediaRecorderSupported,
        getUserMedia: getUserMediaSupported,
        supportedMimeTypes
      });

      // Log browser support info for debugging
      console.log('Browser Support Check:', {
        mediaRecorderSupported,
        getUserMediaSupported,
        supportedMimeTypes
      });
    };

    checkSupport();
    
    // Load transcription history if user is authenticated
    if (isAuthenticated && token) {
      loadTranscriptionHistory();
    }
  }, [isAuthenticated, token]);

  const startRecording = async () => {
    try {
      setError('');
      
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });

      // Try different MIME types for better browser compatibility
      let mimeType = '';
      let fileExtension = '';
      
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
        fileExtension = 'webm';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
        fileExtension = 'webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
        fileExtension = 'mp4';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
        fileExtension = 'wav';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
        fileExtension = 'ogg';
      } else {
        // Fallback - let browser choose
        mimeType = '';
        fileExtension = 'audio';
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/wav' });
        await processAudio(audioBlob, fileExtension);
        
        // Clean up stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setCurrentTranscription('🎤 Recording...');

      console.log(`Recording started with MIME type: ${mimeType || 'default'}`);

    } catch (err) {
      console.error('Error starting recording:', err);
      if (err instanceof Error && err.name === 'NotSupportedError') {
        setError('Audio recording is not supported in your browser. Please try a different browser or update your current one.');
      } else {
        setError('Failed to access microphone. Please check permissions and try again.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setCurrentTranscription('🔄 Processing...');
    }
  };

  const processAudio = async (audioBlob: Blob, fileExtension: string = 'webm') => {
    const resultId = Date.now().toString();
    
    // Add pending result
    const pendingResult: TranscriptionResult = {
      id: resultId,
      timestamp: new Date().toLocaleTimeString(),
      speech_text: '',
      latex: '',
      status: 'transcribing'
    };
    
    setTranscriptions(prev => [pendingResult, ...prev]);

    try {
      // Create FormData to send audio
      const formData = new FormData();
      formData.append('audio', audioBlob, `recording.${fileExtension}`);

      // Send to backend for transcription
      const response = await fetch(`${getApiBaseUrl()}/voice/transcribe/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Backend now returns the saved transcription with database ID
      const newTranscription: TranscriptionResult = {
        id: result.id || resultId, // Use database ID if available
        timestamp: result.created_at ? new Date(result.created_at).toLocaleTimeString() : new Date().toLocaleTimeString(),
        created_at: result.created_at,
        formatted_created_at: result.created_at,
        speech_text: result.speech_text || result.error || 'No speech detected',
        latex: result.latex || '',
        latex_output: result.latex,
        status: result.success ? 'complete' : 'error',
        processing_time: result.processing_time,
        is_favorite: false,
        success: result.success
      };
      
      // Replace pending result with actual result
      setTranscriptions(prev => 
        prev.map(item => 
          item.id === resultId ? newTranscription : item
        )
      );

      setCurrentTranscription('');

    } catch (err) {
      console.error('Error processing audio:', err);
      setError('Failed to process audio. Please try again.');
      
      // Update result with error
      setTranscriptions(prev => 
        prev.map(item => 
          item.id === resultId 
            ? { ...item, status: 'error', speech_text: 'Processing failed' }
            : item
        )
      );
      
      setCurrentTranscription('');
    }
  };

  const clearHistory = async () => {
    await clearHistoryFromDatabase();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    });
  };


  if (!isAuthenticated) {
    return (
      <div className="notes-container">
        <header className="notes-header">
          <div className="header-left">
            <Link href="/" className="notes-title">hang.ai</Link>
            <p className="notes-subtitle">voice to LaTeX</p>
          </div>
          <div className="header-right">
            <ThemeToggle />
          </div>
        </header>
        
        <div className="auth-welcome">
          <h2>Voice Transcription</h2>
          <p>Please sign in to use voice transcription features.</p>
          <Link href="/" className="save-btn">
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="notes-container">
      <header className="notes-header">
        <div className="header-left">
          <Link href="/" className="notes-title">hang.ai</Link>
          <p className="notes-subtitle">voice to LaTeX</p>
        </div>
        <div className="header-right">
          <div className="user-info">
            <span className="user-name">{user?.name}</span>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="voice-page-content">
        <div className="voice-controls">
          <h1>🎤 Voice to LaTeX Transcription</h1>
          <p className="voice-description">
            Speak mathematical expressions and get LaTeX output instantly.
          </p>

          <div className="recording-section">
            <div className="recording-controls">
              <button 
                className={`record-btn ${isRecording ? 'recording' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!browserSupport.mediaRecorder || !browserSupport.getUserMedia}
              >
                {isRecording ? (
                  <>
                    🛑 Stop Recording
                  </>
                ) : (
                  <>
                    🎤 Start Recording
                  </>
                )}
              </button>
              
              {transcriptions.length > 0 && (
                <button 
                  className="clear-btn"
                  onClick={clearHistory}
                >
                  🗑️ Clear History
                </button>
              )}
              
            </div>

            {currentTranscription && (
              <div className="current-transcription">
                {currentTranscription}
              </div>
            )}

            {error && (
              <div className="error-message">
                ⚠️ {error}
              </div>
            )}

            {(!browserSupport.mediaRecorder || !browserSupport.getUserMedia) && (
              <div className="error-message">
                ⚠️ Your browser doesn't support audio recording. Please try:
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li>Chrome, Firefox, or Safari (latest versions)</li>
                  <li>Enable microphone permissions</li>
                  <li>Use HTTPS (required for microphone access)</li>
                </ul>
              </div>
            )}

            {browserSupport.mediaRecorder && browserSupport.getUserMedia && browserSupport.supportedMimeTypes.length === 0 && (
              <div className="error-message">
                ⚠️ Limited audio format support detected. Recording may not work properly.
              </div>
            )}

            {backendStatus && (
              <div className={`current-transcription ${backendStatus.includes('❌') ? 'error-message' : ''}`}>
                {backendStatus}
              </div>
            )}
          </div>

          <div className="usage-tips">
            <h3>💡 Tips for better results:</h3>
            <ul>
              <li>Speak clearly and at a moderate pace</li>
              <li>Use mathematical terms: "integral", "derivative", "square root"</li>
              <li>Example: "integral from 0 to pi of x squared dx"</li>
              <li>Example: "derivative of sine x with respect to x"</li>
            </ul>
          </div>
        </div>

        <div className="transcription-results">
          <h2>📋 Transcription History</h2>
          
          {transcriptions.length === 0 ? (
            <div className="empty-state">
              <p>No transcriptions yet. Click "Start Recording" to begin!</p>
            </div>
          ) : (
            <div className="results-list">
              {transcriptions.map((result) => (
                <div key={result.id} className="transcription-item">
                  <div className="transcription-header">
                    <span className="timestamp">{result.timestamp}</span>
                    <div className="header-actions">
                      <button 
                        className={`favorite-btn ${result.is_favorite ? 'favorite-btn-active' : ''}`}
                        onClick={() => toggleFavorite(result.id)}
                        title={result.is_favorite ? "Remove from favorites" : "Add to favorites"}
                        disabled={result.status === 'transcribing' || result.status === 'translating'}
                      >
                        {result.is_favorite ? '★' : '☆'}
                      </button>
                      <button 
                        className="delete-btn"
                        onClick={() => deleteTranscription(result.id)}
                        title="Delete transcription permanently"
                        disabled={result.status === 'transcribing' || result.status === 'translating'}
                      >
                        🗑️
                      </button>
                      <span className={`status status-${result.status}`}>
                        {result.status === 'transcribing' && '🔄 Transcribing...'}
                        {result.status === 'translating' && '🧮 Translating...'}
                        {result.status === 'complete' && '✅ Complete'}
                        {result.status === 'error' && '❌ Error'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="transcription-content">
                    <div className="speech-text">
                      <strong>Speech:</strong> {result.speech_text}
                    </div>
                    
                    {(result.latex || editingTranscription === result.id) && (
                      <div className="latex-output">
                        <div className="latex-header">
                          <strong>LaTeX:</strong>
                          <div className="latex-actions">
                            {editingTranscription === result.id ? (
                              <button 
                                className="save-btn"
                                onClick={() => saveEditedLatex(result.id)}
                                title="Save changes"
                              >
                                Save
                              </button>
                            ) : (
                              <>
                                <button 
                                  className="edit-btn"
                                  onClick={() => startEditingLatex(result.id, result.latex || '')}
                                  title="Edit LaTeX"
                                >
                                  ✏️
                                </button>
                                <button 
                                  className="copy-btn"
                                  onClick={() => copyToClipboard(result.latex!)}
                                  title="Copy LaTeX"
                                >
                                  📋
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {editingTranscription === result.id ? (
                          <div className="latex-edit-container">
                            <textarea
                              className="latex-edit-input"
                              value={editingLatex}
                              onChange={(e) => setEditingLatex(e.target.value)}
                              placeholder="Enter LaTeX expression..."
                              rows={3}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.ctrlKey) {
                                  saveEditedLatex(result.id);
                                } else if (e.key === 'Escape') {
                                  cancelEditingLatex();
                                }
                              }}
                            />
                            <div className="edit-hints">
                              <small>Press Ctrl+Enter or click Save to save, Esc to cancel</small>
                            </div>
                          </div>
                        ) : (
                          <div className="latex-code">
                            <code>{result.latex}</code>
                          </div>
                        )}
                        
                        <div className="latex-preview">
                          <strong>Preview:</strong>
                          <div className="latex-render">
                            <LaTeXRenderer 
                              content={`$${editingTranscription === result.id ? editingLatex : result.latex}$`} 
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
