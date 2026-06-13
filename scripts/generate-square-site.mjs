import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BASE_URL = (process.env.SITE_URL || 'https://www.vintageexpressions.com').replace(/\/$/, '');
const SQUARE_VERSION = process.env.SQUARE_VERSION || '2026-05-20';
const GENERATED_MARKER = 'SQUARE-GENERATED-CATEGORY-PAGE';

const fallbackCategories = [
  { id: 'fallback-furniture', name: 'Furniture', slug: 'furniture' },
  { id: 'fallback-clothing', name: 'Clothing', slug: 'clothing' },
  { id: 'fallback-art-decor', name: 'Art & Decor', slug: 'art-decor' },
  { id: 'fallback-creative-reuse', name: 'Creative Reuse', slug: 'creative-reuse' }
];

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

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function absoluteUrl(pathname = '/') {
  return `${BASE_URL}/${pathname.replace(/^\//, '')}`;
}

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
  } catch {
    return fallback;
  }
}

async function squareFetch(apiPath) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return null;

  const response = await fetch(`${getSquareBaseUrl()}${apiPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Square API ${response.status}: ${body}`);
  }

  return response.json();
}

async function listCatalogObjects(types = 'ITEM,CATEGORY,IMAGE') {
  const objects = [];
  let cursor = '';

  do {
    const params = new URLSearchParams({ types });
    if (cursor) params.set('cursor', cursor);

    const data = await squareFetch(`/v2/catalog/list?${params.toString()}`);
    if (!data) return [];

    objects.push(...(data.objects || []));
    cursor = data.cursor || '';
  } while (cursor);

  return objects;
}

function normalizeCatalog(objects) {
  if (!objects.length) {
    return { categories: fallbackCategories, products: [] };
  }

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
        categoryId: firstCategory?.id || '',
        category: firstCategory?.name || 'Vintage Find',
        categorySlug: firstCategory?.slug || '',
        image: imageId ? imagesById.get(imageId) || '/assets/img/shop/product-placeholder.jpg' : '/assets/img/shop/product-placeholder.jpg',
        updatedAt: object.updated_at || ''
      };
    })
    .filter((product) => product.variationId && typeof product.priceAmountCents === 'number');

  return { categories, products };
}

function formatPrice(product) {
  if (typeof product.price !== 'number') return '';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency || 'USD'
  }).format(product.price);
}

function productCard(product) {
  const price = formatPrice(product);
  const safeName = escapeHtml(product.name);
  const safeImage = escapeHtml(product.image);
  const safeCategory = escapeHtml(product.category);
  const safeDescription = escapeHtml(product.description || '');
  const safeVariationId = escapeHtml(product.variationId || '');
  const safeCurrency = escapeHtml(product.currency || 'USD');
  const safePriceCents = Number.isFinite(Number(product.priceAmountCents)) ? Number(product.priceAmountCents) : '';

  return `        <article class="product-card reveal">
          <img src="${safeImage}" alt="${safeName}" loading="lazy" width="600" height="600">
          <div class="product-card-content">
            <p class="eyebrow dark">${safeCategory}</p>
            <h3>${safeName}</h3>
            ${safeDescription ? `<p>${safeDescription}</p>` : ''}
            ${price ? `<div class="product-price">${price}</div>` : ''}
            <div class="product-actions">
              ${safeVariationId ? `<button class="btn btn-primary add-to-cart" type="button" data-variation-id="${safeVariationId}" data-name="${safeName}" data-price-cents="${safePriceCents}" data-currency="${safeCurrency}" data-image="${safeImage}">Add to Cart</button>` : `<a class="btn btn-primary" href="/contact/">Ask About This Item</a>`}
            </div>
          </div>
        </article>`;
}

function categoryLinks(categories) {
  return categories
    .map((category) => `<a href="/${category.slug}/">${escapeHtml(category.name)}</a>`)
    .join('');
}

function categoryCopy(category, overrides = {}) {
  const override = overrides[category.id] || overrides[category.slug] || {};
  return {
    title: override.title || `${category.name} in Pacific Beach | Vintage Expressions`,
    metaDescription: override.metaDescription || `Explore curated ${category.name.toLowerCase()} finds from Vintage Expressions in Pacific Beach, San Diego.`,
    eyebrow: override.eyebrow || 'Curated Vintage Finds',
    intro: override.intro || `Explore curated ${category.name.toLowerCase()} pieces, one-of-a-kind finds, and vintage inspiration available through Vintage Expressions in Pacific Beach, San Diego.`,
    heroImage: override.heroImage || `/assets/img/hero/${category.slug}-hero.jpg`
  };
}

function replaceNavigation(html, categories) {
  const links = categoryLinks(categories);

  html = html.replace(
    /<div class="dropdown-menu"(?:\s+data-square-category-nav="desktop")?>(.*?)<\/div>/s,
    `<div class="dropdown-menu" data-square-category-nav="desktop">${links}</div>`
  );

  html = html.replace(
    /<p class="mobile-menu-label">Categories<\/p><a href="\/furniture\/">Furniture<\/a><a href="\/clothing\/">Clothing<\/a><a href="\/art-decor\/">Art &amp; Decor<\/a><a href="\/creative-reuse\/">Creative Reuse<\/a>/s,
    `<div class="mobile-accordion"><button class="mobile-accordion-toggle" type="button" aria-expanded="false" aria-controls="mobile-categories-menu">Categories</button><div class="mobile-submenu" id="mobile-categories-menu" hidden data-square-category-nav="mobile">${links}</div></div>`
  );

  html = html.replace(
    /<div class="mobile-submenu" id="mobile-categories-menu" hidden(?:\s+data-square-category-nav="mobile")?>(.*?)<\/div>/s,
    `<div class="mobile-submenu" id="mobile-categories-menu" hidden data-square-category-nav="mobile">${links}</div>`
  );

  return html;
}

async function walkHtmlFiles(dir = ROOT, found = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.') || ['node_modules', 'netlify', 'scripts', 'templates', 'data'].includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkHtmlFiles(fullPath, found);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      found.push(fullPath);
    }
  }

  return found;
}

async function updateAllNavigation(categories) {
  const files = await walkHtmlFiles();

  for (const file of files) {
    const html = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, replaceNavigation(html, categories));
  }
}

async function removeStaleGeneratedPages(activeSlugs) {
  const manifestPath = path.join(ROOT, 'data/generated-square-pages.json');
  const manifest = await readJson('data/generated-square-pages.json', { generated: [] });

  for (const oldSlug of manifest.generated || []) {
    if (activeSlugs.includes(oldSlug)) continue;

    const indexPath = path.join(ROOT, oldSlug, 'index.html');

    try {
      const html = await fs.readFile(indexPath, 'utf8');
      if (html.includes(GENERATED_MARKER)) {
        await fs.rm(path.join(ROOT, oldSlug), { recursive: true, force: true });
      }
    } catch {}
  }

  await fs.writeFile(manifestPath, JSON.stringify({ generated: activeSlugs }, null, 2));
}

async function generateCategoryPages(categories, products) {
  const template = await fs.readFile(path.join(ROOT, 'templates/square-category-template.html'), 'utf8');
  const overrides = await readJson('data/category-page-overrides.json', {});
  const activeSlugs = [];

  for (const category of categories) {
    category.slug = slugify(category.name);

    const copy = categoryCopy(category, overrides);
    const categoryProducts = products.filter((product) => product.categoryId === category.id || product.categorySlug === category.slug);

    const productCards = categoryProducts.length
      ? categoryProducts.map(productCard).join('\n')
      : `        <div class="inventory-empty"><p>New ${escapeHtml(category.name.toLowerCase())} treasures are arriving soon.</p></div>`;

    const schema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': absoluteUrl(`${category.slug}/#webpage`),
          url: absoluteUrl(`${category.slug}/`),
          name: copy.title,
          description: copy.metaDescription,
          isPartOf: { '@id': `${BASE_URL}/#website` },
          about: { '@id': `${BASE_URL}/#business` },
          inLanguage: 'en-US'
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Shop', item: absoluteUrl('shop/') },
            { '@type': 'ListItem', position: 3, name: category.name, item: absoluteUrl(`${category.slug}/`) }
          ]
        },
        {
          '@type': 'ItemList',
          name: `${category.name} at Vintage Expressions`,
          itemListElement: categoryProducts.map((product, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: product.name,
            url: absoluteUrl(`${category.slug}/`)
          }))
        }
      ]
    };

    const html = template
      .replaceAll('{{SEO_TITLE}}', escapeHtml(copy.title))
      .replaceAll('{{META_DESCRIPTION}}', escapeHtml(copy.metaDescription))
      .replaceAll('{{CANONICAL_URL}}', absoluteUrl(`${category.slug}/`))
      .replaceAll('{{CATEGORY_NAME}}', escapeHtml(category.name))
      .replaceAll('{{CATEGORY_SLUG}}', escapeHtml(category.slug))
      .replaceAll('{{CATEGORY_LINKS}}', categoryLinks(categories))
      .replaceAll('{{HERO_EYEBROW}}', escapeHtml(copy.eyebrow))
      .replaceAll('{{HERO_IMAGE}}', escapeHtml(copy.heroImage))
      .replaceAll('{{INTRO_COPY}}', escapeHtml(copy.intro))
      .replaceAll('{{PRODUCT_CARDS}}', productCards)
      .replaceAll('{{SCHEMA_JSON}}', JSON.stringify(schema, null, 2));

    const outputDir = path.join(ROOT, category.slug);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'index.html'), html);
    activeSlugs.push(category.slug);
  }

  await removeStaleGeneratedPages(activeSlugs);
}

async function generateShopPage(categories, products) {
  const shopPath = path.join(ROOT, 'shop', 'index.html');

  try {
    let html = await fs.readFile(shopPath, 'utf8');
    const productCards = products.length
      ? products.map(productCard).join('\n')
      : `        <div class="inventory-empty"><p>New treasures are arriving soon.</p></div>`;

    const inventorySection = `<section class="section-cream square-inventory-section" aria-labelledby="square-shop-title" data-square-shop-section>
  <div class="container">
    <div class="section-heading reveal">
      <p class="eyebrow dark">Current Inventory</p>
      <h2 id="square-shop-title">Shop Available Finds</h2>
      <p>These items are pulled from the Square catalog during the site build. Add favorites to your cart and check out securely through Square.</p>
    </div>
    <div class="product-grid square-product-grid">
${productCards}
    </div>
  </div>
</section>
<div class="wave-divider wave-to-teal" aria-hidden="true"><svg viewBox="0 0 1440 120" preserveAspectRatio="none" focusable="false"><path d="M0,64 C180,120 360,0 540,56 C720,112 900,12 1080,58 C1260,104 1350,86 1440,42 L1440,120 L0,120 Z"></path></svg></div>`;

    if (html.includes('data-square-shop-section')) {
      html = html.replace(/<section class="section-cream square-inventory-section"[\s\S]*?<div class="wave-divider wave-to-teal" aria-hidden="true"><svg viewBox="0 0 1440 120" preserveAspectRatio="none" focusable="false"><path d="M0,64 C180,120 360,0 540,56 C720,112 900,12 1080,58 C1260,104 1350,86 1440,42 L1440,120 L0,120 Z"><\/path><\/svg><\/div>/, inventorySection);
    } else {
      html = html.replace('<section class="section-teal"><div class="container"><div class="section-heading light reveal"><p class="eyebrow light">Featured Finds</p>', `${inventorySection}<section class="section-teal"><div class="container"><div class="section-heading light reveal"><p class="eyebrow light">Featured Finds</p>`);
    }

    await fs.writeFile(shopPath, replaceNavigation(html, categories));
  } catch (error) {
    console.warn('Could not update shop page:', error.message);
  }
}


async function generateSitemap() {
  const files = await walkHtmlFiles();
  const urls = files
    .map((file) => {
      const rel = path.relative(ROOT, file).replaceAll(path.sep, '/');
      if (rel === '404.html') return null;
      if (rel === 'index.html') return `${BASE_URL}/`;
      if (rel.endsWith('/index.html')) return `${BASE_URL}/${rel.replace(/\/index\.html$/, '')}/`;
      return `${BASE_URL}/${rel}`;
    })
    .filter(Boolean)
    .sort();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`;
  await fs.writeFile(path.join(ROOT, 'sitemap.xml'), xml);

  const robots = `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`;
  await fs.writeFile(path.join(ROOT, 'robots.txt'), robots);
}

async function main() {
  const objects = await listCatalogObjects();
  const { categories, products } = normalizeCatalog(objects);

  await generateCategoryPages(categories, products);
  await generateShopPage(categories, products);
  await updateAllNavigation(categories);
  await generateSitemap();

  console.log(`Square build complete. Generated ${categories.length} category page(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
