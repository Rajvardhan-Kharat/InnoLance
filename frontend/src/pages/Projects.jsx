import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { CATEGORIES, DURATIONS, SKILLS } from '../utils/constants';
import './Projects.css';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    budgetType: '',
    duration: '',
    skills: [],
    minBudget: '',
    maxBudget: '',
    sort: 'newest',
  });

  useEffect(() => {
    const fetchProjects = async () => {
      setLoading(true);
      const params = { page, limit: 12, status: 'open' };
      if (filters.category) params.category = filters.category;
      if (filters.search) params.search = filters.search;
      if (filters.budgetType) params.budgetType = filters.budgetType;
      if (filters.duration) params.duration = filters.duration;
      if (filters.skills.length) params.skills = filters.skills.join(',');
      if (filters.minBudget) params.minBudget = filters.minBudget;
      if (filters.maxBudget) params.maxBudget = filters.maxBudget;
      if (filters.sort) params.sort = filters.sort;
      const { data } = await api.get('/projects', { params });
      setProjects(data.projects);
      setTotal(data.total);
      setPages(data.pages || 1);
      setLoading(false);
    };
    fetchProjects();
  }, [
    page,
    filters.category,
    filters.search,
    filters.budgetType,
    filters.duration,
    filters.skills,
    filters.minBudget,
    filters.maxBudget,
    filters.sort,
  ]);

  const handleSearch = (e) => {
    e.preventDefault();
    const form = e.target;
    setFilters({ ...filters, search: form.search.value.trim() });
    setPage(1);
  };

  const toggleSkill = (skill) => {
    setFilters((prev) => {
      const exists = prev.skills.includes(skill);
      const nextSkills = exists ? prev.skills.filter((s) => s !== skill) : [...prev.skills, skill];
      return { ...prev, skills: nextSkills };
    });
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      category: '',
      budgetType: '',
      duration: '',
      skills: [],
      minBudget: '',
      maxBudget: '',
      sort: 'newest',
    });
    setPage(1);
  };

  return (
    <div className="projects-marketplace">
      <div className="projects-head">
        <div>
          <h1>Find work</h1>
          <p className="page-sub">Search projects, apply filters, and submit proposals.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={clearFilters}>Clear filters</button>
      </div>

      <div className="projects-toolbar">
        <form onSubmit={handleSearch} className="search-form">
          <input name="search" type="text" placeholder="Search by title or keyword..." defaultValue={filters.search} />
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
        <div className="toolbar-right">
          <select
            value={filters.sort}
            onChange={(e) => { setFilters({ ...filters, sort: e.target.value }); setPage(1); }}
            aria-label="Sort"
          >
            <option value="newest">Newest</option>
            <option value="budget_low">Budget: low to high</option>
            <option value="budget_high">Budget: high to low</option>
          </select>
        </div>
      </div>

      <div className="projects-content">
        <aside className="filters">
          <div className="filter-card">
            <h3>Category</h3>
            <select
              value={filters.category}
              onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(1); }}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="filter-card">
            <h3>Budget type</h3>
            <div className="segmented">
              <button
                type="button"
                className={`seg-btn ${filters.budgetType === '' ? 'active' : ''}`}
                onClick={() => { setFilters({ ...filters, budgetType: '' }); setPage(1); }}
              >
                Any
              </button>
              <button
                type="button"
                className={`seg-btn ${filters.budgetType === 'fixed' ? 'active' : ''}`}
                onClick={() => { setFilters({ ...filters, budgetType: 'fixed' }); setPage(1); }}
              >
                Fixed
              </button>
              <button
                type="button"
                className={`seg-btn ${filters.budgetType === 'hourly' ? 'active' : ''}`}
                onClick={() => { setFilters({ ...filters, budgetType: 'hourly' }); setPage(1); }}
              >
                Hourly
              </button>
            </div>
          </div>

          <div className="filter-card">
            <h3>Budget range</h3>
            <div className="range-grid">
              <input
                type="number"
                min="0"
                placeholder="Min"
                value={filters.minBudget}
                onChange={(e) => { setFilters({ ...filters, minBudget: e.target.value }); setPage(1); }}
              />
              <input
                type="number"
                min="0"
                placeholder="Max"
                value={filters.maxBudget}
                onChange={(e) => { setFilters({ ...filters, maxBudget: e.target.value }); setPage(1); }}
              />
            </div>
            <p className="hint">Works for both fixed budgets and hourly ranges.</p>
          </div>

          <div className="filter-card">
            <h3>Project length</h3>
            <select
              value={filters.duration}
              onChange={(e) => { setFilters({ ...filters, duration: e.target.value }); setPage(1); }}
            >
              <option value="">Any duration</option>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-card">
            <h3>Skills</h3>
            <div className="skills-list">
              {SKILLS.map((s) => {
                const active = filters.skills.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`chip ${active ? 'active' : ''}`}
                    onClick={() => toggleSkill(s)}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="results">
          <div className="results-head">
            <span className="results-count">{total} jobs found</span>
          </div>

          {loading ? (
            <div className="loading-list">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="empty-state">No projects found. Try different filters.</div>
          ) : (
            <>
              <div className="project-grid">
                {projects.map((p) => (
                  <Link to={`/projects/${p._id}`} key={p._id} className="project-card">
                    <div className="project-top">
                      <h3>{p.title}</h3>
                      <span className="pill">{p.budgetType === 'fixed' ? 'Fixed price' : 'Hourly'}</span>
                    </div>
                    <p className="project-desc">{p.description?.slice(0, 150)}...</p>
                    <div className="project-meta">
                      <span className="budget">
                        {p.budgetType === 'fixed'
                          ? `₹${p.budget}`
                          : `₹${p.budget} - ₹${p.budgetMax || p.budget}/hr`}
                      </span>
                      <span className="category">{p.category}</span>
                    </div>
                    {p.skills?.length > 0 && (
                      <div className="project-skills">
                        {p.skills.slice(0, 4).map((s) => (
                          <span key={s} className="skill-tag">{s}</span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>

              {pages > 1 && (
                <div className="pagination">
                  <button
                    className="btn btn-ghost"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>Page {page} of {pages}</span>
                  <button
                    className="btn btn-ghost"
                    disabled={page >= pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
