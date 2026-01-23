// Load environment variables - only in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: '.env.development.local' });
}

const express = require('express');
const authRoutes = require('./routes/authRoutes');
const shopifyRoutes = require('./routes/shopifyRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Mount auth and email routes
app.use(authRoutes);
app.use(shopifyRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});
