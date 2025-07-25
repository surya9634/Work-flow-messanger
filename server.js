const express = require("express");
const session = require("express-session");
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// Facebook App Credentials
const FACEBOOK_APP_ID = "1256408305896903";
const FACEBOOK_APP_SECRET = "fc7fbca3fbecd5bc6b06331bc4da17c9";
const CALLBACK_URL = "https://work-flow-messanger.onrender.com/login/callback"; // ✅ Fixed URL

// Session middleware
app.use(session({
  secret: "workflow_secret_key",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Serialize/Deserialize
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Passport Facebook Strategy
passport.use(new FacebookStrategy({
  clientID: FACEBOOK_APP_ID,
  clientSecret: FACEBOOK_APP_SECRET,
  callbackURL: CALLBACK_URL,
  profileFields: ['id', 'displayName', 'emails']
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

// Static folder
app.use(express.static(path.join(__dirname, "public")));

// Auth start
app.get("/login", passport.authenticate("facebook", {
  scope: [
    "pages_show_list",
    "pages_messaging",
    "pages_manage_metadata",
    "pages_read_engagement"
  ]
}));

// Auth callback
app.get("/login/callback", passport.authenticate("facebook", {
  failureRedirect: "/login/fail"
}), (req, res) => {
  res.redirect("/dashboard");
});

// Protected dashboard
app.get("/dashboard", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");

  res.send(`<h1>Hello, ${req.user.displayName}</h1>
  <p>Access Token: ${req.user.accessToken}</p>
  <a href="/logout">Logout</a>`);
});

// Logout
app.get("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect("/");
  });
});

// Login failed
app.get("/login/fail", (req, res) => {
  res.send("Facebook login failed. Try again.");
});

// Homepage
app.get("/", (req, res) => {
  res.send("<h2>Welcome to Messenger Automation</h2><a href='/login'>Login with Facebook</a>");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
