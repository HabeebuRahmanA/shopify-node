# Shopify Admin API vs Headless API - Complete Guide

## ❓ Why Do You Need Admin API If You're Using Headless?

Great question! The answer is nuanced. Let me explain with a clear comparison:

## 📊 Comparison Table

| Feature | Customer Account API (Headless) | Admin API |
|---------|--------------------------------|----------|
| **Purpose** | Customer-facing operations | Backend management & queries |
| **Access Level** | Customer's own data only | Full store access |
| **Authentication** | Customer login required | Admin token only |
| **Use Case** | Mobile app, web frontend | Backend, Node.js server |
| **Who should use** | Flutter app directly | Node.js backend |
| **Token Type** | Bearer token (customer) | Admin API token |
| **Query Restrictions** | Limited to customer profile | Full GraphQL capabilities |

## 🏗️ Your Architecture

```
Flutter Mobile App
        ↓
   [Your Node.js Backend]
        ↓
[Shopify APIs]
```

### Option 1: Customer Account API (RECOMMENDED for simple use cases)
**Best when:** Just fetching customer's own orders and profile

- ✅ Less overhead
- ✅ Built for customer-facing operations
- ✅ Pre-configured in your Headless channel
- ❌ Limited query capabilities
- ❌ Cannot access inventory, refunds, etc.

**How it works:**
1. Flutter app authenticates customer (OAuth)
2. Flutter app gets customer access token
3. Flutter app calls your Node backend with token
4. Node backend queries Customer Account API as that customer

### Option 2: Admin API (RECOMMENDED if you need full power)
**Best when:** You need server-side access to all store data

- ✅ Full GraphQL capabilities
- ✅ Can query any customer's orders
- ✅ Can manage inventory, refunds, payments
- ✅ Can access analytics
- ❌ More powerful = more responsibility
- ❌ Needs secure token storage

**How it works:**
1. You have Admin API token (server secret)
2. Node backend uses token to query Shopify
3. Node backend returns results to Flutter app

## 🔑 YOUR CURRENT SETUP

**Found Credentials:**
- Customer Account API Client ID: `a9fc9fee-bb0d-44b2-ab61-d963796adaa3`
- API Endpoint: `https://shopify-node-nu.vercel.app/auth/callback`

**What you built:**
- ✅ Node backend with Shopify routes
- ✅ Environment variables configured
- ⏳ Needs actual authentication tokens

## ✅ RECOMMENDED APPROACH

### Step 1: Use Customer Account API (Simple & Secure)

Instead of Admin API, use the Customer Account API which is designed for exactly your use case.

**Modify `shopifyRoutes.js`:**

```javascript
// Use Customer Account API instead of Admin API
const SHOPIFY_CUSTOMER_API_URL = `https://${process.env.SHOPIFY_STORE_DOMAIN}/api/2024-01/graphql.json`;

// The customer token comes from the Flutter app after OAuth
router.post('/customer/get-orders', async (req, res) => {
  try {
    const { email, customerAccessToken } = req.body; // Token from Flutter app
    
    const query = `
      query {
        customer {
          id
          email
          orders(first: 10) {
            edges { node { id, name, totalPrice } }
          }
        }
      }
    `;
    
    const response = await fetch(SHOPIFY_CUSTOMER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': customerAccessToken, // From Flutter
      },
      body: JSON.stringify({ query }),
    });
    
    const data = await response.json();
    res.json({ success: true, data: data.data.customer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Step 2: Set Up Admin API (If you need full power later)

If you need to access any customer's data or manage inventory:

1. **Create Custom Admin App in Shopify:**
   - Go to: https://admin.shopify.com/store/habi-dev-store/settings/apps/develop
   - Click **Create an app**
   - Name it: "Node Backend API"
   - Select **Admin API scopes**:
     - `read_customers`
     - `read_orders`
     - `read_inventory` (if needed)
   - Install to your dev store

2. **Get Admin Token:**
   - In the app: Go to **Configuration**
   - Find **Admin API access tokens**
   - Click **Generate token**
   - Copy the token

3. **Add to Vercel:**
   - Update `SHOPIFY_ADMIN_ACCESS_TOKEN` with real token
   - Keep current code in `shopifyRoutes.js`
   - Redeploy

## 🎯 MY RECOMMENDATION

**For your Flutter + Node setup:**

1. **Phase 1 (Now):** Use Customer Account API
   - Simpler
   - More secure
   - Built for this exact purpose
   - No customer impersonation issues

2. **Phase 2 (Later):** Add Admin API if you need
   - Access all customers' data
   - Manage inventory
   - Process refunds
   - Access analytics

## 📝 CURRENT STATUS

- ✅ Node backend created
- ✅ Shopify routes implemented  
- ✅ Environment variables configured
- ⏳ Need customer access tokens from Flutter app
- ⏳ Need to implement proper OAuth flow

## 🚀 NEXT STEPS

1. Update `shopifyRoutes.js` to use Customer Account API (see code above)
2. Implement OAuth callback to exchange code for customer token
3. Update Flutter app to send customer token to backend
4. Test with real Shopify data
5. If needed later, add Admin API for server-side queries

## 🔗 Resources

- [Shopify Customer Account API Docs](https://shopify.dev/docs/api/customer)
- [Shopify Admin API Docs](https://shopify.dev/docs/api/admin)
- [OAuth 2.0 Flow](https://shopify.dev/docs/api/admin-rest/2024-01/resources/oauth)