const express = require("express");
const session = require("express-session");
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

// Session
app.use(session({ secret: "keyboard cat", resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// Passport serialize
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Passport strategy
passport.use(new FacebookStrategy({
  clientID: process.env.APP_ID,
  clientSecret: process.env.APP_SECRET,
  callbackURL: "https://messanger-automation.onrender.com/auth/facebook/callback",
  profileFields: ['id', 'displayName']
}, function (accessToken, refreshToken, profile, cb) {
  profile.accessToken = accessToken;
  return cb(null, profile);
}));

// Routes
app.get('/auth/facebook',
  passport.authenticate('facebook', {
    scope: ['pages_messaging', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata']
  })
);

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/' }),
  function (req, res) {
    res.redirect('/success');
  }
);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/success", (req, res) => {
  if (req.isAuthenticated()) {
    res.send(`
      <h2>✅ Logged in as ${req.user.displayName}</h2>
      <p>Access Token: ${req.user.accessToken}</p>
    `);
  } else {
    res.redirect("/");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
