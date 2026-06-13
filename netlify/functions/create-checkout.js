const crypto = require('crypto');

const SQUARE_VERSION = process.env.SQUARE_VERSION || '2026-05-20';

function getSquareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

function getSiteUrl() {
  return (process.env.SITE_URL || 'https://www.vintageexpressions.com').replace(/\/$/, '');
}

async function squareFetch(path, options = {}) {
  const token = process.env.SQUARE_ACCESS_TOKEN;

  if (!token) {
    throw new Error('Missing SQUARE_ACCESS_TOKEN');
  }

  const response = await fetch(`${getSquareBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const responseText = await response.text();
  let data = null;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { raw: responseText };
  }

  if (!response.ok) {
    const message = data?.errors?.[0]?.detail || responseText || `Square API error ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.squareResponse = data;
    throw error;
  }

  return data;
}

function normalizeCartItems(inputItems) {
  if (!Array.isArray(inputItems)) return [];

  const seen = new Map();

  inputItems.forEach((item) => {
    const variationId = String(item.variationId || '').trim();
    const quantity = Math.max(1, Math.min(99, Number.parseInt(item.quantity, 10) || 1));

    if (!variationId) return;

    seen.set(variationId, (seen.get(variationId) || 0) + quantity);
  });

  return Array.from(seen.entries()).map(([variationId, quantity]) => ({
    catalog_object_id: variationId,
    quantity: String(Math.max(1, Math.min(99, quantity)))
  }));
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed.' })
    };
  }

  try {
    const locationId = process.env.SQUARE_LOCATION_ID;

    if (!locationId) {
      throw new Error('Missing SQUARE_LOCATION_ID');
    }

    const payload = JSON.parse(event.body || '{}');
    const lineItems = normalizeCartItems(payload.items);

    if (!lineItems.length) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Your cart is empty.' })
      };
    }

    const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    const squarePayload = {
      idempotency_key: idempotencyKey,
      order: {
        location_id: locationId,
        line_items: lineItems
      },
      checkout_options: {
        redirect_url: `${getSiteUrl()}/thank-you/?checkout=complete`,
        ask_for_shipping_address: false,
        allow_tipping: false
      },
      pre_populated_data: {
        buyer_email: typeof payload.email === 'string' ? payload.email : undefined
      }
    };

    const data = await squareFetch('/v2/online-checkout/payment-links', {
      method: 'POST',
      body: JSON.stringify(squarePayload)
    });

    const checkoutUrl =
      data?.payment_link?.url ||
      data?.payment_link?.long_url ||
      data?.checkout?.checkout_page_url ||
      '';

    if (!checkoutUrl) {
      throw new Error('Square did not return a checkout URL.');
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutUrl,
        paymentLinkId: data?.payment_link?.id || '',
        orderId: data?.payment_link?.order_id || data?.related_resources?.orders?.[0]?.id || ''
      })
    };
  } catch (error) {
    console.error(error);

    return {
      statusCode: error.statusCode || 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Unable to create checkout.',
        squareResponse: error.squareResponse || undefined
      })
    };
  }
};
