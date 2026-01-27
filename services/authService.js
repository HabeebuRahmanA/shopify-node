const db = require('../db/db');

// Utility: Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(email) {
  return Buffer.from(JSON.stringify({ email, iat: Date.now() })).toString('base64');
}

// Fetch customer details from Shopify (Hybrid approach)
async function getShopifyCustomerDetails(email, forceRefresh = false) {
  try {
    // Import here to avoid circular dependency
    const shopifyRoutes = require('../routes/shopifyRoutes');
    const { queryShopifyAdmin, getCustomerDataStorefront } = shopifyRoutes;
    
    console.log('🔍 [AUTH] Fetching customer details for email:', email);
    
    // For fresh login or force refresh, use Admin API to get complete data
    if (forceRefresh) {
      console.log('📡 [AUTH] Using Admin API for complete data...');
      
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
                totalSpent
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
              }
            }
          }
        }
      `;

      const data = await queryShopifyAdmin(query);
      
      if (data.customers.edges.length > 0) {
        const customer = data.customers.edges[0].node;
        console.log('✅ [AUTH] Admin API data fetched');
        return {
          id: customer.id,
          email: customer.email,
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email.split('@')[0],
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          createdAt: customer.createdAt,
          numberOfOrders: customer.numberOfOrders,
          totalSpent: customer.totalSpent,
          state: customer.state,
          defaultAddress: customer.defaultAddress,
          addresses: customer.addresses.edges.map(edge => edge.node),
          dataSource: 'admin'
        };
      }
    } else {
      // For session validation, use Storefront API for fresh data
      console.log('📡 [AUTH] Using Storefront API for fresh data...');
      const customerData = await getCustomerDataStorefront(email);
      if (customerData) {
        console.log('✅ [AUTH] Storefront API data fetched');
        return customerData;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching Shopify customer details:', error);
    return null;
  }
}

// Create or get user from database
async function getOrCreateUser(email, forceRefresh = false) {
  let user = await db.getUser(email);
  if (!user) {
    user = await db.createUser(email, email.split('@')[0]);
  }
  
  // Try to enrich with Shopify customer data
  try {
    const shopifyCustomer = await getShopifyCustomerDetails(email, forceRefresh);
    if (shopifyCustomer) {
      // Merge Shopify data with local user data
      user = { ...user, ...shopifyCustomer };
      console.log('✅ [AUTH] Enriched user data with Shopify details');
    }
  } catch (error) {
    console.log('⚠️ [AUTH] Could not fetch Shopify customer details, using local data');
  }
  
  return user;
}

module.exports = {
  generateOTP,
  generateToken,
  getOrCreateUser,
  getShopifyCustomerDetails,
};
