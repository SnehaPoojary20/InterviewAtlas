import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();

// Middleware setup
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(express.static('public'));
app.use(cookieParser());

// Basic test route to check server health
app.get('/', (req, res) => {
  res.status(200).json({ success: true, message: "AI Interview Prep API is running!" });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    errors: err.errors || []
  });
});

export { app };