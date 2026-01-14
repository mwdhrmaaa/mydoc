/**
 * Sync Storage Utility Module
 * Manages localStorage operations for sync-related data
 */

const STORAGE_KEYS = {
  LAST_SYNC_CODE: 'mydoc_last_sync_code',
  LAST_SYNC_TIME: 'mydoc_last_sync_time',
  SYNC_ENABLED: 'mydoc_sync_enabled'
};

/**
 * Saves the last used sync code to localStorage
 * @param {string} code - The 6-character sync code
 */
export function saveLastSyncCode(code) {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC_CODE, code);
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, new Date().toISOString());
    return true;
  } catch (error) {
    console.error('Failed to save sync code:', error);
    return false;
  }
}

/**
 * Retrieves the last used sync code from localStorage
 * @returns {string|null} The sync code or null if not found
 */
export function getLastSyncCode() {
  try {
    return localStorage.getItem(STORAGE_KEYS.LAST_SYNC_CODE);
  } catch (error) {
    console.error('Failed to retrieve sync code:', error);
    return null;
  }
}

/**
 * Gets the last sync timestamp
 * @returns {Date|null} The last sync date or null
 */
export function getLastSyncTime() {
  try {
    const timestamp = localStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME);
    return timestamp ? new Date(timestamp) : null;
  } catch (error) {
    console.error('Failed to retrieve sync time:', error);
    return null;
  }
}

/**
 * Clears all sync-related data from localStorage
 */
export function clearSyncData() {
  try {
    localStorage.removeItem(STORAGE_KEYS.LAST_SYNC_CODE);
    localStorage.removeItem(STORAGE_KEYS.LAST_SYNC_TIME);
    localStorage.removeItem(STORAGE_KEYS.SYNC_ENABLED);
    return true;
  } catch (error) {
    console.error('Failed to clear sync data:', error);
    return false;
  }
}

/**
 * Validates if a sync code has correct format (6 alphanumeric characters)
 * @param {string} code - The code to validate
 * @returns {boolean} True if valid
 */
export function validateSyncCode(code) {
  if (!code || typeof code !== 'string') return false;
  return /^[a-zA-Z0-9]{6}$/.test(code.trim());
}

/**
 * Formats a timestamp into a human-readable "last synced" string
 * @param {Date} date - The date to format
 * @returns {string} Formatted time string
 */
export function formatLastSyncTime(date) {
  if (!date) return 'Never';
  
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}
