const express = require('express');
const axios = require('axios');
const cors = require('cors');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
      customizations.push({
        PlanObjectName: variable.planObjectName,
        PlanObjectType: variable.planObjectType,
        PlanObjectExpression: `"${value || ''}"`
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
    const formData = req.body;
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
    const formData = req.body;
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

// Start server (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`uProduce API URL: ${UPRODUCE_API_URL}`);
  });
}

// Export for Vercel serverless
module.exports = app;
