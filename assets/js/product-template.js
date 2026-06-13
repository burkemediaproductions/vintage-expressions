function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatPrice(product) {
  if (typeof product.price !== 'number') return '';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency || 'USD'
  }).format(product.price);
}

export function createProductCard(product) {
  const name = escapeHtml(product.name || 'Vintage Find');
  const description = escapeHtml(product.description || '');
  const category = escapeHtml(product.category || 'Vintage Find');
  const image = escapeHtml(product.image || '/assets/img/shop/product-placeholder.jpg');
  const price = formatPrice(product);
  const variationId = escapeHtml(product.variationId || '');
  const priceAmountCents = Number.isFinite(Number(product.priceAmountCents)) ? Number(product.priceAmountCents) : '';

  return `
    <article class="product-card reveal" data-product-category="${category}">
      <img
        src="${image}"
        alt="${name}"
        loading="lazy"
        width="600"
        height="600"
      >

      <div class="product-card-content">
        <p class="eyebrow dark">${category}</p>
        <h3>${name}</h3>

        ${description ? `<p>${description}</p>` : ''}

        ${price ? `<div class="product-price">${price}</div>` : ''}

        <div class="product-actions">
          ${
            variationId
              ? `<button
                  class="btn btn-primary add-to-cart"
                  type="button"
                  data-variation-id="${variationId}"
                  data-name="${name}"
                  data-price-cents="${priceAmountCents}"
                  data-currency="${escapeHtml(product.currency || 'USD')}"
                  data-image="${image}"
                >Add to Cart</button>`
              : `<a href="/contact/" class="btn btn-primary">Ask About This Item</a>`
          }
        </div>
      </div>
    </article>
  `;
}
