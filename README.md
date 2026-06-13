

## Square Sandbox Cart + Checkout

This build includes a working cart and Square-hosted checkout flow.

Required Netlify environment variables:

```txt
SQUARE_ACCESS_TOKEN=your sandbox or production access token
SQUARE_ENVIRONMENT=sandbox
SQUARE_APPLICATION_ID=your app id
SQUARE_LOCATION_ID=your matching location id
SQUARE_VERSION=2026-05-20
SITE_URL=https://www.vintageexpressions.com
```

For sandbox testing, keep:

```txt
SQUARE_ENVIRONMENT=sandbox
```

The cart sends selected Square `CatalogItemVariation` IDs to:

```txt
/.netlify/functions/create-checkout
```

That function creates a Square Checkout payment link and redirects the customer to Square's hosted checkout page.

When switching to production later, update:

```txt
SQUARE_ACCESS_TOKEN=production token
SQUARE_ENVIRONMENT=production
SQUARE_LOCATION_ID=production location id
SQUARE_APPLICATION_ID=production application id
```

No frontend code should need to change.
