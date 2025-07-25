// server.cjs (Messenger Realtime Chat UI + API Backend)

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const FACEBOOK_APP_ID = "1256408305896903";
const FACEBOOK_APP_SECRET = "fc7fbca3fbecd5bc6b06331bc4da17c9";
const CALLBACK_URL = "https://work-flow-messanger.onrender.com/login/callback";

app.use(session({
  secret: "workflow_secret_key",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

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

app.get("/login", passport.authenticate("facebook", {
  scope: ["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement"]
}));

app.get("/login/callback", passport.authenticate("facebook", { failureRedirect: "/login/fail" }), (req, res) => {
  res.redirect("/dashboard");
});

app.get("/dashboard", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");
  res.send(`<h1>Hello, ${req.user.displayName}</h1>
    <a href="/conversations">View Conversations</a> | <a href="/logout">Logout</a>`);
});

async function getPageAccessToken(userToken) {
  try {
    const resp = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${userToken}`);
    const data = await resp.json();
    if (data.data && data.data.length > 0) return data.data[0];
    return null;
  } catch (err) {
    console.error("Error getting page access token:", err);
    return null;
  }
}

app.get("/conversations", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");
  try {
    const page = await getPageAccessToken(req.user.accessToken);
    if (!page) return res.send("No pages found or permission denied.");

    const resp = await fetch(`https://graph.facebook.com/v19.0/${page.id}/conversations?access_token=${page.access_token}`);
    const data = await resp.json();
    if (data.error) return res.send(`Error: ${data.error.message}`);

    let html = `<h2>Messenger Conversations</h2><ul>`;
    for (let convo of data.data || []) {
      html += `<li><a href="/chat?id=${convo.id}">${convo.id}</a></li>`;
    }
    html += `</ul><a href="/dashboard">Back to Dashboard</a>`;
    res.send(html);
  } catch (err) {
    console.error("Error in /conversations:", err);
    res.status(500).send("Internal server error.");
  }
});

app.get("/chat", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

app.get("/api/messages", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { id } = req.query;
    const page = await getPageAccessToken(req.user.accessToken);
    const resp = await fetch(`https://graph.facebook.com/v19.0/${id}/messages?fields=message,from,created_time&access_token=${page.access_token}`);
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

    res.json({ messages });
  } catch (err) {
    console.error("Error in /api/messages:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/send", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { id, message } = req.body;
    const page = await getPageAccessToken(req.user.accessToken);
    const sendRes = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${page.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: id }, message: { text: message } })
    });
    const result = await sendRes.json();
    res.json(result);
  } catch (err) {
    console.error("Error sending message:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

app.get("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.get("/login/fail", (req, res) => res.send("Facebook login failed. Try again."));

app.get("/", (req, res) => {
  res.send("<h2>Welcome to Messenger Automation</h2><a href='/login'>Login with Facebook</a>");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
