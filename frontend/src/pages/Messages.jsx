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
  const [typingUser, setTypingUser] = useState(null);
  const [callModal, setCallModal] = useState(null);
  const messagesEndRef = useRef(null);
  const callsEnabled = String(import.meta.env.VITE_WEBRTC_CALLS_ENABLED || 'true').toLowerCase() !== 'false';
  const commonEmojis = useMemo(() => ['😀', '👍', '🔥', '🎉', '🙏', '💯', '✅', '🚀', '🤝', '🙂'], []);
  const uploadsBase = useMemo(
    () => import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : ''),
    []
  );

  useEffect(() => {
    api.get('/messages/conversations').then(({ data }) => {
      setConversations(data.conversations);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!conversations.length) return;
    const convoId = searchParams.get('convo');
    if (!convoId) return;
    const target = conversations.find((c) => String(c._id) === String(convoId));
    if (target) setSelected(target);
  }, [conversations, searchParams]);

  useEffect(() => {
    const otherUserId = searchParams.get('user');
    if (!otherUserId || !user) return;
    const projectId = searchParams.get('project') || undefined;
    api.post('/messages/conversations', { otherUserId, projectId })
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

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      setTypingUser(null);
      return;
    }
    const convId = selected._id;
    api.get(`/messages/conversations/${convId}/messages`).then(({ data }) => {
      setMessages(data.messages);
      if (socket?.connected) socket.emit('mark_read', { conversationId: convId });
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
      if (msg?.sender?._id !== user?._id) {
        socket.emit('mark_read', { conversationId: selected._id });
      }
    };
    const onTyping = ({ name }) => setTypingUser(name);
    const onTypingStopped = () => setTypingUser(null);
    const onReadReceipt = ({ conversationId, readerId, messageIds, readAt }) => {
      if (String(conversationId) !== String(selected._id)) return;
      if (String(readerId) === String(user?._id)) return;
      setMessages((prev) => prev.map((m) => (
        messageIds?.includes(String(m._id))
          ? { ...m, read: true, readAt: readAt || new Date().toISOString() }
          : m
      )));
    };
    socket.on('new_message', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('typing_stopped', onTypingStopped);
    socket.on('read_receipt', onReadReceipt);
    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('typing_stopped', onTypingStopped);
      socket.off('read_receipt', onReadReceipt);
    };
  }, [socket, selected?._id, user?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const otherParticipant = selected?.participants?.find((p) => p._id !== user?._id);
  const otherUserId = otherParticipant?._id;

  const sendMessage = async (e) => {
    e.preventDefault();
    if ((!newMessage.trim() && attachments.length === 0) || !selected) return;
    const body = newMessage.trim();
    setNewMessage('');
    setEmojiOpen(false);
    const files = attachments;
    setAttachments([]);
    if (files.length > 0) {
      try {
        const fd = new FormData();
        fd.append('body', body);
        files.forEach((f) => fd.append('attachments', f));
        const { data } = await api.post(`/messages/conversations/${selected._id}/messages`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => {
            if (!evt.total) return;
            setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          },
        });
        setMessages((prev) => [...prev, data.message]);
        setUploadProgress(0);
      } catch (err) {
        setNewMessage(body);
        setAttachments(files);
        setUploadProgress(0);
        alert(err.response?.data?.message || 'Failed to send');
      }
      return;
    }
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

  const onDropFiles = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    setAttachments((prev) => [...prev, ...files].slice(0, 5));
  };

  const startCall = () => {
    if (!callsEnabled) return;
    if (!otherUserId) return;
    setCallModal({ mode: 'outgoing', otherUserId, otherName: otherParticipant?.firstName, callType: 'video' });
  };

  const startAudioCall = () => {
    if (!callsEnabled) return;
    if (!otherUserId) return;
    setCallModal({ mode: 'outgoing', otherUserId, otherName: otherParticipant?.firstName, callType: 'audio' });
  };

  useEffect(() => {
    if (!socket) return;
    const onIncomingOffer = (data) => {
      setCallModal({
        mode: 'incoming',
        otherUserId: data.fromUserId,
        otherName: data.fromName || 'Unknown',
        offer: data.offer,
        callType: data.callType || 'video',
      });
    };
    socket.on('webrtc_offer', onIncomingOffer);
    socket.on('call:offer', onIncomingOffer);
    return () => {
      socket.off('webrtc_offer', onIncomingOffer);
      socket.off('call:offer', onIncomingOffer);
    };
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
                      <span className="conv-preview">
                        {c.lastMessage.body
                          ? `${c.lastMessage.body.slice(0, 40)}...`
                          : (Array.isArray(c.lastMessage.attachments) && c.lastMessage.attachments.length > 0
                            ? '📎 Attachment'
                            : 'Message')}
                      </span>
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
                {callsEnabled && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-call" onClick={startAudioCall} title="Audio call">🎙️</button>
                    <button type="button" className="btn-call" onClick={startCall} title="Video call">📹</button>
                  </div>
                )}
              </div>
              <div
                className={`chat-messages ${dragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropFiles}
              >
                {messages.map((m) => (
                  <div
                    key={m._id}
                    className={`message ${m.sender?._id === user?._id ? 'sent' : 'received'}`}
                  >
                    <span className="msg-avatar">{m.sender?.firstName?.[0]}</span>
                    <div>
                      <div className="msg-body">
                      {m.body ? (
                        <span style={{ whiteSpace: 'pre-wrap' }}>
                          {m.body.split(/(https?:\/\/[^\s]+)/g).map((part, idx) => (
                            /^https?:\/\//.test(part)
                              ? <a key={`${m._id}-link-${idx}`} href={part} target="_blank" rel="noreferrer">{part}</a>
                              : <span key={`${m._id}-txt-${idx}`}>{part}</span>
                          ))}
                        </span>
                      ) : null}
                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {m.attachments.map((a, i) => {
                            const isImg = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a?.name || a?.url || '');
                            const href = a?.url?.startsWith('http') ? a.url : `${uploadsBase}${a?.url || ''}`;
                            return isImg ? (
                              <a key={`${m._id}-att-${i}`} href={href} target="_blank" rel="noreferrer">
                                <img src={href} alt={a?.name || 'attachment'} style={{ maxWidth: 220, borderRadius: 8, border: '1px solid var(--border)' }} />
                              </a>
                            ) : (
                              <a key={`${m._id}-att-${i}`} href={href} target="_blank" rel="noreferrer">📎 {a?.name || 'Attachment'}</a>
                            );
                          })}
                        </div>
                      )}
                      </div>
                      {m.sender?._id === user?._id && (
                        <div className="msg-meta">{m.read ? 'Seen' : 'Delivered'}</div>
                      )}
                    </div>
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEmojiOpen((v) => !v)}
                  title="Emoji"
                >
                  🙂
                </button>
                <label className="btn btn-ghost" title="Attach files" style={{ margin: 0 }}>
                  📎
                  <input
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => setAttachments(Array.from(e.target.files || []).slice(0, 5))}
                  />
                </label>
                <input
                  value={newMessage}
                  onChange={onInputChange}
                  placeholder="Type a message..."
                />
                <button type="submit" className="btn btn-primary">Send</button>
              </form>
              {emojiOpen && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {commonEmojis.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setNewMessage((t) => `${t}${em}`)}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
              {attachments.length > 0 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {attachments.length} file(s) attached:
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {attachments.map((f, i) => (
                      <span key={`${f.name}-${i}`} className="attachment-chip">
                        {f.name}
                        <button type="button" className="chip-x" onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Uploading... {uploadProgress}%
                </div>
              )}
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
          callType={callModal.callType || 'video'}
          onClose={() => setCallModal(null)}
        />
      )}
    </div>
  );
}
