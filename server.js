const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic health check route
app.get('/', (req, res) => {
  res.send('Server is running by vdroid');
});

// Main API route returning "hello"
app.get('/api/hello', (req, res) => {
  res.json({ message: 'hello' });
});

app.get('/api/myapi', (req, res) => {
  res.json({ message: 'Habeeb is talking' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
