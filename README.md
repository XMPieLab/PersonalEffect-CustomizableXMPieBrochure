# XMPie PersonalEffect API Demo

A technical demonstration of the **XMPie uProduce REST API** for on-demand document generation. This application showcases how to integrate PersonalEffect's variable data printing capabilities into custom web applications.

## What This Demonstrates

This demo illustrates key XMPie uProduce API capabilities:

- **Job Submission** - Submitting print jobs via the REST API with dynamic customizations
- **Plan Customization** - Passing variable values to PersonalEffect plans at runtime
- **Immediate Job Processing** - Using synchronous job execution for real-time previews
- **Output Retrieval** - Downloading and processing job output (ZIP containing JPG/PDF)
- **Multi-Document Support** - Selecting different document variants (e.g., A4 vs Letter)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser UI    │────▶│  Node.js Server │────▶│  uProduce API   │
│   (Frontend)    │◀────│   (Middleware)  │◀────│  (XMPie Server) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Vercel Blob    │
                        │ (Thumbnail Cache)│
                        └─────────────────┘
```

**Key Design Decisions:**
- Server-side API calls protect uProduce credentials from client exposure
- Middleware layer handles job ticket construction and output processing
- Optional persistent caching reduces redundant API calls

## uProduce API Integration

### Authentication

The API uses HTTP Basic Authentication:
```javascript
const AUTH = {
  username: process.env.UPRODUCE_USERNAME,
  password: process.env.UPRODUCE_PASSWORD
};
```

### Job Ticket Structure

Jobs are submitted to `/v1/jobs/immediate` with a JSON job ticket:

```json
{
  "Job": {
    "JobType": "Proof",
    "Priority": "Immediately",
    "Context": { "CampaignId": 9767 }
  },
  "Data": {
    "Range": { "All": false, "From": 1, "To": 1 },
    "RecipientsDataSources": [{ "FilterType": "NoDataSource", "Filter": "Dummy Data" }],
    "Assets": { "UseCampaignAssetSources": true, "Media": "Print" }
  },
  "Plan": {
    "Id": 9709,
    "Customizations": [
      { "PlanObjectName": "Language", "PlanObjectType": "Variable", "PlanObjectExpression": "\"EN\"" },
      { "PlanObjectName": "First Name", "PlanObjectType": "ADOR", "PlanObjectExpression": "\"John\"" }
    ]
  },
  "Document": { "Id": 39859 },
  "Output": {
    "Format": "JPG",
    "Resolution": 150
  }
}
```

### Customization Types

| Type | PlanObjectType | Expression Format | Example |
|------|----------------|-------------------|---------|
| Variables | `Variable` | `"value"` | `"\"EN\""` |
| ADORs | `ADOR` | `"value"` | `"\"John Smith\""` |
| Dates | Variable/ADOR | `#date#` | `"#29/01/2026#"` |

### API Workflow

```
1. POST /v1/jobs/immediate
   └─▶ Returns: { FriendlyId, Status, StatusInfo }

2. GET /v1/jobs/{FriendlyId}/output/download
   └─▶ Returns: ZIP file containing output files

3. Extract and process output files
   └─▶ JPG pages or PDF document
```

### Output Formats

| Job Type | Format | Resolution | Use Case |
|----------|--------|------------|----------|
| Proof | JPG | 150 DPI | Fast previews |
| Print | PDF | Full | Production output |

**PDF Settings:**
- `PdfSettings`: "XMPiEQualityHigh"
- `PdfCompatibilityLevel`: "PdfVersion16"
- `PdfStandardsCompliance`: "PDFX42010"

## Project Structure

```
├── server.js              # API middleware - job ticket construction & submission
├── thumbnailCache.js      # Vercel Blob integration for persistent caching
├── products.json          # Template configuration (campaigns, plans, variables)
├── vercel.json            # Serverless deployment config
└── public/
    ├── app.js             # Frontend - form generation & preview display
    ├── styles.css         # UI styling
    └── index.html         # Application shell
```

## Configuration

### Environment Variables

```env
UPRODUCE_API_URL=https://your-server.xmpie.net/XMpieRestAPI/
UPRODUCE_USERNAME=api_user
UPRODUCE_PASSWORD=api_password
BLOB_READ_WRITE_TOKEN=vercel_xxx  # Optional: for persistent thumbnail caching
```

### Template Configuration (products.json)

Templates are defined with their uProduce IDs and customizable variables:

```json
{
  "products": [{
    "id": "template-id",
    "campaignId": 9767,
    "planId": 9709,
    "sizes": [
      { "name": "A4", "documentId": 39859 },
      { "name": "Letter", "documentId": 39733 }
    ],
    "variables": [
      {
        "name": "language",
        "planObjectName": "Language",
        "planObjectType": "Variable",
        "defaultValue": "EN"
      }
    ]
  }]
}
```

## Quick Start

```bash
# Install dependencies
npm install

# Configure credentials
cp .env.example .env
# Edit .env with your uProduce credentials

# Run locally
npm run dev

# Deploy to Vercel
vercel --prod
```

## Security

- **Credential Protection** - API credentials stored server-side only
- **Rate Limiting** - 30 requests/minute per IP
- **Input Sanitization** - XSS prevention on all user inputs
- **Request Validation** - Only configured product IDs accepted

## Deployment

Optimized for Vercel serverless deployment:
- Automatic HTTPS
- Edge caching for static assets
- Optional Blob Storage for thumbnail persistence

See `VERCEL_DEPLOYMENT.md` for detailed instructions.

## Resources

- [XMPie uProduce API Documentation](https://help.xmpie.com/)
- [PersonalEffect Print Pro](https://www.xmpie.com/products/print-design-and-vdp/)
- [XMPie Developer Resources](https://www.xmpie.com)

---

© 2026 XMPie - A CareAR Company
