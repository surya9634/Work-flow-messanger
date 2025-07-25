// server.js
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
const CALLBACK_URL = "https://work-flow-messanger.onrender.com/login/callback";

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: "workflow_secret_key",
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport OAuth Setup
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new FacebookStrategy({
  clientID: FACEBOOK_APP_ID,
  clientSecret: FACEBOOK_APP_SECRET,
  callbackURL: CALLBACK_URL,
  profileFields: ['id', 'displayName', 'emails']
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

// Helper: Get Page Access Token
async function getPageAccessToken(userToken) {
  try {
    const resp = await fetch(`https://graph.facebook.com/me/accounts?access_token=${userToken}`);
    const data = await resp.json();
    if (data?.data?.length) return data.data[0];
    return null;
  } catch (err) {
    console.error("Page token error:", err);
    return null;
  }
}

// ROUTES

// Login with FB
app.get("/login", passport.authenticate("facebook", {
  scope: ["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement"]
}));

// OAuth Callback
app.get("/login/callback", passport.authenticate("facebook", {
  failureRedirect: "/login/fail"
}), (req, res) => {
  res.redirect("/dashboard");
});

// Dashboard UI
app.get("/dashboard", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");
  res.send(`
    <div style="font-family: sans-serif; padding: 40px; text-align: center">
      <h1 style="font-size: 2rem;">Welcome, ${req.user.displayName}</h1>
      <p style="margin: 20px 0;">Choose what you'd like to do:</p>
      <a href="/conversations" style="padding: 10px 20px; background: #2563eb; color: white; border-radius: 5px; text-decoration: none;">View Messenger Conversations</a>
      <br/><br/>
      <a href="/logout" style="color: red;">Logout</a>
    </div>
  `);
});

// Conversations UI
app.get("/conversations", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");

  try {
    const page = await getPageAccessToken(req.user.accessToken);
    if (!page) return res.send("No pages found or permission denied.");

    const response = await fetch(`https://graph.facebook.com/${page.id}/conversations?access_token=${page.access_token}`);
    const data = await response.json();

    let html = `
      <div style="font-family: sans-serif; padding: 40px;">
        <h2 style="font-size: 1.5rem; margin-bottom: 20px;">Messenger Conversations</h2>
        <ul style="list-style: none; padding: 0;">
    `;

    for (let convo of data.data || []) {
      const convoDetail = await fetch(`https://graph.facebook.com/${convo.id}?fields=participants&access_token=${page.access_token}`);
      const convoData = await convoDetail.json();
      const recipient = convoData.participants?.data?.find(p => p.id !== req.user.id);
      const name = recipient?.name || convo.id;
      const userInfo = await fetch(`https://graph.facebook.com/${recipient?.id}?fields=picture&access_token=${page.access_token}`).then(r => r.json());
      const pfp = userInfo.picture?.data?.url || "";

      html += `
        <li style="margin-bottom: 16px;">
          <a href="/chat?id=${convo.id}" style="display: flex; align-items: center; text-decoration: none;">
            <img src="${pfp}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 12px;" />
            <span>${name}</span>
          </a>
        </li>
      `;
    }

    html += `</ul><a href="/dashboard" style="color: blue;">← Back to Dashboard</a></div>`;
    res.send(html);
  } catch (err) {
    console.error("Conversation error:", err);
    res.status(500).send("Failed to load conversations.");
  }
});

// Chat page
app.get("/chat", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// API: Get messages for conversation
app.get("/api/messages", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { id } = req.query;
    const page = await getPageAccessToken(req.user.accessToken);

    const resp = await fetch(`https://graph.facebook.com/${id}/messages?fields=message,from,created_time&access_token=${page.access_token}`);
    const data = await resp.json();

    const messages = await Promise.all((data.data || []).map(async msg => {
      const userResp = await fetch(`https://graph.facebook.com/${msg.from.id}?fields=name,picture&access_token=${page.access_token}`);
      const userData = await userResp.json();
      return {
        sender: userData.name || msg.from.id,
        text: msg.message || "[No text]",
        pfp: userData.picture?.data?.url || ""
      };
    }));

    res.json({ messages: messages.reverse() }); // Newest at bottom
  } catch (err) {
    console.error("Fetch messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// API: Send message to conversation
app.post("/api/send", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { id, message } = req.body;
    const page = await getPageAccessToken(req.user.accessToken);

    const result = await fetch(`https://graph.facebook.com/me/messages?access_token=${page.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: id },
        message: { text: message }
      })
    }).then(r => r.json());

    res.json(result);
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Logout
app.get("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect("/");
  });
});

// Fallback routes
app.get("/login/fail", (req, res) => res.send("Facebook login failed."));
app.get("/", (req, res) => {
  res.send("<h2>Welcome to Messenger Automation</h2><a href='/login'>Login with Facebook</a>");
});

// Start server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
