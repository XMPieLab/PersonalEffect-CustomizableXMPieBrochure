# Multi-Template System Guide

## Overview

The XMPie Brochure Customizer now supports multiple templates/products through a flexible JSON-based configuration system. This allows you to easily add, modify, or remove templates without changing the application code.

## Architecture

### Key Components

1. **products.json** - Central configuration file defining all available templates
2. **Server API** - Dynamic job ticket generation based on product configuration
3. **Frontend** - Automatic form generation and product selection UI

## Configuration File: products.json

### Structure

```json
{
  "products": [
    {
      "id": "unique-product-id",
      "title": "Product Display Name",
      "description": "Brief description of the product",
      "campaignId": 9767,
      "planId": 9709,
      "sizes": [...],
      "variables": [...]
    }
  ]
}
```

### Product Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the product |
| `title` | string | Yes | Display name shown in UI |
| `description` | string | Yes | Brief description for product selector |
| `campaignId` | number | Yes | uProduce Campaign ID |
| `planId` | number | Yes | uProduce Plan ID |
| `sizes` | array | Yes | Available page sizes and their document IDs |
| `variables` | array | Yes | Customizable fields for this product |

### Size Configuration

Each size object defines a page size option:

```json
{
  "name": "A4",
  "documentId": 39859,
  "label": "A4"
}
```

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Internal name (used in form data) |
| `documentId` | number | uProduce Document ID for this size |
| `label` | string | Display label in UI |

### Variable Configuration

Variables define the customizable fields for a product:

```json
{
  "name": "language",
  "label": "Language",
  "type": "select",
  "planObjectName": "Language",
  "planObjectType": "Variable",
  "required": true,
  "defaultValue": "EN",
  "options": [
    { "value": "EN", "label": "English" },
    { "value": "FR", "label": "French" }
  ]
}
```

#### Variable Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Field name (used in form data) |
| `label` | string | Yes | Display label in UI |
| `type` | string | Yes | Field type: "select" or "text" |
| `planObjectName` | string | No* | uProduce Plan Object Name |
| `planObjectType` | string | No* | uProduce Plan Object Type ("Variable" or "ADOR") |
| `required` | boolean | Yes | Whether field is required |
| `defaultValue` | string | Yes | Default value for the field |
| `placeholder` | string | No | Placeholder text (for text inputs) |
| `options` | array | Yes** | Available options (for select inputs) |

\* `planObjectName` and `planObjectType` should be `null` for special fields like `pageSize` that don't map to uProduce customizations.

\*\* `options` is required only for `type: "select"`

#### Variable Types

**Select Field:**
```json
{
  "name": "industry",
  "label": "Industry",
  "type": "select",
  "planObjectName": "VAR_Industry",
  "planObjectType": "Variable",
  "required": true,
  "defaultValue": "FinancialServices",
  "options": [
    { "value": "FinancialServices", "label": "Financial Services" },
    { "value": "HealthcareIndustry", "label": "Healthcare Industry" }
  ]
}
```

**Text Field:**
```json
{
  "name": "firstName",
  "label": "First Name",
  "type": "text",
  "planObjectName": "First Name",
  "planObjectType": "ADOR",
  "required": false,
  "defaultValue": "YourName",
  "placeholder": "Enter first name"
}
```

## Adding a New Template

### Step 1: Gather Template Information

Collect the following from your uProduce setup:
- Campaign ID
- Plan ID
- Document IDs for each size variation
- Variable names and types from your plan
- Available options for each variable

### Step 2: Add to products.json

Add a new product object to the `products` array:

```json
{
  "id": "new-template",
  "title": "New Marketing Flyer",
  "description": "Customizable marketing flyer with dynamic content",
  "campaignId": 1234,
  "planId": 5678,
  "sizes": [
    {
      "name": "A4",
      "documentId": 11111,
      "label": "A4"
    },
    {
      "name": "Letter",
      "documentId": 22222,
      "label": "US Letter"
    }
  ],
  "variables": [
    {
      "name": "pageSize",
      "label": "Page Size",
      "type": "select",
      "planObjectName": null,
      "planObjectType": null,
      "required": true,
      "defaultValue": "A4",
      "options": [
        { "value": "A4", "label": "A4" },
        { "value": "Letter", "label": "US Letter" }
      ]
    },
    {
      "name": "headline",
      "label": "Headline Text",
      "type": "text",
      "planObjectName": "VAR_Headline",
      "planObjectType": "Variable",
      "required": true,
      "defaultValue": "Your Headline Here",
      "placeholder": "Enter headline"
    }
  ]
}
```

### Step 3: Restart the Server

The application will automatically load the new template on restart.

## User Experience

### Single Product

When only one product is defined in `products.json`:
- Product selector is hidden
- Form is displayed immediately
- Preview generates automatically

### Multiple Products

When multiple products are defined:
- Product selector cards are displayed
- User clicks a card to select a template
- Form is generated dynamically based on selection
- Preview generates after selection

## API Changes

### New Endpoint: GET /api/products

Returns the complete products configuration:

```json
{
  "products": [...]
}
```

### Updated Endpoints

Both `/api/preview` and `/api/download-pdf` now require `productId` in the request body:

```json
{
  "productId": "xmpie-brochure",
  "pageSize": "A4",
  "language": "EN",
  ...
}
```

## Dynamic Job Ticket Generation

The server now builds job tickets dynamically:

1. Retrieves product configuration by `productId`
2. Selects document ID based on `pageSize`
3. Builds customizations array from product variables
4. Generates job ticket with correct Campaign ID and Plan ID

## Best Practices

### Variable Naming

- Use descriptive names: `firstName`, `companyName`, `industryType`
- Match uProduce Plan Object Names exactly
- Use consistent naming conventions

### Default Values

- Always provide sensible defaults
- Ensure defaults are valid options for select fields
- Use empty strings for optional text fields if appropriate

### Options Organization

- Order options logically (alphabetically or by popularity)
- Use clear, descriptive labels
- Keep value names consistent with uProduce

### Testing New Templates

1. Add template to `products.json`
2. Restart server
3. Verify template appears in selector (if multiple products)
4. Test form generation
5. Test preview generation
6. Test PDF download
7. Verify all variables are correctly mapped

## Troubleshooting

### Template Not Appearing

- Check JSON syntax in `products.json`
- Verify `id` is unique
- Check server console for loading errors

### Form Fields Not Generating

- Verify `variables` array is properly formatted
- Check that `type` is either "select" or "text"
- Ensure `options` array exists for select fields

### Preview/PDF Errors

- Verify Campaign ID and Plan ID are correct
- Check Document IDs for each size
- Ensure `planObjectName` matches uProduce exactly
- Verify `planObjectType` is "Variable" or "ADOR"

### Variable Not Applying

- Check `planObjectName` spelling
- Verify `planObjectType` is correct
- Ensure variable exists in uProduce Plan
- Check that value is being sent in form data

## Example: Complete Product Configuration

```json
{
  "id": "corporate-brochure",
  "title": "Corporate Brochure",
  "description": "Professional corporate brochure with customizable content and branding",
  "campaignId": 9999,
  "planId": 8888,
  "sizes": [
    {
      "name": "A4",
      "documentId": 77777,
      "label": "A4 (210 × 297 mm)"
    },
    {
      "name": "Letter",
      "documentId": 66666,
      "label": "US Letter (8.5 × 11 in)"
    },
    {
      "name": "Tabloid",
      "documentId": 55555,
      "label": "Tabloid (11 × 17 in)"
    }
  ],
  "variables": [
    {
      "name": "pageSize",
      "label": "Page Size",
      "type": "select",
      "planObjectName": null,
      "planObjectType": null,
      "required": true,
      "defaultValue": "A4",
      "options": [
        { "value": "A4", "label": "A4 (210 × 297 mm)" },
        { "value": "Letter", "label": "US Letter (8.5 × 11 in)" },
        { "value": "Tabloid", "label": "Tabloid (11 × 17 in)" }
      ]
    },
    {
      "name": "language",
      "label": "Language",
      "type": "select",
      "planObjectName": "Language",
      "planObjectType": "Variable",
      "required": true,
      "defaultValue": "EN",
      "options": [
        { "value": "EN", "label": "English" },
        { "value": "ES", "label": "Spanish" },
        { "value": "FR", "label": "French" }
      ]
    },
    {
      "name": "companyName",
      "label": "Company Name",
      "type": "text",
      "planObjectName": "Company",
      "planObjectType": "ADOR",
      "required": true,
      "defaultValue": "",
      "placeholder": "Enter your company name"
    },
    {
      "name": "tagline",
      "label": "Company Tagline",
      "type": "text",
      "planObjectName": "VAR_Tagline",
      "planObjectType": "Variable",
      "required": false,
      "defaultValue": "",
      "placeholder": "Enter your tagline"
    },
    {
      "name": "colorScheme",
      "label": "Color Scheme",
      "type": "select",
      "planObjectName": "VAR_ColorScheme",
      "planObjectType": "Variable",
      "required": true,
      "defaultValue": "Blue",
      "options": [
        { "value": "Blue", "label": "Professional Blue" },
        { "value": "Green", "label": "Fresh Green" },
        { "value": "Red", "label": "Bold Red" },
        { "value": "Purple", "label": "Creative Purple" }
      ]
    }
  ]
}
```

## Migration from Single Template

If you're migrating from the original single-template version:

1. **Backup your `.env` file** - You'll need the Campaign ID and Plan ID
2. **Create `products.json`** - Use the example structure
3. **Map your existing variables** - Convert hardcoded variables to JSON format
4. **Test thoroughly** - Ensure all functionality works as before
5. **Add new templates** - Now you can easily add more!

## Future Enhancements

Potential additions to the system:

- **Template categories** - Group templates by type
- **Template preview images** - Show thumbnail in selector
- **Conditional fields** - Show/hide fields based on other selections
- **Field validation** - Custom validation rules per field
- **Template versioning** - Support multiple versions of same template
- **User permissions** - Restrict access to certain templates

## Support

For questions or issues:
- Check server console logs for errors
- Validate JSON syntax in `products.json`
- Verify uProduce API credentials in `.env`
- Review uProduce Plan configuration

---

© 2025 XMPie - A Xerox Company
