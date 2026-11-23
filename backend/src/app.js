require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');

const app = express();
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production');
}
app.disable('x-powered-by');
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(session({
  name: 'hospital.sid',
  secret: process.env.SESSION_SECRET || 'development-secret-change-before-deploy',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SESSION_SECURE === 'true',
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use((req, res) => res.status(404).json({ message: 'ไม่พบ API ที่เรียกใช้งาน' }));
app.use(errorHandler);

module.exports = app;
