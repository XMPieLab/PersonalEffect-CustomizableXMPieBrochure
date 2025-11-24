# XMPie Brochure Customizer

A standalone web application demonstrating the capabilities of **XMPie uProduce** and **PersonalEffect Print Pro** for creating personalized marketing materials on demand.

![XMPie Logo](https://www.xmpie.com/wp-content/themes/roots-mipo/assets/img/XMPieLogo.svg)

## Overview

This application extracts the brochure customization functionality from XMPie's StoreFlow eCommerce platform and provides it as a standalone demo. Users can:

- **Select from multiple templates** - Support for unlimited product templates via JSON configuration
- **Customize brochure fields in real-time** - Dynamic form generation based on template
- **View low-resolution JPG previews instantly** - Fast preview generation
- **Download high-resolution print-ready PDFs** - Production-quality output
- **Toggle between single-page and spread view modes** - Flexible viewing options

> **New in v2.0:** Multi-template support! See [MULTI_TEMPLATE_GUIDE.md](MULTI_TEMPLATE_GUIDE.md) for details on configuring multiple templates.

## Features

### Customization Options

- **Page Size**: A4 or US Letter
- **Language**: English, UK English, French, German, Italian, Spanish
- **Personal Information**: First Name, Company
- **Industry Selection**: Financial Services, Higher Education, Insurance, Print Providers, Healthcare, Education, Other
- **Printer Selection**: Various Xerox® printer models (Baltoro®, iGen® 5, Iridesse®, PrimeLink®, Versant® 280, Versant® 4100)
- **Software Selection**: XMPie® StoreFlow, uDirect Studio, PersonalEffect® Print, PersonalEffect TransMedia

### Preview Features

- **Real-time Preview**: Automatic preview generation on field changes
- **Dual View Modes**: 
  - Single page view with navigation
  - Spread view showing both pages side-by-side
- **Keyboard Navigation**: Use arrow keys to navigate between pages
- **Responsive Design**: Works on desktop and tablet devices

### PDF Generation

- **High-Resolution Output**: Print-ready PDF with PDF/X-4:2010 compliance
- **Automatic Download**: One-click download of generated PDF
- **Custom Settings**: Uses XMPiEQualityHigh settings for optimal output

## Technology Stack

### Backend
- **Node.js**: Runtime environment
- **Express**: Web framework
- **Axios**: HTTP client for API requests
- **AdmZip**: ZIP file handling
- **dotenv**: Environment variable management

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **Modern CSS**: Grid, Flexbox, CSS animations
- **Responsive Design**: Mobile-first approach

### API Integration
- **XMPie uProduce API**: Job submission and output retrieval
- **Basic Authentication**: Secure API access

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Access to XMPie uProduce API

### Setup

1. **Clone or download the repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Edit the `.env` file with your uProduce API credentials:
   ```env
   PORT=3000
   UPRODUCE_API_URL=https://your-uproduce-server.com/api
   UPRODUCE_USERNAME=David
   UPRODUCE_PASSWORD=Chalk2Chee$e
   CAMPAIGN_ID=9767
   PLAN_ID=9709
   ```
   
   **Note:** Document IDs are hardcoded in `server.js`:
   - A4 brochure: Document ID `39859`
   - US Letter brochure: Document ID `39733`
   
   The application automatically selects the correct document based on the page size.

4. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

## Project Structure

```
xmpie-brochure-customizer/
├── server.js                  # Express server and API endpoints
├── package.json               # Dependencies and scripts
├── .env                       # Environment configuration
├── products.json              # Product/template configuration (NEW)
├── README.md                  # This file
├── MULTI_TEMPLATE_GUIDE.md    # Multi-template system guide (NEW)
└── public/                    # Frontend assets
    ├── index.html             # Main HTML page
    ├── styles.css             # Styling
    └── app.js                 # Frontend JavaScript
```

## API Endpoints

### GET /api/products
Get available products/templates configuration.

**Response:**
```json
{
  "products": [
    {
      "id": "xmpie-brochure",
      "title": "XMPie Brochure",
      "description": "Customizable XMPie marketing brochure...",
      "campaignId": 9767,
      "planId": 9709,
      "sizes": [...],
      "variables": [...]
    }
  ]
}
```

### POST /api/preview
Generate low-resolution JPG previews of the brochure.

**Request Body:**
```json
{
  "productId": "xmpie-brochure",
  "pageSize": "A4",
  "language": "EN",
  "firstName": "John",
  "company": "Acme Corp",
  "industry": "FinancialServices",
  "printer": "Baltoro",
  "software1": "StoreFlow",
  "software2": "PersonalEffectTransMedia"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": 314947,
  "images": [
    {
      "name": "Customize XMPie Brochure - A4_r00001_p001.jpg",
      "data": "data:image/jpeg;base64,..."
    },
    {
      "name": "Customize XMPie Brochure - A4_r00001_p002.jpg",
      "data": "data:image/jpeg;base64,..."
    }
  ],
  "pageCount": 2
}
```

### POST /api/download-pdf
Generate and download high-resolution print-ready PDF.

**Request Body:** Same as /api/preview

**Response:** PDF file download

### GET /api/health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "XMPie Brochure Customizer API is running"
}
```

## uProduce API Integration

### Job Ticket Structure

The application uses two types of job tickets:

#### Proof Job (JPG Preview)
- **JobType**: "Proof"
- **Priority**: "Immediately"
- **Output Format**: JPG
- **Resolution**: 150 DPI
- **Data Source**: Dummy Data (no recipient list)

#### Print Job (PDF)
- **JobType**: "Print"
- **Output Format**: PDF
- **PDF Settings**: XMPiEQualityHigh
- **PDF Compliance**: PDF/X-4:2010
- **Data Source**: RecipientList

### Workflow

1. **Submit Job**: POST to `/v1/jobs/immediate` with job ticket
2. **Receive Job Response**: Get FriendlyId and job status
3. **Download Output**: GET `/v1/jobs/{FriendlyId}/output/download`
4. **Extract Files**: Unzip and extract JPG or PDF files
5. **Display/Download**: Show preview or trigger PDF download

## Customization

### Adding/Modifying Templates

**The new multi-template system makes customization much easier!**

Simply edit `products.json` to:
- Add new templates
- Modify existing templates
- Change available fields
- Update options and defaults

See [MULTI_TEMPLATE_GUIDE.md](MULTI_TEMPLATE_GUIDE.md) for complete documentation.

### Legacy: Modifying Form Fields (Old Method)

For the old single-template approach, you would edit `public/index.html` and `server.js`. 
**This is no longer necessary** - use `products.json` instead!

### Styling

All styles are in `public/styles.css`. The application uses:
- **Primary Color**: #fdb813 (XMPie yellow)
- **Gradient Background**: Purple gradient
- **Modern UI**: Rounded corners, shadows, smooth transitions

### Adding Features

The modular structure makes it easy to add features:
- **Digital PDF**: Add another button and endpoint for lower-resolution PDFs
- **Multiple Templates**: Add template selection dropdown
- **History**: Store previous customizations
- **Sharing**: Add social sharing or email functionality

## Troubleshooting

### Preview Not Loading

1. Check `.env` configuration
2. Verify uProduce API URL and credentials
3. Check browser console for errors
4. Ensure Campaign ID, Plan ID, and Document ID are correct

### PDF Download Fails

1. Verify all required fields are filled
2. Check server logs for API errors
3. Ensure sufficient permissions on uProduce server

### Connection Issues

1. Check network connectivity
2. Verify uProduce API server is accessible
3. Check CORS settings if running on different domain

## Security Notes

- **Never commit `.env` file** with real credentials
- Use environment variables for sensitive data
- Implement rate limiting for production use
- Add authentication for public-facing deployments
- Use HTTPS in production

## Performance Optimization

- Preview generation typically takes 2-5 seconds
- PDF generation may take 5-10 seconds
- Images are cached in browser
- Consider implementing server-side caching for repeated requests

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

This is a demonstration application for XMPie products.

## Support

For questions about:
- **XMPie Products**: Visit [xmpie.com](https://www.xmpie.com)
- **PersonalEffect**: [Learn more](https://www.xmpie.com/products/print-design-and-vdp/)
- **uProduce API**: Contact XMPie support

## Credits

Powered by:
- **XMPie PersonalEffect Print Pro**
- **XMPie uProduce API**
- **XMPie StoreFlow**

© 2025 XMPie - A Xerox Company
