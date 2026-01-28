const express = require('express');
const router = express.Router();

const db = require('../db/db');

// Shopify Admin API query function (inline to avoid circular dependency)
async function queryShopifyAdmin(query) {
  try {
    const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
    const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    const SHOPIFY_ADMIN_API_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`;

    const response = await fetch(SHOPIFY_ADMIN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query }),
    });

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

// Add item to cart
router.post('/cart/add-item', async (req, res) => {
  const { userId, productId, variantId, quantity, price, currency } = req.body;

  console.log('🛒 [CART] Add item request received');
  console.log('📊 [CART] Request body:', JSON.stringify(req.body, null, 2));

  if (!userId || !productId || !variantId || !quantity || !price || !currency) {
    console.log('❌ [CART] Missing required fields');
    console.log('❌ [CART] userId:', userId);
    console.log('❌ [CART] productId:', productId);
    console.log('❌ [CART] variantId:', variantId);
    console.log('❌ [CART] quantity:', quantity);
    console.log('❌ [CART] price:', price);
    console.log('❌ [CART] currency:', currency);
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    console.log('🛒 [CART] Adding item to cart for user:', userId);
    
    // Get or create user's cart
    console.log('📊 [CART] Getting or creating cart...');
    const cart = await db.createOrUpdateCart(userId);
    console.log('✅ [CART] Cart created/retrieved:', cart.id);
    
    // Add item to cart
    console.log('📊 [CART] Adding item to cart...');
    console.log('📊 [CART] Cart ID:', cart.id);
    console.log('📊 [CART] Product ID:', productId);
    console.log('📊 [CART] Variant ID:', variantId);
    console.log('📊 [CART] Quantity:', quantity);
    console.log('📊 [CART] Price:', price);
    console.log('📊 [CART] Currency:', currency);
    
    const cartItem = await db.addCartItem(cart.id, productId, variantId, quantity, price, currency);
    console.log('✅ [CART] Item added to cart successfully:', cartItem.id);
    
    res.json({
      success: true,
      cartItem,
      message: 'Item added to cart'
    });
  } catch (error) {
    console.error('🔥 [CART] Error adding item to cart:', error);
    console.error('🔥 [CART] Full error stack:', error.stack);
    res.status(500).json({ error: 'Failed to add item to cart', details: error.message });
  }
});

// Get user's cart
router.get('/cart/get-cart/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    console.log('🛒 [CART] Getting cart for user:', userId);
    
    const cart = await db.getUserCart(userId);
    
    if (!cart) {
      return res.json({
        success: true,
        cart: null,
        items: [],
        message: 'No active cart found'
      });
    }

    console.log('✅ [CART] Cart retrieved successfully');
    
    res.json({
      success: true,
      cart,
      items: cart.items || [],
      message: 'Cart retrieved successfully'
    });
  } catch (error) {
    console.error('🔥 [CART] Error getting cart:', error);
    res.status(500).json({ error: 'Failed to get cart' });
  }
});

// Update cart item quantity
router.put('/cart/update-item', async (req, res) => {
  const { itemId, quantity } = req.body;

  if (!itemId || !quantity) {
    return res.status(400).json({ error: 'Item ID and quantity are required' });
  }

  try {
    console.log('🛒 [CART] Updating item quantity:', itemId, 'to:', quantity);
    
    const result = await db.updateCartItemQuantity(itemId, quantity);
    
    console.log('✅ [CART] Item quantity updated successfully');
    
    res.json({
      success: true,
      result,
      message: quantity <= 0 ? 'Item removed from cart' : 'Item quantity updated'
    });
  } catch (error) {
    console.error('🔥 [CART] Error updating item quantity:', error);
    res.status(500).json({ error: 'Failed to update item quantity' });
  }
});

// Remove item from cart
router.delete('/cart/remove-item/:itemId', async (req, res) => {
  const { itemId } = req.params;

  if (!itemId) {
    return res.status(400).json({ error: 'Item ID is required' });
  }

  try {
    console.log('🛒 [CART] Removing item from cart:', itemId);
    
    await db.removeCartItem(itemId);
    
    console.log('✅ [CART] Item removed from cart successfully');
    
    res.json({
      success: true,
      message: 'Item removed from cart'
    });
  } catch (error) {
    console.error('🔥 [CART] Error removing item from cart:', error);
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

// Clear cart
router.delete('/cart/clear-cart/:cartId', async (req, res) => {
  const { cartId } = req.params;

  if (!cartId) {
    return res.status(400).json({ error: 'Cart ID is required' });
  }

  try {
    console.log('🛒 [CART] Clearing cart:', cartId);
    
    await db.clearCart(cartId);
    
    console.log('✅ [CART] Cart cleared successfully');
    
    res.json({
      success: true,
      message: 'Cart cleared successfully'
    });
  } catch (error) {
    console.error('🔥 [CART] Error clearing cart:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

// Create COD order
router.post('/orders/create-order', async (req, res) => {
  const { userId, cartId, shippingAddress, paymentMethod = 'cod', orderNotes = '' } = req.body;

  console.log('🛒 [ORDER] Creating COD order');
  console.log('📊 [ORDER] Request body:', JSON.stringify(req.body, null, 2));

  if (!userId || !cartId || !shippingAddress) {
    console.log('❌ [ORDER] Missing required fields');
    console.log('❌ [ORDER] userId:', userId);
    console.log('❌ [ORDER] cartId:', cartId);
    console.log('❌ [ORDER] shippingAddress:', shippingAddress);
    return res.status(400).json({ error: 'User ID, cart ID, and shipping address are required' });
  }

  try {
    console.log('🛒 [ORDER] Creating COD order for user:', userId);
    
    // Get cart details
    const cart = await db.getUserCart(userId);
    if (!cart || cart.items.length === 0) {
      console.log('❌ [ORDER] Cart is empty');
      return res.status(400).json({ error: 'Cart is empty' });
    }

    console.log('📊 [ORDER] Cart items:', cart.items.length);
    console.log('📊 [ORDER] Cart ID:', cart.id);

    // Calculate total
    const totalAmount = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const currency = cart.items[0]?.currency || 'USD';

    console.log('📊 [ORDER] Total amount:', totalAmount);
    console.log('📊 [ORDER] Currency:', currency);

    // Create Shopify order
    const shopifyOrder = await createShopifyOrder(cart.items, shippingAddress, totalAmount, currency, orderNotes);
    
    // Create order in our database
    const order = await db.createOrder(
      userId,
      shopifyOrder.id,
      totalAmount,
      currency,
      paymentMethod,
      shippingAddress,
      cart.items,
      orderNotes
    );

    console.log('✅ [ORDER] COD order created successfully');
    console.log('📊 [ORDER] Order ID:', order.id);
    
    res.json({
      success: true,
      order,
      shopifyOrder,
      message: 'COD order created successfully'
    });
  } catch (error) {
    console.error('🔥 [ORDER] Error creating order:', error);
    console.error('🔥 [ORDER] Full error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create order', details: error.message });
  }
});

// Helper function to create Shopify order
async function createShopifyOrder(cartItems, shippingAddress, totalAmount, currency, orderNotes = '') {
  try {
    console.log('🛒 [SHOPIFY] Creating Shopify order...');
    
    const lineItems = cartItems.map(item => ({
      variantId: item.shopify_variant_id,
      quantity: item.quantity
    }));

    const query = `
      mutation {
        orderCreate(input: {
          lineItems: ${JSON.stringify(lineItems).replace(/"/g, '\\\\"')},
          shippingAddress: {
            address1: "${shippingAddress.address1}",
            address2: "${shippingAddress.address2 || ''}",
            city: "${shippingAddress.city}",
            province: "${shippingAddress.province}",
            zip: "${shippingAddress.zip}",
            country: "${shippingAddress.country}"
          },
          financialStatus: PENDING,
          note: "COD Order - Mobile App${orderNotes.isNotEmpty ? ' - ' + orderNotes : ''}",
          tags: "mobile-app, cod"
        }
      ) {
        order {
          id
          name
          orderNumber
          totalPrice
          currencyCode
          displayFinancialStatus
          displayFulfillmentStatus
          shippingAddress {
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
    `;

    const data = await queryShopifyAdmin(query);
    
    if (data.orderCreate && data.orderCreate.order) {
      console.log('✅ [SHOPIFY] Order created successfully:', data.orderCreate.order.name);
      return data.orderCreate.order;
    } else if (data.orderCreate && data.orderCreate.userErrors.length > 0) {
      throw new Error(`Shopify order creation failed: ${data.orderCreate.userErrors.map(e => e.message).join(', ')}`);
    } else {
      throw new Error('Unknown error creating Shopify order');
    }
  } catch (error) {
    console.error('🔥 [SHOPIFY] Error creating order:', error);
    throw error;
  }
}

// Get user orders
router.get('/orders/user-orders/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    console.log('📦 [ORDERS] Getting orders for user:', userId);
    
    const orders = await db.getUserOrders(userId);
    
    console.log('✅ [ORDERS] Orders retrieved successfully:', orders.length);
    
    res.json({
      success: true,
      orders,
      count: orders.length,
      message: 'Orders retrieved successfully'
    });
  } catch (error) {
    console.error('🔥 [ORDERS] Error getting orders:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

module.exports = router;
