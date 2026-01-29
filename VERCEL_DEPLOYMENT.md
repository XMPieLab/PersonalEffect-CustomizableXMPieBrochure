# Vercel Deployment Guide

## Prerequisites

1. GitHub account with the repository
2. Vercel account (free tier works)
3. uProduce API credentials

## Deployment Steps

### 1. Push to GitHub

Make sure all your changes are committed and pushed to GitHub:

```bash
git add .
git commit -m "Add Vercel configuration"
git push origin main
```

### 2. Import Project to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Vercel will auto-detect the settings

### 3. Configure Environment Variables

In the Vercel project settings, add these environment variables:

**Required Variables:**

| Variable | Value | Description |
|----------|-------|-------------|
| `UPRODUCE_API_URL` | `https://marketingx.xmpie.net/XMpieRestAPI/` | Your uProduce API URL |
| `UPRODUCE_USERNAME` | `David` | Your uProduce username |
| `UPRODUCE_PASSWORD` | `Chalk2Chee$e` | Your uProduce password |
| `CAMPAIGN_ID` | `9767` | Campaign ID |
| `PLAN_ID` | `9709` | Plan ID |
| `NODE_ENV` | `production` | Set to production |

**Optional - Persistent Thumbnail Caching (Vercel Blob Storage):**

| Variable | Value | Description |
|----------|-------|-------------|
| `BLOB_READ_WRITE_TOKEN` | (auto-populated) | Vercel Blob read/write token |

To enable persistent thumbnail caching across deployments:

1. Go to your Vercel project dashboard
2. Click "Storage" → "Create Database" → "Blob"
3. Name it (e.g., `thumbnail-store`) and create
4. Connect it to your project - the `BLOB_READ_WRITE_TOKEN` is auto-populated
5. Redeploy your application

Thumbnails are stored as public JPG files and served directly from Vercel's CDN.
Without Blob Storage, thumbnails use in-memory caching (reset on each deployment).

**Note:** Document IDs are now hardcoded in `server.js`:
- A4 brochure: `39859`
- US Letter brochure: `39733`

The correct document is automatically selected based on the page size chosen by the user.

**To add environment variables in Vercel:**

1. Go to your project dashboard
2. Click "Settings"
3. Click "Environment Variables"
4. Add each variable with its value
5. Make sure to select "Production", "Preview", and "Development" for each

### 4. Deploy

1. Click "Deploy" in Vercel
2. Wait for the build to complete (usually 1-2 minutes)
3. Your site will be live at `https://your-project-name.vercel.app`

## Configuration Files

### vercel.json

This file tells Vercel how to build and route your application:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.js"
    }
  ]
}
```

### server.js

The server is configured to:
- Run normally in development (`npm run dev`)
- Export as a serverless function for Vercel in production

## Troubleshooting

### "Cannot GET /" Error

This means the server isn't properly configured. Make sure:
- `vercel.json` exists in the root directory
- `server.js` exports the app: `module.exports = app;`
- Environment variables are set in Vercel

### API Errors

If the API calls fail:
- Check environment variables are set correctly
- Verify `UPRODUCE_API_URL` includes the full path with `/api` at the end
- Check uProduce API credentials are correct
- Verify the uProduce server is accessible from Vercel's servers

### Build Fails

If the build fails:
- Check `package.json` has all required dependencies
- Verify Node.js version compatibility (Vercel uses Node 18 by default)
- Check the build logs in Vercel dashboard for specific errors

## Local Development

To run locally:

```bash
npm install
npm run dev
```

The app will run on `http://localhost:3000`

## Custom Domain

To add a custom domain:

1. Go to project settings in Vercel
2. Click "Domains"
3. Add your domain
4. Update DNS records as instructed

## Automatic Deployments

Vercel automatically deploys when you push to GitHub:
- Push to `main` branch → Production deployment
- Push to other branches → Preview deployment
- Pull requests → Preview deployment with unique URL

## Environment Variables Per Branch

You can set different environment variables for:
- **Production**: Used for `main` branch
- **Preview**: Used for other branches and PRs
- **Development**: Used for local development

This allows you to use different uProduce campaigns for testing vs production.

## Monitoring

View deployment logs and errors:
1. Go to Vercel dashboard
2. Click on your project
3. Click "Deployments"
4. Click on any deployment to see logs

## Support

- Vercel Documentation: [vercel.com/docs](https://vercel.com/docs)
- Vercel Support: Available in dashboard
- GitHub Issues: For application-specific issues
