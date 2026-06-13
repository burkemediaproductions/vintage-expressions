(() => {
  const STORAGE_KEY = 'vintageExpressionsCartV1';
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

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
    const formatter = currency === 'USD' ? money : new Intl.NumberFormat('en-US', { style: 'currency', currency });
    return formatter.format((Number(cents) || 0) / 100);
  }

  function getCartTotal(cart) {
    return cart.reduce((sum, item) => sum + ((Number(item.priceCents) || 0) * (Number(item.quantity) || 1)), 0);
  }

  function addItem(item) {
    if (!item.variationId) return;

    const cart = loadCart();
    const existing = cart.find((cartItem) => cartItem.variationId === item.variationId);

    if (existing) {
      existing.quantity = Math.min(99, (Number(existing.quantity) || 1) + 1);
    } else {
      cart.push({
        variationId: item.variationId,
        name: item.name || 'Vintage Find',
        priceCents: Number(item.priceCents) || 0,
        currency: item.currency || 'USD',
        image: item.image || '',
        quantity: 1
      });
    }

    saveCart(cart);
    openCart();
  }

  function updateQuantity(variationId, quantity) {
    let cart = loadCart();
    const item = cart.find((cartItem) => cartItem.variationId === variationId);

    if (!item) return;

    item.quantity = Math.max(1, Math.min(99, Number(quantity) || 1));
    saveCart(cart);
  }

  function removeItem(variationId) {
    const cart = loadCart().filter((item) => item.variationId !== variationId);
    saveCart(cart);
  }

  function clearCart() {
    saveCart([]);
  }

  function renderCart() {
    const cart = loadCart();
    const count = cart.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const total = getCartTotal(cart);

    const countEl = document.querySelector('[data-cart-count]');
    const itemsEl = document.querySelector('[data-cart-items]');
    const totalEl = document.querySelector('[data-cart-total]');
    const checkoutBtn = document.querySelector('[data-cart-checkout]');
    const clearBtn = document.querySelector('[data-cart-clear]');

    if (countEl) countEl.textContent = String(count);
    if (totalEl) totalEl.textContent = formatCents(total, cart[0]?.currency || 'USD');
    if (checkoutBtn) checkoutBtn.disabled = !cart.length;
    if (clearBtn) clearBtn.hidden = !cart.length;

    if (!itemsEl) return;

    if (!cart.length) {
      itemsEl.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
      return;
    }

    itemsEl.innerHTML = cart.map((item) => `
      <article class="cart-line-item">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : ''}
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${formatCents(item.priceCents, item.currency)}</p>
          <label>
            <span class="sr-only">Quantity for ${escapeHtml(item.name)}</span>
            <input type="number" min="1" max="99" value="${Number(item.quantity) || 1}" data-cart-qty="${escapeHtml(item.variationId)}">
          </label>
          <button type="button" class="cart-remove" data-cart-remove="${escapeHtml(item.variationId)}">Remove</button>
        </div>
      </article>
    `).join('');
  }

  function createCartUi() {
    if (document.querySelector('[data-cart-drawer]')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'cart-ui';
    wrapper.innerHTML = `
      <button class="cart-floating-button" type="button" data-cart-open aria-label="Open shopping cart">
        Cart <span data-cart-count>0</span>
      </button>

      <div class="cart-drawer" data-cart-drawer aria-hidden="true">
        <div class="cart-backdrop" data-cart-close></div>
        <aside class="cart-panel" aria-label="Shopping cart" tabindex="-1">
          <div class="cart-panel-header">
            <div>
              <p class="eyebrow dark">Vintage Expressions</p>
              <h2>Shopping Cart</h2>
            </div>
            <button type="button" class="cart-close" data-cart-close aria-label="Close cart">×</button>
          </div>

          <div class="cart-items" data-cart-items></div>

          <div class="cart-summary">
            <div class="cart-total-row">
              <span>Total</span>
              <strong data-cart-total>$0.00</strong>
            </div>
            <p class="cart-note">Checkout happens securely on our site using Square’s payment form.</p>
            <button class="btn btn-primary cart-checkout" type="button" data-cart-checkout>Checkout</button>
            <button class="cart-clear" type="button" data-cart-clear>Clear cart</button>
            <p class="cart-error" data-cart-error role="alert"></p>
          </div>
        </aside>
      </div>
    `;

    document.body.appendChild(wrapper);
  }

  function openCart() {
    const drawer = document.querySelector('[data-cart-drawer]');
    const panel = document.querySelector('.cart-panel');

    if (!drawer) return;

    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cart-open');
    renderCart();
    if (panel) panel.focus();
  }

  function closeCart() {
    const drawer = document.querySelector('[data-cart-drawer]');

    if (!drawer) return;

    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cart-open');
  }

  async function checkout() {
    const errorEl = document.querySelector('[data-cart-error]');
    const checkoutBtn = document.querySelector('[data-cart-checkout]');
    const cart = loadCart();

    if (!cart.length) return;

    if (errorEl) errorEl.textContent = '';
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.textContent = 'Opening Checkout...';
    }

    window.location.href = '/checkout/';
  }

  function wireCartEvents() {
    document.addEventListener('click', (event) => {
      const addButton = event.target.closest('.add-to-cart');
      if (addButton) {
        addItem({
          variationId: addButton.dataset.variationId,
          name: addButton.dataset.name,
          priceCents: addButton.dataset.priceCents,
          currency: addButton.dataset.currency,
          image: addButton.dataset.image
        });
        return;
      }

      if (event.target.closest('[data-cart-open]')) {
        openCart();
        return;
      }

      if (event.target.closest('[data-cart-close]')) {
        closeCart();
        return;
      }

      const removeButton = event.target.closest('[data-cart-remove]');
      if (removeButton) {
        removeItem(removeButton.dataset.cartRemove);
        return;
      }

      if (event.target.closest('[data-cart-checkout]')) {
        checkout();
        return;
      }

      if (event.target.closest('[data-cart-clear]')) {
        clearCart();
        return;
      }
    });

    document.addEventListener('change', (event) => {
      const quantityInput = event.target.closest('[data-cart-qty]');
      if (!quantityInput) return;
      updateQuantity(quantityInput.dataset.cartQty, quantityInput.value);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeCart();
    });

    window.addEventListener('ve-cart-updated', renderCart);
  }

  document.addEventListener('DOMContentLoaded', () => {
    createCartUi();
    wireCartEvents();
    renderCart();
  });
})();
