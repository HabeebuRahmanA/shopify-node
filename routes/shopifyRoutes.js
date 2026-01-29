const express = require('express');
const router = express.Router();

// Shopify Admin API GraphQL endpoint
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Shopify Storefront API GraphQL endpoint
const SHOPIFY_STOREFRONT_ACCESS_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
const SHOPIFY_STOREFRONT_API_URL = `https://${SHOPIFY_STORE_DOMAIN}/api/2024-01/graphql.json`;

console.log('🔍 [INIT] Shopify environment variables check:');
console.log('🔍 [INIT] SHOPIFY_STORE_DOMAIN:', SHOPIFY_STORE_DOMAIN ? 'SET' : 'NOT SET');
console.log('🔍 [INIT] SHOPIFY_ADMIN_ACCESS_TOKEN:', SHOPIFY_ADMIN_ACCESS_TOKEN ? 'SET' : 'NOT SET');
console.log('🔍 [INIT] SHOPIFY_STOREFRONT_ACCESS_TOKEN:', SHOPIFY_STOREFRONT_ACCESS_TOKEN ? 'SET' : 'NOT SET');

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN || !SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
  console.error('🔥 [INIT] Missing required Shopify environment variables!');
}

const SHOPIFY_ADMIN_API_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`;

// Helper function to query Shopify Admin API
async function queryShopifyAdmin(query, variables = {}) {
  try {
    const response = await fetch(SHOPIFY_ADMIN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  } catch (error) {
    console.error('Shopify Admin API query error:', error);
    throw error;
  }
}

// Helper function to query Shopify Storefront API
async function queryShopifyStorefront(query, variables = {}) {
  try {
    const response = await fetch(SHOPIFY_STOREFRONT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`Shopify Storefront API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Storefront GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  } catch (error) {
    console.error('Shopify Storefront API query error:', error);
    throw error;
  }
}

// Check if customer exists in Shopify
async function checkShopifyCustomerExists(email) {
  try {
    // Check if environment variables are set
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      throw new Error('Shopify environment variables not configured');
    }

    console.log('🔍 [SHOPIFY] Checking customer existence for email:', email);
    console.log('🔍 [SHOPIFY] Store domain:', SHOPIFY_STORE_DOMAIN);
    console.log('🔍 [SHOPIFY] Admin API URL:', SHOPIFY_ADMIN_API_URL);
    
    const query = `
      query {
        customers(first: 1, query: "email:${email}") {
          edges {
            node {
              id
              email
            }
          }
        }
      }
    `;

    console.log('📡 [SHOPIFY] Sending GraphQL query...');
    
    const data = await queryShopifyAdmin(query);
    
    console.log('📊 [SHOPIFY] GraphQL response:', JSON.stringify(data, null, 2));
    
    const customerCount = data.customers.edges.length;
    console.log('📊 [SHOPIFY] Customers found:', customerCount);
    
    if (customerCount > 0) {
      const customer = data.customers.edges[0].node;
      console.log('✅ [SHOPIFY] Customer found:', customer.email);
    }
    
    return customerCount > 0;
  } catch (error) {
    console.error('🔥 [SHOPIFY] Error checking Shopify customer:', error.message);
    console.error('🔥 [SHOPIFY] Full error:', error);
    
    // Re-throw the error so it can be caught and handled properly
    throw error;
  }
}

// Fetch customer data using Storefront API (for fresh data on app start)
async function getCustomerDataStorefront(email) {
  try {
    console.log('🔍 [STOREFRONT] Fetching customer data for email:', email);
    
    // For Storefront API, we need to find customer by email first
    // This is a limitation - Storefront API works best with customer access tokens
    // Let's use a customer query that can search by email
    
    const query = `
      query {
        customers(first: 1, query: "email:${email}") {
          edges {
            node {
              id
              email
              firstName
              lastName
              phone
              createdAt
              numberOfOrders
              defaultAddress {
                address1
                address2
                city
                province
                zip
                country
              }
              addresses(first: 5) {
                edges {
                  node {
                    address1
                    address2
                    city
                    province
                    zip
                    country
                  }
                }
              }
              orders(first: 10, reverse: true) {
                edges {
                  node {
                    id
                    name
                    number
                    processedAt
                    totalPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                    displayFinancialStatus
                    displayFulfillmentStatus
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await queryShopifyStorefront(query);
    
    if (data.customers && data.customers.edges.length > 0) {
      const customer = data.customers.edges[0].node;
      console.log('✅ [STOREFRONT] Customer data fetched successfully');
      return {
        id: customer.id,
        email: customer.email,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || email.split('@')[0],
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        createdAt: customer.createdAt,
        numberOfOrders: customer.numberOfOrders,
        defaultAddress: customer.defaultAddress,
        addresses: customer.addresses?.edges?.map(edge => edge.node) || [],
        orders: customer.orders?.edges?.map(edge => edge.node) || [],
        dataSource: 'storefront'
      };
    } else {
      console.log('⚠️ [STOREFRONT] No customer found for email:', email);
      return null;
    }
  } catch (error) {
    console.error('🔥 [STOREFRONT] Error fetching customer data:', error.message);
    console.error('🔥 [STOREFRONT] Full error:', error);
    
    // If Storefront API fails, fall back to Admin API for auto-login
    console.log('🔄 [STOREFRONT] Falling back to Admin API for auto-login');
    try {
      const shopifyRoutes = require('./shopifyRoutes');
      const { queryShopifyAdmin } = shopifyRoutes;
      
      const adminQuery = `
        query {
          customers(first: 1, query: "email:${email}") {
            edges {
              node {
                id
                email
                firstName
                lastName
                phone
                createdAt
                numberOfOrders
                state
                defaultAddress {
                  address1
                  address2
                  city
                  province
                  zip
                  country
                }
                addresses(first: 5) {
                  address1
                  address2
                  city
                  province
                  zip
                  country
                }
              }
            }
          }
        }
      `;

      const adminData = await queryShopifyAdmin(adminQuery);
      
      if (adminData.customers.edges.length > 0) {
        const customer = adminData.customers.edges[0].node;
        console.log('✅ [ADMIN] Fallback data fetched successfully');
        return {
          id: customer.id,
          email: customer.email,
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || email.split('@')[0],
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          createdAt: customer.createdAt,
          numberOfOrders: customer.numberOfOrders,
          totalSpent: 0,
          state: customer.state,
          defaultAddress: customer.defaultAddress,
          addresses: customer.addresses || [],
          dataSource: 'admin_fallback'
        };
      }
    } catch (fallbackError) {
      console.error('🔥 [ADMIN] Fallback also failed:', fallbackError.message);
    }
    
    return null;
  }
}

// Get customer orders using Admin API
router.post('/orders/get-orders', async (req, res) => {
  const { email } = req.body;

  console.log('🔍 [ORDERS] Request received');
  console.log('📧 [ORDERS] Email:', email);
  console.log('🔍 [ORDERS] Request body:', JSON.stringify(req.body));

  if (!email || !email.includes('@')) {
    console.log('❌ [ORDERS] Invalid email format');
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    console.log('🔍 [ORDERS] Fetching orders for email:', email);
    
    // Check if environment variables are set
    console.log('🔍 [ORDERS] Checking environment variables...');
    console.log('🌐 [ORDERS] SHOPIFY_STORE_DOMAIN:', SHOPIFY_STORE_DOMAIN ? 'SET' : 'NOT SET');
    console.log('🔑 [ORDERS] SHOPIFY_ADMIN_ACCESS_TOKEN:', SHOPIFY_ADMIN_ACCESS_TOKEN ? 'SET' : 'NOT SET');
    console.log('🛍️ [ORDERS] SHOPIFY_STOREFRONT_ACCESS_TOKEN:', SHOPIFY_STOREFRONT_ACCESS_TOKEN ? 'SET' : 'NOT SET');
    
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      console.error('🔥 [ORDERS] Missing Shopify Admin environment variables');
      return res.status(500).json({ error: 'Shopify Admin configuration missing' });
    }
    
    console.log('📡 [ORDERS] Building GraphQL query...');
    const query = `
      query {
        customers(first: 1, query: "email:${email}") {
          edges {
            node {
              id
              email
              orders(first: 20, reverse: true) {
                edges {
                  node {
                    id
                    name
                    processedAt
                    createdAt
                    totalPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                    displayFinancialStatus
                    displayFulfillmentStatus
                    lineItems(first: 10) {
                      edges {
                        node {
                          title
                          quantity
                          originalUnitPriceSet {
                            shopMoney {
                              amount
                              currencyCode
                            }
                          }
                        }
                      }
                    }
                    shippingAddress {
                      address1
                      address2
                      city
                      province
                      zip
                      country
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    console.log('📡 [ORDERS] Sending GraphQL query to Shopify Admin API...');
    console.log('🔗 [ORDERS] Admin API URL:', SHOPIFY_ADMIN_API_URL);
    
    const data = await queryShopifyAdmin(query);
    console.log('📊 [ORDERS] Shopify Admin response received');
    console.log('📊 [ORDERS] Full response:', JSON.stringify(data, null, 2));
    
    if (data.customers && data.customers.edges.length > 0) {
      const customer = data.customers.edges[0].node;
      console.log('✅ [ORDERS] Customer found:', customer.email);
      console.log('📦 [ORDERS] Orders count:', customer.orders ? customer.orders.edges.length : 0);
      
      const orders = customer.orders ? customer.orders.edges.map(edge => edge.node) : [];
      
      console.log('✅ [ORDERS] Successfully processed orders');
      console.log('📊 [ORDERS] Orders summary:', orders.map(o => ({ name: o.name, status: o.displayFinancialStatus, total: o.totalPriceSet?.shopMoney?.amount })));
      
      res.json({
        success: true,
        orders: orders,
        count: orders.length,
        message: `Found ${orders.length} orders`
      });
    } else {
      console.log('⚠️ [ORDERS] No customer found for email:', email);
      console.log('📊 [ORDERS] Customers array:', data.customers);
      res.json({
        success: true,
        orders: [],
        count: 0,
        message: 'No orders found - customer not found'
      });
    }
  } catch (error) {
    console.error('🔥 [ORDERS] Error fetching orders:', error.message);
    console.error('🔥 [ORDERS] Full error details:', error);
    console.error('🔥 [ORDERS] Error stack:', error.stack);
    
    // Check if it's a GraphQL error
    if (error.message && error.message.includes('GraphQL')) {
      console.error('🔥 [ORDERS] GraphQL error detected');
      try {
        const graphqlErrors = JSON.parse(error.message);
        console.error('🔥 [ORDERS] GraphQL errors:', JSON.stringify(graphqlErrors, null, 2));
        return res.status(500).json({ 
          error: 'Shopify GraphQL API error',
          details: graphqlErrors,
          message: 'Invalid GraphQL query fields'
        });
      } catch (parseError) {
        console.error('🔥 [ORDERS] Could not parse GraphQL error');
      }
    }
    
    console.error('🔥 [ORDERS] Sending 500 response to client');
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message,
      message: 'Internal server error'
    });
  }
});

// Get customer addresses using Admin API
router.post('/addresses/get-addresses', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    console.log('🔍 [ADDRESSES] Fetching addresses for email:', email);
    
    // Check if environment variables are set
    console.log('🔍 [ADDRESSES] Checking environment variables...');
    console.log('🌐 [ADDRESSES] SHOPIFY_STORE_DOMAIN:', SHOPIFY_STORE_DOMAIN ? 'SET' : 'NOT SET');
    console.log('🔑 [ADDRESSES] SHOPIFY_ADMIN_ACCESS_TOKEN:', SHOPIFY_ADMIN_ACCESS_TOKEN ? 'SET' : 'NOT SET');
    
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      console.error('🔥 [ADDRESSES] Missing Shopify Admin environment variables');
      return res.status(500).json({ error: 'Shopify Admin configuration missing' });
    }
    
    console.log('📡 [ADDRESSES] Building GraphQL query...');
    const query = `
      query {
        customers(first: 1, query: "email:${email}") {
          edges {
            node {
              id
              email
              defaultAddress {
                address1
                address2
                city
                province
                zip
                country
              }
              addresses(first: 10) {
                address1
                address2
                city
                province
                zip
                country
              }
            }
          }
        }
      }
    `;

    console.log('📡 [ADDRESSES] Sending GraphQL query to Shopify Admin API...');
    console.log('🔗 [ADDRESSES] Admin API URL:', SHOPIFY_ADMIN_API_URL);
    
    const data = await queryShopifyAdmin(query);
    console.log('📊 [ADDRESSES] Shopify Admin response received');
    console.log('📊 [ADDRESSES] Full response:', JSON.stringify(data, null, 2));
    
    if (data.customers && data.customers.edges.length > 0) {
      const customer = data.customers.edges[0].node;
      console.log('✅ [ADDRESSES] Customer found:', customer.email);
      
      const addresses = [];
      
      // Add default address first if it exists
      if (customer.defaultAddress) {
        console.log('🏠 [ADDRESSES] Default address found');
        addresses.push({
          ...customer.defaultAddress,
          isDefault: true
        });
      }
      
      // Add other addresses
      if (customer.addresses && customer.addresses.length > 0) {
        console.log('📍 [ADDRESSES] Found ${customer.addresses.length} additional addresses');
        customer.addresses.forEach(address => {
          // Skip if it's the same as default address
          const isDefault = customer.defaultAddress && 
            customer.defaultAddress.address1 === address.address1 &&
            customer.defaultAddress.city === address.city;
          
          if (!isDefault) {
            addresses.push({
              ...address,
              isDefault: false
            });
          }
        });
      }
      
      console.log('✅ [ADDRESSES] Successfully processed addresses');
      console.log('📊 [ADDRESSES] Total addresses:', addresses.length);
      
      res.json({
        success: true,
        addresses: addresses,
        count: addresses.length,
        defaultAddress: customer.defaultAddress,
        message: `Found ${addresses.length} addresses`
      });
    } else {
      console.log('⚠️ [ADDRESSES] No customer found for email:', email);
      console.log('📊 [ADDRESSES] Customers array:', data.customers);
      res.json({
        success: true,
        addresses: [],
        count: 0,
        message: 'No addresses found - customer not found'
      });
    }
  } catch (error) {
    console.error('🔥 [ADDRESSES] Error fetching addresses:', error.message);
    console.error('🔥 [ADDRESSES] Full error details:', error);
    console.error('🔥 [ADDRESSES] Error stack:', error.stack);
    
    // Check if it's a GraphQL error
    if (error.message && error.message.includes('GraphQL')) {
      console.error('🔥 [ADDRESSES] GraphQL error detected');
      try {
        const graphqlErrors = JSON.parse(error.message);
        console.error('🔥 [ADDRESSES] GraphQL errors:', JSON.stringify(graphqlErrors, null, 2));
        return res.status(500).json({ 
          error: 'Shopify GraphQL API error',
          details: graphqlErrors,
          message: 'Invalid GraphQL query fields'
        });
      } catch (parseError) {
        console.error('🔥 [ADDRESSES] Could not parse GraphQL error');
      }
    }
    
    console.error('🔥 [ADDRESSES] Sending 500 response to client');
    res.status(500).json({ 
      error: 'Failed to fetch addresses',
      details: error.message,
      message: 'Internal server error'
    });
  }
});

// Get all store products using Storefront API
router.post('/shop/get-products', async (req, res) => {
  try {
    console.log('🔍 [SHOP] Fetching all products from store');
    
    // Check if environment variables are set
    console.log('🔍 [SHOP] Checking environment variables...');
    console.log('🌐 [SHOP] SHOPIFY_STORE_DOMAIN:', SHOPIFY_STORE_DOMAIN ? 'SET' : 'NOT SET');
    console.log('🛍️ [SHOP] SHOPIFY_STOREFRONT_ACCESS_TOKEN:', SHOPIFY_STOREFRONT_ACCESS_TOKEN ? 'SET' : 'NOT SET');
    
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
      console.error('🔥 [SHOP] Missing Shopify Storefront environment variables');
      // Fall back to Admin API if Storefront token is not available
      if (SHOPIFY_ADMIN_ACCESS_TOKEN) {
        console.log('🔄 [SHOP] Falling back to Admin API for products');
        return _getProductsAdminAPI(req, res);
      }
      return res.status(500).json({ error: 'Shopify configuration missing' });
    }
    
    console.log('📡 [SHOP] Building Storefront API query...');
    const query = `
      query {
        products(first: 50, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              description
              productType
              vendor
              tags
              createdAt
              updatedAt
              featuredImage {
                url
                altText
              }
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
                maxVariantPrice {
                  amount
                  currencyCode
                }
              }
              variants(first: 5) {
                edges {
                  node {
                    id
                    title
                    sku
                    priceV2 {
                      amount
                      currencyCode
                    }
                    availableForSale
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
              collections(first: 5) {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    console.log('📡 [SHOP] Sending GraphQL query to Shopify Storefront API...');
    console.log('🔗 [SHOP] Storefront API URL:', SHOPIFY_STOREFRONT_API_URL);
    
    const data = await queryShopifyStorefront(query);
    console.log('📊 [SHOP] Shopify Storefront response received');
    console.log('📊 [SHOP] Products count:', data.products ? data.products.edges.length : 0);
    
    if (data.products && data.products.edges.length > 0) {
      const products = data.products.edges.map(edge => edge.node);
      
      console.log('✅ [SHOP] Successfully fetched products');
      console.log('📊 [SHOP] Products summary:', products.map(p => ({ 
        title: p.title, 
        type: p.productType, 
        price: p.priceRangeV2?.minVariantPrice?.amount 
      })));
      
      res.json({
        success: true,
        products: products,
        count: products.length,
        pageInfo: data.products.pageInfo,
        message: `Found ${products.length} products`
      });
    } else {
      console.log('⚠️ [SHOP] No products found in store');
      res.json({
        success: true,
        products: [],
        count: 0,
        message: 'No products found in store'
      });
    }
  } catch (error) {
    console.error('🔥 [SHOP] Error fetching products:', error.message);
    console.error('🔥 [SHOP] Full error details:', error);
    console.error('🔥 [SHOP] Error stack:', error.stack);
    
    // Fall back to Admin API if Storefront API fails
    if (SHOPIFY_ADMIN_ACCESS_TOKEN) {
      console.log('🔄 [SHOP] Storefront API failed, falling back to Admin API');
      return _getProductsAdminAPI(req, res);
    }
    
    // Check if it's a GraphQL error
    if (error.message && error.message.includes('GraphQL')) {
      console.error('🔥 [SHOP] GraphQL error detected');
      try {
        const graphqlErrors = JSON.parse(error.message);
        console.error('🔥 [SHOP] GraphQL errors:', JSON.stringify(graphqlErrors, null, 2));
        return res.status(500).json({ 
          error: 'Shopify GraphQL API error',
          details: graphqlErrors,
          message: 'Invalid GraphQL query fields'
        });
      } catch (parseError) {
        console.error('🔥 [SHOP] Could not parse GraphQL error');
      }
    }
    
    console.error('🔥 [SHOP] Sending 500 response to client');
    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: error.message,
      message: 'Internal server error'
    });
  }
});

// Helper function to get products using Admin API (fallback)
async function _getProductsAdminAPI(req, res) {
  try {
    console.log('🔄 [SHOP] Using Admin API fallback for products');
    
    const query = `
      query {
        products(first: 50, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              description
              productType
              vendor
              tags
              createdAt
              updatedAt
              featuredImage {
                url
                altText
              }
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
                maxVariantPrice {
                  amount
                  currencyCode
                }
              }
              variants(first: 5) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    inventoryQuantity
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const data = await queryShopifyAdmin(query);
    console.log('📊 [SHOP] Admin API response received');
    
    if (data.products && data.products.edges.length > 0) {
      const products = data.products.edges.map(edge => edge.node);
      
      console.log('✅ [SHOP] Admin API fallback successful');
      
      res.json({
        success: true,
        products: products,
        count: products.length,
        pageInfo: data.products.pageInfo,
        message: `Found ${products.length} products (Admin API)`,
        dataSource: 'admin'
      });
    } else {
      res.json({
        success: true,
        products: [],
        count: 0,
        message: 'No products found in store'
      });
    }
  } catch (error) {
    console.error('🔥 [SHOP] Admin API fallback also failed:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: error.message,
      message: 'Both Storefront and Admin APIs failed'
    });
  }
}

// Step 1: Auth Callback - Handle Shopify OAuth redirect
router.get('/auth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'No authorization code received' });
    }

    // TODO: Exchange code for access token using Shopify's OAuth endpoint
    // This would involve:
    // 1. Making a POST request to https://STORE.myshopify.com/admin/oauth/access_token
    // 2. Storing the customer access token in database/session
    // 3. Redirecting back to Flutter app with success status

    res.json({
      success: true,
      message: 'OAuth callback received',
      code: code,
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Step 2: Logout endpoint
router.post('/auth/logout', async (req, res) => {
  try {
    // Clear customer session/token from database
    // TODO: Implement logout logic - clear tokens from database
    
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Step 3: Get customer orders - Called from Flutter app
router.post('/customer/get-orders', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // GraphQL query to get customer by email and their orders
    const query = `
      query GetCustomerOrders($email: String!) {
        customers(first: 1, query: "email:${email}") {
          edges {
            node {
              id
              email
              firstName
              lastName
              displayName
              createdAt
              updatedAt
              orders(first: 10) {
                edges {
                  node {
                    id
                    name
                    orderNumber
                    createdAt
                    totalPrice
                    status
                    fulfillmentStatus
                    shippingAddress {
                      address1
                      address2
                      city
                      province
                      zip
                      country
                    }
                    lineItems(first: 10) {
                      edges {
                        node {
                          id
                          title
                          quantity
                          variantTitle
                          originalUnitPrice
                          originalLinePrice
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await queryShopifyAdmin(query, { email });
    
    if (!data.customers.edges || data.customers.edges.length === 0) {
      return res.status(404).json({
        error: 'Customer not found',
        email: email,
      });
    }

    const customer = data.customers.edges[0].node;
    const orders = customer.orders.edges.map(edge => edge.node);

    res.json({
      success: true,
      message: 'Orders fetched successfully',
      email: email,
      customerName: customer.displayName,
      totalOrders: orders.length,
      orders: orders,
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Step 4: Get customer profile
router.post('/customer/profile', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // GraphQL query to get customer profile
    const query = `
      query GetCustomerProfile($email: String!) {
        customers(first: 1, query: "email:${email}") {
          edges {
            node {
              id
              email
              firstName
              lastName
              displayName
              phone
              createdAt
              updatedAt
              lifetimeDuration
              defaultAddress {
                address1
                address2
                city
                province
                zip
                country
                phone
              }
              addresses(first: 5) {
                edges {
                  node {
                    id
                    address1
                    address2
                    city
                    province
                    zip
                    country
                  }
                }
              }
              totalSpent
              numberOfOrders
            }
          }
        }
      }
    `;

    const data = await queryShopifyAdmin(query, { email });
    
    if (!data.customers.edges || data.customers.edges.length === 0) {
      return res.status(404).json({
        error: 'Customer not found',
        email: email,
      });
    }

    const customer = data.customers.edges[0].node;
    const addresses = customer.addresses.edges.map(edge => edge.node);

    res.json({
      success: true,
      message: 'Customer profile fetched successfully',
      profile: {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        displayName: customer.displayName,
        phone: customer.phone,
        createdAt: customer.createdAt,
        totalSpent: customer.totalSpent,
        numberOfOrders: customer.numberOfOrders,
        defaultAddress: customer.defaultAddress,
        addresses: addresses,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get product details by ID using Admin API
router.post('/shopify/get-product', async (req, res) => {
  const { product_id, numeric_id } = req.body;

  if (!product_id) {
    return res.status(400).json({ error: 'Product ID required' });
  }

  try {
    console.log('🔍 [PRODUCT] Fetching product details for:', product_id);
    
    // Check if environment variables are set
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      console.error('🔥 [PRODUCT] Missing Shopify Admin environment variables');
      return res.status(500).json({ error: 'Shopify Admin configuration missing' });
    }
    
    // Query Shopify Admin API for product details
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          description
          featuredImage {
            url
            altText
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                sku
                priceV2 {
                  amount
                  currencyCode
                }
                image {
                  url
                  altText
                }
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    `;
    
    const variables = { id: product_id };
    
    console.log('📡 [PRODUCT] Sending GraphQL query to Shopify Admin API...');
    const response = await queryShopifyAdmin(query, variables);
    
    if (response.product) {
      const product = response.product;
      console.log('✅ [PRODUCT] Product found:', product.title);
      
      // Find the specific variant if variant_id was provided
      let variant = null;
      if (numeric_id) {
        variant = product.variants?.edges?.find(edge => 
          edge.node.id.includes(numeric_id)
        )?.node;
      }
      
      // If no specific variant found, use the first one
      if (!variant && product.variants?.edges?.length > 0) {
        variant = product.variants.edges[0].node;
      }
      
      res.json({
        success: true,
        product: {
          id: product.id,
          title: product.title,
          handle: product.handle,
          description: product.description,
          featuredImage: product.featuredImage,
          priceRange: product.priceRangeV2,
          variant: variant,
          image: variant?.image || product.featuredImage,
          variant_title: variant?.title || '',
        }
      });
    } else {
      console.log('⚠️ [PRODUCT] Product not found');
      res.status(404).json({ 
        success: false, 
        error: 'Product not found' 
      });
    }
  } catch (error) {
    console.error('🔥 [PRODUCT] Error fetching product:', error.message);
    console.error('🔥 [PRODUCT] Full error details:', error);
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch product details' 
    });
  }
});

// Export the functions for use in other routes
module.exports = {
  router,
  checkShopifyCustomerExists,
  getCustomerDataStorefront,
  queryShopifyAdmin,
  queryShopifyStorefront
};