// Neuronic Web Clipper — Background Service Worker

const DEFAULT_SERVER = 'http://localhost:8000';

// --- Context menus ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clip-selection',
    title: 'Send selection to Neuronic',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'clip-page',
    title: 'Clip page to Neuronic',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'clip-selection') {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__neuronicGetSelection?.()
      });
      if (result?.result) {
        const { title, markdown } = result.result;
        const note = await apiRequest('POST', '/notes', {
          title: title || `Selection from ${tab.title}`,
          content: markdown,
          type: 'text'
        });
        notify(tab.id, note ? 'Selection saved to Neuronic!' : 'Failed to save selection.');
      }
    } catch (err) {
      console.error('Clip selection error:', err);
      notify(tab.id, 'Failed to clip selection.');
    }
  }

  if (info.menuItemId === 'clip-page') {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__neuronicExtractPage?.()
      });
      if (result?.result) {
        const { title, markdown } = result.result;
        const note = await apiRequest('POST', '/notes', {
          title: title || tab.title,
          content: markdown,
          type: 'text'
        });
        notify(tab.id, note ? 'Page clipped to Neuronic!' : 'Failed to clip page.');
      }
    } catch (err) {
      console.error('Clip page error:', err);
      notify(tab.id, 'Failed to clip page.');
    }
  }
});

// --- Message listener ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'api-request') {
    apiRequest(msg.method, msg.path, msg.body)
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }

  if (msg.type === 'get-page-context') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) return sendResponse({ ok: false });
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => ({
            title: document.title,
            url: location.href,
            excerpt: document.body?.innerText?.slice(0, 200) || ''
          })
        });
        sendResponse({ ok: true, data: result.result });
      } catch {
        sendResponse({ ok: true, data: { title: tabs[0].title, url: tabs[0].url, excerpt: '' } });
      }
    });
    return true;
  }

  if (msg.type === 'toggle-sidebar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'toggle-sidebar' });
      }
    });
  }
});

// --- Keyboard command ---
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-sidebar') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'toggle-sidebar' });
      }
    });
  }
});

// --- API helper ---
async function apiRequest(method, path, body) {
  const { serverUrl, token } = await chrome.storage.local.get(['serverUrl', 'token']);
  const base = serverUrl || DEFAULT_SERVER;

  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
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
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Notify content script ---
function notify(tabId, message) {
  chrome.tabs.sendMessage(tabId, { type: 'notify', message }).catch(() => {});
}
