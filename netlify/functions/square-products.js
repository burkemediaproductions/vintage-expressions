const { Client, Environment } = require('square');

exports.handler = async function () {
  try {
    if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required Square environment variables.'
        })
      };
    }

    const client = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN,
      environment: Environment.Production
    });

    const response = await client.catalogApi.searchCatalogItems({
      enabledLocationIds: [process.env.SQUARE_LOCATION_ID]
    });

    const items = response.result.items || [];

    const products = items.map((item) => {
      const variation = item.itemData?.variations?.[0];
      const priceMoney = variation?.itemVariationData?.priceMoney;
      const categoryName = item.itemData?.categories?.[0]?.name || '';

      return {
        id: item.id,
        name: item.itemData?.name || '',
        description: item.itemData?.description || '',
        imageId: item.itemData?.imageIds?.[0] || null,
        image: '/assets/img/shop/product-placeholder.jpg',
        price: priceMoney?.amount ? Number(priceMoney.amount) / 100 : null,
        currency: priceMoney?.currency || 'USD',
        category: categoryName,
        available: true
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({ products })
    };
  } catch (error) {
    console.error('Square inventory error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Unable to retrieve Square inventory'
      })
    };
  }
};
