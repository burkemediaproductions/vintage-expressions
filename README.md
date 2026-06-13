

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

## Square item/category troubleshooting

This version intentionally displays Square catalog items even when they are not yet checkout-ready. If an item is missing a variation or price, it appears with an `Ask About This Item` button instead of `Add to Cart`.

Debug helpers:

```txt
/.netlify/functions/square-debug
/data/square-catalog-debug.json
```

Use these to confirm what the API is actually returning from Sandbox or Production.

Items do not need to be assigned to a Square Online channel for the Catalog API to return them. The important fields for this site are:

```txt
Item exists in the same Square environment as SQUARE_ENVIRONMENT
Item is assigned to a Square category
Item has at least one item variation
Item variation has a price if it should be checkout-ready
Item/location visibility is compatible with SQUARE_LOCATION_ID
```

Checkout requires a Square CatalogItemVariation ID and price.

## Branded on-site Square checkout

This build includes a custom `/checkout/` page using Square Web Payments SDK.

Flow:

```txt
Cart on Vintage Expressions
→ /checkout/ branded page
→ Square secure card element tokenizes card
→ Netlify function creates a Square order
→ Netlify function charges payment through Payments API
→ /thank-you/?checkout=complete
```

Required Netlify environment variables:

```txt
SQUARE_ACCESS_TOKEN=your sandbox or production access token
SQUARE_ENVIRONMENT=sandbox
SQUARE_APPLICATION_ID=your matching sandbox or production application ID
SQUARE_LOCATION_ID=your matching sandbox or production location ID
SQUARE_VERSION=2026-05-20
SITE_URL=https://www.vintageexpressions.com
```

Sandbox uses:

```txt
https://sandbox.web.squarecdn.com/v1/square.js
```

Production uses:

```txt
https://web.squarecdn.com/v1/square.js
```

Important: the card number field is still controlled by Square. The surrounding checkout page is branded by Vintage Expressions, but card data never touches the site code.
