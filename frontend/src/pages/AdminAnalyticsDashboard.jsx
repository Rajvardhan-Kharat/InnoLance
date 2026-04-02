import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import './AdminDashboard.css';

export default function AdminAnalyticsDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get('/admin/analytics/financial');
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch analytics', err);
      } finally {
        setLoading(false);
      }
    };
    if (user?.role === 'admin') fetchAnalytics();
  }, [user]);

  if (loading) return <div className="loading-screen">Loading Analytics Data...</div>;
  if (!data) return <div className="error-screen">Failed to load analytics or insufficient permissions.</div>;

  const conversionRate = data.freelancers.total > 0 
    ? ((data.freelancers.hired / data.freelancers.total) * 100).toFixed(1) 
    : 0;

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>📊 InnoLance Financial Analytics</h1>
        <p>Track platform revenue, active escrow balances, and user metrics.</p>
      </div>

      <div className="stats-grid" style={{ marginTop: '30px' }}>
        <div className="stat-card" style={{ borderTop: '4px solid #48bb78' }}>
          <span className="stat-value">₹{data.revenue.toLocaleString()}</span>
          <span className="stat-label">Total Platform Revenue</span>
          <p style={{ fontSize: '0.8em', color: '#718096', marginTop: '10px' }}>Derived from project matching fees</p>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #4299e1' }}>
          <span className="stat-value">₹{data.escrow.toLocaleString()}</span>
          <span className="stat-label">Active Escrow Balance</span>
          <p style={{ fontSize: '0.8em', color: '#718096', marginTop: '10px' }}>Funds held for in-progress milestones</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginTop: '30px' }}>
        <div className="stat-card" style={{ borderTop: '4px solid #ed8936' }}>
          <span className="stat-value">{data.freelancers.hired} / {data.freelancers.total}</span>
          <span className="stat-label">Freelancers Hired</span>
          <div style={{ marginTop: '10px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '4px', height: '8px' }}>
            <div style={{ width: `${conversionRate}%`, backgroundColor: '#ed8936', height: '8px', borderRadius: '4px' }}></div>
          </div>
          <p style={{ fontSize: '0.8em', color: '#718096', marginTop: '10px' }}>{conversionRate}% Conversion Rate</p>
        </div>
        <div className="stat-card" style={{ borderTop: '4px solid #9f7aea' }}>
          <span className="stat-value">{data.projects.hired}</span>
          <span className="stat-label">Funded Projects</span>
          <p style={{ fontSize: '0.8em', color: '#718096', marginTop: '10px' }}>{data.projects.completed} Projects Completed</p>
        </div>
      </div>
    </div>
  );
}
