import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import PostProject from './pages/PostProject';
import MyProjects from './pages/MyProjects';
import Proposals from './pages/Proposals';
import Messages from './pages/Messages';
import Profile from './pages/Profile';
import FreelancerProfile from './pages/FreelancerProfile';
import AdminDashboard from './pages/AdminDashboard';
import AdminProjectBuilder from './pages/AdminProjectBuilder';
import AdminAssemblyDashboard from './pages/AdminAssemblyDashboard';
import AdminAnalyticsDashboard from './pages/AdminAnalyticsDashboard';
import CmsPage from './pages/CmsPage';
import Wallet from './pages/Wallet';
import { useAuth } from './context/AuthContext';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="profile/:id" element={<FreelancerProfile />} />
        <Route path="page/:slug" element={<CmsPage />} />
        <Route path="dashboard" element={<PrivateRoute><MyProjects /></PrivateRoute>} />
        <Route path="post-project" element={<PrivateRoute><PostProject /></PrivateRoute>} />
        <Route path="proposals" element={<PrivateRoute><Proposals /></PrivateRoute>} />
        <Route path="messages" element={<PrivateRoute><Messages /></PrivateRoute>} />
        <Route path="settings" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="wallet" element={<PrivateRoute><Wallet /></PrivateRoute>} />
        <Route path="admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="admin/analytics" element={<AdminRoute><AdminAnalyticsDashboard /></AdminRoute>} />
        <Route path="admin/project-builder/:projectId" element={<AdminRoute><AdminProjectBuilder /></AdminRoute>} />
        <Route path="admin/assembly/:projectId" element={<AdminRoute><AdminAssemblyDashboard /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
