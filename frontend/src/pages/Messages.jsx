import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import CallModal from '../components/CallModal';
import './Messages.css';

export default function Messages() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [typingUser, setTypingUser] = useState(null);
  const [callModal, setCallModal] = useState(null);
  const messagesEndRef = useRef(null);

  const callsEnabled =
    String(import.meta.env.VITE_WEBRTC_CALLS_ENABLED || 'true').toLowerCase() !== 'false';

  const commonEmojis = useMemo(
    () => ['😀', '👍', '🔥', '🎉', '🙏', '💯', '✅', '🚀', '🤝', '🙂'],
    []
  );

  const uploadsBase = useMemo(
    () =>
      import.meta.env.VITE_SOCKET_URL ||
      (typeof window !== 'undefined' ? window.location.origin : ''),
    []
  );

  // Load conversations
  useEffect(() => {
    api
      .get('/messages/conversations')
      .then(({ data }) => {
        setConversations(data.conversations || []);
        setLoadError('');
      })
      .catch((err) => {
        setConversations([]);
        setLoadError(err.response?.data?.message || 'Failed to load conversations.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Select conversation from URL
  useEffect(() => {
    if (!conversations.length) return;
    const convoId = searchParams.get('convo');
    if (!convoId) return;
    const target = conversations.find((c) => String(c._id) === String(convoId));
    if (target) setSelected(target);
  }, [conversations, searchParams]);

  // Create new conversation if needed
  useEffect(() => {
    const otherUserId = searchParams.get('user');
    if (!otherUserId || !user) return;
    const projectId = searchParams.get('project') || undefined;

    api
      .post('/messages/conversations', { otherUserId, projectId })
      .then(({ data }) => {
        const convo = data.conversation;
        setConversations((prev) => {
          if (prev.some((p) => String(p._id) === String(convo._id))) return prev;
          return [convo, ...prev];
        });
        setSelected(convo);
        navigate(`/messages?convo=${convo._id}`, { replace: true });
      })
      .catch(() => {});
  }, [searchParams, user, navigate]);

  // Load messages (FIXED PART)
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      setTypingUser(null);
      return;
    }

    const convId = selected._id;

    api
      .get(`/messages/conversations/${convId}/messages`)
      .then(({ data }) => {
        setMessages(data.messages || []);
        if (socket?.connected)
          socket.emit('mark_read', { conversationId: convId });
      })
      .catch((err) => {
        setMessages([]);
        alert(err.response?.data?.message || 'Failed to load messages.');
      });

    if (socket) {
      socket.emit('join_conversation', convId);
    }

    return () => {
      if (socket) socket.emit('leave_conversation', convId);
    };
  }, [selected?._id, socket]);

  // Socket listeners
  useEffect(() => {
    if (!socket || !selected) return;

    const onNewMessage = (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });

      if (msg?.sender?._id !== user?._id) {
        socket.emit('mark_read', { conversationId: selected._id });
      }
    };

    socket.on('new_message', onNewMessage);

    return () => {
      socket.off('new_message', onNewMessage);
    };
  }, [socket, selected?._id, user?._id]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selected) return;

    const body = newMessage.trim();
    setNewMessage('');

    try {
      const { data } = await api.post(
        `/messages/conversations/${selected._id}/messages`,
        { body }
      );
      setMessages((prev) => [...prev, data.message]);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send');
    }
  };

  if (loading) return <div>Loading...</div>;
  if (loadError) return <div>{loadError}</div>;

  return (
    <div className="messages-page">
      <h1>Messages</h1>

      {!selected ? (
        <p>Select a conversation</p>
      ) : (
        <>
          <div className="chat-messages">
            {messages.map((m) => (
              <div key={m._id}>{m.body}</div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage}>
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type message"
            />
            <button type="submit">Send</button>
          </form>
        </>
      )}
    </div>
  );
}