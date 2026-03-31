import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './Notifications.css';

export default function Notifications() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef(null);

  const fetchNotifications = () => {
    if (!user) return;
    api.get('/notifications').then(({ data }) => {
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    }).catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  if (!user) return null;

  return (
    <div className="notifications-wrap" ref={ref}>
      <button
        type="button"
        className="notifications-trigger"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && <span className="notifications-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notifications-dropdown">
          <div className="notifications-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="btn-link" onClick={markAllRead}>Mark all read</button>
            )}
          </div>
          <div className="notifications-list">
            {notifications.length === 0 ? (
              <p className="notifications-empty">No notifications</p>
            ) : (
              notifications.slice(0, 15).map((n) => (
                <Link
                  key={n._id}
                  to={n.link || '#'}
                  className={`notification-item ${n.read ? '' : 'unread'}`}
                  onClick={() => { setOpen(false); if (!n.read) markRead(n._id); }}
                >
                  <div className="notification-title">{n.title}</div>
                  {n.body && <div className="notification-body">{n.body}</div>}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
