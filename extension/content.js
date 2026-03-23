// Neuronic Web Clipper — Content Script

// --- Page extraction ---
function extractPageContent() {
  const title = document.title;
  const url = location.href;
  const date = new Date().toISOString().slice(0, 10);

  const clone = document.body.cloneNode(true);
  // Strip non-content elements
  const strip = 'script,style,nav,footer,header,aside,iframe,.ad,.ads,.sidebar,.comments,#comments,[role="banner"],[role="navigation"],[role="complementary"]';
  clone.querySelectorAll(strip).forEach(el => el.remove());

  // Find main content container
  const main = clone.querySelector('article') ||
    clone.querySelector('main') ||
    clone.querySelector('[role="main"]') ||
    clone.querySelector('.post-content,.entry-content,.article-content,.article-body') ||
    clone;

  let markdown = htmlToMarkdown(main).trim();
  // Deduplicate excessive blank lines
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  const header = `> Clipped from [${title}](${url}) on ${date}\n\n`;
  return { title, markdown: header + markdown };
}

// --- Selection extraction ---
function getSelectedMarkdown() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  const frag = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.appendChild(frag);

  const title = `Selection from ${document.title}`;
  const url = location.href;
  const date = new Date().toISOString().slice(0, 10);

  let markdown = htmlToMarkdown(wrapper).trim();
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  const header = `> Clipped from [${document.title}](${url}) on ${date}\n\n`;
  return { title, markdown: header + markdown };
}

// --- HTML to Markdown converter ---
function htmlToMarkdown(element) {
  let result = '';

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = node.tagName.toLowerCase();
    const inner = htmlToMarkdown(node);

    switch (tag) {
      case 'h1': result += `\n\n# ${inner.trim()}\n\n`; break;
      case 'h2': result += `\n\n## ${inner.trim()}\n\n`; break;
      case 'h3': result += `\n\n### ${inner.trim()}\n\n`; break;
      case 'h4': result += `\n\n#### ${inner.trim()}\n\n`; break;
      case 'h5': result += `\n\n##### ${inner.trim()}\n\n`; break;
      case 'h6': result += `\n\n###### ${inner.trim()}\n\n`; break;

      case 'p': result += `\n\n${inner.trim()}\n\n`; break;
      case 'br': result += '\n'; break;
      case 'hr': result += '\n\n---\n\n'; break;

      case 'strong': case 'b': result += `**${inner.trim()}**`; break;
      case 'em': case 'i': result += `*${inner.trim()}*`; break;
      case 'del': case 's': result += `~~${inner.trim()}~~`; break;
      case 'code':
        if (node.parentElement?.tagName.toLowerCase() === 'pre') {
          result += inner;
        } else {
          result += `\`${inner.trim()}\``;
        }
        break;

      case 'pre': {
        const code = node.querySelector('code');
        const lang = code?.className?.match(/language-(\w+)/)?.[1] || '';
        const text = (code || node).textContent;
        result += `\n\n\`\`\`${lang}\n${text.trim()}\n\`\`\`\n\n`;
        break;
      }

      case 'blockquote':
        result += '\n\n' + inner.trim().split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
        break;

      case 'a': {
        const href = node.getAttribute('href');
        if (href) {
          const resolved = resolveUrl(href);
          result += `[${inner.trim()}](${resolved})`;
        } else {
          result += inner;
        }
        break;
      }

      case 'img': {
        const src = node.getAttribute('src');
        const alt = node.getAttribute('alt') || '';
        if (src) {
          result += `![${alt}](${resolveUrl(src)})`;
        }
        break;
      }

      case 'ul':
        result += '\n\n' + convertList(node, false) + '\n\n';
        break;
      case 'ol':
        result += '\n\n' + convertList(node, true) + '\n\n';
        break;
      case 'li':
        result += inner;
        break;

      case 'table':
        result += '\n\n' + convertTable(node) + '\n\n';
        break;

      case 'div': case 'section': case 'span': case 'figure': case 'figcaption':
        result += inner;
        break;

      default:
        result += inner;
    }
  }

  return result;
}

function convertList(ul, ordered, depth = 0) {
  const indent = '  '.repeat(depth);
  let result = '';
  let i = 1;

  for (const li of ul.children) {
    if (li.tagName.toLowerCase() !== 'li') continue;

    const prefix = ordered ? `${i}. ` : '- ';
    let text = '';

    for (const child of li.childNodes) {
      const tag = child.tagName?.toLowerCase();
      if (tag === 'ul') {
        text += '\n' + convertList(child, false, depth + 1);
      } else if (tag === 'ol') {
        text += '\n' + convertList(child, true, depth + 1);
      } else if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent.trim();
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        text += htmlToMarkdown(child).trim();
      }
    }

    result += `${indent}${prefix}${text.trim()}\n`;
    i++;
  }

  return result.trimEnd();
}

function convertTable(table) {
  const rows = table.querySelectorAll('tr');
  if (!rows.length) return '';

  const matrix = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td'))
      .map(c => htmlToMarkdown(c).trim().replace(/\|/g, '\\|'));
    matrix.push(cells);
  }

  const cols = Math.max(...matrix.map(r => r.length));
  const lines = [];

  for (let i = 0; i < matrix.length; i++) {
    const padded = matrix[i].concat(Array(cols).fill('')).slice(0, cols);
    lines.push('| ' + padded.join(' | ') + ' |');
    if (i === 0) {
      lines.push('| ' + Array(cols).fill('---').join(' | ') + ' |');
    }
  }

  return lines.join('\n');
}

function resolveUrl(url) {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

// --- Expose functions for background script ---
window.__neuronicExtractPage = extractPageContent;
window.__neuronicGetSelection = getSelectedMarkdown;

// --- Message listener ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'extract-page') {
    sendResponse(extractPageContent());
  }
  if (msg.type === 'get-selection') {
    sendResponse(getSelectedMarkdown());
  }
  if (msg.type === 'toggle-sidebar') {
    toggleSidebar();
  }
  if (msg.type === 'notify') {
    showNotification(msg.message);
  }
});

// --- Notification toast ---
function showNotification(message) {
  const existing = document.getElementById('neuronic-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'neuronic-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    background: '#1c1c1c',
    color: '#c4a759',
    padding: '12px 20px',
    borderRadius: '6px',
    border: '1px solid #333',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontSize: '14px',
    zIndex: '2147483647',
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    transition: 'opacity 0.3s ease'
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Sidebar ---
let sidebarOpen = false;
let sidebarHost = null;

function toggleSidebar() {
  if (sidebarOpen) {
    closeSidebar();
  } else {
    injectSidebar();
  }
}

function injectSidebar() {
  if (sidebarHost) {
    sidebarHost.style.transform = 'translateX(0)';
    sidebarOpen = true;
    return;
  }

  sidebarHost = document.createElement('div');
  sidebarHost.id = 'neuronic-sidebar-host';
  const shadow = sidebarHost.attachShadow({ mode: 'closed' });

  Object.assign(sidebarHost.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    width: '320px',
    height: '100vh',
    zIndex: '2147483646',
    transition: 'transform 0.25s ease',
    transform: 'translateX(320px)'
  });

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('sidebar/sidebar.html');
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  shadow.appendChild(iframe);

  document.body.appendChild(sidebarHost);

  // Slide in after append
  requestAnimationFrame(() => {
    sidebarHost.style.transform = 'translateX(0)';
  });
  sidebarOpen = true;
}

function closeSidebar() {
  if (sidebarHost) {
    sidebarHost.style.transform = 'translateX(320px)';
    sidebarOpen = false;
  }
}

// Close sidebar on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebarOpen) {
    closeSidebar();
  }
});
