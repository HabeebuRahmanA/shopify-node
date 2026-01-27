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
          phone = ${shopifyData.phone || null},
          shopify_id = ${shopifyData.id || null},
          shopify_created_at = ${shopifyData.createdAt || null},
          number_of_orders = ${shopifyData.numberOfOrders || 0},
          total_spent = ${shopifyData.totalSpent || 0},
          data_source = ${shopifyData.dataSource || 'unknown'},
          updated_at = NOW()
        WHERE email = ${email}
      `;
      return true;
    } catch (error) {
      console.error('Error updating user Shopify data:', error);
      throw error;
    }
  },
};

module.exports = db;