// Neuronic Web Clipper — Sidebar

const DEFAULT_SERVER = 'http://localhost:8000';

const loadingEl = document.getElementById('loading');
const contentEl = document.getElementById('content');
const pageInfoEl = document.getElementById('page-info');
const resultsEl = document.getElementById('results');
const noAuthEl = document.getElementById('no-auth');
const noResultsEl = document.getElementById('no-results');
const closeBtn = document.getElementById('close-btn');

// Close button
closeBtn.addEventListener('click', () => {
  // Tell parent content script to close
  window.parent.postMessage({ type: 'neuronic-close-sidebar' }, '*');
  // Also try via chrome runtime
  chrome.runtime.sendMessage({ type: 'toggle-sidebar' });
});

// Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    chrome.runtime.sendMessage({ type: 'toggle-sidebar' });
  }
});

// Init
init();

async function init() {
  const { token, serverUrl } = await chrome.storage.local.get(['token', 'serverUrl']);

  if (!token) {
    loadingEl.classList.add('hidden');
    noAuthEl.classList.remove('hidden');
    return;
  }

  // Get page context
  try {
    const pageContext = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'get-page-context' }, (res) => {
        if (res?.ok) resolve(res.data);
        else reject(new Error('Could not get page context'));
      });
    });

    const query = (pageContext.title + ' ' + pageContext.excerpt).slice(0, 200);
    pageInfoEl.textContent = pageContext.title || pageContext.url;

    // Search for related notes
    const base = serverUrl || DEFAULT_SERVER;
    const res = await fetch(`${base}/search/hybrid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query, limit: 8 })
    });

    if (!res.ok) {
      if (res.status === 401) {
        loadingEl.classList.add('hidden');
        noAuthEl.classList.remove('hidden');
        return;
      }
      throw new Error('Search failed');
    }

    const data = await res.json();
    loadingEl.classList.add('hidden');

    if (!data.results?.length) {
      noResultsEl.classList.remove('hidden');
      return;
    }

    renderResults(data.results);
    contentEl.classList.remove('hidden');
  } catch (err) {
    console.error('Sidebar error:', err);
    loadingEl.classList.add('hidden');
    noResultsEl.classList.remove('hidden');
  }
}

function renderResults(results) {
  resultsEl.innerHTML = results.map(r => {
    const badgeClass = r.match_type === 'both' ? 'badge-both' :
      r.match_type === 'semantic' ? 'badge-semantic' : 'badge-keyword';

    const href = r.source === 'note'
      ? `http://localhost:5173/notes/${r.id}`
      : '#';

    return `
      <a class="result-item" href="${href}" target="_blank" rel="noopener">
        <div class="result-title">${escapeHtml(r.title)}</div>
        <div class="result-preview">${escapeHtml(r.preview || '')}</div>
        <div class="result-meta">
          <span class="badge ${badgeClass}">${r.match_type}</span>
          <span class="badge badge-keyword">${r.source}</span>
        </div>
      </a>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
