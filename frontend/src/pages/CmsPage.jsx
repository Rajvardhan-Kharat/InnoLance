import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import './CmsPage.css';

export default function CmsPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/admin/cms/public/${slug}`)
      .then(({ data }) => setPage(data.page))
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!page) return <div className="cms-not-found">Page not found</div>;

  return (
    <div className="cms-page">
      <h1>{page.title}</h1>
      <div className="cms-content" dangerouslySetInnerHTML={{ __html: page.content?.replace(/\n/g, '<br/>') || '' }} />
    </div>
  );
}
