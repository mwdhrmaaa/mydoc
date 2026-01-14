// Primary: JSONBin.io (more reliable)
// Fallback: npoint.io
const JSONBIN_API = 'https://api.jsonbin.io/v3';
const NPOINT_API = 'https://api.npoint.io';

// Use a public bin for demo purposes (in production, use your own API key)
const USE_JSONBIN = false; // Set to true if you have API key

/**
 * Utility to compress a string using GZIP
 * @param {string} str - String to compress
 * @returns {Promise<string>} Base64 encoded compressed data
 */
async function compressData(str) {
  const stream = new Blob([str]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
  const chunks = [];
  const reader = compressedStream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const blob = new Blob(chunks);
  const buffer = await blob.arrayBuffer();
  // Convert ArrayBuffer to Base64
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Utility to decompress GZIP data from Base64
 * @param {string} base64 - Base64 encoded compressed data
 * @returns {Promise<string>} Decompressed string
 */
async function decompressData(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const stream = new Blob([bytes]).stream();
  const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
  const response = new Response(decompressedStream);
  return await response.text();
}

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
  try {
    const jsonStr = JSON.stringify(documents);
    const compressed = await compressData(jsonStr);
    
    const payload = {
      version: '1.2', // Internal version bumped for compression
      isCompressed: true,
      timestamp: new Date().toISOString(),
      data: compressed
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
      // Provide more specific error message based on the actual error
      const errorMessage = error.message.includes('npoint error') 
        ? `Cloud API Error: ${error.message}. Payload might still be too large or server is down.`
        : `Upload failed: ${error.message}. Please check your connection.`;
      throw new Error(errorMessage);
    }
  } catch (err) {
    console.error('Compression or Upload failed:', err);
    throw err;
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
      return await processDownload(await downloadFromJsonBin(normalizedCode));
    } catch (error) {
      console.warn('JSONBin download failed, trying npoint:', error);
      lastError = error;
    }
  }

  // Try npoint
  try {
    return await processDownload(await downloadFromNPoint(normalizedCode));
  } catch (error) {
    lastError = error;
  }

  // If both failed
  console.error('All download methods failed:', lastError);
  throw new Error('Invalid code or network error. Please check and try again.');
}

/**
 * Processes downloaded payload, handles decompression if needed.
 * @param {Object} payload - The downloaded data
 * @returns {Promise<Array>} List of documents
 */
async function processDownload(payload) {
  if (!payload) return [];
  
  // If it's a legacy array (uncompressed)
  if (Array.isArray(payload)) return payload;
  
  // If it's a legacy object with documents field
  if (payload.documents && Array.isArray(payload.documents)) return payload.documents;
  
  // Handle compressed format
  if (payload.isCompressed && payload.data) {
    try {
      const decompressed = await decompressData(payload.data);
      return JSON.parse(decompressed);
    } catch (err) {
      console.error('Decompression failed:', err);
      throw new Error('Failed to decompress data. The code might be corrupted.');
    }
  }
  
  return [];
}

/**
 * Downloads from JSONBin.io
 * @param {string} code - The sync code
 * @returns {Promise<Object>} Response payload
 */
async function downloadFromJsonBin(code) {
  return retryFetch(async () => {
    const response = await fetch(`${JSONBIN_API}/b/${code}`);
    
    if (!response.ok) {
      throw new Error(`JSONBin error: ${response.status}`);
    }

    const result = await response.json();
    return result.record || result;
  });
}

/**
 * Downloads from npoint.io
 * @param {string} code - The sync code
 * @returns {Promise<Object>} Response payload
 */
async function downloadFromNPoint(code) {
  return retryFetch(async () => {
    const response = await fetch(`${NPOINT_API}/bins/${code}`);
    
    if (!response.ok) {
      throw new Error(`npoint error: ${response.status}`);
    }

    return await response.json();
  });
}

