const SQUARE_VERSION = process.env.SQUARE_VERSION || '2026-05-20';

function getSquareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

function slugify(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Square API error ${response.status}: ${body}`);
  }

  return response.json();
}

async function listCatalogObjects(types = 'ITEM,CATEGORY,IMAGE') {
  const objects = [];
  let cursor = '';

  do {
    const qs = new URLSearchParams({ types });
    if (cursor) qs.set('cursor', cursor);

    const data = await squareFetch(`/v2/catalog/list?${qs.toString()}`);
    objects.push(...(data.objects || []));
    cursor = data.cursor || '';
  } while (cursor);

  return objects;
}

function normalizeCatalog(objects) {
  const categories = [];
  const categoriesById = new Map();
  const imagesById = new Map();

  for (const object of objects) {
    if (object.is_deleted) continue;

    if (object.type === 'CATEGORY') {
      const name = object.category_data?.name || 'Category';
      const category = {
        id: object.id,
        name,
        slug: slugify(name),
        updatedAt: object.updated_at || ''
      };
      categories.push(category);
      categoriesById.set(object.id, category);
    }

    if (object.type === 'IMAGE') {
      imagesById.set(object.id, object.image_data?.url || '');
    }
  }

  categories.sort((a, b) => a.name.localeCompare(b.name));

  const products = objects
    .filter((object) => object.type === 'ITEM' && !object.is_deleted && object.item_data)
    .map((object) => {
      const item = object.item_data || {};
      const categoryIds = [
        ...(Array.isArray(item.categories) ? item.categories.map((category) => category.id).filter(Boolean) : []),
        item.category_id
      ].filter(Boolean);

      const firstCategory = categoryIds.map((id) => categoriesById.get(id)).find(Boolean) || null;
      const variations = Array.isArray(item.variations) ? item.variations.filter((variation) => !variation.is_deleted) : [];
      const firstVariation = variations[0] || null;
      const variationData = firstVariation?.item_variation_data || {};
      const priceMoney = variationData.price_money || null;
      const imageId = Array.isArray(item.image_ids) ? item.image_ids[0] : null;

      return {
        id: object.id,
        variationId: firstVariation?.id || '',
        variationName: variationData.name || '',
        name: item.name || 'Vintage Find',
        description: item.description || '',
        price: priceMoney?.amount ? priceMoney.amount / 100 : null,
        priceAmountCents: priceMoney?.amount || null,
        currency: priceMoney?.currency || 'USD',
        category: firstCategory?.name || 'Vintage Find',
        categoryId: firstCategory?.id || '',
        categorySlug: firstCategory?.slug || '',
        image: imageId ? imagesById.get(imageId) || '/assets/img/shop/product-placeholder.jpg' : '/assets/img/shop/product-placeholder.jpg',
        updatedAt: object.updated_at || ''
      };
    })
    .filter((product) => product.variationId && typeof product.priceAmountCents === 'number');

  return { categories, products };
}

exports.handler = async function handler() {
  try {
    const objects = await listCatalogObjects();
    const data = normalizeCatalog(objects);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unable to load Square catalog data.' })
    };
  }
};
