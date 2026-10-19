import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './Navbar.css';

export default function Navbar() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error(err);
    } finally {
      navigate('/login');
    }
  };

  return (
    <nav className="navbar-container">
      <Link to="/dashboard" className="navbar-brand">InterviewAtlas</Link>
      <div className="navbar-links">
        <Link to="/dashboard" className="nav-link">Dashboard</Link>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>
    </nav>
  );
}