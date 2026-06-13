(() => {
  const STORAGE_KEY = 'vintageExpressionsCartV1';
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  let card = null;
  let paymentConfig = null;
  let isSubmitting = false;

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function loadCart() {
    try {
      const cart = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(cart) ? cart : [];
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent('ve-cart-updated'));
  }

  function formatCents(cents, currency = 'USD') {
    const formatter = currency === 'USD'
      ? money
      : new Intl.NumberFormat('en-US', { style: 'currency', currency });

    return formatter.format((Number(cents) || 0) / 100);
  }

  function getCartTotal(cart) {
    return cart.reduce((sum, item) => sum + ((Number(item.priceCents) || 0) * (Number(item.quantity) || 1)), 0);
  }

  function setStatus(message, type = '') {
    const status = document.querySelector('[data-checkout-status]');
    if (!status) return;

    status.textContent = message || '';
    status.dataset.statusType = type;
  }

  function setSubmitState(isBusy) {
    const button = document.querySelector('[data-place-order]');
    if (!button) return;

    button.disabled = isBusy || !loadCart().length;
    button.textContent = isBusy ? 'Processing Payment...' : 'Place Order Securely';
  }

  function renderSummary() {
    const cart = loadCart();
    const itemsEl = document.querySelector('[data-checkout-items]');
    const totalEl = document.querySelector('[data-checkout-total]');
    const subtotalEl = document.querySelector('[data-checkout-subtotal]');
    const emptyEl = document.querySelector('[data-checkout-empty]');
    const formEl = document.querySelector('[data-checkout-form-wrap]');

    if (emptyEl) emptyEl.hidden = Boolean(cart.length);
    if (formEl) formEl.hidden = !cart.length;

    if (subtotalEl) subtotalEl.textContent = formatCents(getCartTotal(cart), cart[0]?.currency || 'USD');
    if (totalEl) totalEl.textContent = formatCents(getCartTotal(cart), cart[0]?.currency || 'USD');

    if (!itemsEl) return;

    if (!cart.length) {
      itemsEl.innerHTML = '';
      setSubmitState(false);
      return;
    }

    itemsEl.innerHTML = cart.map((item) => `
      <article class="checkout-line-item">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : ''}
        <div>
          <h3>${escapeHtml(item.name || 'Vintage Find')}</h3>
          <p>${formatCents(item.priceCents, item.currency)} × ${Number(item.quantity) || 1}</p>
        </div>
        <strong>${formatCents((Number(item.priceCents) || 0) * (Number(item.quantity) || 1), item.currency)}</strong>
      </article>
    `).join('');

    setSubmitState(false);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        if (window.Square) resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Unable to load Square payment library.'));
      document.head.appendChild(script);
    });
  }

  async function loadPaymentConfig() {
    const response = await fetch('/.netlify/functions/square-config');

    if (!response.ok) {
      throw new Error('Unable to load Square payment configuration.');
    }

    const config = await response.json();

    if (!config.applicationId || !config.locationId || !config.squareJsUrl) {
      throw new Error('Square payment configuration is incomplete.');
    }

    return config;
  }

  async function initializeCard() {
    if (!loadCart().length) return;

    setStatus('Loading secure payment form...', 'info');

    paymentConfig = await loadPaymentConfig();
    await loadScript(paymentConfig.squareJsUrl);

    if (!window.Square) {
      throw new Error('Square payment library did not initialize.');
    }

    const payments = window.Square.payments(paymentConfig.applicationId, paymentConfig.locationId);

    card = await payments.card({
      style: {
        input: {
          color: '#2e2117',
          fontFamily: 'Montserrat, Arial, sans-serif',
          fontSize: '16px'
        },
        '.input-container': {
          borderColor: '#dcc7a1',
          borderRadius: '12px'
        },
        '.input-container.is-focus': {
          borderColor: '#2f8c84'
        }
      }
    });

    await card.attach('#card-container');
    setStatus('Secure card form ready.', 'success');
  }

  function collectCheckoutDetails() {
    return {
      firstName: document.querySelector('[name="firstName"]')?.value || '',
      lastName: document.querySelector('[name="lastName"]')?.value || '',
      email: document.querySelector('[name="email"]')?.value || '',
      phone: document.querySelector('[name="phone"]')?.value || '',
      pickupMethod: document.querySelector('[name="pickupMethod"]:checked')?.value || 'In-store pickup',
      notes: document.querySelector('[name="notes"]')?.value || ''
    };
  }

  function validateDetails(details) {
    if (!details.firstName.trim()) return 'Please enter your first name.';
    if (!details.lastName.trim()) return 'Please enter your last name.';
    if (!details.email.trim()) return 'Please enter your email address.';
    return '';
  }

  async function submitPayment(event) {
    event.preventDefault();

    if (isSubmitting) return;

    const cart = loadCart();

    if (!cart.length) {
      setStatus('Your cart is empty.', 'error');
      return;
    }

    if (!card) {
      setStatus('The secure card form is still loading. Please try again in a moment.', 'error');
      return;
    }

    const checkout = collectCheckoutDetails();
    const validationMessage = validateDetails(checkout);

    if (validationMessage) {
      setStatus(validationMessage, 'error');
      return;
    }

    isSubmitting = true;
    setSubmitState(true);
    setStatus('Tokenizing payment securely...', 'info');

    try {
      const tokenResult = await card.tokenize();

      if (tokenResult.status !== 'OK') {
        const message = tokenResult.errors?.map((error) => error.message).join(' ') || 'Unable to tokenize card.';
        throw new Error(message);
      }

      setStatus('Submitting payment to Square...', 'info');

      const response = await fetch('/.netlify/functions/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: tokenResult.token,
          checkout,
          items: cart.map((item) => ({
            variationId: item.variationId,
            quantity: item.quantity
          }))
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to complete payment.');
      }

      saveCart([]);
      setStatus('Payment complete. Redirecting...', 'success');
      window.location.href = data.redirectUrl || '/thank-you/?checkout=complete';
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Unable to complete payment.', 'error');
      isSubmitting = false;
      setSubmitState(false);
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    renderSummary();

    const form = document.querySelector('[data-checkout-form]');
    if (form) form.addEventListener('submit', submitPayment);

    try {
      await initializeCard();
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Unable to load Square payment form.', 'error');
    }
  });
})();
