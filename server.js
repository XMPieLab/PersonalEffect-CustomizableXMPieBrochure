const express = require('express');
const axios = require('axios');
const cors = require('cors');
const AdmZip = require('adm-zip');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// uProduce API configuration
const UPRODUCE_API_URL = process.env.UPRODUCE_API_URL;
const AUTH = {
  username: process.env.UPRODUCE_USERNAME,
  password: process.env.UPRODUCE_PASSWORD
};

// Campaign configuration
const CAMPAIGN_ID = parseInt(process.env.CAMPAIGN_ID);
const PLAN_ID = parseInt(process.env.PLAN_ID);
const DOCUMENT_ID = parseInt(process.env.DOCUMENT_ID);

/**
 * Generate job ticket for preview (JPG) or print (PDF)
 */
function generateJobTicket(formData, jobType = 'Proof') {
  const baseTicket = {
    Job: {
      JobType: jobType,
      Context: {
        CampaignId: CAMPAIGN_ID
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
      Id: PLAN_ID,
      Customizations: [
        {
          PlanObjectName: "Language",
          PlanObjectType: "Variable",
          PlanObjectExpression: `"${formData.language}"`
        },
        {
          PlanObjectName: "First Name",
          PlanObjectType: "ADOR",
          PlanObjectExpression: `"${formData.firstName || ''}"`
        },
        {
          PlanObjectName: "Company",
          PlanObjectType: "ADOR",
          PlanObjectExpression: `"${formData.company || ''}"`
        },
        {
          PlanObjectName: "VAR_Industry",
          PlanObjectType: "Variable",
          PlanObjectExpression: `"${formData.industry}"`
        },
        {
          PlanObjectName: "VAR_Printer",
          PlanObjectType: "Variable",
          PlanObjectExpression: `"${formData.printer || ''}"`
        },
        {
          PlanObjectName: "VAR_Software1",
          PlanObjectType: "Variable",
          PlanObjectExpression: `"${formData.software1}"`
        },
        {
          PlanObjectName: "VAR_Software2",
          PlanObjectType: "Variable",
          PlanObjectExpression: `"${formData.software2}"`
        }
      ]
    },
    Document: {
      Id: DOCUMENT_ID,
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
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'XMPie Brochure Customizer API is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`uProduce API URL: ${UPRODUCE_API_URL}`);
});
