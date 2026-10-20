import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';

export const verifyJWT = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check Authorization header first (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 2. Fallback to cookies if header is missing
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      throw new ApiError(401, 'Unauthorized request: No token provided');
    }

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET || process.env.ACCESS_TOKEN_SECRET);
    
    // Attach user payload to request
    req.user = decodedToken;
    next();
  } catch (error) {
    return next(new ApiError(401, error?.message || 'Invalid access token'));
  }
};