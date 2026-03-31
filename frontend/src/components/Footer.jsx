import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div className="footer-logo">InnoLance</div>
          <p className="footer-tagline">Hire talent. Find work. Pay safely.</p>
        </div>
        <div className="footer-links">
          <div>
            <div className="footer-title">Marketplace</div>
            <Link to="/projects">Find Work</Link>
            <Link to="/post-project">Post a Project</Link>
          </div>
          <div>
            <div className="footer-title">Company</div>
            <Link to="/page/about">About</Link>
            <Link to="/page/help">Help</Link>
          </div>
          <div>
            <div className="footer-title">Legal</div>
            <Link to="/page/privacy">Privacy</Link>
            <Link to="/page/terms">Terms</Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} InnoLance. All rights reserved.</span>
      </div>
    </footer>
  );
}

