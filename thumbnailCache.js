/**
 * Thumbnail Cache Module
 * Provides persistent caching for template thumbnails.
 * Uses Vercel Blob Storage in production, falls back to in-memory cache for local development.
 */

let blob = null;
let useVercelBlob = false;

// In-memory fallback cache for local development
const memoryCache = new Map();

/**
 * Initialize the cache
 * Attempts to use Vercel Blob if available, otherwise uses in-memory cache
 */
async function initCache() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      blob = await import('@vercel/blob');
      useVercelBlob = true;
      console.log('Thumbnail cache: Using Vercel Blob Storage');
    } catch (error) {
      console.log('Thumbnail cache: Vercel Blob not available, using in-memory cache');
      useVercelBlob = false;
    }
  } else {
    console.log('Thumbnail cache: No Blob credentials, using in-memory cache');
    useVercelBlob = false;
  }
}

/**
 * Generate a blob path for a product thumbnail
 * @param {string} productId - The product ID
 * @returns {string} Blob path
 */
function getBlobPath(productId) {
  return `thumbnails/${productId}.jpg`;
}

/**
 * Get a thumbnail from cache
 * @param {string} productId - The product ID
 * @returns {Promise<string|null>} Base64 image data URL or null if not cached
 */
async function getThumbnail(productId) {
  const path = getBlobPath(productId);
  
  if (useVercelBlob && blob) {
    try {
      const { list } = blob;
      const result = await list({ prefix: path, limit: 1 });
      
      if (result.blobs.length > 0) {
        const blobUrl = result.blobs[0].url;
        console.log(`Thumbnail cache HIT (Blob): ${productId}`);
        return blobUrl;
      }
    } catch (error) {
      console.error('Error reading from Vercel Blob:', error.message);
    }
  } else {
    const cached = memoryCache.get(productId);
    if (cached) {
      console.log(`Thumbnail cache HIT (memory): ${productId}`);
      return cached;
    }
  }
  
  console.log(`Thumbnail cache MISS: ${productId}`);
  return null;
}

/**
 * Store a thumbnail in cache
 * @param {string} productId - The product ID
 * @param {string} imageData - Base64 image data URL (data:image/jpeg;base64,...)
 * @returns {Promise<string|null>} The blob URL if stored, null on failure
 */
async function setThumbnail(productId, imageData) {
  const path = getBlobPath(productId);
  
  if (useVercelBlob && blob) {
    try {
      const { put } = blob;
      
      // Convert base64 data URL to buffer
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      const result = await put(path, buffer, {
        access: 'public',
        contentType: 'image/jpeg',
        addRandomSuffix: false
      });
      
      console.log(`Thumbnail cached (Vercel Blob): ${productId} -> ${result.url}`);
      return result.url;
    } catch (error) {
      console.error('Error writing to Vercel Blob:', error.message);
      return null;
    }
  } else {
    memoryCache.set(productId, imageData);
    console.log(`Thumbnail cached (memory): ${productId}`);
    return imageData;
  }
}

/**
 * Invalidate a cached thumbnail
 * @param {string} productId - The product ID
 * @returns {Promise<boolean>} Success status
 */
async function invalidateThumbnail(productId) {
  const path = getBlobPath(productId);
  
  if (useVercelBlob && blob) {
    try {
      const { del, list } = blob;
      const result = await list({ prefix: path, limit: 1 });
      
      if (result.blobs.length > 0) {
        await del(result.blobs[0].url);
        console.log(`Thumbnail invalidated (Vercel Blob): ${productId}`);
      }
      return true;
    } catch (error) {
      console.error('Error deleting from Vercel Blob:', error.message);
      return false;
    }
  } else {
    memoryCache.delete(productId);
    console.log(`Thumbnail invalidated (memory): ${productId}`);
    return true;
  }
}

/**
 * Check if cache is using persistent storage
 * @returns {boolean}
 */
function isPersistent() {
  return useVercelBlob;
}

module.exports = {
  initCache,
  getThumbnail,
  setThumbnail,
  invalidateThumbnail,
  isPersistent
};
