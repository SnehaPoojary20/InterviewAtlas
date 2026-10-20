import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import jwt from 'jsonwebtoken';



const registerUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            throw new ApiError(400, 'Email and password are required');
        }
        
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            throw new ApiError(409, 'User with this email already exists');
        }

        const user = await User.create({ email, password });
        const createdUser = await User.findById(user._id).select('-password');

        return res
            .status(201)
            .json(new ApiResponse(201, createdUser, 'User registered successfully'));

    } catch (error) {
        console.error("REGISTER ERROR STACK:", error);
        if (typeof next === 'function') {
            return next(error);
        }
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};



const loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            throw new ApiError(400, 'Email and password are required');
        }

        const user = await User.findOne({ email });
        if (!user) {
            throw new ApiError(404, 'User does not exist');
        }

        const isPasswordValid = await user.isPasswordCorrect(password);
        if (!isPasswordValid) {
            throw new ApiError(401, 'Invalid user credentials');
        }

        const token = jwt.sign({ _id: user._id, email: user.email }, process.env.JWT_SECRET, {
            expiresIn: '7d',
        });

        const loggedInUser = await User.findById(user._id).select('-password');

        // Configured for cross-domain auth 
        const options = {
            httpOnly: true,
            secure: true,           // Required when sameSite is 'none'
            sameSite: 'none',       // Allows cross-site cookie transmission
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        };

        return res
            .status(200)
            .cookie('token', token, options)
            .json(
                new ApiResponse(
                    200,
                    { user: loggedInUser, token },
                    'User logged in successfully'
                )
            );
    } catch (error) {
        if (typeof next === 'function') {
            return next(error);
        }
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};



const logoutUser = async (req, res, next) => {
    try {
        const options = {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
        };
        return res
            .status(200)
            .clearCookie('token', options)
            .json(new ApiResponse(200, {}, 'User logged out successfully'));
    } catch (error) {
        if (typeof next === 'function') {
            return next(error);
        }
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};

export { registerUser, loginUser, logoutUser };