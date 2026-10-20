import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './KitViewer.css';

export default function KitViewer() {
  const { id } = useParams();
  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKitDetails();
  }, [id]);

  const fetchKitDetails = async () => {
    try {
      const res = await apiFetch(`/kits/${id}`);
      setKit(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Loading kit details...</div>;
  if (!kit) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Kit not found.</div>;

  const kitData = kit.kitData || kit;

  return (
    <div className="kit-viewer-container">
      <div className="kit-header">
        <h1>{kitData?.role?.title || 'Interview Prep Kit'}</h1>
        <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>Company URL: {kitData?.source?.company_url}</p>
      </div>

      <div className="section-card">
        <h2>Company Brief</h2>
        <p style={{ marginTop: '0.75rem' }}><strong>Summary:</strong> {kitData?.company_brief?.summary}</p>
        <p style={{ marginTop: '0.5rem' }}><strong>What They Do:</strong> {kitData?.company_brief?.what_they_do}</p>
      </div>

      <div className="section-card">
        <h2>Question Bank</h2>
        <div style={{ marginTop: '1rem' }}>
          {kitData?.questions?.map((q, idx) => (
            <div key={q.id || idx} className="question-item">
              <span style={{ fontSize: '0.75rem', background: '#2563eb', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                {q.category}
              </span>
              <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>{q.prompt}</p>
              <p style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '0.25rem' }}>
                <strong>Outline:</strong> {q.answer_outline}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}