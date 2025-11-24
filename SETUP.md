# Setup Guide - XMPie Brochure Customizer

This guide will help you set up and run the XMPie Brochure Customizer application.

## Prerequisites

### 1. Install Node.js

Node.js is required to run this application. If you don't have it installed:

#### Option A: Using Homebrew (Recommended for Mac)

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

#### Option B: Download from Official Website

1. Visit [nodejs.org](https://nodejs.org/)
2. Download the LTS (Long Term Support) version
3. Run the installer
4. Follow the installation wizard

#### Verify Installation

After installation, verify Node.js and npm are installed:

```bash
node --version
# Should output something like: v18.x.x or v20.x.x

npm --version
# Should output something like: 9.x.x or 10.x.x
```

## Installation Steps

### 1. Navigate to Project Directory

```bash
cd /Users/davidbaldaro/PersonalEffect-CustomizableXMPieBrochure
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages:
- express (web server)
- axios (HTTP client)
- cors (CORS middleware)
- dotenv (environment variables)
- adm-zip (ZIP file handling)
- nodemon (development auto-reload)

### 3. Configure Environment Variables

Edit the `.env` file with your actual uProduce API details:

```env
PORT=3000
UPRODUCE_API_URL=https://your-uproduce-server.com/api
UPRODUCE_USERNAME=David
UPRODUCE_PASSWORD=Chalk2Chee$e
CAMPAIGN_ID=9767
PLAN_ID=9709
DOCUMENT_ID=39859
```

**Important Configuration Notes:**

- **UPRODUCE_API_URL**: Replace with your actual uProduce server URL
  - Example: `https://uproduce.yourdomain.com/api`
  - Make sure to include `/api` at the end
  - Do NOT include a trailing slash

- **Credentials**: Update with your actual username and password
  - These are used for Basic Authentication with the uProduce API

- **Campaign/Plan/Document IDs**: Verify these match your XMPie setup
  - Campaign ID: The campaign containing your brochure template
  - Plan ID: The plan configuration for customization
  - Document ID: The specific document/template to use

### 4. Start the Application

#### For Production:

```bash
npm start
```

#### For Development (with auto-reload):

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in `.env`)

### 5. Open in Browser

Open your web browser and navigate to:

```
http://localhost:3000
```

## Testing the Application

### 1. Initial Preview

1. Click the "Refresh Preview" button
2. Wait 2-5 seconds for the preview to generate
3. You should see a 2-page brochure preview

### 2. Customize Fields

Try changing:
- Language selection
- First Name and Company
- Industry type
- Printer model
- Software selections

The preview will automatically refresh when you change fields.

### 3. View Modes

- Click the 📖 icon to toggle between single-page and spread view
- Use arrow keys (← →) to navigate pages in single-page view
- Use Previous/Next buttons to navigate

### 4. Download PDF

1. Fill in all desired customization fields
2. Click "Download Print PDF"
3. Wait 5-10 seconds for PDF generation
4. The PDF will automatically download to your Downloads folder

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, you can change it in `.env`:

```env
PORT=3001
```

Then restart the server.

### Cannot Connect to uProduce API

**Check the following:**

1. **API URL is correct**
   ```bash
   # Test the API endpoint
   curl https://your-uproduce-server.com/api/v1/jobs
   ```

2. **Credentials are correct**
   - Verify username and password
   - Check if the account has necessary permissions

3. **Network connectivity**
   - Ensure the uProduce server is accessible from your network
   - Check firewall settings

4. **CORS issues**
   - The server includes CORS middleware
   - If running on different domains, additional configuration may be needed

### Preview Not Loading

1. **Check browser console** (F12 or Cmd+Option+I)
   - Look for error messages
   - Check Network tab for failed requests

2. **Check server logs**
   - The terminal running the server will show detailed error messages
   - Look for API response errors

3. **Verify Campaign/Plan/Document IDs**
   - Ensure these IDs exist in your uProduce system
   - Check that the document has the correct variable names

### PDF Download Fails

1. **Check all required fields are filled**
   - Some fields may be required for PDF generation
   - Check server logs for specific errors

2. **Verify job ticket configuration**
   - The PDF job ticket may need adjustment for your setup
   - Check `server.js` generateJobTicket function

3. **Check uProduce server resources**
   - PDF generation requires more resources than preview
   - Ensure the server has sufficient capacity

## Development Tips

### Viewing Server Logs

The server logs all API requests and responses:

```bash
npm run dev
```

Look for:
- Job submission confirmations
- Job IDs (FriendlyId)
- Error messages
- API response data

### Modifying the Job Ticket

If you need to adjust the job ticket parameters, edit `server.js`:

```javascript
function generateJobTicket(formData, jobType = 'Proof') {
  // Modify baseTicket structure here
}
```

### Customizing the UI

- **HTML**: Edit `public/index.html`
- **CSS**: Edit `public/styles.css`
- **JavaScript**: Edit `public/app.js`

Changes to frontend files are immediately visible (just refresh the browser).
Changes to `server.js` require a server restart (or use `npm run dev` for auto-reload).

### Adding New Form Fields

1. Add the field to `public/index.html`
2. Update the job ticket in `server.js` to include the new field
3. Ensure the field name matches the XMPie template variable

## Security Considerations

### For Production Deployment

1. **Never commit `.env` file**
   - It's already in `.gitignore`
   - Use environment variables on your hosting platform

2. **Use HTTPS**
   - Set up SSL/TLS certificates
   - Use a reverse proxy (nginx, Apache)

3. **Add authentication**
   - Implement user authentication if needed
   - Restrict access to authorized users

4. **Rate limiting**
   - Add rate limiting middleware
   - Prevent API abuse

5. **Input validation**
   - Validate all form inputs
   - Sanitize user data

## Next Steps

### Enhancements You Can Add

1. **Digital PDF Option**
   - Add a button for lower-resolution PDFs
   - Create a separate job ticket with different settings

2. **Template Selection**
   - Add dropdown to select different templates
   - Update Campaign/Document IDs dynamically

3. **Save/Load Customizations**
   - Store customizations in localStorage
   - Allow users to save and reload their work

4. **Email Delivery**
   - Add option to email the PDF
   - Integrate with email service

5. **History/Gallery**
   - Show previously generated brochures
   - Allow users to regenerate from history

## Support

### Resources

- **XMPie Website**: [xmpie.com](https://www.xmpie.com)
- **PersonalEffect**: [Product Page](https://www.xmpie.com/products/print-design-and-vdp/)
- **Node.js Documentation**: [nodejs.org/docs](https://nodejs.org/docs)
- **Express Documentation**: [expressjs.com](https://expressjs.com)

### Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review server logs for error messages
3. Verify all configuration settings
4. Check the README.md for additional information
5. Contact XMPie support for API-specific issues

## Quick Reference

### Common Commands

```bash
# Install dependencies
npm install

# Start server (production)
npm start

# Start server (development with auto-reload)
npm run dev

# Check Node.js version
node --version

# Check npm version
npm --version
```

### File Structure

```
PersonalEffect-CustomizableXMPieBrochure/
├── server.js              # Express server
├── package.json           # Dependencies
├── .env                   # Configuration (DO NOT COMMIT)
├── README.md             # Documentation
├── SETUP.md              # This file
└── public/
    ├── index.html        # Main page
    ├── styles.css        # Styling
    └── app.js            # Frontend logic
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| UPRODUCE_API_URL | uProduce API endpoint | https://server.com/api |
| UPRODUCE_USERNAME | API username | David |
| UPRODUCE_PASSWORD | API password | Chalk2Chee$e |
| CAMPAIGN_ID | Campaign ID | 9767 |
| PLAN_ID | Plan ID | 9709 |
| DOCUMENT_ID | Document ID | 39859 |

---

**Ready to start?** Run `npm install` and then `npm start`!
