import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import './Home.css';

export default function Home() {
  const { user } = useAuth();
  const [recommendedProjects, setRecommendedProjects] = useState([]);

  useEffect(() => {
    if (user?.role === 'freelancer') {
      api.get('/recommendations/projects').then(({ data }) => setRecommendedProjects(data.projects || [])).catch(() => setRecommendedProjects([]));
    }
  }, [user]);

  return (
    <div className="home">
      <section className="hero">
        <h1>Connect with top freelancers. Get work done.</h1>
        <p className="hero-sub">
          Post projects, receive proposals, and hire vetted talent. One platform for clients and freelancers.
        </p>
        <div className="hero-actions">
          {!user && (
            <>
              <Link to="/register" className="btn btn-primary btn-lg">Get Started</Link>
              <Link to="/projects" className="btn btn-outline btn-lg">Browse Projects</Link>
            </>
          )}
          {user && (
            <>
              {user.role === 'client' && <Link to="/post-project" className="btn btn-primary btn-lg">Post a Project</Link>}
              <Link to="/projects" className="btn btn-outline btn-lg">Find Work</Link>
            </>
          )}
        </div>
      </section>
      {user?.role === 'freelancer' && recommendedProjects.length > 0 && (
        <section className="recommended">
          <h2>Recommended for you</h2>
          <p className="page-sub">Projects matching your skills</p>
          <div className="project-grid">
            {recommendedProjects.map((p) => (
              <Link to={`/projects/${p._id}`} key={p._id} className="project-card">
                <h3>{p.title}</h3>
                <p className="project-desc">{p.description?.slice(0, 100)}...</p>
                <div className="project-meta">
                  <span className="budget">{p.budgetType === 'fixed' ? `₹${p.budget}` : `₹${p.budget}/hr`}</span>
                  <span className="category">{p.category}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="features">
        <h2>Why InnoLance</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <span className="feature-icon">📋</span>
            <h3>Post & Bid</h3>
            <p>Clients post projects; freelancers submit proposals. Simple and transparent.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">💬</span>
            <h3>Direct Messaging</h3>
            <p>Communicate in-app. Keep all project discussions in one place.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">⭐</span>
            <h3>Reviews & Trust</h3>
            <p>Ratings and reviews help you choose the right talent or client.</p>
          </div>
        </div>
      </section>
      <section className="cta">
        <Link to="/projects" className="btn btn-primary btn-lg">Explore Projects</Link>
      </section>
    </div>
  );
}
