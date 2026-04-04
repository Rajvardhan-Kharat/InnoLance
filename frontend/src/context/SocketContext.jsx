import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

function socketBaseUrl() {
  if (SOCKET_URL) return SOCKET_URL;
  // In Vite dev, connect straight to the API port so Socket.io skips the dev-server
  // WebSocket proxy (same backend CORS already allows http://localhost:5173).
  if (import.meta.env.DEV) return 'http://localhost:5003';
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const url = socketBaseUrl();
    const s = io(url, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    s.on('connect', () => {});
    s.on('connect_error', () => {});
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
