# Minimal Node.js Hello API

This is a minimal Node.js application using Express that exposes a single API endpoint returning `hello`. Suitable for deployment and pushing to GitHub.

## Requirements

- Node.js (>= 16 recommended)
- npm (comes with Node)

## Install

```bash
npm install
```

## Run locally

```bash
npm start
```

The server will start on [http://localhost:3000](http://localhost:3000).

- `GET /` → returns a simple "Server is running" message
- `GET /api/hello` → returns JSON: `{ "message": "hello" }`

## Deploying

You can push this repo to GitHub as-is. For most Node hosting providers, you only need to:

- Set the start command to `npm start`
- Optionally configure the `PORT` environment variable; otherwise it defaults to `3000`.


## Shopify Integration

This application includes integration with Shopify Admin API for customer management and order retrieval.

### Features

1. **Customer Orders Endpoint** (`POST /customer/get-orders`)
   - Retrieves customer orders by email address
   - Returns order details including line items, shipping address, and order status
   - Called by Flutter mobile app

2. **Customer Profile Endpoint** (`POST /customer/profile`)
   - Fetches customer profile information by email
   - Returns customer details, addresses, total spent, and order count
   - Used by Flutter app to display customer information

3. **OAuth Callback** (`GET /auth/callback`)
   - Handles OAuth redirect after customer authentication
   - Exchanges authorization code for access tokens

4. **Logout Endpoint** (`POST /auth/logout`)
   - Clears customer session and tokens

### Environment Variables

The following environment variables must be configured in Vercel:

- `SHOPIFY_STORE_DOMAIN`: Your Shopify store domain (e.g., `habi-dev-store.myshopify.com`)
- `SHOPIFY_ADMIN_ACCESS_TOKEN`: Admin API access token for Shopify Admin API queries
- `SHOPIFY_STOREFRONT_URL`: Storefront API URL for querying shop data

### API Implementation

The Shopify integration uses GraphQL queries to:
- Query customer data by email
- Retrieve order history with line items
- Fetch customer addresses and profile information

All queries are made to the Shopify Admin API 2024-01 endpoint.

### Testing

To test the endpoints:

```bash
# Get customer orders
curl -X POST http://localhost:3000/customer/get-orders \
  -H "Content-Type: application/json" \
  -d '{"email": "customer@example.com"}'

# Get customer profile
curl -X POST http://localhost:3000/customer/profile \
  -H "Content-Type: application/json" \
  -d '{"email": "customer@example.com"}'
```

### Production Deployment

1. Ensure all environment variables are set in Vercel
2. The app is deployed to: https://shopify-node-nu.vercel.app
3. All Shopify OAuth URIs are configured:
   - Callback: https://shopify-node-nu.vercel.app/auth/callback
   - Logout: https://shopify-node-nu.vercel.app/auth/logout
   - JS Origin: https://shopify-node-nu.vercel.app

### Next Steps

1. Configure actual Shopify Admin API access token
2. Implement full OAuth token exchange flow
3. Add customer session management to database
4. Implement comprehensive error handling
5. Add request validation and rate limiting