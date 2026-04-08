import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './FreelancerProfile.css';

export default function FreelancerProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState({ avg: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/users/${id}`).then(({ data }) => {
      setProfile(data.user);
      setReviews(data.reviews || []);
      setRating(data.rating || { avg: 0, count: 0 });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const startConversation = async () => {
    if (!user) return;
    try {
      const { data } = await api.post('/messages/conversations', {
        otherUserId: id,
      });
      navigate(`/messages?convo=${data.conversation._id}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to start conversation');
    }
  };

  if (loading || !profile) return <div className="loading-screen">Loading...</div>;

  const isOwnProfile = user?._id === profile._id;

  return (
    <div className="freelancer-profile">
      <div className="profile-hero">
        <div className="profile-avatar">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" />
          ) : (
            <span>{profile.firstName?.[0]}{profile.lastName?.[0]}</span>
          )}
        </div>
        <div className="profile-head">
          <h1>{profile.firstName} {profile.lastName}</h1>
          {profile.headline && <p className="headline">{profile.headline}</p>}
          {profile.companyName && <p className="company">{profile.companyName}</p>}
          {rating.count > 0 && (
            <p className="rating">
              ★ {rating.avg.toFixed(1)} ({rating.count} reviews)
            </p>
          )}
          {!isOwnProfile && user && (
            <button type="button" className="btn btn-primary" onClick={startConversation}>
              Message
            </button>
          )}
        </div>
      </div>
      {profile.bio && (
        <section>
          <h2>About</h2>
          <p>{profile.bio}</p>
        </section>
      )}
      {profile.skills?.length > 0 && (
        <section>
          <h2>Skills</h2>
          <div className="skill-tags">
            {profile.skills.map((s) => (
              <span key={s} className="skill-tag">{s}</span>
            ))}
          </div>
        </section>
      )}
      {profile.hourlyRate && (
        <section>
          <h2>Rate</h2>
          <p>₹{profile.hourlyRate}/hr</p>
        </section>
      )}
      {reviews.length > 0 && (
        <section>
          <h2>Reviews</h2>
          {reviews.map((r) => (
            <div key={r._id} className="review-item">
              <div className="review-meta">
                <span className="stars">★ {r.rating}</span>
                <span>{r.reviewer?.firstName} {r.reviewer?.lastName}</span>
              </div>
              {r.comment && <p>{r.comment}</p>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
