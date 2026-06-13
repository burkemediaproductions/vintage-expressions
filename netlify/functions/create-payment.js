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
    const message = data?.errors?.[0]?.detail || data?.errors?.[0]?.code || responseText || `Square API error ${response.status}`;
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

function cleanString(value, maxLength = 255) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeCheckoutDetails(details = {}) {
  const pickupMethod = cleanString(details.pickupMethod, 40) || 'In-store pickup';
  const firstName = cleanString(details.firstName, 80);
  const lastName = cleanString(details.lastName, 80);
  const email = cleanString(details.email, 120);
  const phone = cleanString(details.phone, 40);
  const notes = cleanString(details.notes, 500);

  return {
    pickupMethod,
    firstName,
    lastName,
    email,
    phone,
    notes,
    fullName: [firstName, lastName].filter(Boolean).join(' ')
  };
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
    const body = JSON.parse(event.body || '{}');
    const sourceId = String(body.sourceId || '').trim();
    const locationId = process.env.SQUARE_LOCATION_ID;
    const lineItems = normalizeCartItems(body.items);
    const checkoutDetails = normalizeCheckoutDetails(body.checkout || {});

    if (!sourceId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing Square payment token.' })
      };
    }

    if (!locationId) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing SQUARE_LOCATION_ID.' })
      };
    }

    if (!lineItems.length) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Your cart is empty.' })
      };
    }

    const orderNoteParts = [
      'Vintage Expressions website checkout',
      checkoutDetails.pickupMethod ? `Fulfillment: ${checkoutDetails.pickupMethod}` : '',
      checkoutDetails.fullName ? `Customer: ${checkoutDetails.fullName}` : '',
      checkoutDetails.email ? `Email: ${checkoutDetails.email}` : '',
      checkoutDetails.phone ? `Phone: ${checkoutDetails.phone}` : '',
      checkoutDetails.notes ? `Notes: ${checkoutDetails.notes}` : ''
    ].filter(Boolean);

    const orderResult = await squareFetch('/v2/orders', {
      method: 'POST',
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: locationId,
          line_items: lineItems,
          note: orderNoteParts.join('\n')
        }
      })
    });

    const order = orderResult.order;
    const amountMoney = order?.total_money;

    if (!order?.id || !amountMoney?.amount || !amountMoney?.currency) {
      throw new Error('Square did not return a payable order total.');
    }

    const paymentBody = {
      source_id: sourceId,
      idempotency_key: crypto.randomUUID(),
      amount_money: amountMoney,
      order_id: order.id,
      location_id: locationId,
      note: 'Vintage Expressions website checkout',
      autocomplete: true
    };

    if (checkoutDetails.email) {
      paymentBody.buyer_email_address = checkoutDetails.email;
    }

    const paymentResult = await squareFetch('/v2/payments', {
      method: 'POST',
      body: JSON.stringify(paymentBody)
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        orderId: order.id,
        paymentId: paymentResult.payment?.id || '',
        status: paymentResult.payment?.status || '',
        receiptUrl: paymentResult.payment?.receipt_url || '',
        redirectUrl: `${getSiteUrl()}/thank-you/?checkout=complete&order=${encodeURIComponent(order.id)}`
      })
    };
  } catch (error) {
    console.error('Create payment failed', error.squareResponse || error);

    return {
      statusCode: error.statusCode || 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Unable to complete payment.'
      })
    };
  }
};
