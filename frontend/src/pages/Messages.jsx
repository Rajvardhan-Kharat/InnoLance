import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import CallModal from '../components/CallModal';
import './Messages.css';

// ─── Constants ──────────────────────────────────────────────────────────────
const COMMON_EMOJIS = [
  '😀','😂','😍','🥰','😎','🤔','😅','😭',
  '👍','👎','🙏','👏','🤝','✌️','💪','🫡',
  '🔥','💯','✅','❌','🚀','⭐','💡','🎉',
  '❤️','💙','💚','💛','🧡','💜','🖤','🤍',
];

const FILE_ICONS = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📊', pptx: '📊', zip: '🗜️', png: '🖼️', jpg: '🖼️', jpeg: '🖼️',
  gif: '🖼️', mp4: '🎬', mp3: '🎵', txt: '📃', default: '📎' };

function getFileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function isEmojiOnly(text) {
  const t = text?.trim() || '';
  if (!t) return false;
  // A regex that specifically looks for just standard emojis, not too broad
  return /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+$/u.test(t);
}

// ─── ConvItem ────────────────────────────────────────────────────────────────
function ConvItem({ conv, userId, isSelected, onClick }) {
  const other = conv.participants?.find((p) => String(p._id) !== String(userId));
  const name = conv.isGroup ? (conv.name || 'Group Chat') : (other ? `${other.firstName} ${other.lastName}` : 'Unknown');
  const initial = conv.isGroup ? '👥' : (name[0] || '?').toUpperCase();
  const lastMsgText = conv.lastMessage?.body || (conv.project?.title ? `Re: ${conv.project.title}` : '');
  const ts = conv.lastMessage?.createdAt || conv.updatedAt;

  return (
    <div className={`msg-conv-item ${isSelected ? 'active' : ''}`} onClick={onClick}>
      <div className={`msg-conv-avatar ${conv.isGroup ? 'group' : ''}`}>
        {initial}
        {!conv.isGroup && <span className="msg-online-dot" />}
      </div>
      <div className="msg-conv-info">
        <div className="msg-conv-name">
          {name}
          {conv.isGroup && <span className="msg-group-badge" style={{ marginLeft: 6 }}>Group</span>}
        </div>
        <div className="msg-conv-preview">{lastMsgText || 'Start chatting...'}</div>
      </div>
      <div className="msg-conv-meta">
        {ts && <span className="msg-conv-time">{formatTime(ts)}</span>}
        <button
          className="msg-conv-delete"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm('Delete this conversation? This action cannot be undone.')) {
              conv.onDelete && conv.onDelete(conv._id);
            }
          }}
          title="Delete Conversation"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

// ─── Main Messages Page ───────────────────────────────────────────────────────
export default function Messages() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachments, setAttachments] = useState([]);   // { file, preview }
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [callModal, setCallModal] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [search, setSearch] = useState('');

  const messagesEndRef = useRef(null);
  const msgBodyRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeout = useRef(null);

  const callsEnabled = String(import.meta.env.VITE_WEBRTC_CALLS_ENABLED || 'true').toLowerCase() !== 'false';

  // ── Load conversations ────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/messages/conversations')
      .then(({ data }) => setConversations(data.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDeleteConv = async (convId) => {
    try {
      await api.delete(`/messages/conversations/${convId}`);
      setConversations((prev) => prev.filter((c) => c._id !== convId));
      if (selected?._id === convId) setSelected(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete conversation');
    }
  };

  // ── URL param: select conversation ───────────────────────────────────────
  useEffect(() => {
    if (!conversations.length) return;
    const convoId = searchParams.get('convo');
    if (!convoId) return;
    const target = conversations.find((c) => String(c._id) === String(convoId));
    if (target) setSelected(target);
  }, [conversations, searchParams]);

  // ── URL param: create conversation ───────────────────────────────────────
  useEffect(() => {
    const otherUserId = searchParams.get('user');
    if (!otherUserId || !user) return;
    const projectId = searchParams.get('project') || undefined;
    api.post('/messages/conversations', { otherUserId, projectId })
      .then(({ data }) => {
        const convo = data.conversation;
        setConversations((prev) =>
          prev.some((p) => String(p._id) === String(convo._id)) ? prev : [convo, ...prev]
        );
        setSelected(convo);
        navigate(`/messages?convo=${convo._id}`, { replace: true });
      })
      .catch(() => {});
  }, [searchParams, user, navigate]);

  // ── Load messages ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) { setMessages([]); setTypingUser(null); return; }
    const convId = selected._id;
    api.get(`/messages/conversations/${convId}/messages`)
      .then(({ data }) => {
        setMessages(data.messages || []);
        if (socket?.connected) socket.emit('mark_read', { conversationId: convId });
      })
      .catch(() => setMessages([]));
    if (socket) socket.emit('join_conversation', convId);
    return () => { if (socket) socket.emit('leave_conversation', convId); };
  }, [selected?._id, socket]);

  // ── Socket: real-time messages + typing ──────────────────────────────────
  useEffect(() => {
    if (!socket || !selected) return;

    const onMsg = (msg) => {
      setMessages((prev) => prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]);
      if (msg?.sender?._id !== user?._id)
        socket.emit('mark_read', { conversationId: selected._id });
    };

    const onTyping = ({ userId: uid, firstName }) => {
      if (uid === user?._id) return;
      setTypingUser(firstName || 'Someone');
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTypingUser(null), 3000);
    };

    const onStopTyping = ({ userId: uid }) => {
      if (uid === user?._id) return;
      setTypingUser(null);
    };

    const onIncomingCall = ({ fromUserId, fromName, offer, callType }) => {
      setCallModal({ mode: 'incoming', otherUserId: fromUserId, otherName: fromName, offer, callType: callType || 'video' });
    };

    socket.on('new_message', onMsg);
    socket.on('user_typing', onTyping);
    socket.on('user_stopped_typing', onStopTyping);
    socket.on('webrtc_offer', onIncomingCall);
    socket.on('call:offer', onIncomingCall);

    return () => {
      socket.off('new_message', onMsg);
      socket.off('user_typing', onTyping);
      socket.off('user_stopped_typing', onStopTyping);
      socket.off('webrtc_offer', onIncomingCall);
      socket.off('call:offer', onIncomingCall);
    };
  }, [socket, selected?._id, user?._id]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (msgBodyRef.current) {
      msgBodyRef.current.scrollTop = msgBodyRef.current.scrollHeight;
    }
  }, [messages, typingUser]);

  // ── Typing events ─────────────────────────────────────────────────────────
  const emitTyping = useCallback(() => {
    if (!socket || !selected) return;
    socket.emit('typing', { conversationId: selected._id });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('stop_typing', { conversationId: selected._id });
    }, 2000);
  }, [socket, selected]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (e) => {
    e?.preventDefault();
    const body = newMessage.trim();
    if (!body && attachments.length === 0) return;
    if (!selected) return;

    setSending(true);
    setNewMessage('');
    setAttachments([]);
    setEmojiOpen(false);
    setLinkOpen(false);

    try {
      // For now send text body (attachments require multipart — placeholder)
      const { data } = await api.post(
        `/messages/conversations/${selected._id}/messages`,
        { body: body || '[📎 Attachment]' }
      );
      setMessages((prev) => 
        prev.some((m) => m._id === data.message._id) ? prev : [...prev, data.message]
      );
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
    emitTyping();
  };

  // ── Emoji insert ──────────────────────────────────────────────────────────
  const insertEmoji = (emoji) => {
    setNewMessage((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  // ── Link insert ───────────────────────────────────────────────────────────
  const insertLink = () => {
    if (!linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setNewMessage((prev) => (prev ? `${prev} ${url}` : url));
    setLinkUrl('');
    setLinkOpen(false);
    textareaRef.current?.focus();
  };

  // ── File attach ───────────────────────────────────────────────────────────
  const handleFiles = (files) => {
    const arr = Array.from(files).map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setAttachments((prev) => [...prev, ...arr].slice(0, 5));
  };

  // ── Call ──────────────────────────────────────────────────────────────────
  const startCall = (callType, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!selected || !callsEnabled) return;
    const other = selected.participants?.find((p) => String(p._id) !== String(user?._id));
    if (!other) return;
    setCallModal({ mode: 'outgoing', otherUserId: other._id, otherName: `${other.firstName} ${other.lastName}`, callType });
  };

  // ── Filtered conversations ────────────────────────────────────────────────
  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const other = c.participants?.find((p) => String(p._id) !== String(user?._id));
      const name = c.isGroup ? c.name : (other ? `${other.firstName} ${other.lastName}` : '');
      return name?.toLowerCase().includes(q) || c.project?.title?.toLowerCase().includes(q);
    });
  }, [conversations, search, user]);

  // ── Derived: current other user ───────────────────────────────────────────
  const otherUser = selected?.participants?.find((p) => String(p._id) !== String(user?._id));
  const headerName = selected
    ? (selected.isGroup ? (selected.name || 'Group Chat') : (otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : 'Chat'))
    : '';

  // ── Message grouping (collapse consecutive by same sender) ────────────────
  const groupedMessages = useMemo(() => {
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const isSameSender = prev && String(prev.sender?._id || prev.sender) === String(m.sender?._id || m.sender);
      const isSameDay = prev && new Date(prev.createdAt).toDateString() === new Date(m.createdAt).toDateString();
      return { ...m, compact: isSameSender && isSameDay, showDate: !isSameDay };
    });
  }, [messages]);

  if (loading) {
    return (
      <div className="msg-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>💬</div>
          <p>Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Call Modal ──────────────────────────────────────────────────── */}
      {callModal && (
        <CallModal
          {...callModal}
          onClose={() => setCallModal(null)}
        />
      )}

      <div className="msg-page">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="msg-sidebar">
          <div className="msg-sidebar-head">
            <h2>Messages</h2>
            <div className="msg-search">
              <span className="msg-search-icon">🔍</span>
              <input
                type="text"
                className="msg-search-input"
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="msg-conv-list">
            {filteredConvs.length === 0 ? (
              <div className="msg-empty-convs">
                <span style={{ fontSize: '2rem' }}>💬</span>
                <p>{search ? 'No conversations match.' : 'No conversations yet.'}</p>
              </div>
            ) : (
              filteredConvs.map((c) => (
                <ConvItem
                  key={c._id}
                  conv={{ ...c, onDelete: handleDeleteConv }}
                  userId={user?._id}
                  isSelected={selected?._id === c._id}
                  onClick={() => setSelected(c)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── Chat Panel ──────────────────────────────────────────────────── */}
        <section className="msg-chat">
          {!selected ? (
            <div className="msg-empty-state">
              <div className="msg-empty-icon">💬</div>
              <h3>Your messages</h3>
              <p>Select a conversation to start chatting</p>
            </div>
          ) : (
            <>
              {/* ── Header ─────────────────────────────────────────────── */}
              <div className="msg-chat-header">
                <div className={`msg-header-avatar ${selected.isGroup ? 'group' : ''}`}>
                  {selected.isGroup ? '👥' : (headerName[0] || '?').toUpperCase()}
                </div>
                <div className="msg-header-info">
                  <div className="msg-header-name">{headerName}</div>
                  <div className="msg-header-sub">
                    {selected.isGroup
                      ? `${selected.participants?.length || 0} members`
                      : selected.project?.title
                        ? `Re: ${selected.project.title}`
                        : 'Direct message'}
                  </div>
                </div>
                <div className="msg-header-actions">
                  {/* Audio Call */}
                  {callsEnabled && !selected.isGroup && (
                    <button
                      type="button"
                      className="msg-icon-btn call"
                      title="Audio Call"
                      onClick={(e) => startCall('audio', e)}
                    >
                      📞
                    </button>
                  )}
                  {/* Video Call */}
                  {callsEnabled && (
                    <button
                      type="button"
                      className="msg-icon-btn video"
                      title={selected.isGroup ? 'Start Standup' : 'Video Call'}
                      onClick={(e) => selected.isGroup ? alert('Group video call coming soon!') : startCall('video', e)}
                    >
                      🎥
                    </button>
                  )}
                </div>
              </div>

              {/* ── Messages Body ───────────────────────────────────────── */}
              <div
                ref={msgBodyRef}
                className={`msg-body ${dragOver ? 'dragover' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFiles(e.dataTransfer.files);
                }}
              >
                {groupedMessages.map((m, idx) => {
                  const isMine = String(m.sender?._id || m.sender) === String(user?._id);
                  const senderName = m.sender ? `${m.sender.firstName} ${m.sender.lastName}` : 'Unknown';
                  const isAdmin = selected.isGroup && selected.admins?.some(
                    (a) => String(a._id || a) === String(m.sender?._id || m.sender)
                  );
                  const emojiOnly = isEmojiOnly(m.body);

                  return (
                    <div key={m._id || idx}>
                      {/* Date separator */}
                      {m.showDate && (
                        <div className="msg-date-sep">
                          <span>{formatDate(m.createdAt)}</span>
                        </div>
                      )}
                      <div className={`msg-row ${isMine ? 'mine' : 'other'} ${m.compact ? 'compact' : ''}`}>
                        {/* Avatar (only for others) */}
                        {!isMine && (
                          <div className="msg-row-avatar">
                            {(senderName[0] || '?').toUpperCase()}
                          </div>
                        )}
                        <div className="msg-bubble-wrap">
                          {/* Sender name for group chats */}
                          {!isMine && !m.compact && selected.isGroup && (
                            <div className="msg-sender-name">
                              {senderName}
                              {isAdmin && <span className="msg-admin-badge">Admin</span>}
                            </div>
                          )}
                          <div className={`msg-bubble ${emojiOnly ? 'emoji-only' : ''}`}>
                            {m.body}
                            {/* Inline time */}
                            {!emojiOnly && (
                              <span className="msg-bubble-time">{formatTime(m.createdAt)}</span>
                            )}
                          </div>
                          {emojiOnly && (
                            <span className="msg-bubble-time" style={{ padding: '0 4px', color: 'var(--text-muted)' }}>
                              {formatTime(m.createdAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {typingUser && (
                  <div className="msg-typing">
                    <div className="msg-row-avatar" style={{ fontSize: '0.7rem' }}>
                      {typingUser[0].toUpperCase()}
                    </div>
                    <div className="msg-typing-dots">
                      <span /><span /><span />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* ── Attachment Preview ──────────────────────────────────── */}
              {attachments.length > 0 && (
                <div className="msg-attach-preview">
                  {attachments.map((a, i) => (
                    <div key={i} className="msg-attach-chip">
                      <span>{getFileIcon(a.file.name)}</span>
                      <span title={a.file.name}>{a.file.name}</span>
                      <span style={{ opacity: 0.6, fontSize: '0.72rem' }}>{formatBytes(a.file.size)}</span>
                      <button
                        type="button"
                        className="msg-attach-remove"
                        onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Footer / Input ──────────────────────────────────────── */}
              <div className="msg-footer">
                {/* Emoji Picker Popover */}
                {emojiOpen && (
                  <>
                    <div className="msg-popover-backdrop" onClick={() => setEmojiOpen(false)} />
                    <div className="msg-emoji-picker">
                      <h5>Emojis</h5>
                      <div className="msg-emoji-grid">
                        {COMMON_EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            className="msg-emoji-btn"
                            onClick={() => { insertEmoji(em); setEmojiOpen(false); }}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Link Insert Popover */}
                {linkOpen && (
                  <>
                    <div className="msg-popover-backdrop" onClick={() => setLinkOpen(false)} />
                    <div className="msg-link-prompt">
                      <h5>📎 Insert Link</h5>
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && insertLink()}
                        autoFocus
                      />
                      <div className="msg-link-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkOpen(false)}>Cancel</button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={insertLink}>Insert</button>
                      </div>
                    </div>
                  </>
                )}

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleFiles(e.target.files)}
                  accept="*/*"
                />

                <div className="msg-input-row">
                  {/* Toolbar */}
                  <div className="msg-toolbar">
                    {/* Emoji */}
                    <button
                      type="button"
                      className="msg-tool-btn"
                      title="Emoji"
                      onClick={() => { setEmojiOpen((v) => !v); setLinkOpen(false); }}
                    >
                      😊
                    </button>
                    {/* Attach file */}
                    <button
                      type="button"
                      className="msg-tool-btn"
                      title="Attach file"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📎
                    </button>
                    {/* Insert link */}
                    <button
                      type="button"
                      className="msg-tool-btn"
                      title="Insert link"
                      onClick={() => { setLinkOpen((v) => !v); setEmojiOpen(false); }}
                    >
                      🔗
                    </button>
                    {/* Image */}
                    <button
                      type="button"
                      className="msg-tool-btn"
                      title="Send image"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => handleFiles(e.target.files);
                        input.click();
                      }}
                    >
                      🖼️
                    </button>
                  </div>

                  {/* Textarea */}
                  <div className="msg-textarea-wrap">
                    <textarea
                      ref={textareaRef}
                      className="msg-textarea"
                      rows={1}
                      placeholder="Type a message... (Shift+Enter for new line)"
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        // Auto-resize
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
                      }}
                      onKeyDown={handleKeyDown}
                    />
                  </div>

                  {/* Send */}
                  <button
                    type="button"
                    className="msg-send-btn"
                    onClick={sendMessage}
                    disabled={sending || (!newMessage.trim() && attachments.length === 0)}
                    title="Send (Enter)"
                  >
                    {sending ? '⏳' : '➤'}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}