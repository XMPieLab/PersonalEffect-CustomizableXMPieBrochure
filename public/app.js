// Application State
let productsConfig = null;
let currentProduct = null;
let currentImages = [];
let currentPage = 0;
let viewMode = 'single'; // 'single', 'spread', or '3d'
let theme = localStorage.getItem('theme') || 'light';

// 3D View State
let view3DState = {
    rotationX: -15,
    rotationY: 30,
    rotationZ: 0,
    translateX: 0,
    translateY: 0,
    scale: 1,
    isDragging: false,
    startX: 0,
    startY: 0,
    startRotationX: 0,
    startRotationY: 0,
    startTranslateX: 0,
    startTranslateY: 0
};

// DOM Elements
const form = document.getElementById('customizationForm');
const formFields = document.getElementById('formFields');
const productSelector = document.getElementById('productSelector');
const productCarousel = document.getElementById('productCarousel');
const carouselPrev = document.getElementById('carouselPrev');
const carouselNext = document.getElementById('carouselNext');
const carouselToggle = document.getElementById('carouselToggle');
const refreshPreviewBtn = document.getElementById('refreshPreviewBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const viewModeToggle = document.getElementById('viewModeToggle');
const viewModeIcon = document.getElementById('viewModeIcon');
const view3DToggle = document.getElementById('view3DToggle');
const view3DIcon = document.getElementById('view3DIcon');
const themeToggle = document.getElementById('themeToggle');
const retryBtn = document.getElementById('retryBtn');

// State Elements
const mainContent = document.querySelector('.main-content');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const previewContainer = document.getElementById('previewContainer');
const initialState = document.getElementById('initialState');

// View Elements
const singlePageView = document.getElementById('singlePageView');
const spreadView = document.getElementById('spreadView');
const view3D = document.getElementById('view3D');
const currentPageImage = document.getElementById('currentPageImage');
const page1Image = document.getElementById('page1Image');
const page2Image = document.getElementById('page2Image');
const pageIndicator = document.getElementById('pageIndicator');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');

// 3D View Elements
const scene3D = document.getElementById('scene3D');
const viewport3D = document.getElementById('viewport3D');
const brochure3D = document.getElementById('brochure3D');
const page3DFront = document.getElementById('page3DFront');
const page3DBack = document.getElementById('page3DBack');
const reset3DViewBtn = document.getElementById('reset3DView');

// Form inputs for auto-refresh (will be updated dynamically)
let formInputs = [];

// Carousel state
let carouselPosition = 0;
let productThumbnails = new Map(); // Store generated thumbnails

/**
 * Load products configuration from API
 */
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        if (!response.ok) {
            throw new Error('Failed to load products');
        }
        productsConfig = await response.json();
        console.log('Loaded products:', productsConfig);
        
        if (productsConfig.products && productsConfig.products.length > 0) {
            // If only one product, select it automatically
            if (productsConfig.products.length === 1) {
                selectProduct(productsConfig.products[0].id);
            } else {
                // Show product selector - don't auto-select
                renderProductSelector();
                // Hide main content until user selects a template
                mainContent.classList.add('hidden');
            }
        } else {
            showError('No products available');
        }
    } catch (error) {
        console.error('Error loading products:', error);
        showError('Failed to load product configuration');
    }
}

/**
 * Render product carousel
 */
function renderProductSelector() {
    productSelector.style.display = 'block';
    productCarousel.innerHTML = '';
    
    // Create all carousel items first
    productsConfig.products.forEach((product, index) => {
        const item = document.createElement('div');
        item.className = 'carousel-item';
        item.dataset.productId = product.id;
        item.dataset.index = index;
        
        item.innerHTML = `
            <div class="carousel-card">
                <div class="carousel-thumbnail loading" id="thumb-${product.id}">
                    <span style="color: hsl(var(--muted-foreground)); font-size: 12px;">Loading...</span>
                </div>
                <div class="carousel-info">
                    <h4 class="carousel-title">${product.title}</h4>
                    <p class="carousel-description">${product.description}</p>
                </div>
            </div>
        `;
        
        item.addEventListener('click', () => selectProduct(product.id));
        productCarousel.appendChild(item);
    });
    
    // Generate ALL thumbnails in parallel using Promise.all
    const thumbnailPromises = productsConfig.products.map(product => generateThumbnail(product));
    Promise.all(thumbnailPromises).then(() => {
        console.log('All thumbnails loaded');
    }).catch(error => {
        console.error('Error loading some thumbnails:', error);
    });
    
    // Setup carousel navigation
    updateCarouselButtons();
}

/**
 * Generate thumbnail for a product
 */
async function generateThumbnail(product) {
    const thumbElement = document.getElementById(`thumb-${product.id}`);
    
    if (!thumbElement) {
        console.error(`Thumbnail element not found for product: ${product.id}`);
        return;
    }
    
    // If product has a thumbnail URL, use it
    if (product.thumbnail) {
        thumbElement.innerHTML = `<img src="${product.thumbnail}" alt="${product.title}">`;
        thumbElement.classList.remove('loading');
        return;
    }
    
    // Check if we already generated this thumbnail
    if (productThumbnails.has(product.id)) {
        const cachedThumb = productThumbnails.get(product.id);
        thumbElement.innerHTML = `<img src="${cachedThumb}" alt="${product.title}">`;
        thumbElement.classList.remove('loading');
        return;
    }
    
    // Generate thumbnail by calling preview API with default values
    try {
        const defaultFormData = {
            productId: product.id
        };
        
        // Add default values from variables
        product.variables.forEach(variable => {
            defaultFormData[variable.name] = variable.defaultValue || '';
        });
        
        const response = await fetch('/api/preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(defaultFormData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate thumbnail');
        }
        
        const data = await response.json();
        
        if (data.success && data.images && data.images.length > 0) {
            // Use first page as thumbnail
            const thumbnailData = data.images[0].data;
            productThumbnails.set(product.id, thumbnailData);
            
            // Re-get the element to ensure we have the latest reference
            const currentThumbElement = document.getElementById(`thumb-${product.id}`);
            if (currentThumbElement) {
                currentThumbElement.innerHTML = `<img src="${thumbnailData}" alt="${product.title}">`;
                currentThumbElement.classList.remove('loading');
                console.log(`Thumbnail loaded for: ${product.title}`);
            } else {
                console.error(`Lost reference to thumbnail element for: ${product.id}`);
            }
        } else {
            throw new Error('No images in response');
        }
    } catch (error) {
        console.error(`Error generating thumbnail for ${product.title}:`, error);
        thumbElement.innerHTML = `
            <div style="text-align: center; padding: 20px; color: hsl(var(--muted-foreground));">
                <div style="font-size: 32px; margin-bottom: 8px;">📄</div>
                <div style="font-size: 12px;">${product.title}</div>
            </div>
        `;
        thumbElement.classList.remove('loading');
    }
}

/**
 * Update carousel navigation buttons
 */
function updateCarouselButtons() {
    const items = productCarousel.querySelectorAll('.carousel-item');
    const containerWidth = productCarousel.parentElement.offsetWidth;
    const totalWidth = Array.from(items).reduce((sum, item) => sum + item.offsetWidth + 16, 0);
    
    carouselPrev.disabled = carouselPosition === 0;
    carouselNext.disabled = totalWidth <= containerWidth || carouselPosition <= -(totalWidth - containerWidth);
}

/**
 * Scroll carousel
 */
function scrollCarousel(direction) {
    const containerWidth = productCarousel.parentElement.offsetWidth;
    const scrollAmount = containerWidth * 0.8;
    
    if (direction === 'prev') {
        carouselPosition = Math.min(0, carouselPosition + scrollAmount);
    } else {
        carouselPosition -= scrollAmount;
    }
    
    productCarousel.style.transform = `translateX(${carouselPosition}px)`;
    updateCarouselButtons();
}

/**
 * Select a product and generate its form
 */
function selectProduct(productId) {
    currentProduct = productsConfig.products.find(p => p.id === productId);
    if (!currentProduct) {
        console.error('Product not found:', productId);
        return;
    }
    
    console.log('Selected product:', currentProduct.title);
    
    // Show main content if it was hidden
    mainContent.classList.remove('hidden');
    
    // Update active carousel item
    document.querySelectorAll('.carousel-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.productId === productId) {
            item.classList.add('active');
        }
    });
    
    // Generate form for this product
    generateForm();
    
    // Always generate a fresh preview when switching products
    // This ensures all view modes are updated correctly
    generatePreview();
}

/**
 * Generate form fields dynamically from product configuration
 */
function generateForm() {
    if (!currentProduct) return;
    
    formFields.innerHTML = '';
    
    currentProduct.variables.forEach(variable => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.setAttribute('for', variable.name);
        label.textContent = variable.label;
        formGroup.appendChild(label);
        
        let input;
        
        if (variable.type === 'select') {
            input = document.createElement('select');
            input.className = 'form-control';
            input.id = variable.name;
            input.name = variable.name;
            
            variable.options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option.value;
                optionEl.textContent = option.label;
                if (option.value === variable.defaultValue) {
                    optionEl.selected = true;
                }
                input.appendChild(optionEl);
            });
            
            // Ensure the default value is set after all options are added
            if (variable.defaultValue) {
                input.value = variable.defaultValue;
                console.log(`Set default value for ${variable.name}: ${variable.defaultValue}`);
            }
        } else if (variable.type === 'text') {
            // Check if this is a date field
            const isDateField = variable.name.toLowerCase().includes('date');
            
            if (isDateField) {
                // Create date input with calendar picker
                input = document.createElement('input');
                input.type = 'date';
                input.className = 'form-control date-input';
                input.id = variable.name;
                input.name = variable.name;
                
                // Convert default value from DD/MM/YYYY to YYYY-MM-DD for date input
                if (variable.defaultValue) {
                    const dateParts = variable.defaultValue.split('/');
                    if (dateParts.length === 3) {
                        const [day, month, year] = dateParts;
                        input.value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    }
                }
                
                // Add hidden input to store DD/MM/YYYY format for API
                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.id = `${variable.name}_formatted`;
                hiddenInput.name = variable.name;
                hiddenInput.value = variable.defaultValue || '';
                
                // Update hidden input when date changes
                input.addEventListener('change', (e) => {
                    const dateValue = e.target.value;
                    if (dateValue) {
                        const [year, month, day] = dateValue.split('-');
                        hiddenInput.value = `${day}/${month}/${year}`;
                    } else {
                        hiddenInput.value = '';
                    }
                });
                
                formGroup.appendChild(input);
                formGroup.appendChild(hiddenInput);
                
                console.log(`Set default date for ${variable.name}: ${variable.defaultValue}`);
            } else {
                // Regular text input
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-control';
                input.id = variable.name;
                input.name = variable.name;
                input.value = variable.defaultValue || '';
                if (variable.placeholder) {
                    input.placeholder = variable.placeholder;
                }
                console.log(`Set default value for ${variable.name}: ${input.value}`);
            }
        }
        
        if (variable.required) {
            input.required = true;
        }
        
        // Only append input if it hasn't been appended already (date fields append themselves)
        const isDateField = variable.name.toLowerCase().includes('date');
        if (!isDateField) {
            formGroup.appendChild(input);
        }
        
        formFields.appendChild(formGroup);
    });
    
    // Update form inputs reference for auto-refresh
    formInputs = form.querySelectorAll('input, select');
    setupAutoRefresh();
}

/**
 * Get form data as object
 */
function getFormData() {
    const formData = new FormData(form);
    const data = {
        productId: currentProduct.id
    };
    
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
    
    const totalPages = currentImages.length;
    pageIndicator.textContent = `Page ${currentPage + 1} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 0;
    nextPageBtn.disabled = currentPage === totalPages - 1;
    
    // Hide navigation if only one page
    const pageNavigation = document.querySelector('.page-navigation');
    if (totalPages <= 1) {
        pageNavigation.style.display = 'none';
    } else {
        pageNavigation.style.display = 'flex';
    }
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
 * Create a blank white image data URL
 */
function createBlankWhiteImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}

/**
 * Display spread view
 */
function displaySpread() {
    if (currentImages.length === 0) return;
    
    page1Image.src = currentImages[0]?.data || '';
    
    // Always show second page (blank if no image for print simulation)
    const page2Container = page2Image.parentElement;
    page2Container.style.display = 'flex';
    
    if (currentImages.length > 1) {
        page2Image.src = currentImages[1].data;
    } else {
        // Show blank white page to simulate reverse side
        page2Image.src = createBlankWhiteImage();
    }
}

/**
 * Display 3D view
 */
function display3DView() {
    if (currentImages.length === 0) return;
    
    page3DFront.src = currentImages[0]?.data || '';
    
    // Always show back page (blank if no image for print simulation)
    const backPageElement = document.querySelector('.page-back');
    backPageElement.style.display = 'block';
    
    if (currentImages.length > 1) {
        page3DBack.src = currentImages[1].data;
    } else {
        // Show blank white page to simulate reverse side
        page3DBack.src = createBlankWhiteImage();
    }
    
    update3DTransform();
}

/**
 * Update 3D transform
 */
function update3DTransform() {
    const transform = `
        translateX(${view3DState.translateX}px)
        translateY(${view3DState.translateY}px)
        scale(${view3DState.scale})
        rotateX(${view3DState.rotationX}deg)
        rotateY(${view3DState.rotationY}deg)
        rotateZ(${view3DState.rotationZ}deg)
    `;
    brochure3D.style.transform = transform;
}

/**
 * Reset 3D view to default position
 */
function reset3DView() {
    view3DState.rotationX = -15;
    view3DState.rotationY = 30;
    view3DState.rotationZ = 0;
    view3DState.translateX = 0;
    view3DState.translateY = 0;
    view3DState.scale = 1;
    update3DTransform();
}

/**
 * Handle 3D view mouse down
 */
function handle3DMouseDown(e) {
    view3DState.isDragging = true;
    view3DState.startX = e.clientX;
    view3DState.startY = e.clientY;
    view3DState.startRotationX = view3DState.rotationX;
    view3DState.startRotationY = view3DState.rotationY;
    view3DState.startTranslateX = view3DState.translateX;
    view3DState.startTranslateY = view3DState.translateY;
    scene3D.style.cursor = e.shiftKey ? 'grabbing' : 'grabbing';
    e.preventDefault();
}

/**
 * Handle 3D view mouse move
 */
function handle3DMouseMove(e) {
    if (!view3DState.isDragging) return;
    
    const deltaX = e.clientX - view3DState.startX;
    const deltaY = e.clientY - view3DState.startY;
    
    if (e.shiftKey) {
        // Pan mode
        view3DState.translateX = view3DState.startTranslateX + deltaX;
        view3DState.translateY = view3DState.startTranslateY + deltaY;
    } else {
        // Rotate mode
        view3DState.rotationY = view3DState.startRotationY + deltaX * 0.5;
        view3DState.rotationX = view3DState.startRotationX - deltaY * 0.5;
        
        // Clamp rotation X to prevent flipping
        view3DState.rotationX = Math.max(-90, Math.min(90, view3DState.rotationX));
    }
    
    update3DTransform();
}

/**
 * Handle 3D view mouse up
 */
function handle3DMouseUp() {
    view3DState.isDragging = false;
    scene3D.style.cursor = 'grab';
}

/**
 * Handle 3D view wheel (zoom)
 */
function handle3DWheel(e) {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    view3DState.scale = Math.max(0.3, Math.min(3, view3DState.scale + delta));
    
    update3DTransform();
}

/**
 * Toggle view mode between single and spread
 */
function toggleViewMode() {
    if (viewMode === '3d') {
        // If in 3D mode, switch to single
        viewMode = 'single';
    } else if (viewMode === 'single') {
        viewMode = 'spread';
    } else {
        viewMode = 'single';
    }
    updateViewDisplay();
}

/**
 * Toggle 3D view
 */
function toggle3DView() {
    if (viewMode === '3d') {
        viewMode = 'single';
    } else {
        viewMode = '3d';
    }
    updateViewDisplay();
}

/**
 * Update view display based on current mode
 */
function updateViewDisplay() {
    // Hide all views
    singlePageView.style.display = 'none';
    spreadView.style.display = 'none';
    view3D.style.display = 'none';
    
    // Update icons
    view3DToggle.classList.remove('active');
    
    // Show appropriate view
    if (viewMode === 'single') {
        viewModeIcon.classList.add('single');
        singlePageView.style.display = 'block';
        displayCurrentPage();
    } else if (viewMode === 'spread') {
        viewModeIcon.classList.remove('single');
        singlePageView.style.display = 'none';
        spreadView.style.display = 'block';
        displaySpread();
    } else if (viewMode === '3d') {
        view3D.style.display = 'block';
        view3DToggle.classList.add('active');
        display3DView();
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
        } else if (viewMode === 'spread') {
            displaySpread();
        } else if (viewMode === '3d') {
            display3DView();
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
    
    // Query all form inputs
    formInputs = form.querySelectorAll('input, select');
    
    // Add change listeners to all inputs
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
view3DToggle.addEventListener('click', toggle3DView);
themeToggle.addEventListener('click', toggleTheme);
retryBtn.addEventListener('click', generatePreview);

// 3D View Event Listeners
scene3D.addEventListener('mousedown', handle3DMouseDown);
document.addEventListener('mousemove', handle3DMouseMove);
document.addEventListener('mouseup', handle3DMouseUp);
scene3D.addEventListener('wheel', handle3DWheel, { passive: false });
reset3DViewBtn.addEventListener('click', reset3DView);

// Carousel navigation
carouselPrev.addEventListener('click', () => scrollCarousel('prev'));
carouselNext.addEventListener('click', () => scrollCarousel('next'));

// Carousel collapse/expand
carouselToggle.addEventListener('click', () => {
    productSelector.classList.toggle('collapsed');
    localStorage.setItem('carouselCollapsed', productSelector.classList.contains('collapsed'));
});

// Restore collapsed state from localStorage
if (localStorage.getItem('carouselCollapsed') === 'true') {
    productSelector.classList.add('collapsed');
}

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
viewModeIcon.classList.add('single');

// Load products and initialize
loadProducts();

// Show initial message
console.log('XMPie Brochure Customizer loaded successfully!');
console.log('Powered by PersonalEffect Print Pro & uProduce API');
