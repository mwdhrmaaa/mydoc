// Primary Backend: npoint.io
const NPOINT_API = 'https://api.npoint.io';

/**
 * Robust ArrayBuffer to Base64 using FileReader
 */
async function bufferToBase64(buffer) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(new Blob([buffer]));
  });
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
 * Utility to compress a string using GZIP
 */
async function compressData(str) {
  if (typeof CompressionStream === 'undefined') return null;

  try {
    const stream = new Blob([str]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const response = new Response(compressedStream);
    const buffer = await response.arrayBuffer();
    return await bufferToBase64(buffer);
  } catch (err) {
    console.error('Compression failed:', err);
    return null;
  }
}

/**
 * Utility to decompress GZIP data from Base64
 */
async function decompressData(data) {
  try {
    const bytes = base64ToArrayBuffer(data);
    const stream = new Blob([bytes]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const response = new Response(decompressedStream);
    return await response.text();
  } catch (err) {
    console.error('Decompression failed:', err);
    throw new Error('Could not read cloud data format.');
  }
}

/**
 * Uploads documents to cloud storage
 */
export async function uploadProject(documents) {
  const jsonStr = JSON.stringify(documents);
  const rawSize = jsonStr.length;
  
  let dataToUpload = jsonStr;
  let isCompressed = false;

  // Only compress if data is meaningful (> 2KB)
  if (rawSize > 2048 && typeof CompressionStream !== 'undefined') {
    const compressed = await compressData(jsonStr);
    if (compressed) {
      dataToUpload = compressed;
      isCompressed = true;
    }
  }

  const payload = {
    version: '1.4',
    timestamp: new Date().toISOString(),
    isCompressed,
    data: dataToUpload
  };

  return retryFetch(async () => {
    const response = await fetch(`${NPOINT_API}/bins`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 413) {
        throw new Error('Document group is too large for the cloud (Limit 128KB). Try deleting some old documents.');
      }
      throw new Error(`Cloud server error (${status}). Please try again later.`);
    }

    const result = await response.json();
    const fullId = result.binId || result.id;
    return fullId.slice(-6).toUpperCase();
  });
}

/**
 * Downloads documents using a code
 */
export async function downloadProject(code) {
  if (!code || code.length !== 6) throw new Error('Code must be 6 characters.');
  
  return retryFetch(async () => {
    const response = await fetch(`${NPOINT_API}/bins/${code.toLowerCase()}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(response.status === 404 ? 'Invalid or expired code.' : 'Cloud server issue.');
    }

    const payload = await response.json();
    return await processDownload(payload);
  });
}

/**
 * Process downloaded data (Array or Compressed Object)
 */
async function processDownload(payload) {
  if (!payload) return [];
  
  // Retro-compatibility with older formats
  if (Array.isArray(payload)) return payload;
  if (payload.documents && Array.isArray(payload.documents)) return payload.documents;
  
  // Modern compressed/wrapped format
  if (payload.data) {
    if (payload.isCompressed) {
      const decompressed = await decompressData(payload.data);
      return JSON.parse(decompressed);
    }
    return JSON.parse(payload.data);
  }
  
  return [];
}

/**
 * Retry utility
 */
async function retryFetch(fetchFn, maxRetries = 2) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastError;
}



