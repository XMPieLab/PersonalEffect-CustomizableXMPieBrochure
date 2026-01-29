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
const AdmZip = require('adm-zip');
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
  // Remove script tags and dangerous patterns
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .substring(0, 500); // Limit field length
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
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '1mb' })); // Limit request body size
app.use(express.static(path.join(__dirname, 'public')));
app.use(rateLimiter); // Apply rate limiting to all routes

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// uProduce API configuration
const UPRODUCE_API_URL = process.env.UPRODUCE_API_URL;
const AUTH = {
  username: process.env.UPRODUCE_USERNAME,
  password: process.env.UPRODUCE_PASSWORD
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
    
    // Submit job to uProduce API
    const jobResponse = await axios.post(
      `${UPRODUCE_API_URL}/v1/jobs/immediate`,
      jobTicket,
      {
        auth: AUTH,
        headers: {
          'Content-Type': 'application/json'
        }
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
    const downloadResponse = await axios.get(
      `${UPRODUCE_API_URL}/v1/jobs/${jobData.FriendlyId}/output/download`,
      {
        auth: AUTH,
        responseType: 'arraybuffer'
      }
    );

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
    console.error('Error generating preview:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to generate preview',
      details: error.response?.data || error.message
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
    
    // Submit job to uProduce API
    const jobResponse = await axios.post(
      `${UPRODUCE_API_URL}/v1/jobs/immediate`,
      jobTicket,
      {
        auth: AUTH,
        headers: {
          'Content-Type': 'application/json'
        }
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
    const downloadResponse = await axios.get(
      `${UPRODUCE_API_URL}/v1/jobs/${jobData.FriendlyId}/output/download`,
      {
        auth: AUTH,
        responseType: 'arraybuffer'
      }
    );

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

    // Send PDF as download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating PDF:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to generate PDF',
      details: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/products
 * Get available products/templates
 */
app.get('/api/products', (req, res) => {
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
    
    // Submit job to uProduce API
    const jobResponse = await axios.post(
      `${UPRODUCE_API_URL}/v1/jobs/immediate`,
      jobTicket,
      {
        auth: AUTH,
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
    const downloadResponse = await axios.get(
      `${UPRODUCE_API_URL}/v1/jobs/${jobData.FriendlyId}/output/download`,
      { auth: AUTH, responseType: 'arraybuffer' }
    );
    
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
    
    res.json({
      success: true,
      productId,
      thumbnail: thumbnailData,
      cached: false,
      persistent: thumbnailCache.isPersistent()
    });
    
  } catch (error) {
    console.error('Error generating thumbnail:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to generate thumbnail',
      details: error.response?.data || error.message
    });
  }
});

/**
 * DELETE /api/thumbnail/:productId
 * Invalidate a cached thumbnail
 */
app.delete('/api/thumbnail/:productId', async (req, res) => {
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
 * Serve the main HTML page
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize cache and start server
thumbnailCache.initCache().then(() => {
  if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`uProduce API URL: ${UPRODUCE_API_URL}`);
    });
  }
});

// Export for Vercel serverless
module.exports = app;
