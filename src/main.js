import { storage } from './storage.js';

let currentDocId = null;
let saveTimeout = null;

// DOM Elements
const docList = document.getElementById('doc-list');
const newDocBtn = document.getElementById('new-doc-btn');
const docTitleInput = document.getElementById('doc-title');
const editor = document.getElementById('editor');
const deleteDocBtn = document.getElementById('delete-doc-btn');
const exportBtn = document.getElementById('export-btn');
const wordCountSpan = document.getElementById('word-count');
const charCountSpan = document.getElementById('char-count');
const saveStatus = document.getElementById('save-status');
const docCountSpan = document.getElementById('doc-count');

// Initialize
function init() {
  const docs = storage.getDocuments();
  renderDocList(docs);
  
  if (docs.length > 0) {
    loadDocument(docs[0].id);
  } else {
    createNewDocument();
  }

  // Event Listeners
  newDocBtn.addEventListener('click', createNewDocument);
  docTitleInput.addEventListener('input', () => debounceSave());
  editor.addEventListener('input', () => {
    updateStats();
    debounceSave();
  });
  deleteDocBtn.addEventListener('click', deleteCurrentDocument);
  exportBtn.addEventListener('click', exportToTxt);
}

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
