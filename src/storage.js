// Key used for persisting document data in the browser's LocalStorage.
const STORAGE_KEY = 'mydoc_documents';

export const storage = {
  /**
   * Retrieves all document objects from LocalStorage.
   * @returns {Array} List of document objects.
   */
  getDocuments() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveDocuments(documents) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
  },

  createDocument(title = '', content = '') {
    const docs = this.getDocuments();
    const newDoc = {
      id: crypto.randomUUID(),
      title,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    docs.unshift(newDoc);
    this.saveDocuments(docs);
    return newDoc;
  },

  updateDocument(id, updates) {
    const docs = this.getDocuments();
    const index = docs.findIndex(d => d.id === id);
    if (index !== -1) {
      docs[index] = { 
        ...docs[index], 
        ...updates, 
        updatedAt: new Date().toISOString() 
      };
      this.saveDocuments(docs);
      return docs[index];
    }
    return null;
  },

  deleteDocument(id) {
    const docs = this.getDocuments();
    const filtered = docs.filter(d => d.id !== id);
    this.saveDocuments(filtered);
  }
};
