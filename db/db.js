const { neon } = require('@neondatabase/serverless');

// Initialize Neon connection
const sql = neon(process.env.POSTGRES_URL_NON_SSL);

// Database functions for users
const db = {
  // Create a new user
  async createUser(email, name) {
    try {
      const result = await sql`
        INSERT INTO users (email, name, created_at)
        VALUES (${email}, ${name}, NOW())
        RETURNING id, email, name, created_at
      `;
      return result[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  // Get user by email
  async getUser(email) {
    try {
      const result = await sql`
        SELECT * FROM users WHERE email = ${email}
      `;
      return result[0] || null;
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  },

  // Store OTP
  async storeOTP(email, code, expiresAt) {
    try {
      const result = await sql`
        INSERT INTO otp (email, code, expires_at, created_at)
        VALUES (${email}, ${code}, ${expiresAt}, NOW())
        RETURNING id, email, code, expires_at
      `;
      return result[0];
    } catch (error) {
      console.error('Error storing OTP:', error);
      throw error;
    }
  },

  // Get OTP by email
  async getOTP(email) {
    try {
      const result = await sql`
        SELECT * FROM otp WHERE email = ${email} AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1
      `;
      return result[0] || null;
    } catch (error) {
      console.error('Error getting OTP:', error);
      throw error;
    }
  },

  // Delete OTP (after verification)
  async deleteOTP(email) {
    try {
      await sql`DELETE FROM otp WHERE email = ${email}`;
      return true;
    } catch (error) {
      console.error('Error deleting OTP:', error);
      throw error;
    }
  },

  // Store session
  async createSession(userId, token, expiresAt) {
    try {
      const result = await sql`
        INSERT INTO sessions (user_id, token, created_at, expires_at)
        VALUES (${userId}, ${token}, NOW(), ${expiresAt})
        RETURNING id, user_id, token, created_at, expires_at
      `;
      return result[0];
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  },

  // Get session by token
  async getSession(token) {
    try {
      const result = await sql`
        SELECT * FROM sessions 
        WHERE token = ${token} AND revoked = false
      `;
      return result[0] || null;
    } catch (error) {
      console.error('Error getting session:', error);
      throw error;
    }
  },

  // Get user by ID
  async getUserById(userId) {
    try {
      const result = await sql`
        SELECT * FROM users WHERE id = ${userId}
      `;
      return result[0] || null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  },

  // Revoke session
  async revokeSession(token) {
    try {
      await sql`
        UPDATE sessions 
        SET revoked = true 
        WHERE token = ${token}
      `;
      return true;
    } catch (error) {
      console.error('Error revoking session:', error);
      throw error;
    }
  },

  // Clean up expired sessions
  async cleanupExpiredSessions() {
    try {
      await sql`
        DELETE FROM sessions 
        WHERE expires_at < NOW() OR revoked = true
      `;
      return true;
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      throw error;
    }
  },

  // Update user with Shopify data
  async updateUserShopifyData(email, shopifyData) {
    try {
      await sql`
        UPDATE users 
        SET 
          name = ${shopifyData.name || email.split('@')[0]},
          shopify_id = ${shopifyData.id || null},
          shopify_created_at = ${shopifyData.createdAt || null},
          number_of_orders = ${shopifyData.numberOfOrders || 0},
          total_spent = ${shopifyData.totalSpent || 0},
          data_source = ${shopifyData.dataSource || 'unknown'},
          updated_at = NOW()
        WHERE email = ${email}
      `;
      console.log('✅ [DB] User Shopify data updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating user Shopify data:', error);
      throw error;
    }
  },

  // Cart Management Functions

  // Create or get user's cart
  async createOrUpdateCart(userId) {
    try {
      // Check if user has an active cart
      const existingCart = await sql`
        SELECT * FROM carts 
        WHERE user_id = ${userId} AND status = 'active'
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      
      if (existingCart.length > 0) {
        return existingCart[0];
      }
      
      // Create new cart
      const newCart = await sql`
        INSERT INTO carts (user_id, status) 
        VALUES (${userId}, 'active')
        RETURNING *
      `;
      
      return newCart[0];
    } catch (error) {
      console.error('Error creating/updating cart:', error);
      throw error;
    }
  },

  // Get user's cart with items
  async getUserCart(userId) {
    try {
      const cart = await sql`
        SELECT c.*, 
               json_agg(
                 json_build_object(
                   'id', ci.id,
                   'shopify_product_id', ci.shopify_product_id,
                   'shopify_variant_id', ci.shopify_variant_id,
                   'quantity', ci.quantity,
                   'price', ci.price,
                   'currency', ci.currency,
                   'added_at', ci.added_at
                 )
               ) as items
        FROM carts c
        LEFT JOIN cart_items ci ON c.id = ci.cart_id
        WHERE c.user_id = ${userId} AND c.status = 'active'
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT 1
      `;
      
      if (cart.length > 0) {
        // Filter out null items
        cart[0].items = cart[0].items.filter(item => item.id !== null);
        return cart[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error getting user cart:', error);
      throw error;
    }
  },

  // Add item to cart
  async addCartItem(cartId, productId, variantId, quantity, price, currency) {
    try {
      // Check if item already exists in cart
      const existingItem = await sql`
        SELECT * FROM cart_items 
        WHERE cart_id = ${cartId} AND shopify_variant_id = ${variantId}
      `;
      
      if (existingItem.length > 0) {
        // Update quantity
        const updated = await sql`
          UPDATE cart_items 
          SET quantity = quantity + ${quantity}
          WHERE cart_id = ${cartId} AND shopify_variant_id = ${variantId}
          RETURNING *
        `;
        
        // Update cart timestamp
        await sql`UPDATE carts SET updated_at = NOW() WHERE id = ${cartId}`;
        
        return updated[0];
      } else {
        // Add new item
        const newItem = await sql`
          INSERT INTO cart_items (cart_id, shopify_product_id, shopify_variant_id, quantity, price, currency)
          VALUES (${cartId}, ${productId}, ${variantId}, ${quantity}, ${price}, ${currency})
          RETURNING *
        `;
        
        // Update cart timestamp
        await sql`UPDATE carts SET updated_at = NOW() WHERE id = ${cartId}`;
        
        return newItem[0];
      }
    } catch (error) {
      console.error('Error adding cart item:', error);
      throw error;
    }
  },

  // Update cart item quantity
  async updateCartItemQuantity(itemId, quantity) {
    try {
      if (quantity <= 0) {
        // Remove item if quantity is 0 or less
        await sql`DELETE FROM cart_items WHERE id = ${itemId}`;
        return { deleted: true };
      } else {
        const updated = await sql`
          UPDATE cart_items 
          SET quantity = ${quantity}
          WHERE id = ${itemId}
          RETURNING *
        `;
        return updated[0];
      }
    } catch (error) {
      console.error('Error updating cart item:', error);
      throw error;
    }
  },

  // Remove item from cart
  async removeCartItem(itemId) {
    try {
      await sql`DELETE FROM cart_items WHERE id = ${itemId}`;
      return { success: true };
    } catch (error) {
      console.error('Error removing cart item:', error);
      throw error;
    }
  },

  // Clear cart
  async clearCart(cartId) {
    try {
      await sql`DELETE FROM cart_items WHERE cart_id = ${cartId}`;
      return { success: true };
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  },

  // Order Management Functions

  // Create order
  async createOrder(userId, shopifyOrderId, totalAmount, currency, paymentMethod, shippingAddress, orderItems) {
    try {
      const newOrder = await sql`
        INSERT INTO orders (user_id, shopify_order_id, total_amount, currency, payment_method, shipping_address, order_items, status)
        VALUES (${userId}, ${shopifyOrderId}, ${totalAmount}, ${currency}, ${paymentMethod}, ${JSON.stringify(shippingAddress)}, ${JSON.stringify(orderItems)}, 'confirmed')
        RETURNING *
      `;
      
      // Mark cart as converted
      await sql`
        UPDATE carts 
        SET status = 'converted' 
        WHERE user_id = ${userId} AND status = 'active'
      `;
      
      return newOrder[0];
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  },

  // Get user orders
  async getUserOrders(userId) {
    try {
      const orders = await sql`
        SELECT * FROM orders 
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;
      return orders;
    } catch (error) {
      console.error('Error getting user orders:', error);
      throw error;
    }
  },

  // Update order status
  async updateOrderStatus(orderId, status) {
    try {
      const updated = await sql`
        UPDATE orders 
        SET status = ${status}, updated_at = NOW()
        WHERE id = ${orderId}
        RETURNING *
      `;
      return updated[0];
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }
};

module.exports = db;