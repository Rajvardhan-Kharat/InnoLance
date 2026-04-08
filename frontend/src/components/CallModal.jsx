import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import './CallModal.css';

export default function CallModal({ mode, otherUserId, otherName, offer: initialOffer, callType = 'video', onClose }) {
  const socket = useSocket();
  const [status, setStatus] = useState(mode === 'outgoing' ? 'calling' : 'incoming');
  const [error, setError] = useState('');
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const cleanupRef = useRef(null);

  const iceServers = useRef(() => {
    const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS;
    if (!raw) return [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : [{ urls: 'stun:stun.l.google.com:19302' }];
    } catch {
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  })().current;

  useEffect(() => {
    if (!socket || !otherUserId) return;
    if (mode !== 'outgoing') return;

    const pc = new RTCPeerConnection({
      iceServers,
    });
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('call:ice', { toUserId: otherUserId, candidate: e.candidate });
        socket.emit('webrtc_ice', { toUserId: otherUserId, candidate: e.candidate });
      }
    };

    const cleanup = () => {
      pc.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    cleanupRef.current = cleanup;

    navigator.mediaDevices.getUserMedia({ video: callType !== 'audio', audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        return pc.createOffer();
      })
      .then((offer) => {
        pc.setLocalDescription(offer);
        socket.emit('call:offer', { toUserId: otherUserId, offer, callType });
        socket.emit('webrtc_offer', { toUserId: otherUserId, offer, callType });
      })
      .catch(() => setError('Camera/mic access denied'));

    const onAnswer = (data) => {
      if (data.fromUserId !== otherUserId) return;
      pc.setRemoteDescription(new RTCSessionDescription(data.answer))
        .then(() => setStatus('connected'))
        .catch(() => setError('Failed to connect'));
    };
    const onIce = (data) => {
      if (data.fromUserId !== otherUserId) return;
      if (data.candidate) pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    };
    const onHangup = (data) => {
      if (data.fromUserId !== otherUserId) return;
      onClose();
    };
    const onBusy = (data) => {
      if (data.fromUserId !== otherUserId) return;
      setError('User is busy.');
      setStatus('calling');
    };

    socket.on('webrtc_answer', onAnswer);
    socket.on('call:answer', onAnswer);
    socket.on('webrtc_ice', onIce);
    socket.on('call:ice', onIce);
    socket.on('webrtc_hangup', onHangup);
    socket.on('call:hangup', onHangup);
    socket.on('call:busy', onBusy);

    return () => {
      socket.off('webrtc_answer', onAnswer);
      socket.off('call:answer', onAnswer);
      socket.off('webrtc_ice', onIce);
      socket.off('call:ice', onIce);
      socket.off('webrtc_hangup', onHangup);
      socket.off('call:hangup', onHangup);
      socket.off('call:busy', onBusy);
      cleanup();
    };
  }, [socket, otherUserId, mode]);

  const handleAccept = () => {
    if (mode !== 'incoming' || !initialOffer || !socket) return;
    setStatus('connecting');
    const pc = new RTCPeerConnection({
      iceServers,
    });
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('call:ice', { toUserId: otherUserId, candidate: e.candidate });
        socket.emit('webrtc_ice', { toUserId: otherUserId, candidate: e.candidate });
      }
    };

    navigator.mediaDevices.getUserMedia({ video: callType !== 'audio', audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        return pc.setRemoteDescription(new RTCSessionDescription(initialOffer));
      })
      .then(() => pc.createAnswer())
      .then((answer) => {
        pc.setLocalDescription(answer);
        socket.emit('call:answer', { toUserId: otherUserId, answer });
        socket.emit('webrtc_answer', { toUserId: otherUserId, answer });
        setStatus('connected');
      })
      .catch(() => setError('Failed to accept call'));

    const onIce = (data) => {
      if (data.fromUserId !== otherUserId) return;
      if (data.candidate) pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
    };
    const onHangup = (data) => {
      if (data.fromUserId !== otherUserId) return;
      onClose();
    };
    socket.on('webrtc_ice', onIce);
    socket.on('call:ice', onIce);
    socket.on('webrtc_hangup', onHangup);
    socket.on('call:hangup', onHangup);
    const cleanup = () => {
      socket.off('webrtc_ice', onIce);
      socket.off('call:ice', onIce);
      socket.off('webrtc_hangup', onHangup);
      socket.off('call:hangup', onHangup);
      pc.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    cleanupRef.current = cleanup;
  };

  const handleReject = () => {
    socket?.emit('call:busy', { toUserId: otherUserId });
    socket?.emit('webrtc_hangup', { toUserId: otherUserId });
    onClose();
  };

  const handleHangup = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    socket?.emit('call:hangup', { toUserId: otherUserId });
    socket?.emit('webrtc_hangup', { toUserId: otherUserId });
    onClose();
  };

  return (
    <div className="call-modal-overlay">
      <div className="call-modal">
        <h3>
          {mode === 'outgoing' && (status === 'calling' ? `Calling (${callType})...` : status === 'connected' ? 'Connected' : '')}
          {mode === 'incoming' && status === 'incoming' && `Incoming ${callType} call`}
          {mode === 'incoming' && status !== 'incoming' && 'Connected'}
          {' — '}{otherName}
        </h3>
        {error && <p className="call-error">{error}</p>}
        <div className="call-videos">
          <video ref={localVideoRef} autoPlay muted playsInline className="local-video" style={{ display: callType === 'audio' ? 'none' : 'block' }} />
          <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" style={{ display: callType === 'audio' ? 'none' : 'block' }} />
          {callType === 'audio' && <div style={{ color: 'var(--text-muted)' }}>Audio call in progress...</div>}
        </div>
        <div className="call-actions">
          {mode === 'incoming' && status === 'incoming' && (
            <>
              <button type="button" className="btn btn-primary" onClick={handleAccept}>Accept</button>
              <button type="button" className="btn btn-ghost" onClick={handleReject}>Reject</button>
            </>
          )}
          {((mode === 'outgoing') || (mode === 'incoming' && status !== 'incoming')) && (
            <button type="button" className="btn hangup" onClick={handleHangup}>Hang up</button>
          )}
        </div>
      </div>
    </div>
  );
}
