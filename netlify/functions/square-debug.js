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

async function squareFetch(path) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error('Missing SQUARE_ACCESS_TOKEN');

  const response = await fetch(`${getSquareBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json'
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Square API ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : {};
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

function categoryIdsFor(itemData = {}) {
  const ids = [];

  if (Array.isArray(itemData.categories)) {
    itemData.categories.forEach((category) => {
      if (category?.id) ids.push(category.id);
    });
  }

  if (itemData.category_id) ids.push(itemData.category_id);

  return [...new Set(ids)];
}

exports.handler = async function handler() {
  try {
    const objects = await listCatalogObjects();
    const categories = objects
      .filter((object) => object.type === 'CATEGORY' && !object.is_deleted)
      .map((object) => ({
        id: object.id,
        name: object.category_data?.name || '',
        slug: slugify(object.category_data?.name || ''),
        updatedAt: object.updated_at || ''
      }));

    const categoriesById = new Map(categories.map((category) => [category.id, category]));

    const items = objects
      .filter((object) => object.type === 'ITEM' && !object.is_deleted && object.item_data)
      .map((object) => {
        const item = object.item_data || {};
        const categoryIds = categoryIdsFor(item);
        const categoryNames = categoryIds.map((id) => categoriesById.get(id)?.name || id);
        const variations = Array.isArray(item.variations) ? item.variations.filter((variation) => !variation.is_deleted) : [];

        return {
          id: object.id,
          name: item.name || '',
          categoryIds,
          categoryNames,
          variationCount: variations.length,
          variations: variations.map((variation) => ({
            id: variation.id,
            name: variation.item_variation_data?.name || '',
            priceMoney: variation.item_variation_data?.price_money || null,
            presentAtAllLocations: variation.present_at_all_locations,
            presentAtLocationIds: variation.present_at_location_ids || [],
            absentAtLocationIds: variation.absent_at_location_ids || []
          })),
          presentAtAllLocations: object.present_at_all_locations,
          presentAtLocationIds: object.present_at_location_ids || [],
          absentAtLocationIds: object.absent_at_location_ids || [],
          updatedAt: object.updated_at || ''
        };
      });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        environment: process.env.SQUARE_ENVIRONMENT || 'production',
        locationIdConfigured: Boolean(process.env.SQUARE_LOCATION_ID),
        categoriesCount: categories.length,
        itemsCount: items.length,
        categories,
        items
      }, null, 2)
    };
  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Unable to debug Square catalog.' }, null, 2)
    };
  }
};
