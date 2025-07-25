const express = require("express");
const path = require("path");
const axios = require("axios");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());
app.use(bodyParser.json());

const APP_ID = "YOUR_APP_ID"; // ⬅️ Replace
const APP_SECRET = "YOUR_APP_SECRET"; // ⬅️ Replace
const REDIRECT_URI = "https://messanger-automation.onrender.com/login/callback"; // ⬅️ Replace if different
const VERIFY_TOKEN = "your_verify_token"; // ⬅️ Replace and match with FB webhook setup

const users = {}; // userId -> { token, pages, history }

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// FB OAuth login
app.get("/login", (req, res) => {
  const loginUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${REDIRECT_URI}&scope=pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata`;
  res.redirect(loginUrl);
});

// OAuth callback
app.get("/login/callback", async (req, res) => {
  try {
    const { code } = req.query;

    const accessTokenRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
      params: {
        client_id: APP_ID,
        redirect_uri: REDIRECT_URI,
        client_secret: APP_SECRET,
        code
      }
    });

    const shortToken = accessTokenRes.data.access_token;

    const longLivedRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
      params: {
        grant_type: "fb_exchange_token",
        client_id: APP_ID,
        client_secret: APP_SECRET,
        fb_exchange_token: shortToken
      }
    });

    const userToken = longLivedRes.data.access_token;

    const userInfo = await axios.get(`https://graph.facebook.com/me?access_token=${userToken}`);
    const userId = userInfo.data.id;

    const pagesRes = await axios.get(`https://graph.facebook.com/me/accounts?access_token=${userToken}`);
    const pages = pagesRes.data.data;

    users[userId] = {
      token: userToken,
      pages: pages.map(p => ({ id: p.id, name: p.name, token: p.access_token })),
      history: []
    };

    // Subscribe webhook to each page
    for (const page of users[userId].pages) {
      await axios.post(`https://graph.facebook.com/v19.0/${page.id}/subscribed_apps?access_token=${page.token}`);
    }

    res.cookie("userId", userId);
    res.redirect("/");
  } catch (err) {
    console.error("Login callback error:", err.response?.data || err.message);
    res.status(500).send("Login failed");
  }
});

app.get("/pages", (req, res) => {
  const userId = req.cookies.userId;
  if (!userId || !users[userId]) return res.status(401).send("Not logged in");
  res.json(users[userId].pages);
});

app.get("/history", (req, res) => {
  const userId = req.cookies.userId;
  if (!userId || !users[userId]) return res.status(401).send("Not logged in");
  res.json(users[userId].history);
});

// Messenger Webhook Verification
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

// Messenger Webhook Listener
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const pageID = entry.id;
      for (const event of entry.messaging) {
        const senderId = event.sender.id;
        const messageText = event.message?.text;

        const user = Object.values(users).find(u => u.pages.find(p => p.id === pageID));
        const page = user?.pages.find(p => p.id === pageID);

        if (!user || !page) continue;

        if (messageText) {
          user.history.push({ pageId: pageID, from: senderId, text: messageText });

          await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${page.token}`, {
            recipient: { id: senderId },
            message: { text: `Echo: ${messageText}` }
          });

          user.history.push({ pageId: pageID, from: "page", text: `Echo: ${messageText}` });
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Messenger SaaS backend running on port ${PORT}`);
});
