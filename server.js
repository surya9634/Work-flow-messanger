// server.js
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import FacebookStrategy from 'passport-facebook';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

// Session setup
app.use(session({
  secret: 'keyboardcat',
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport Facebook Strategy
passport.use(new FacebookStrategy({
  clientID: process.env.FB_APP_ID,
  clientSecret: process.env.FB_APP_SECRET,
  callbackURL: '/login/callback'
}, (accessToken, refreshToken, profile, cb) => {
  return cb(null, { profile, accessToken });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Facebook login routes
app.get('/login', passport.authenticate('facebook', {
  scope: ['pages_show_list', 'pages_messaging', 'pages_manage_metadata', 'pages_read_engagement']
}));

app.get('/login/callback',
  passport.authenticate('facebook', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// Load user pages
app.get('/pages', async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthorized');
  const url = `https://graph.facebook.com/v19.0/me/accounts?access_token=${req.user.accessToken}`;
  const response = await fetch(url);
  const data = await response.json();
  res.json(data.data || []);
});

// Load chat history (example dummy response)
app.get('/history', async (req, res) => {
  res.json([
    { id: '1', user: 'Suraj Sharma', message: 'Welcome to Messenger SaaS!' },
    { id: '2', user: 'Bot', message: 'This is an AI-powered automation platform.' }
  ]);
});

// Send message (example)
app.get('/send-message', async (req, res) => {
  if (!req.user) return res.status(401).send('Unauthorized');
  const { pageId, message } = req.query;
  const url = `https://graph.facebook.com/v19.0/${pageId}/messages?access_token=${req.user.accessToken}`;
  const body = JSON.stringify({ message: { text: message } });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });

  const data = await response.json();
  res.json(data);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
