import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './Navbar.css';

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // Check login state whenever route changes or component mounts
    useEffect(() => {
        const loggedInStatus = localStorage.getItem('isAuthenticated') === 'true';
        setIsLoggedIn(loggedInStatus);
    }, [location]);

    const handleLogout = async () => {
        try {
            await apiFetch('/auth/logout', { method: 'POST' });
        } catch (err) {
            console.error(err);
        } finally {
            localStorage.removeItem('isAuthenticated');
            setIsLoggedIn(false);
            navigate('/login');
        }
    };

    return (
        <nav className="navbar-container">
            <Link to={isLoggedIn ? "/dashboard" : "/login"} className="navbar-brand">
                InterviewAtlas
            </Link>
            <div className="navbar-links">
                {isLoggedIn ? (
                    <>
                        <Link to="/dashboard" className="nav-link">Dashboard</Link>
                        <button onClick={handleLogout} className="logout-btn">Logout</button>
                    </>
                ) : (
                    <>
                        <Link to="/login" className="nav-link">Login</Link>
                        <Link to="/register" className="nav-link register-link">Register</Link>
                    </>
                )}
            </div>
        </nav>
    );
}