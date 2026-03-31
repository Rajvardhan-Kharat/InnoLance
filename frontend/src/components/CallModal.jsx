import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import './CallModal.css';

export default function CallModal({ mode, otherUserId, otherName, offer: initialOffer, onClose }) {
  const socket = useSocket();
  const [status, setStatus] = useState(mode === 'outgoing' ? 'calling' : 'incoming');
  const [error, setError] = useState('');
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!socket || !otherUserId) return;
    if (mode !== 'outgoing') return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc_ice', { toUserId: otherUserId, candidate: e.candidate });
    };

    const cleanup = () => {
      pc.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        return pc.createOffer();
      })
      .then((offer) => {
        pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { toUserId: otherUserId, offer });
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

    socket.on('webrtc_answer', onAnswer);
    socket.on('webrtc_ice', onIce);
    socket.on('webrtc_hangup', onHangup);

    return () => {
      socket.off('webrtc_answer', onAnswer);
      socket.off('webrtc_ice', onIce);
      socket.off('webrtc_hangup', onHangup);
      cleanup();
    };
  }, [socket, otherUserId, mode]);

  const handleAccept = () => {
    if (mode !== 'incoming' || !initialOffer || !socket) return;
    setStatus('connecting');
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('webrtc_ice', { toUserId: otherUserId, candidate: e.candidate });
    };

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        return pc.setRemoteDescription(new RTCSessionDescription(initialOffer));
      })
      .then(() => pc.createAnswer())
      .then((answer) => {
        pc.setLocalDescription(answer);
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
    socket.on('webrtc_hangup', onHangup);
    const cleanup = () => {
      socket.off('webrtc_ice', onIce);
      socket.off('webrtc_hangup', onHangup);
      pc.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    window.__callCleanup = cleanup;
  };

  const handleReject = () => {
    socket?.emit('webrtc_hangup', { toUserId: otherUserId });
    onClose();
  };

  const handleHangup = () => {
    if (window.__callCleanup) window.__callCleanup();
    socket?.emit('webrtc_hangup', { toUserId: otherUserId });
    onClose();
  };

  return (
    <div className="call-modal-overlay">
      <div className="call-modal">
        <h3>
          {mode === 'outgoing' && (status === 'calling' ? 'Calling...' : status === 'connected' ? 'Connected' : '')}
          {mode === 'incoming' && status === 'incoming' && 'Incoming call'}
          {mode === 'incoming' && status !== 'incoming' && 'Connected'}
          {' — '}{otherName}
        </h3>
        {error && <p className="call-error">{error}</p>}
        <div className="call-videos">
          <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
          <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
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
