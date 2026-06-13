import { createProductCard } from './product-template.js';

function getRequestedCategory(container) {
  return container.dataset.squareCategory || '';
}

function normalize(value = '') {
  return String(value).trim().toLowerCase();
}

async function loadProducts() {
  const containers = document.querySelectorAll('[data-square-products]');

  if (!containers.length) return;

  try {
    const response = await fetch('/.netlify/functions/square-products');

    if (!response.ok) {
      throw new Error('Failed to load inventory');
    }

    const data = await response.json();
    const products = Array.isArray(data.products) ? data.products : [];

    containers.forEach((container) => {
      const requestedCategory = getRequestedCategory(container);

      const filteredProducts = requestedCategory
        ? products.filter((product) => normalize(product.category) === normalize(requestedCategory))
        : products;

      if (!filteredProducts.length) {
        container.innerHTML = `
          <div class="inventory-empty">
            <p>New treasures are arriving soon.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = filteredProducts
        .map((product) => createProductCard(product))
        .join('');

      container.querySelectorAll('.reveal').forEach((el) => {
        el.classList.add('is-visible');
      });
    });
  } catch (error) {
    console.error(error);

    containers.forEach((container) => {
      container.innerHTML = `
        <div class="inventory-error">
          <p>Unable to load inventory right now.</p>
        </div>
      `;
    });
  }
}

document.addEventListener('DOMContentLoaded', loadProducts);
