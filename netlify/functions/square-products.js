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

function isPresentAtLocation(object, locationId) {
  if (!locationId) return true;

  if (Array.isArray(object.absent_at_location_ids) && object.absent_at_location_ids.includes(locationId)) {
    return false;
  }

  if (object.present_at_all_locations === true) {
    return true;
  }

  if (Array.isArray(object.present_at_location_ids) && object.present_at_location_ids.includes(locationId)) {
    return true;
  }

  // If location fields are absent/undefined, do not hide the item. Catalog reads are not channel-gated.
  if (object.present_at_all_locations === undefined && !object.present_at_location_ids && !object.absent_at_location_ids) {
    return true;
  }

  return false;
}

function getCategoryIds(item) {
  const ids = [];

  if (Array.isArray(item.categories)) {
    item.categories.forEach((category) => {
      if (category?.id) ids.push(category.id);
    });
  }

  if (item.category_id) ids.push(item.category_id);

  return [...new Set(ids)];
}

function normalizeCatalog(objects) {
  const locationId = process.env.SQUARE_LOCATION_ID || '';
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
    .filter((object) => isPresentAtLocation(object, locationId))
    .map((object) => {
      const item = object.item_data || {};
      const categoryIds = getCategoryIds(item);
      const categoryObjects = categoryIds.map((id) => categoriesById.get(id)).filter(Boolean);
      const firstCategory = categoryObjects[0] || null;
      const variations = Array.isArray(item.variations) ? item.variations.filter((variation) => {
        return !variation.is_deleted && isPresentAtLocation(variation, locationId);
      }) : [];
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
        price: typeof priceMoney?.amount === 'number' ? priceMoney.amount / 100 : null,
        priceAmountCents: typeof priceMoney?.amount === 'number' ? priceMoney.amount : null,
        currency: priceMoney?.currency || 'USD',
        category: firstCategory?.name || 'Vintage Find',
        categoryId: firstCategory?.id || '',
        categorySlug: firstCategory?.slug || '',
        categoryIds,
        categorySlugs: categoryObjects.map((category) => category.slug),
        categories: categoryObjects.map((category) => category.name),
        image: imageId ? imagesById.get(imageId) || '/assets/img/shop/product-placeholder.jpg' : '/assets/img/shop/product-placeholder.jpg',
        checkoutReady: Boolean(firstVariation?.id && typeof priceMoney?.amount === 'number'),
        missingCheckoutReason: !firstVariation?.id
          ? 'Missing item variation'
          : typeof priceMoney?.amount !== 'number'
            ? 'Missing variation price'
            : '',
        updatedAt: object.updated_at || ''
      };
    });

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
