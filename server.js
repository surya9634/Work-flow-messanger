import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as FacebookStrategy } from "passport-facebook";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 10000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// Session setup
app.use(session({
  secret: "keyboard cat",
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// Facebook credentials (replace with your env values or paste directly)
const FACEBOOK_APP_ID = "1256408305896903";
const FACEBOOK_APP_SECRET = "your-app-secret"; // replace with real secret

passport.use(new FacebookStrategy({
  clientID: FACEBOOK_APP_ID,
  clientSecret: FACEBOOK_APP_SECRET,
  callbackURL: "https://messanger-automation.onrender.com/login/callback",
  profileFields: ['id', 'displayName', 'emails']
}, (accessToken, refreshToken, profile, cb) => {
  profile.accessToken = accessToken;
  return cb(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Facebook login routes
app.get("/login", passport.authenticate("facebook", {
  scope: ['pages_show_list', 'pages_messaging', 'pages_read_engagement', 'pages_manage_metadata']
}));

app.get("/login/callback", passport.authenticate("facebook", {
  failureRedirect: "/"
}), (req, res) => {
  // 🟢 FIXED: redirect back to single page
  res.redirect("/");
});

// Sample data API for frontend
app.get("/pages", (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  res.json([
    { id: "123", name: "Suraj's Test Page" },
    { id: "456", name: "Workflow Bot Page" }
  ]);
});

app.get("/history", (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  res.json([
    { id: "1", message: "Hi from Suraj" },
    { id: "2", message: "Hello from Bot 🤖" }
  ]);
});

// Home fallback (if someone types `/` directly)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
