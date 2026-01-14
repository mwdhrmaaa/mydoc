// Primary: JSONBin.io (more reliable)
// Fallback: npoint.io
const JSONBIN_API = 'https://api.jsonbin.io/v3';
const NPOINT_API = 'https://api.npoint.io';

// Use a public bin for demo purposes (in production, use your own API key)
const USE_JSONBIN = false; // Set to true if you have API key

/**
 * Generates a short unique code from a full ID
 * @param {string} fullId - The full ID from API
 * @returns {string} 6-character uppercase code
 */
function generateShortCode(fullId) {
  // Take last 6 chars and convert to uppercase
  return fullId.slice(-6).toUpperCase();
}

/**
 * Retry logic for fetch requests
 * @param {Function} fetchFn - The fetch function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise} The fetch result
 */
async function retryFetch(fetchFn, maxRetries = 2) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

/**
 * Uploads documents to cloud storage and returns a unique 6-character code.
 * Tries JSONBin first (if enabled), falls back to npoint.
 * @param {Array} documents - The list of documents to sync.
 * @returns {Promise<string>} Unique project code.
 */
export async function uploadProject(documents) {
  const payload = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    documents: documents
  };

  // Try JSONBin first if enabled
  if (USE_JSONBIN) {
    try {
      return await uploadToJsonBin(payload);
    } catch (error) {
      console.warn('JSONBin upload failed, trying fallback:', error);
    }
  }

  // Fallback to npoint
  try {
    return await uploadToNPoint(payload);
  } catch (error) {
    console.error('All upload methods failed:', error);
    throw new Error('Upload failed. Please check your internet connection.');
  }
}

/**
 * Uploads data to JSONBin.io
 * @param {Object} data - The data to upload
 * @returns {Promise<string>} Sync code
 */
async function uploadToJsonBin(data) {
  return retryFetch(async () => {
    const response = await fetch(`${JSONBIN_API}/b`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bin-Private': 'false'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`JSONBin error: ${response.status}`);
    }

    const result = await response.json();
    return generateShortCode(result.metadata.id);
  });
}

/**
 * Uploads data to npoint.io
 * @param {Object} data - The data to upload
 * @returns {Promise<string>} Sync code
 */
async function uploadToNPoint(data) {
  return retryFetch(async () => {
    const response = await fetch(`${NPOINT_API}/bins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`npoint error: ${response.status}`);
    }

    const result = await response.json();
    return generateShortCode(result.binId);
  });
}

/**
 * Downloads documents from cloud storage using a unique code.
 * Tries both JSONBin and npoint until one succeeds.
 * @param {string} code - The 6-character project code.
 * @returns {Promise<Array>} List of downloaded documents.
 */
export async function downloadProject(code) {
  if (!code || code.length !== 6) {
    throw new Error('Invalid code format. Code must be 6 characters.');
  }

  const normalizedCode = code.toLowerCase();
  let lastError;

  // Try JSONBin first if enabled
  if (USE_JSONBIN) {
    try {
      return await downloadFromJsonBin(normalizedCode);
    } catch (error) {
      console.warn('JSONBin download failed, trying npoint:', error);
      lastError = error;
    }
  }

  // Try npoint
  try {
    return await downloadFromNPoint(normalizedCode);
  } catch (error) {
    lastError = error;
  }

  // If both failed
  console.error('All download methods failed:', lastError);
  throw new Error('Invalid code or network error. Please check and try again.');
}

/**
 * Downloads from JSONBin.io
 * @param {string} code - The sync code
 * @returns {Promise<Array>} Documents array
 */
async function downloadFromJsonBin(code) {
  return retryFetch(async () => {
    const response = await fetch(`${JSONBIN_API}/b/${code}`);
    
    if (!response.ok) {
      throw new Error(`JSONBin error: ${response.status}`);
    }

    const result = await response.json();
    const data = result.record || result;
    
    // Handle both old and new format
    return data.documents || data;
  });
}

/**
 * Downloads from npoint.io
 * @param {string} code - The sync code
 * @returns {Promise<Array>} Documents array
 */
async function downloadFromNPoint(code) {
  return retryFetch(async () => {
    const response = await fetch(`${NPOINT_API}/bins/${code}`);
    
    if (!response.ok) {
      throw new Error(`npoint error: ${response.status}`);
    }

    const data = await response.json();
    
    // Handle both old and new format
    return data.documents || data;
  });
}

