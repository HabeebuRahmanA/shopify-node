// Load environment variables - only in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: '.env.development.local' });
}

const express = require('express');
const authRoutes = require('./routes/authRoutes');
const { router: shopifyRoutes } = require('./routes/shopifyRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Add global error handler
app.use((err, req, res, next) => {
  console.error('🔥 [GLOBAL ERROR]', err);
  res.status(500).json({ 
    error: 'Server error occurred',
    message: err.message 
  });
});

app.use(express.json());

// Add a simple test endpoint
app.get('/test', (req, res) => {
  console.log('🔍 [TEST] Server is working');
  res.json({ 
    message: 'Server is working',
    timestamp: new Date().toISOString(),
    env: {
      SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN ? 'SET' : 'NOT SET',
      SHOPIFY_ADMIN_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ? 'SET' : 'NOT SET',
      POSTGRES_URL_NON_SSL: process.env.POSTGRES_URL_NON_SSL ? 'SET' : 'NOT SET'
    }
  });
});

// Mount auth and email routes
app.use(authRoutes);
app.use(shopifyRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});
