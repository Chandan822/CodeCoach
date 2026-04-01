const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const cron = require('node-cron');
const axios = require('axios');

dotenv.config();

const app = express();

const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const allowedOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : []),
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'CodeCoach API is running' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Cron job: ping the server every 14 minutes to keep it alive
cron.schedule('*/14 * * * *', async () => {
  try {
    const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
    const response = await axios.get(`${BASE_URL}/`);
    console.log(`[Cron] Keep-alive ping sent. Status: ${response.status}`);
  } catch (err) {
    console.error('[Cron] Keep-alive ping failed:', err.message);
  }
});
