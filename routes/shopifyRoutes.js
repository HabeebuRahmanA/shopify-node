const express = require('express');
const router = express.Router();

// Shopify Admin API GraphQL endpoint
const SHOPIFY_ADMIN_API_URL = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

// Helper function to query Shopify Admin API
async function queryShopifyAdmin(query, variables = {}) {
  try {
    const response = await fetch(SHOPIFY_ADMIN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
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
    console.error('Shopify API query error:', error);
    throw error;
  }
}

// Check if customer exists in Shopify
async function checkShopifyCustomerExists(email) {
  try {
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

    const data = await queryShopifyAdmin(query);
    return data.customers.edges.length > 0;
  } catch (error) {
    console.error('Error checking Shopify customer:', error);
    return false;
  }
}

// Export the function for use in other routes
module.exports = {
  router,
  checkShopifyCustomerExists
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