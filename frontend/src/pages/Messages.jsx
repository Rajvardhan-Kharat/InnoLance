import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import CallModal from '../components/CallModal';
import './Messages.css';

export default function Messages() {
  const { user } = useAuth();
  const socket = useSocket();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUser, setTypingUser] = useState(null);
  const [callModal, setCallModal] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    api.get('/messages/conversations').then(({ data }) => {
      setConversations(data.conversations);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      setTypingUser(null);
      return;
    }
    const convId = selected._id;
    api.get(`/messages/conversations/${convId}/messages`).then(({ data }) => {
      setMessages(data.messages);
    });
    if (socket) {
      socket.emit('join_conversation', convId, (res) => {
        if (res?.error) return;
      });
    }
    return () => {
      if (socket) socket.emit('leave_conversation', convId);
    };
  }, [selected?._id, socket]);

  useEffect(() => {
    if (!socket || !selected) return;
    const onNewMessage = (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    };
    const onTyping = ({ name }) => setTypingUser(name);
    const onTypingStopped = () => setTypingUser(null);
    socket.on('new_message', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('typing_stopped', onTypingStopped);
    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('typing_stopped', onTypingStopped);
    };
  }, [socket, selected?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const otherParticipant = selected?.participants?.find((p) => p._id !== user?._id);
  const otherUserId = otherParticipant?._id;

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selected) return;
    const body = newMessage.trim();
    setNewMessage('');
    if (socket?.connected) {
      socket.emit('send_message', { conversationId: selected._id, body }, (res) => {
        if (res?.error) {
          setNewMessage(body);
          alert(res.error);
        } else if (res?.message) {
          setMessages((prev) => {
            if (prev.some((m) => m._id === res.message._id)) return prev;
            return [...prev, res.message];
          });
        }
      });
    } else {
      try {
        const { data } = await api.post(`/messages/conversations/${selected._id}/messages`, { body });
        setMessages((prev) => [...prev, data.message]);
      } catch (err) {
        setNewMessage(body);
        alert(err.response?.data?.message || 'Failed to send');
      }
    }
  };

  const handleTyping = () => {
    if (socket?.connected && selected) socket.emit('typing_start', selected._id);
  };
  const typingTimeoutRef = useRef(null);
  const onInputChange = (e) => {
    setNewMessage(e.target.value);
    handleTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (socket?.connected && selected) socket.emit('typing_stop', selected._id);
    }, 1500);
  };

  const startCall = () => {
    if (!otherUserId) return;
    setCallModal({ mode: 'outgoing', otherUserId, otherName: otherParticipant?.firstName });
  };

  useEffect(() => {
    if (!socket) return;
    const onIncomingOffer = (data) => {
      setCallModal({
        mode: 'incoming',
        otherUserId: data.fromUserId,
        otherName: data.fromName || 'Unknown',
        offer: data.offer,
      });
    };
    socket.on('webrtc_offer', onIncomingOffer);
    return () => socket.off('webrtc_offer', onIncomingOffer);
  }, [socket]);

  if (loading) return <div className="loading-screen">Loading...</div>;

  return (
    <div className="messages-page">
      <h1>Messages</h1>
      <div className="messages-layout">
        <aside className="conversations-list">
          {conversations.length === 0 ? (
            <p className="empty-msg">No conversations yet. Start one from a project or profile.</p>
          ) : (
            conversations.map((c) => {
              const other = c.participants?.find((p) => p._id !== user?._id);
              return (
                <button
                  type="button"
                  key={c._id}
                  className={`conversation-item ${selected?._id === c._id ? 'active' : ''}`}
                  onClick={() => setSelected(c)}
                >
                  <span className="conv-avatar">
                    {other?.firstName?.[0]}{other?.lastName?.[0]}
                  </span>
                  <div className="conv-info">
                    <span className="conv-name">{other?.firstName} {other?.lastName}</span>
                    {c.project && <span className="conv-project">{c.project.title}</span>}
                    {c.lastMessage && (
                      <span className="conv-preview">{c.lastMessage.body?.slice(0, 40)}...</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </aside>
        <div className="chat-panel">
          {!selected ? (
            <div className="chat-placeholder">Select a conversation</div>
          ) : (
            <>
              <div className="chat-header">
                <span className="conv-avatar">
                  {otherParticipant?.firstName?.[0]}{otherParticipant?.lastName?.[0]}
                </span>
                <div>
                  <strong>{otherParticipant?.firstName} {otherParticipant?.lastName}</strong>
                  {selected.project && (
                    <Link to={`/projects/${selected.project._id}`} className="chat-project-link">
                      {selected.project.title}
                    </Link>
                  )}
                </div>
                <button type="button" className="btn-call" onClick={startCall} title="Voice/Video call">
                  📞
                </button>
              </div>
              <div className="chat-messages">
                {messages.map((m) => (
                  <div
                    key={m._id}
                    className={`message ${m.sender?._id === user?._id ? 'sent' : 'received'}`}
                  >
                    <span className="msg-avatar">{m.sender?.firstName?.[0]}</span>
                    <div className="msg-body">{m.body}</div>
                  </div>
                ))}
                {typingUser && (
                  <div className="message received typing-msg">
                    <span className="msg-avatar">{typingUser[0]}</span>
                    <div className="msg-body typing-dots">...</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={sendMessage} className="chat-form">
                <input
                  value={newMessage}
                  onChange={onInputChange}
                  placeholder="Type a message..."
                />
                <button type="submit" className="btn btn-primary">Send</button>
              </form>
            </>
          )}
        </div>
      </div>
      {callModal && (
        <CallModal
          mode={callModal.mode}
          otherUserId={callModal.otherUserId}
          otherName={callModal.otherName}
          offer={callModal.offer}
          onClose={() => setCallModal(null)}
        />
      )}
    </div>
  );
}
