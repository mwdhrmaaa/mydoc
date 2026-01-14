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
  if (typeof CompressionStream === 'undefined') {
    console.warn('CompressionStream not supported. Sending uncompressed.');
    return str;
  }

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
  
  // Robust Base64 conversion for large files
  return arrayBufferToBase64(buffer);
}

/**
 * Utility to decompress GZIP data from Base64
 * @param {string} data - Data to decompress
 * @param {boolean} isCompressed - Whether the data is actually compressed
 * @returns {Promise<string>} Decompressed string
 */
async function decompressData(data, isCompressed) {
  if (!isCompressed) return data;
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support decompression. Update your browser.');
  }

  const bytes = base64ToArrayBuffer(data);
  const stream = new Blob([bytes]).stream();
  const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
  const response = new Response(decompressedStream);
  return await response.text();
}

/**
 * Robust ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Robust Base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates a short unique code from a full ID
 * @param {string} fullId - The full ID from API
 * @returns {string} 6-character uppercase code
 */
function generateShortCode(fullId) {
  return fullId.slice(-6).toUpperCase();
}

/**
 * Retry logic for fetch requests
 */
async function retryFetch(fetchFn, maxRetries = 2) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Uploads documents to cloud storage and returns a unique 6-character code.
 */
export async function uploadProject(documents) {
  try {
    const jsonStr = JSON.stringify(documents);
    const rawSize = (jsonStr.length / 1024).toFixed(1);
    
    let dataToUpload = jsonStr;
    let isCompressed = false;

    if (typeof CompressionStream !== 'undefined') {
      dataToUpload = await compressData(jsonStr);
      isCompressed = true;
    }
    
    const compressedSize = (dataToUpload.length / 1024).toFixed(1);
    console.log(`Sync Size: ${rawSize}KB -> ${compressedSize}KB (Compressed: ${isCompressed})`);

    const payload = {
      version: '1.3', 
      isCompressed,
      timestamp: new Date().toISOString(),
      data: dataToUpload,
      _debug: { rawSize, compressedSize }
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
       // Detailed 413 check
      if (error.message.includes('413')) {
        throw new Error(`Data is too large (${compressedSize}KB). Even with compression, it exceeds the cloud server limit of 128KB.`);
      }
      throw error;
    }
  } catch (err) {
    console.error('Upload failed:', err);
    throw err;
  }
}

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
    if (!response.ok) throw new Error(`JSONBin error: ${response.status}`);
    const result = await response.json();
    return generateShortCode(result.metadata.id);
  });
}

async function uploadToNPoint(data) {
  return retryFetch(async () => {
    const response = await fetch(`${NPOINT_API}/bins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`npoint error: ${response.status}`);
    const result = await response.json();
    return generateShortCode(result.binId);
  });
}

/**
 * Downloads documents from cloud storage using a unique code.
 */
export async function downloadProject(code) {
  if (!code || code.length !== 6) throw new Error('Invalid code format.');
  const normalizedCode = code.toLowerCase();

  // Try JSONBin
  if (USE_JSONBIN) {
    try {
      return await processDownload(await downloadFromJsonBin(normalizedCode));
    } catch (e) {}
  }

  // Try npoint
  try {
    return await processDownload(await downloadFromNPoint(normalizedCode));
  } catch (err) {
    throw new Error('Invalid code or cloud server issue.');
  }
}

async function processDownload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload.documents && Array.isArray(payload.documents)) return payload.documents;
  
  if (payload.data) {
    try {
      const decompressed = await decompressData(payload.data, payload.isCompressed);
      return JSON.parse(decompressed);
    } catch (err) {
      throw new Error('Failed to decompress data.');
    }
  }
  return [];
}

async function downloadFromJsonBin(code) {
  return retryFetch(async () => {
    const response = await fetch(`${JSONBIN_API}/b/${code}`);
    if (!response.ok) throw new Error(`JSONBin error: ${response.status}`);
    const result = await response.json();
    return result.record || result;
  });
}

async function downloadFromNPoint(code) {
  return retryFetch(async () => {
    const response = await fetch(`${NPOINT_API}/bins/${code}`);
    if (!response.ok) throw new Error(`npoint error: ${response.status}`);
    return await response.json();
  });
}


