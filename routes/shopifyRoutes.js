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
    
    // Note: Storefront API customer query requires customer access token, not just email
    // For now, let's return a basic structure and we'll implement OAuth later
    console.log('⚠️ [STOREFRONT] Storefront API needs customer access token - using fallback');
    
    // Fallback: Return basic data without Storefront API call
    // In a full implementation, you'd need OAuth flow to get customer access token
    return {
      email: email,
      name: email.split('@')[0],
      phone: null,
      createdAt: null,
      numberOfOrders: 0,
      defaultAddress: null,
      addresses: [],
      orders: [],
      dataSource: 'storefront_fallback'
    };
    
    /* Full Storefront API implementation (requires customer access token):
    const query = `
      query {
        customer(customerAccessToken: "${customerAccessToken}") {
          id
          email
          firstName
          lastName
          phone
          createdAt
          numberOfOrders
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
          defaultAddress {
            address1
            address2
            city
            province
            zip
            country
          }
          orders(first: 10, reverse: true) {
            edges {
              node {
                id
                name
                orderNumber
                processedAt
                totalPriceV2 {
                  amount
                  currencyCode
                }
                financialStatus
                fulfillmentStatus
              }
            }
          }
        }
      }
    `;

    const data = await queryShopifyStorefront(query);
    
    if (data.customer) {
      console.log('✅ [STOREFRONT] Customer data fetched successfully');
      return {
        id: data.customer.id,
        email: data.customer.email,
        name: `${data.customer.firstName || ''} ${data.customer.lastName || ''}`.trim() || email.split('@')[0],
        firstName: data.customer.firstName,
        lastName: data.customer.lastName,
        phone: data.customer.phone,
        createdAt: data.customer.createdAt,
        numberOfOrders: data.customer.numberOfOrders,
        defaultAddress: data.customer.defaultAddress,
        addresses: data.customer.addresses?.edges?.map(edge => edge.node) || [],
        orders: data.customer.orders?.edges?.map(edge => edge.node) || [],
        dataSource: 'storefront'
      };
    }
    
    return null;
    */
  } catch (error) {
    console.error('🔥 [STOREFRONT] Error fetching customer data:', error.message);
    throw error;
  }
}

// Get customer orders using Admin API
router.post('/orders/get-orders', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    console.log('🔍 [ORDERS] Fetching orders for email:', email);
    
    // Check if environment variables are set
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      console.error('🔥 [ORDERS] Missing Shopify environment variables');
      return res.status(500).json({ error: 'Shopify configuration missing' });
    }
    
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
                    number
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

    console.log('📡 [ORDERS] Sending GraphQL query to Shopify...');
    const data = await queryShopifyAdmin(query);
    console.log('📊 [ORDERS] Shopify response:', JSON.stringify(data, null, 2));
    
    if (data.customers.edges.length > 0) {
      const customer = data.customers.edges[0].node;
      const orders = customer.orders.edges.map(edge => edge.node);
      
      console.log('✅ [ORDERS] Found ${orders.length} orders for customer');
      
      res.json({
        success: true,
        orders: orders,
        count: orders.length,
      });
    } else {
      console.log('⚠️ [ORDERS] No customer found for email:', email);
      res.json({
        success: true,
        orders: [],
        count: 0,
      });
    }
  } catch (error) {
    console.error('🔥 [ORDERS] Error fetching orders:', error.message);
    console.error('🔥 [ORDERS] Full error:', error);
    
    // Check if it's a GraphQL error
    if (error.message && error.message.includes('GraphQL')) {
      console.error('🔥 [ORDERS] GraphQL error detected');
      return res.status(500).json({ 
        error: 'Shopify API error',
        details: error.message 
      });
    }
    
    res.status(500).json({ error: 'Failed to fetch orders' });
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