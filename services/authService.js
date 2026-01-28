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
    console.log('🔍 [AUTH] Fetching customer details for email:', email, 'forceRefresh:', forceRefresh);
    
    // Import here to avoid circular dependency
    const shopifyRoutes = require('../routes/shopifyRoutes');
    const { queryShopifyAdmin, getCustomerDataStorefront } = shopifyRoutes;
    
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
                ordersCount
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

      const data = await queryShopifyAdmin(query);
      console.log('📊 [AUTH] Admin API response:', JSON.stringify(data, null, 2));
      
      if (data.customers && data.customers.edges && data.customers.edges.length > 0) {
        const customer = data.customers.edges[0].node;
        console.log('✅ [AUTH] Admin API data fetched for customer:', customer.email);
        console.log('📞 [AUTH] Customer phone:', customer.phone);
        console.log('📅 [AUTH] Customer created:', customer.createdAt);
        console.log('📍 [AUTH] Customer addresses:', customer.addresses?.length || 0);
        
        return {
          id: customer.id,
          email: customer.email,
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email.split('@')[0],
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          createdAt: customer.createdAt,
          numberOfOrders: customer.numberOfOrders || customer.ordersCount || 0,
          totalSpent: 0, // Not available in this query
          state: customer.state,
          defaultAddress: customer.defaultAddress,
          addresses: customer.addresses || [],
          dataSource: 'admin'
        };
      } else {
        console.log('⚠️ [AUTH] No customer found in Admin API for email:', email);
        console.log('📊 [AUTH] Admin API customers data:', JSON.stringify(data.customers, null, 2));
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
    console.error('🔥 [AUTH] Error fetching Shopify customer details:', error.message);
    console.error('🔥 [AUTH] Full error:', error);
    return null;
  }
}

// Create or get user from database
async function getOrCreateUser(email, forceRefresh = false) {
  let user = await db.getUser(email);
  let isNewUser = false;
  
  if (!user) {
    user = await db.createUser(email, email.split('@')[0]);
    isNewUser = true;
    console.log('👤 [AUTH] Created new user in database:', user.id);
  }
  
  // Try to enrich with Shopify customer data
  try {
    let shopifyCustomer = await getShopifyCustomerDetails(email, forceRefresh);
    
    // If no Shopify customer exists and this is a new user, create one
    if (!shopifyCustomer && isNewUser) {
      console.log('🆕 [AUTH] No Shopify customer found for new user, creating one...');
      try {
        shopifyCustomer = await createShopifyCustomer(email, user.name, '');
        console.log('✅ [AUTH] Shopify customer created for new user');
      } catch (createError) {
        console.log('⚠️ [AUTH] Failed to create Shopify customer:', createError.message);
        console.log('⚠️ [AUTH] Full error details:', createError);
        // Continue with local user data if Shopify creation fails
      }
    }
    
    if (shopifyCustomer) {
      // IMPORTANT: Preserve local database fields, add Shopify data
      const enrichedUser = {
        id: user.id,           // Keep local database ID
        email: user.email,     // Keep local email
        created_at: user.created_at, // Keep local created_at
        updated_at: user.updated_at, // Keep local updated_at
        // Add all Shopify fields
        ...shopifyCustomer,
        // Ensure we have a name (fallback to email username)
        name: shopifyCustomer.name || user.name || email.split('@')[0],
      };
      
      console.log('✅ [AUTH] Enriched user data with Shopify details');
      console.log('📊 [AUTH] Final user data keys:', Object.keys(enrichedUser));
      
      // Update database with fresh data
      try {
        await db.updateUserShopifyData(email, shopifyCustomer);
        console.log('💾 [AUTH] Updated database with Shopify data');
      } catch (dbError) {
        console.log('⚠️ [AUTH] Database update failed, but continuing:', dbError.message);
        // Don't fail the login, just continue with the data we have
      }
      
      return enrichedUser;
    } else {
      console.log('⚠️ [AUTH] No Shopify customer data found, returning local user data');
      return user;
    }
  } catch (error) {
    console.log('⚠️ [AUTH] Could not fetch Shopify customer details, using local data:', error.message);
    return user;
  }
}

// Create Shopify customer
async function createShopifyCustomer(email, firstName, lastName) {
  try {
    console.log('🛒 [AUTH] Creating Shopify customer for:', email);
    console.log('👤 [AUTH] Customer name:', `${firstName || ''} ${lastName || ''}`.trim());
    
    const mutation = `
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            email
            firstName
            lastName
            phone
            createdAt
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
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        email: email,
        firstName: firstName || '',
        lastName: lastName || '',
        acceptsMarketing: false
      }
    };

    console.log('📡 [AUTH] Sending Shopify customer creation request...');
    console.log('🔗 [AUTH] Variables:', JSON.stringify(variables, null, 2));

    const data = await queryShopifyAdmin(mutation, variables);
    console.log('📊 [AUTH] Shopify customer creation response:', JSON.stringify(data, null, 2));
    
    if (data.customerCreate && data.customerCreate.customer) {
      const customer = data.customerCreate.customer;
      console.log('✅ [AUTH] Shopify customer created successfully:', customer.email);
      console.log('🆔 [AUTH] Shopify Customer ID:', customer.id);
      return {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
        createdAt: customer.createdAt,
        numberOfOrders: 0,
        ordersCount: 0,
        state: customer.state,
        defaultAddress: customer.defaultAddress,
        addresses: customer.addresses || [],
        dataSource: 'admin',
        isNewCustomer: true
      };
    } else if (data.customerCreate && data.customerCreate.userErrors && data.customerCreate.userErrors.length > 0) {
      const errors = data.customerCreate.userErrors;
      console.log('❌ [AUTH] Shopify customer creation errors:');
      errors.forEach(error => {
        console.log(`   - Field: ${error.field}, Message: ${error.message}`);
      });
      throw new Error(`Shopify customer creation failed: ${errors.map(e => e.message).join(', ')}`);
    } else {
      console.log('❌ [AUTH] Unexpected Shopify response:', JSON.stringify(data, null, 2));
      throw new Error('Unknown error creating Shopify customer - unexpected response format');
    }
  } catch (error) {
    console.error('🔥 [AUTH] Error creating Shopify customer:', error.message);
    console.error('🔥 [AUTH] Full error:', error);
    throw error;
  }
}

module.exports = {
  generateOTP,
  generateToken,
  getOrCreateUser,
  getShopifyCustomerDetails,
  createShopifyCustomer,
};
