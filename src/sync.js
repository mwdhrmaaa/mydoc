const API_URL = 'https://api.npoint.io';

/**
 * Uploads documents to a JSON bin and returns a unique 6-character code.
 * @param {Array} documents - The list of documents to sync.
 * @returns {Promise<string>} Unique project code.
 */
export async function uploadProject(documents) {
  try {
    const response = await fetch(`${API_URL}/bins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documents)
    });
    const data = await response.json();
    return data.binId.substring(0, 6).toUpperCase();
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}

/**
 * Downloads documents from a JSON bin using a unique code.
 * @param {string} code - The 6-character project code.
 * @returns {Promise<Array>} List of downloaded documents.
 */
export async function downloadProject(code) {
  try {
    const response = await fetch(`${API_URL}/bins/${code.toLowerCase()}`);
    if (!response.ok) throw new Error('Invalid code');
    return await response.json();
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}
