# Quick Start Guide

Get the XMPie Brochure Customizer running in 3 steps!

## Step 1: Install Node.js (if not already installed)

### Mac (using Homebrew):
```bash
brew install node
```

### Or download from: https://nodejs.org/

Verify installation:
```bash
node --version
npm --version
```

## Step 2: Configure & Install

1. **Edit `.env` file** with your uProduce API details:
   ```env
   UPRODUCE_API_URL=https://your-uproduce-server.com/api
   UPRODUCE_USERNAME=David
   UPRODUCE_PASSWORD=Chalk2Chee$e
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

## Step 3: Run the Application

```bash
npm start
```

Then open: **http://localhost:3000**

---

## What You'll See

1. **Customization Form** (left panel)
   - Page Size, Language, Personal Info
   - Industry, Printer, Software selections

2. **Preview Panel** (right panel)
   - Click "Refresh Preview" to generate
   - Toggle between single/spread view
   - Navigate with arrow keys or buttons

3. **Download PDF**
   - Click "Download Print PDF" for high-res output

---

## Troubleshooting

### Port 3000 already in use?
Change `PORT=3001` in `.env` file

### Can't connect to uProduce?
- Verify `UPRODUCE_API_URL` is correct
- Check credentials
- Ensure server is accessible

### Need more help?
See **SETUP.md** for detailed instructions

---

**That's it!** You're ready to customize brochures with XMPie PersonalEffect! 🎉
