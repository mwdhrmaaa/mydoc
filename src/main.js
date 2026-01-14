import { storage } from './storage.js';
import { uploadProject, downloadProject } from './sync.js';
import { 
  saveLastSyncCode, 
  getLastSyncCode, 
  getLastSyncTime, 
  validateSyncCode,
  formatLastSyncTime 
} from './sync-storage.js';

let currentDocId = null; // Currently active document ID
let saveTimeout = null; // Timeout for auto-save debouncing
let isFocusMode = false; // Whether focus mode is active
let isTypewriterMode = false; // Whether typewriter mode is active

// DOM Elements
const docList = document.getElementById('doc-list');
const newDocBtn = document.getElementById('new-doc-btn');
const docTitleInput = document.getElementById('doc-title');
const editor = document.getElementById('editor');
const deleteDocBtn = document.getElementById('delete-doc-btn');
const exportBtn = document.getElementById('export-btn');
const wordCountSpan = document.getElementById('word-count');
const charCountSpan = document.getElementById('char-count');
const readingTimeSpan = document.getElementById('reading-time');
const saveStatus = document.getElementById('save-status');
const docCountSpan = document.getElementById('doc-count');
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const focusModeBtn = document.getElementById('focus-mode-btn');
const typewriterModeBtn = document.getElementById('typewriter-mode-btn');

// Sync Elements
const syncCodeInput = document.getElementById('sync-code');
const syncUploadBtn = document.getElementById('sync-upload-btn');
const syncDownloadBtn = document.getElementById('sync-download-btn');

// Toast Notification System
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 100);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Initialize
/**
 * Initializes the application, loads documents, and sets up event listeners.
 */
function init() {
  const docs = storage.getDocuments();
  renderDocList(docs);
  
  if (docs.length > 0) {
    loadDocument(docs[0].id);
  } else {
    createNewDocument();
  }

  // Load last sync code if available
  const lastCode = getLastSyncCode();
  if (lastCode) {
    syncCodeInput.value = lastCode;
    const lastTime = getLastSyncTime();
    if (lastTime) {
      syncCodeInput.placeholder = `Last synced: ${formatLastSyncTime(lastTime)}`;
    }
  }

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('Service Worker Registered'))
      .catch((err) => console.log('Service Worker Failed:', err));
  }

  // Event Listeners
  newDocBtn.addEventListener('click', createNewDocument);
  docTitleInput.addEventListener('input', () => debounceSave());
  editor.addEventListener('input', () => {
    updateStats();
    debounceSave();
    if (isTypewriterMode) centerCursor();
  });
  
  deleteDocBtn.addEventListener('click', deleteCurrentDocument);
  exportBtn.addEventListener('click', exportToTxt);
  
  toggleSidebarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('collapsed');
  });

  // Close sidebar on item click for mobile
  docList.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && e.target.closest('.doc-item')) {
      sidebar.classList.add('collapsed');
    }
  });

  // Close sidebar clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        !sidebar.classList.contains('collapsed') && 
        !sidebar.contains(e.target)) {
      sidebar.classList.add('collapsed');
    }
  });

  focusModeBtn.addEventListener('click', () => {
    isFocusMode = !isFocusMode;
    document.body.classList.toggle('focus-mode', isFocusMode);
    focusModeBtn.classList.toggle('active', isFocusMode);
  });

  typewriterModeBtn.addEventListener('click', () => {
    isTypewriterMode = !isTypewriterMode;
    typewriterModeBtn.classList.toggle('active', isTypewriterMode);
  });

  // Sync Logic
  async function triggerAutoSync(silent = false) {
    const docs = storage.getDocuments();
    if (docs.length === 0) return;
    
    syncUploadBtn.disabled = true;
    syncUploadBtn.classList.add('loading');
    if (!silent) showToast('Uploading project...', 'info');
    
    try {
      const code = await uploadProject(docs);
      syncCodeInput.value = code;
      saveLastSyncCode(code);
      updateSyncLinkField(code); // Update link field
      
      if (!silent) showToast(`✓ Uploaded! Code: ${code}`, 'success');
      
      // Auto-copy to clipboard only if manual or specifically needed
      if (!silent && navigator.clipboard) {
        navigator.clipboard.writeText(code).catch(() => {});
      }
    } catch (err) {
      if (!silent) showToast(err.message || 'Upload failed.', 'error');
      console.error('Auto-sync error:', err);
    } finally {
      syncUploadBtn.disabled = false;
      syncUploadBtn.classList.remove('loading');
    }
  }

  syncUploadBtn.addEventListener('click', () => triggerAutoSync(false));

  syncDownloadBtn.addEventListener('click', async () => {
    const code = syncCodeInput.value.trim();
    
    if (!code) {
      showToast('Please enter a project code.', 'warning');
      syncCodeInput.focus();
      return;
    }

    if (!validateSyncCode(code)) {
      showToast('Invalid code format. Must be 6 characters.', 'error');
      return;
    }

    const localDocs = storage.getDocuments();
    if (localDocs.length > 0) {
      if (!confirm('This will merge cloud documents with your current ones. Continue?')) {
        return;
      }
    }

    syncDownloadBtn.disabled = true;
    syncDownloadBtn.classList.add('loading');
    showToast('Downloading project...', 'info');

    try {
      const cloudDocs = await downloadProject(code);
      
      // Simple merge by ID
      const merged = [...cloudDocs];
      localDocs.forEach(local => {
        if (!merged.find(m => m.id === local.id)) {
          merged.push(local);
        }
      });

      storage.saveDocuments(merged);
      saveLastSyncCode(code);
      updateSyncLinkField(code); // Update link field
      renderDocList(merged);
      if (merged.length > 0) loadDocument(merged[0].id);
      
      showToast(`✓ Synced ${cloudDocs.length} document(s)!`, 'success');
    } catch (err) {
      showToast(err.message || 'Download failed. Check code and connection.', 'error');
      console.error('Download error:', err);
    } finally {
      syncDownloadBtn.disabled = false;
      syncDownloadBtn.classList.remove('loading');
    }
  });

  syncCodeInput.addEventListener('input', (e) => {
    updateSyncLinkField(e.target.value);
  });

  const syncCopyLinkBtn = document.getElementById('sync-copy-link-btn');
  syncCopyLinkBtn.addEventListener('click', () => {
    const linkField = document.getElementById('sync-link-field');
    const link = linkField ? linkField.value : '';
    
    if (!link) {
      showToast('No sync link available to copy.', 'warning');
      return;
    }
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link)
        .then(() => showToast(`✓ Sync link copied!`, 'success'))
        .catch(() => showToast('Failed to copy link.', 'error'));
    }
  });

  /**
   * Updates the read-only sync link field based on current code
   */
  function updateSyncLinkField(code) {
    const linkField = document.getElementById('sync-link-field');
    if (!linkField) return;
    
    if (code && code.trim().length === 6) {
      const link = `${window.location.origin}${window.location.pathname}?sync=${code.trim().toUpperCase()}`;
      linkField.value = link;
    } else {
      linkField.value = '';
    }
  }

  // Initial link field update
  updateSyncLinkField(syncCodeInput.value);

  handleDeepLink();
}

/**
 * Renders the list of documents in the sidebar.
 * @param {Array} docs - Array of document objects to display.
 */
function renderDocList(docs) {
  docList.innerHTML = '';
  docs.forEach(doc => {
    const div = document.createElement('div');
    div.className = `doc-item ${doc.id === currentDocId ? 'active' : ''}`;
    div.innerHTML = `
      <span class="doc-item-title">${doc.title || 'Untitled'}</span>
      <span class="doc-item-date">${new Date(doc.updatedAt).toLocaleDateString()}</span>
    `;
    div.onclick = () => loadDocument(doc.id);
    docList.appendChild(div);
  });
  docCountSpan.textContent = `${docs.length} document${docs.length !== 1 ? 's' : ''}`;
}

/**
 * Loads a specific document into the editor.
 * @param {string} id - The unique ID of the document to load.
 */
function loadDocument(id) {
  const docs = storage.getDocuments();
  const doc = docs.find(d => d.id === id);
  if (!doc) return;

  currentDocId = id;
  docTitleInput.value = doc.title;
  editor.value = doc.content;
  
  updateStats();
  renderDocList(docs);
  saveStatus.textContent = 'Saved';
}

function createNewDocument() {
  const newDoc = storage.createDocument('', '');
  currentDocId = newDoc.id;
  loadDocument(newDoc.id);
  docTitleInput.focus();
  
  // Auto-sync after short delay to ensure doc is saved
  setTimeout(() => {
    const syncUploadBtn = document.getElementById('sync-upload-btn');
    if (syncUploadBtn) syncUploadBtn.click(); // Simple way to trigger the logic
  }, 500);
}

function deleteCurrentDocument() {
  if (!currentDocId) return;
  if (!confirm('Are you sure you want to delete this document?')) return;

  storage.deleteDocument(currentDocId);
  const docs = storage.getDocuments();
  
  if (docs.length > 0) {
    loadDocument(docs[0].id);
  } else {
    createNewDocument();
  }
}

function debounceSave() {
  saveStatus.textContent = 'Saving...';
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveDocument, 1000);
}

function saveDocument() {
  if (!currentDocId) return;
  
  storage.updateDocument(currentDocId, {
    title: docTitleInput.value,
    content: editor.value
  });
  
  saveStatus.textContent = 'Saved';
  const docs = storage.getDocuments();
  renderDocList(docs);
}

function updateStats() {
  const text = editor.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = text.length;
  
  wordCountSpan.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  charCountSpan.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
  
  // Calculate reading time (avg 200 wpm)
  const minutes = Math.ceil(words / 200);
  readingTimeSpan.textContent = `${minutes} min read`;
}

/**
 * Handles automatic sync from URL parameter ?sync=CODE
 */
async function handleDeepLink() {
  const urlParams = new URLSearchParams(window.location.search);
  const syncCode = urlParams.get('sync');
  
  if (syncCode && syncCode.length === 6) {
    const code = syncCode.toUpperCase();
    const syncCodeInput = document.getElementById('sync-code');
    const syncDownloadBtn = document.getElementById('sync-download-btn');
    
    if (syncCodeInput) syncCodeInput.value = code;
    
    // Smooth delay to let the app load first
    setTimeout(async () => {
      showToast(`Auto-syncing from link: ${code}...`, 'info');
      try {
        if (syncDownloadBtn) {
          syncDownloadBtn.disabled = true;
          syncDownloadBtn.classList.add('loading');
        }

        const cloudDocs = await downloadProject(code);
        
        if (cloudDocs && cloudDocs.length > 0) {
          const localDocs = storage.getDocuments();
          
          // Simple merge by ID
          const merged = [...cloudDocs];
          localDocs.forEach(local => {
            if (!merged.find(m => m.id === local.id)) {
              merged.push(local);
            }
          });
          
          storage.saveDocuments(merged);
          saveLastSyncCode(code);
          renderDocList(merged);
          loadDocument(merged[0].id);
          
          showToast(`✓ Auto-synced ${cloudDocs.length} document(s)!`, 'success');
          
          // Clear query param from URL without refreshing
          const newUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        } else {
          showToast('Project is empty or invalid.', 'warning');
        }
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        if (syncDownloadBtn) {
          syncDownloadBtn.disabled = false;
          syncDownloadBtn.classList.remove('loading');
        }
      }
    }, 1000);
  }
}

function centerCursor() {
  const wrapper = document.querySelector('.editor-content-wrapper');
  const lineHeight = parseInt(window.getComputedStyle(editor).lineHeight);
  const cursorPosition = editor.selectionStart;
  const textBeforeCursor = editor.value.substring(0, cursorPosition);
  const linesBeforeCursor = textBeforeCursor.split('\n').length;
  
  const targetScroll = (linesBeforeCursor * lineHeight) - (wrapper.clientHeight / 2);
  wrapper.scrollTo({
    top: targetScroll,
    behavior: 'smooth'
  });
}

function exportToTxt() {
  const title = docTitleInput.value || 'Untitled';
  const content = editor.value;
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', init);
