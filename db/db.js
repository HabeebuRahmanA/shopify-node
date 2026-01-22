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
  async storeSession(userId, token) {
    try {
      const result = await sql`
        INSERT INTO sessions (user_id, token, created_at)
        VALUES (${userId}, ${token}, NOW())
        RETURNING id, user_id, token, created_at
      `;
      return result[0];
    } catch (error) {
      console.error('Error storing session:', error);
      throw error;
    }
  },

  // Get session by token
  async getSession(token) {
    try {
      const result = await sql`
        SELECT s.*, u.email FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ${token}
      `;
      return result[0] || null;
    } catch (error) {
      console.error('Error getting session:', error);
      throw error;
    }
  },
};

module.exports = db;