// Neuronic Web Clipper — Popup (Zotero-style auto-clip to Library)

const $ = (sel) => document.querySelector(sel);
const DEFAULT_SERVER = 'http://localhost:8000';

// Views
const viewLoading = $('#view-loading');
const viewLogin = $('#view-login');
const viewSaving = $('#view-saving');
const viewSaved = $('#view-saved');
const viewError = $('#view-error');

// Login elements
const loginForm = $('#login-form');
const emailInput = $('#email');
const passwordInput = $('#password');
const serverUrlInput = $('#server-url');
const loginBtn = $('#login-btn');
const loginError = $('#login-error');

// Saved elements
const savedTitle = $('#saved-title');
const savedSubtitle = $('#saved-subtitle');
const folderSelect = $('#folder-select');
const doneBtn = $('#done-btn');

// Error elements
const errorDetail = $('#error-detail');
const retryBtn = $('#retry-btn');

// State
let token = null;
let serverUrl = DEFAULT_SERVER;
let savedFileId = null;
let allFolders = [];
let dismissTimer = null;

// --- Init ---
init();

async function init() {
  const stored = await chrome.storage.local.get(['token', 'serverUrl', 'lastFolderId']);
  token = stored.token;
  serverUrl = stored.serverUrl || DEFAULT_SERVER;
  serverUrlInput.value = serverUrl;

  if (token) {
    try {
      await apiRequest('GET', '/auth/me');
      startClip(stored.lastFolderId);
    } catch {
      showLogin();
    }
  } else {
    showLogin();
  }
}

// --- Views ---
function showView(view) {
  [viewLoading, viewLogin, viewSaving, viewSaved, viewError].forEach(v =>
    v.classList.add('hidden')
  );
  view.classList.remove('hidden');
}

function showLogin() {
  token = null;
  chrome.storage.local.remove(['token']);
  showView(viewLogin);
  emailInput.focus();
}

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Connecting...';

  serverUrl = serverUrlInput.value.replace(/\/+$/, '') || DEFAULT_SERVER;

  try {
    const data = await apiRequest('POST', '/auth/login', {
      email: emailInput.value,
      password: passwordInput.value
    });

    token = data.access_token;
    await chrome.storage.local.set({ token, serverUrl });

    const stored = await chrome.storage.local.get(['lastFolderId']);
    startClip(stored.lastFolderId);
  } catch (err) {
    loginError.textContent = err.message || 'Connection failed';
    loginError.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Connect';
  }
});

// --- Clip flow ---
async function startClip(lastFolderId) {
  showView(viewSaving);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab.url;

    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      throw new Error('Cannot clip this page');
    }

    // Import URL to library + fetch folders in parallel
    const importBody = { url };
    if (lastFolderId) {
      importBody.folder_id = lastFolderId;
    }

    const [file, folders] = await Promise.all([
      apiRequest('POST', '/files/import-url', importBody),
      apiRequest('GET', '/notes/folders')
    ]);

    savedFileId = file.id;
    allFolders = folders;

    showSaved(file.original_name || tab.title, lastFolderId);
  } catch (err) {
    showError(err.message || 'Failed to save page');
  }
}

function showSaved(title, lastFolderId) {
  savedTitle.textContent = title;
  updateSubtitle(lastFolderId);

  // Populate folder dropdown
  folderSelect.innerHTML = '<option value="">No folder</option>';
  for (const f of allFolders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    if (lastFolderId && f.id === lastFolderId) opt.selected = true;
    folderSelect.appendChild(opt);
  }

  showView(viewSaved);
  startDismissTimer();
}

function updateSubtitle(folderId) {
  if (folderId) {
    const folder = allFolders.find(f => f.id === folderId);
    savedSubtitle.textContent = folder ? `Saved to ${folder.name}` : 'Saved to Library';
  } else {
    savedSubtitle.textContent = 'Saved to Library';
  }
}

function showError(message) {
  errorDetail.textContent = message;
  showView(viewError);
}

// --- Retry ---
retryBtn.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(['lastFolderId']);
  startClip(stored.lastFolderId);
});

// --- Folder picker ---
folderSelect.addEventListener('change', async () => {
  const folderId = folderSelect.value ? parseInt(folderSelect.value) : 0;
  updateSubtitle(folderId || null);
  resetDismissTimer();

  try {
    await apiRequest('PATCH', `/files/${savedFileId}`, { folder_id: folderId });
    if (folderId) {
      await chrome.storage.local.set({ lastFolderId: folderId });
    } else {
      await chrome.storage.local.remove(['lastFolderId']);
    }
  } catch {
    // Silently fail — folder update is best-effort
  }
});

// --- Auto-dismiss ---
function startDismissTimer() {
  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => window.close(), 3000);
}

function resetDismissTimer() {
  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => window.close(), 3000);
}

function pauseDismissTimer() {
  clearTimeout(dismissTimer);
}

document.body.addEventListener('mouseenter', pauseDismissTimer);
document.body.addEventListener('mouseleave', resetDismissTimer);

folderSelect.addEventListener('focus', pauseDismissTimer);
folderSelect.addEventListener('blur', resetDismissTimer);

// --- Done ---
doneBtn.addEventListener('click', () => window.close());

// --- API helper ---
async function apiRequest(method, path, body) {
  const base = serverUrl || DEFAULT_SERVER;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (token) {
    opts.headers['Authorization'] = `Bearer ${token}`;
  }
  if (body) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${base}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    let message = err.detail;
    if (typeof message !== 'string') {
      message = Array.isArray(message)
        ? message.map(e => e.msg || JSON.stringify(e)).join(', ')
        : JSON.stringify(message);
    }
    throw new Error(message || `HTTP ${res.status}`);
  }
  return res.json();
}
