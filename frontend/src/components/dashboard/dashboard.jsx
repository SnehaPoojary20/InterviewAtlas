import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './Dashboard.css';

export default function Dashboard() {
  const [companyUrl, setCompanyUrl] = useState('');
  const [jd, setJd] = useState('');
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [kits, setKits] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchKits();
  }, []);

  const fetchKits = async () => {
    try {
      const res = await apiFetch('/kits');
      setKits(res.data || []);
    } catch (err) {
      if (err.message.includes('Unauthorized')) navigate('/login');
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/kits', {
        method: 'POST',
        body: JSON.stringify({ company_url: companyUrl, jd, days: parseInt(days, 10) }),
      });
      navigate(`/kits/${res.data._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">Dashboard</h1>
      {error && <div className="error-alert">{error}</div>}

      <form onSubmit={handleGenerate} className="form-card">
        <h3>Generate New Prep Kit</h3>
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label>Company Website URL</label>
          <input type="url" required placeholder="https://example.com" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} className="form-control" />
        </div>
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label>Job Description (JD)</label>
          <textarea required rows="5" placeholder="Paste full job description requirements..." value={jd} onChange={(e) => setJd(e.target.value)} className="form-control" />
        </div>
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <label>Days Available for Preparation</label>
          <input type="number" min="1" max="14" value={days} onChange={(e) => setDays(e.target.value)} className="form-control" style={{ width: '120px' }} />
        </div>
        <button type="submit" disabled={loading} className="submit-btn" style={{ marginTop: '1.5rem' }}>
          {loading ? 'Crawling Company & Generating Kit...' : 'Generate Kit'}
        </button>
      </form>

      <h3>Your Generated Kits</h3>
      <div className="kits-grid" style={{ marginTop: '1rem' }}>
        {kits.map((kit) => (
          <div key={kit._id} className="kit-card">
            <div>
              <strong>{kit.kitData?.role?.title || 'Role'}</strong>
              <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>{kit.kitData?.source?.company_url}</p>
            </div>
            <button onClick={() => navigate(`/kits/${kit._id}`)} className="view-btn">View</button>
          </div>
        ))}
      </div>
    </div>
  );
}