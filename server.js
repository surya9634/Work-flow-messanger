// === server.js ===
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const fetch = require("node-fetch");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

// ======= CONFIG =======
const FACEBOOK_APP_ID = "1256408305896903";
const FACEBOOK_APP_SECRET = "fc7fbca3fbecd5bc6b06331bc4da17c9";
const CALLBACK_URL = "https://work-flow-messanger.onrender.com/login/callback";
const VERIFY_TOKEN = "workflow_verify_token"; // Webhook verify token

// ======= Middleware =======
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: "workflow_secret_key",
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// ======= Passport Setup =======
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

// ======= Helpers =======
async function getPageAccessToken(userToken) {
  const resp = await fetch(`https://graph.facebook.com/me/accounts?access_token=${userToken}`);
  const data = await resp.json();
  return data?.data?.[0] || null;
}

// ======= Facebook OAuth Routes =======
app.get("/login", passport.authenticate("facebook", {
  scope: ["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement"]
}));

app.get("/login/callback", passport.authenticate("facebook", {
  failureRedirect: "/login/fail"
}), async (req, res) => {
  try {
    const page = await getPageAccessToken(req.user.accessToken);
    if (page) {
      // ✅ FIX: Add subscribed_fields
      const response = await fetch(`https://graph.facebook.com/${page.id}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscribed_fields: ["messages", "messaging_postbacks"],
          access_token: page.access_token
        })
      });
      const data = await response.json();
      console.log("✅ Page subscribed to webhook:", data);
    }
  } catch (err) {
    console.error("❌ Subscription failed:", err.message);
  }

  res.redirect("/dashboard");
});

// ======= Pages =======
app.get("/dashboard", (req, res) => {
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
          <a href="/chat?id=${recipient.id}" style="display: flex; align-items: center; text-decoration: none;">
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

// ======= Chat API =======
app.get("/chat", (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

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

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error("Fetch messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.post("/api/send", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { id, message } = req.body;
    const page = await getPageAccessToken(req.user.accessToken);

    const result = await fetch(`https://graph.facebook.com/me/messages?access_token=${page.access_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id },
        message: { text: message }
      })
    }).then(r => r.json());

    io.to(id).emit("newMessage", { id, message });
    res.json(result);
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ======= Webhook =======
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

app.post('/webhook', express.json(), async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        const message = event.message?.text;

        if (senderId && message) {
          console.log(`📩 Message from ${senderId}: ${message}`);
          io.to(senderId).emit("newMessage", { id: senderId, message });

          // Optional: Auto-reply (can be removed)
          const page = await getPageAccessToken(process.env.PAGE_USER_ACCESS_TOKEN || req.user?.accessToken);
          await fetch(`https://graph.facebook.com/me/messages?access_token=${page.access_token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: senderId },
              message: { text: "Thanks for messaging us!" }
            })
          });
        }
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// ======= Socket.IO Join Rooms =======
io.on("connection", socket => {
  console.log("✅ Socket.IO connected");
  socket.on("join", (id) => {
    socket.join(id);
    console.log("🟢 Joined conversation:", id);
  });
});

// ======= Misc =======
app.get("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.get("/login/fail", (req, res) => res.send("Facebook login failed."));
app.get("/", (req, res) => {
  res.send("<h2>Welcome to Messenger Automation</h2><a href='/login'>Login with Facebook</a>");
});

// ======= Start Server =======
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
