// Application State
let currentImages = [];
let currentPage = 0;
let viewMode = 'single'; // 'single' or 'spread'
let theme = localStorage.getItem('theme') || 'light';

// DOM Elements
const form = document.getElementById('customizationForm');
const refreshPreviewBtn = document.getElementById('refreshPreviewBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const viewModeToggle = document.getElementById('viewModeToggle');
const viewModeIcon = document.getElementById('viewModeIcon');
const themeToggle = document.getElementById('themeToggle');
const retryBtn = document.getElementById('retryBtn');

// State Elements
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const previewContainer = document.getElementById('previewContainer');
const initialState = document.getElementById('initialState');

// View Elements
const singlePageView = document.getElementById('singlePageView');
const spreadView = document.getElementById('spreadView');
const currentPageImage = document.getElementById('currentPageImage');
const page1Image = document.getElementById('page1Image');
const page2Image = document.getElementById('page2Image');
const pageIndicator = document.getElementById('pageIndicator');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');

// Form inputs for auto-refresh
const formInputs = form.querySelectorAll('input, select');

/**
 * Get form data as object
 */
function getFormData() {
    const formData = new FormData(form);
    const data = {};
    
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }
    
    return data;
}

/**
 * Show loading state
 */
function showLoading() {
    loadingState.style.display = 'flex';
    errorState.style.display = 'none';
    previewContainer.style.display = 'none';
    initialState.style.display = 'none';
    refreshPreviewBtn.disabled = true;
    downloadPdfBtn.disabled = true;
}

/**
 * Show error state
 */
function showError(message) {
    loadingState.style.display = 'none';
    errorState.style.display = 'flex';
    previewContainer.style.display = 'none';
    initialState.style.display = 'none';
    errorMessage.textContent = message;
    refreshPreviewBtn.disabled = false;
    downloadPdfBtn.disabled = false;
}

/**
 * Show preview
 */
function showPreview() {
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    previewContainer.style.display = 'block';
    initialState.style.display = 'none';
    refreshPreviewBtn.disabled = false;
    downloadPdfBtn.disabled = false;
}

/**
 * Update page navigation
 */
function updatePageNavigation() {
    if (currentImages.length === 0) return;
    
    pageIndicator.textContent = `Page ${currentPage + 1} of ${currentImages.length}`;
    prevPageBtn.disabled = currentPage === 0;
    nextPageBtn.disabled = currentPage === currentImages.length - 1;
}

/**
 * Display current page in single view
 */
function displayCurrentPage() {
    if (currentImages.length === 0) return;
    
    currentPageImage.src = currentImages[currentPage].data;
    updatePageNavigation();
}

/**
 * Display spread view
 */
function displaySpread() {
    if (currentImages.length === 0) return;
    
    page1Image.src = currentImages[0]?.data || '';
    page2Image.src = currentImages[1]?.data || '';
}

/**
 * Toggle view mode
 */
function toggleViewMode() {
    if (viewMode === 'single') {
        viewMode = 'spread';
        viewModeIcon.classList.remove('single');
        singlePageView.style.display = 'none';
        spreadView.style.display = 'block';
        displaySpread();
    } else {
        viewMode = 'single';
        viewModeIcon.classList.add('single');
        singlePageView.style.display = 'block';
        spreadView.style.display = 'none';
        displayCurrentPage();
    }
}

/**
 * Toggle theme
 */
function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
    localStorage.setItem('theme', theme);
}

/**
 * Initialize theme
 */
function initTheme() {
    document.documentElement.classList.add(theme);
    document.body.classList.add(theme);
}

/**
 * Generate preview
 */
async function generatePreview() {
    try {
        showLoading();
        
        const formData = getFormData();
        
        const response = await fetch('/api/preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate preview');
        }
        
        const data = await response.json();
        
        if (!data.success || !data.images || data.images.length === 0) {
            throw new Error('No preview images received');
        }
        
        currentImages = data.images;
        currentPage = 0;
        
        showPreview();
        
        if (viewMode === 'single') {
            displayCurrentPage();
        } else {
            displaySpread();
        }
        
    } catch (error) {
        console.error('Error generating preview:', error);
        showError(error.message || 'Failed to generate preview. Please try again.');
    }
}

/**
 * Download PDF
 */
async function downloadPdf() {
    try {
        downloadPdfBtn.disabled = true;
        downloadPdfBtn.innerHTML = '<span class="btn-icon">⏳</span> Generating PDF...';
        
        const formData = getFormData();
        
        const response = await fetch('/api/download-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate PDF');
        }
        
        // Get the PDF blob
        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `XMPie_Brochure_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        downloadPdfBtn.innerHTML = '<span class="btn-icon">✓</span> PDF Downloaded!';
        
        setTimeout(() => {
            downloadPdfBtn.innerHTML = '<span class="btn-icon">📥</span> Download Print PDF';
            downloadPdfBtn.disabled = false;
        }, 3000);
        
    } catch (error) {
        console.error('Error downloading PDF:', error);
        alert(error.message || 'Failed to download PDF. Please try again.');
        downloadPdfBtn.innerHTML = '<span class="btn-icon">📥</span> Download Print PDF';
        downloadPdfBtn.disabled = false;
    }
}

/**
 * Auto-refresh preview on form change
 */
function setupAutoRefresh() {
    let debounceTimer;
    
    formInputs.forEach(input => {
        input.addEventListener('change', () => {
            // Only auto-refresh if we already have images loaded
            if (currentImages.length > 0) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    generatePreview();
                }, 500);
            }
        });
    });
}

// Event Listeners
refreshPreviewBtn.addEventListener('click', generatePreview);
downloadPdfBtn.addEventListener('click', downloadPdf);
viewModeToggle.addEventListener('click', toggleViewMode);
themeToggle.addEventListener('click', toggleTheme);
retryBtn.addEventListener('click', generatePreview);

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 0) {
        currentPage--;
        displayCurrentPage();
    }
});

nextPageBtn.addEventListener('click', () => {
    if (currentPage < currentImages.length - 1) {
        currentPage++;
        displayCurrentPage();
    }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (viewMode === 'single' && currentImages.length > 0) {
        if (e.key === 'ArrowLeft' && currentPage > 0) {
            currentPage--;
            displayCurrentPage();
        } else if (e.key === 'ArrowRight' && currentPage < currentImages.length - 1) {
            currentPage++;
            displayCurrentPage();
        }
    }
});

// Initialize
initTheme();
setupAutoRefresh();
viewModeIcon.classList.add('single');

// Generate initial preview on page load
generatePreview();

// Show initial message
console.log('XMPie Brochure Customizer loaded successfully!');
console.log('Powered by PersonalEffect Print Pro & uProduce API');
