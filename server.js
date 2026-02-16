/**
 * XMPie Template Customizer - Server
 * 
 * Express server that provides API endpoints for generating previews and PDFs
 * using the XMPie uProduce API. Supports multiple templates via products.json.
 * 
 * @author XMPie
 * @version 1.0.0
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const sanitizeHtml = require('sanitize-html');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const thumbnailCache = require('./thumbnailCache');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// Rate limiting store (in-memory, resets on restart)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // Max requests per window per IP
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Purge expired entries every 5 minutes

// Periodic cleanup to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore) {
    if (now > record.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL_MS).unref();

/**
 * Simple rate limiter middleware
 * Limits requests per IP to prevent API abuse
 */
function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  
  const record = rateLimitStore.get(ip);
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
    return next();
  }
  
  record.count++;
  
  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    console.warn(`Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({ 
      error: 'Too many requests', 
      message: 'Please wait before making more requests',
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    });
  }
  
  next();
}

/**
 * Input sanitizer - removes potentially dangerous characters
 */
function sanitizeInput(value) {
  if (typeof value !== 'string') return value;
  // Strip all HTML tags and trim to max length
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {}
  }).trim().substring(0, 500);
}

/**
 * Sanitize all string values in an object
 */
function sanitizeFormData(data) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    sanitized[key] = sanitizeInput(value);
  }
  return sanitized;
}

/**
 * Validate that productId exists in configuration
 */
function validateProductId(productId) {
  if (!productId || typeof productId !== 'string') return false;
  return productsConfig.products.some(p => p.id === productId);
}

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : (process.env.NODE_ENV === 'production' ? false : true),
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' })); // Limit request body size

// Static asset cache busting: compute content hashes at startup
const publicDir = path.join(__dirname, 'public');
const assetHashes = {};
const HASHED_ASSETS = ['app.js', 'styles.css'];

HASHED_ASSETS.forEach(filename => {
  try {
    const content = fs.readFileSync(path.join(publicDir, filename));
    const hash = crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    assetHashes[filename] = `${base}.${hash}${ext}`;
  } catch (err) {
    console.warn(`Cache busting: could not hash ${filename}:`, err.message);
  }
});
console.log('Asset hashes:', assetHashes);

// Rewrite hashed filenames back to original files
app.use((req, res, next) => {
  for (const [original, hashed] of Object.entries(assetHashes)) {
    if (req.path === `/${hashed}`) {
      // Long-lived cache for hashed assets (1 year)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      req.url = `/${original}`;
      break;
    }
  }
  next();
});

app.use(express.static(publicDir, {
  // Short cache for non-hashed static files (e.g. images, favicon)
  maxAge: '1h',
  // index.html is served via the explicit route below, not here
  index: false
}));
app.use(rateLimiter); // Apply rate limiting to all routes

// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.public.blob.vercel-storage.com", "https://www.xmpie.com"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  xXssProtection: false
}));

// Validate required environment variables at startup
const REQUIRED_ENV_VARS = ['UPRODUCE_API_URL', 'UPRODUCE_USERNAME', 'UPRODUCE_PASSWORD'];
const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('See .env.example for required configuration.');
  process.exit(1);
}

// uProduce API configuration
const UPRODUCE_API_URL = process.env.UPRODUCE_API_URL;
const AUTH = {
  username: process.env.UPRODUCE_USERNAME,
  password: process.env.UPRODUCE_PASSWORD
};

// Pre-configured axios instance with timeout for all uProduce API calls
const UPRODUCE_TIMEOUT_MS = 55000; // 55s (under Vercel's 60s function limit)
const uproduceClient = axios.create({
  baseURL: UPRODUCE_API_URL,
  timeout: UPRODUCE_TIMEOUT_MS,
  auth: AUTH
});

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

const circuitBreaker = {
  state: 'CLOSED',       // CLOSED = normal, OPEN = fast-fail, HALF_OPEN = testing
  failureCount: 0,
  failureThreshold: 5,   // Open after 5 consecutive failures
  resetTimeout: 30000,   // Try again after 30 seconds
  lastFailureTime: 0,

  /**
   * Record a successful API call
   */
  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  },

  /**
   * Record a failed API call
   */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`Circuit breaker OPEN after ${this.failureCount} consecutive failures`);
    }
  },

  /**
   * Check if requests should be allowed through
   * @returns {boolean}
   */
  canRequest() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        console.log('Circuit breaker HALF_OPEN — allowing test request');
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow one request through to test
    return true;
  }
};

// Load products configuration
let productsConfig = { products: [] };
try {
  const productsData = fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8');
  productsConfig = JSON.parse(productsData);
  console.log(`Loaded ${productsConfig.products.length} product(s) from products.json`);
} catch (error) {
  console.error('Error loading products.json:', error.message);
  console.log('Using empty products configuration');
}

/**
 * Get product configuration by ID
 */
function getProductById(productId) {
  return productsConfig.products.find(p => p.id === productId);
}

/**
 * Generate job ticket for preview (JPG) or print (PDF)
 */
function generateJobTicket(formData, jobType = 'Proof') {
  // Get product configuration
  const product = getProductById(formData.productId);
  if (!product) {
    throw new Error(`Product not found: ${formData.productId}`);
  }

  // Select document ID based on page size
  const sizeConfig = product.sizes.find(s => s.name === formData.pageSize);
  if (!sizeConfig) {
    throw new Error(`Size not found: ${formData.pageSize}`);
  }
  const documentId = sizeConfig.documentId;
  
  // Build customizations dynamically from product variables
  const customizations = [];
  product.variables.forEach(variable => {
    // Skip pageSize as it's handled by document selection
    if (variable.planObjectName && variable.planObjectType) {
      const value = formData[variable.name] !== undefined ? formData[variable.name] : variable.defaultValue;
      
      // Check if this is a date field (contains 'date' in the name or has date format)
      const isDateField = variable.name.toLowerCase().includes('date') || 
                         (value && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value));
      
      // Format the expression based on field type
      let expression;
      if (isDateField && value) {
        // Date fields need to be wrapped in # symbols
        expression = `#${value}#`;
      } else {
        // Regular fields wrapped in quotes
        expression = `"${value || ''}"`;
      }
      
      customizations.push({
        PlanObjectName: variable.planObjectName,
        PlanObjectType: variable.planObjectType,
        PlanObjectExpression: expression
      });
    }
  });
  
  const baseTicket = {
    Job: {
      JobType: jobType,
      Context: {
        CampaignId: product.campaignId
      }
    },
    Data: {
      Range: {
        All: false,
        From: 1,
        To: 1
      },
      RecipientsDataSources: jobType === 'Proof' 
        ? [{ FilterType: "NoDataSource", Filter: "Dummy Data" }]
        : [{ Id: 14485, FilterType: "TableName", Filter: "RecipientList" }],
      Assets: {
        UseCampaignAssetSources: true,
        Media: "Print"
      }
    },
    Plan: {
      Id: product.planId,
      Customizations: customizations
    },
    Document: {
      Id: documentId,
      Fonts: {
        UseCampaignFonts: true
      }
    }
  };

  // Add output configuration based on job type
  if (jobType === 'Proof') {
    baseTicket.Job.Priority = "Immediately";
    baseTicket.Output = {
      Format: "JPG",
      FileName: {
        Automatic: true
      },
      Bleed: {
        UseDocumentDefinition: false,
        Top: 0,
        Bottom: 0,
        LeftOrInside: 0,
        RightOrOutside: 0
      },
      Resolution: 150,
      ProductionPolicies: {
        MissingFonts: "Ignore",
        MissingAssets: "Ignore",
        MissingStyles: "Ignore",
        TextOverflow: "Ignore",
        FileSizeLimitReached: "FailJob"
      }
    };
  } else {
    baseTicket.Output = {
      Format: "PDF",
      FileName: {
        Automatic: true
      },
      Bleed: {
        UseDocumentDefinition: true
      },
      PdfSettings: "XMPiEQualityHigh",
      PdfCompatibilityLevel: "PdfVersion16",
      PdfStandardsCompliance: "PDFX42010",
      FlatteningHandlerType: "UseXDot",
      ProductionPolicies: {
        MissingFonts: "Ignore",
        MissingAssets: "Ignore",
        MissingStyles: "Ignore",
        TextOverflow: "Ignore",
        FileSizeLimitReached: "FailJob"
      }
    };
  }

  return baseTicket;
}

/**
 * POST /api/preview
 * Generate preview images (JPG) for the brochure
 */
app.post('/api/preview', async (req, res) => {
  try {
    // Validate and sanitize input
    const formData = sanitizeFormData(req.body);
    
    if (!validateProductId(formData.productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    
    const jobTicket = generateJobTicket(formData, 'Proof');

    console.log('Submitting preview job to uProduce API...');
    
    // Check circuit breaker before calling external API
    if (!circuitBreaker.canRequest()) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again shortly.' });
    }

    // Submit job to uProduce API
    const jobResponse = await uproduceClient.post(
      '/v1/jobs/immediate',
      jobTicket,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const jobData = jobResponse.data;
    console.log('Job submitted successfully:', jobData.FriendlyId);

    // Check if job completed successfully
    if (jobData.Status !== 'Completed') {
      return res.status(500).json({
        error: 'Job did not complete successfully',
        status: jobData.Status,
        statusInfo: jobData.StatusInfo
      });
    }

    // Download the output ZIP file
    const downloadResponse = await uproduceClient.get(
      `/v1/jobs/${jobData.FriendlyId}/output/download`,
      { responseType: 'arraybuffer' }
    );

    circuitBreaker.onSuccess();

    // Extract JPG files from ZIP
    const zip = new AdmZip(downloadResponse.data);
    const zipEntries = zip.getEntries();
    
    const images = [];
    zipEntries.forEach((entry) => {
      if (entry.entryName.endsWith('.jpg') || entry.entryName.endsWith('.jpeg')) {
        const imageBuffer = entry.getData();
        const base64Image = imageBuffer.toString('base64');
        images.push({
          name: entry.entryName,
          data: `data:image/jpeg;base64,${base64Image}`
        });
      }
    });

    // Sort images by page number
    images.sort((a, b) => {
      const pageA = parseInt(a.name.match(/p(\d+)/)?.[1] || '0');
      const pageB = parseInt(b.name.match(/p(\d+)/)?.[1] || '0');
      return pageA - pageB;
    });

    res.json({
      success: true,
      jobId: jobData.FriendlyId,
      images: images,
      pageCount: images.length
    });

  } catch (error) {
    circuitBreaker.onFailure();
    console.error('Error generating preview:', error.response?.data || error.message);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Preview generation timed out' });
    }
    res.status(500).json({
      error: 'Failed to generate preview'
    });
  }
});

/**
 * POST /api/download-pdf
 * Generate and download print-ready PDF
 */
app.post('/api/download-pdf', async (req, res) => {
  try {
    // Validate and sanitize input
    const formData = sanitizeFormData(req.body);
    
    if (!validateProductId(formData.productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    
    const jobTicket = generateJobTicket(formData, 'Print');

    console.log('Submitting PDF job to uProduce API...');
    
    // Check circuit breaker before calling external API
    if (!circuitBreaker.canRequest()) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again shortly.' });
    }

    // Submit job to uProduce API
    const jobResponse = await uproduceClient.post(
      '/v1/jobs/immediate',
      jobTicket,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const jobData = jobResponse.data;
    console.log('PDF job submitted successfully:', jobData.FriendlyId);

    // Check if job completed successfully
    if (jobData.Status !== 'Completed') {
      return res.status(500).json({
        error: 'Job did not complete successfully',
        status: jobData.Status,
        statusInfo: jobData.StatusInfo
      });
    }

    // Download the output ZIP file
    const downloadResponse = await uproduceClient.get(
      `/v1/jobs/${jobData.FriendlyId}/output/download`,
      { responseType: 'arraybuffer' }
    );

    circuitBreaker.onSuccess();

    // Extract PDF from ZIP
    const zip = new AdmZip(downloadResponse.data);
    const zipEntries = zip.getEntries();
    
    let pdfBuffer = null;
    let pdfFileName = 'brochure.pdf';
    
    zipEntries.forEach((entry) => {
      if (entry.entryName.endsWith('.pdf')) {
        pdfBuffer = entry.getData();
        pdfFileName = entry.entryName;
      }
    });

    if (!pdfBuffer) {
      return res.status(500).json({
        error: 'No PDF found in output'
      });
    }

    // Sanitize filename to prevent header injection
    const safePdfFileName = pdfFileName.replace(/[^\w.\-]/g, '_');

    // Send PDF as download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safePdfFileName}"`);
    res.send(pdfBuffer);

  } catch (error) {
    circuitBreaker.onFailure();
    console.error('Error generating PDF:', error.response?.data || error.message);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'PDF generation timed out' });
    }
    res.status(500).json({
      error: 'Failed to generate PDF'
    });
  }
});

/**
 * GET /api/products
 * Get available products/templates
 */
app.get('/api/products', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
  res.json(productsConfig);
});

/**
 * GET /api/thumbnail/:productId
 * Get cached thumbnail or generate one for a product
 */
app.get('/api/thumbnail/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const product = getProductById(productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Check if product has a static thumbnail URL
    if (product.thumbnail) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
      return res.json({
        success: true,
        productId,
        thumbnail: product.thumbnail,
        cached: false,
        source: 'static'
      });
    }
    
    // Check cache first
    const cachedThumbnail = await thumbnailCache.getThumbnail(productId);
    if (cachedThumbnail) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
      return res.json({
        success: true,
        productId,
        thumbnail: cachedThumbnail,
        cached: true,
        persistent: thumbnailCache.isPersistent()
      });
    }
    
    // Generate thumbnail using default values
    const defaultFormData = { productId };
    product.variables.forEach(variable => {
      defaultFormData[variable.name] = variable.defaultValue || '';
    });
    
    const jobTicket = generateJobTicket(defaultFormData, 'Proof');
    
    console.log(`Generating thumbnail for product: ${productId}`);
    
    // Check circuit breaker before calling external API
    if (!circuitBreaker.canRequest()) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again shortly.' });
    }

    // Submit job to uProduce API
    const jobResponse = await uproduceClient.post(
      '/v1/jobs/immediate',
      jobTicket,
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    const jobData = jobResponse.data;
    
    if (jobData.Status !== 'Completed') {
      return res.status(500).json({
        error: 'Thumbnail generation failed',
        status: jobData.Status
      });
    }
    
    // Download and extract first page
    const downloadResponse = await uproduceClient.get(
      `/v1/jobs/${jobData.FriendlyId}/output/download`,
      { responseType: 'arraybuffer' }
    );

    circuitBreaker.onSuccess();
    
    const zip = new AdmZip(downloadResponse.data);
    const zipEntries = zip.getEntries();
    
    let thumbnailData = null;
    for (const entry of zipEntries) {
      if (entry.entryName.endsWith('.jpg') || entry.entryName.endsWith('.jpeg')) {
        const imageBuffer = entry.getData();
        thumbnailData = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        break;
      }
    }
    
    if (!thumbnailData) {
      return res.status(500).json({ error: 'No image in job output' });
    }
    
    // Cache the thumbnail
    await thumbnailCache.setThumbnail(productId, thumbnailData);
    
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    res.json({
      success: true,
      productId,
      thumbnail: thumbnailData,
      cached: false,
      persistent: thumbnailCache.isPersistent()
    });
    
  } catch (error) {
    circuitBreaker.onFailure();
    console.error('Error generating thumbnail:', error.response?.data || error.message);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Thumbnail generation timed out' });
    }
    res.status(500).json({
      error: 'Failed to generate thumbnail'
    });
  }
});

/**
 * DELETE /api/thumbnail/:productId
 * Invalidate a cached thumbnail
 */
app.delete('/api/thumbnail/:productId', async (req, res) => {
  // Require admin API key for destructive operations
  const adminKey = process.env.ADMIN_API_KEY;
  const authHeader = req.headers.authorization;

  if (!adminKey || !authHeader || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { productId } = req.params;
  await thumbnailCache.invalidateThumbnail(productId);
  res.json({ success: true, message: `Thumbnail cache cleared for ${productId}` });
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'XMPie Brochure Customizer API is running' });
});

/**
 * GET /
 * Serve the main HTML page with cache-busted asset references
 */
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  // Replace asset references with hashed versions
  for (const [original, hashed] of Object.entries(assetHashes)) {
    html = html.split(original).join(hashed);
  }
  res.setHeader('Cache-Control', 'no-cache'); // Always revalidate HTML
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

/**
 * GET /about
 * Serve the about page with cache-busted asset references
 */
app.get('/about', (req, res) => {
  let html = fs.readFileSync(path.join(publicDir, 'about.html'), 'utf8');
  // Replace asset references with hashed versions
  for (const [original, hashed] of Object.entries(assetHashes)) {
    html = html.split(original).join(hashed);
  }
  res.setHeader('Cache-Control', 'no-cache'); // Always revalidate HTML
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Initialize cache and start server
let server;
thumbnailCache.initCache().then(() => {
  if (process.env.NODE_ENV !== 'production') {
    server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`uProduce API URL: ${UPRODUCE_API_URL}`);
    });
  }
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  if (server) {
    server.close(() => {
      console.log('HTTP server closed. All in-flight requests completed.');
      process.exit(0);
    });
    // Force shutdown after 10 seconds if connections don't drain
    setTimeout(() => {
      console.error('Forced shutdown — connections did not drain in time.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for Vercel serverless
module.exports = app;
