import express from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'secret', { expiresIn: process.env.JWT_EXPIRE || '7d' });

function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return String(v).toLowerCase() === 'true' || String(v) === '1';
}

function frontendBaseUrl(req) {
  const configured = process.env.OAUTH_REDIRECT_BASE_URL || process.env.FRONTEND_URL || '';
  if (configured) return configured.replace(/\/+$/, '');
  const origin = req.headers.origin || '';
  return origin ? String(origin).replace(/\/+$/, '') : 'http://localhost:5173';
}

function apiBaseUrl(req) {
  const configured = process.env.API_BASE_URL || process.env.BACKEND_URL || '';
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0].trim() : req.protocol;
  const host = req.headers['x-forwarded-host'] ? String(req.headers['x-forwarded-host']).split(',')[0].trim() : req.get('host');
  return `${proto}://${host}`;
}

function signOauthState(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '10m' });
}

function verifyOauthState(token) {
  return jwt.verify(token, process.env.JWT_SECRET || 'secret');
}

function signOauthPending(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '20m' });
}

function verifyOauthPending(token) {
  return jwt.verify(token, process.env.JWT_SECRET || 'secret');
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error_description || data?.error?.message || data?.error || data?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.statusCode = 400;
    err.meta = data;
    throw err;
  }
  return data;
}

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['client', 'freelancer']),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { email, password, role, firstName, lastName } = req.body;
      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ message: 'Email already registered' });
      const user = await User.create({ email, password, role, firstName, lastName });
      const token = signToken(user._id);
      res.status(201).json({ user: user.toJSON(), token });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').exists()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { email, password } = req.body;
      const user = await User.findOne({ email }).select('+password');
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      if (!user.isActive) return res.status(401).json({ message: 'Account is deactivated' });
      const token = signToken(user._id);
      user.password = undefined;
      res.json({ user: user.toJSON(), token });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user });
});

// ------------------------------
// OAuth (Google + GitHub) - additive
// ------------------------------

router.get('/oauth/google/start', async (req, res) => {
  if (!envBool('OAUTH_GOOGLE_ENABLED', true)) return res.status(404).json({ message: 'Google OAuth disabled' });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ message: 'GOOGLE_CLIENT_ID not set' });

  const base = apiBaseUrl(req);
  const redirectUri = `${base}/api/auth/oauth/google/callback`;
  const state = signOauthState({ provider: 'google', nonce: crypto.randomBytes(16).toString('hex') });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/oauth/google/callback', async (req, res) => {
  try {
    if (!envBool('OAUTH_GOOGLE_ENABLED', true)) return res.status(404).send('Google OAuth disabled');
    const code = String(req.query.code || '');
    const stateToken = String(req.query.state || '');
    if (!code || !stateToken) return res.status(400).send('Missing code/state');
    const state = verifyOauthState(stateToken);
    if (state?.provider !== 'google') return res.status(400).send('Invalid state');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(500).send('Google OAuth not configured');

    const base = apiBaseUrl(req);
    const redirectUri = `${base}/api/auth/oauth/google/callback`;

    const tokenRes = await fetchJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const accessToken = tokenRes.access_token;
    if (!accessToken) return res.status(400).send('Missing access token');

    const profile = await fetchJson('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const email = String(profile.email || '').toLowerCase().trim();
    const providerId = String(profile.sub || '').trim();
    const emailVerified = profile.email_verified === true || profile.email_verified === 'true';
    if (!email || !emailVerified) return res.status(400).send('Google account email is not verified');
    if (!providerId) return res.status(400).send('Missing provider id');

    const existing = await User.findOne({ email });
    const fe = frontendBaseUrl(req);

    if (existing) {
      existing.oauthProviders = existing.oauthProviders || {};
      existing.oauthProviders.google = { providerId, email, linkedAt: new Date() };
      existing.authProviders = Array.isArray(existing.authProviders) ? existing.authProviders : ['password'];
      if (!existing.authProviders.includes('google')) existing.authProviders.push('google');
      await existing.save();

      const token = signToken(existing._id);
      return res.redirect(`${fe}/oauth/callback?token=${encodeURIComponent(token)}`);
    }

    const pending = signOauthPending({
      provider: 'google',
      providerId,
      email,
      firstName: String(profile.given_name || '').trim(),
      lastName: String(profile.family_name || '').trim(),
      avatar: String(profile.picture || '').trim(),
    });
    return res.redirect(`${fe}/oauth/complete?pending=${encodeURIComponent(pending)}`);
  } catch (err) {
    const fe = frontendBaseUrl(req);
    const msg = encodeURIComponent(err?.message || 'OAuth failed');
    return res.redirect(`${fe}/login?oauthError=${msg}`);
  }
});

router.get('/oauth/github/start', async (req, res) => {
  if (!envBool('OAUTH_GITHUB_ENABLED', true)) return res.status(404).json({ message: 'GitHub OAuth disabled' });
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(500).json({ message: 'GITHUB_CLIENT_ID not set' });

  const base = apiBaseUrl(req);
  const redirectUri = `${base}/api/auth/oauth/github/callback`;
  const state = signOauthState({ provider: 'github', nonce: crypto.randomBytes(16).toString('hex') });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get('/oauth/github/callback', async (req, res) => {
  try {
    if (!envBool('OAUTH_GITHUB_ENABLED', true)) return res.status(404).send('GitHub OAuth disabled');
    const code = String(req.query.code || '');
    const stateToken = String(req.query.state || '');
    if (!code || !stateToken) return res.status(400).send('Missing code/state');
    const state = verifyOauthState(stateToken);
    if (state?.provider !== 'github') return res.status(400).send('Invalid state');

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(500).send('GitHub OAuth not configured');

    const base = apiBaseUrl(req);
    const redirectUri = `${base}/api/auth/oauth/github/callback`;

    const tokenRes = await fetchJson('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const accessToken = tokenRes.access_token;
    if (!accessToken) return res.status(400).send('Missing access token');

    const userProfile = await fetchJson('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'InnoLance' },
    });

    // GitHub may not include email here; fetch emails and pick primary verified.
    const emails = await fetchJson('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'InnoLance' },
    });
    const primary = Array.isArray(emails)
      ? emails.find((e) => e?.primary && e?.verified && e?.email)
      : null;
    const email = String(primary?.email || userProfile.email || '').toLowerCase().trim();

    const providerId = String(userProfile.id || '').trim();
    if (!email) return res.status(400).send('GitHub email not available (ensure you have a primary verified email)');
    if (!providerId) return res.status(400).send('Missing provider id');

    const existing = await User.findOne({ email });
    const fe = frontendBaseUrl(req);

    if (existing) {
      existing.oauthProviders = existing.oauthProviders || {};
      existing.oauthProviders.github = { providerId, email, linkedAt: new Date() };
      existing.authProviders = Array.isArray(existing.authProviders) ? existing.authProviders : ['password'];
      if (!existing.authProviders.includes('github')) existing.authProviders.push('github');
      await existing.save();

      const token = signToken(existing._id);
      return res.redirect(`${fe}/oauth/callback?token=${encodeURIComponent(token)}`);
    }

    const pending = signOauthPending({
      provider: 'github',
      providerId,
      email,
      firstName: String(userProfile.name || '').split(' ')[0] || '',
      lastName: String(userProfile.name || '').split(' ').slice(1).join(' ') || '',
      avatar: String(userProfile.avatar_url || '').trim(),
    });
    return res.redirect(`${fe}/oauth/complete?pending=${encodeURIComponent(pending)}`);
  } catch (err) {
    const fe = frontendBaseUrl(req);
    const msg = encodeURIComponent(err?.message || 'OAuth failed');
    return res.redirect(`${fe}/login?oauthError=${msg}`);
  }
});

router.post(
  '/oauth/complete',
  [
    body('pending').isString(),
    body('role').isIn(['client', 'freelancer']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const pending = verifyOauthPending(req.body.pending);
      const role = req.body.role;
      const email = String(pending.email || '').toLowerCase().trim();
      if (!email) return res.status(400).json({ message: 'Invalid pending token' });

      const exists = await User.findOne({ email });
      if (exists) {
        const token = signToken(exists._id);
        return res.json({ user: exists.toJSON(), token });
      }

      const randomPassword = crypto.randomBytes(24).toString('hex'); // satisfies minlength
      const user = await User.create({
        email,
        password: randomPassword,
        role,
        firstName: pending.firstName || undefined,
        lastName: pending.lastName || undefined,
        avatar: pending.avatar || undefined,
        isVerified: true,
        oauthProviders: {
          google: pending.provider === 'google' ? { providerId: pending.providerId, email, linkedAt: new Date() } : undefined,
          github: pending.provider === 'github' ? { providerId: pending.providerId, email, linkedAt: new Date() } : undefined,
        },
        authProviders: ['password', pending.provider].filter(Boolean),
      });

      const token = signToken(user._id);
      res.status(201).json({ user: user.toJSON(), token });
    } catch (err) {
      const code = err.statusCode || 500;
      res.status(code).json({ message: err.message });
    }
  }
);

export default router;
