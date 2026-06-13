exports.handler = async function handler() {
  const environment = process.env.SQUARE_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      environment,
      applicationId: process.env.SQUARE_APPLICATION_ID || '',
      locationId: process.env.SQUARE_LOCATION_ID || '',
      squareJsUrl: environment === 'sandbox'
        ? 'https://sandbox.web.squarecdn.com/v1/square.js'
        : 'https://web.squarecdn.com/v1/square.js'
    })
  };
};
