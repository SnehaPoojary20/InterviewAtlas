import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();

// Allowed origins for CORS 
const allowedOrigins = [
  "http://localhost:5173",
  /\.vercel\.app$/
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow non-browser requests (like Postman or server-to-server)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(allowed => 
      allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
    );

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(express.static('public'));
app.use(cookieParser());

import authRouter from './routes/auth.routes.js';
import kitRouter from './routes/kit.routes.js';

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/kits', kitRouter);

app.get('/', (req, res) => {
  res.status(200).json({ success: true, message: "AI Interview Prep API is running!" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    errors: err.errors || []
  });
});

export { app };