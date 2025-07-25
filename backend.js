const express = require("express");
const axios = require("axios");
const path = require("path");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const qs = require("querystring");

const app = express();
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const APP_ID = "1256408305896903";
const APP_SECRET = "hello";
const REDIRECT_URI = "https://messanger-automation.onrender.com/login/callback"; // update for Render

let users = {}; // memory store: userId -> { token, pages: [], history: [] }

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/login", (req, res) => {
  const authURL = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${REDIRECT_URI}&scope=pages_messaging,pages_show_list,pages_read_engagement,pages_manage_metadata`;
  res.redirect(authURL);
});

app.get("/login/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${REDIRECT_URI}&client_secret=${APP_SECRET}&code=${code}`
    );
    const shortToken = tokenRes.data.access_token;

    const longTokenRes = await axios.get(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`
    );

    const userToken = longTokenRes.data.access_token;

    const userInfo = await axios.get(`https://graph.facebook.com/me?access_token=${userToken}`);
    const userId = userInfo.data.id;

    const pagesRes = await axios.get(`https://graph.facebook.com/me/accounts?access_token=${userToken}`);
    const pages = pagesRes.data.data;

    users[userId] = {
      token: userToken,
      pages: pages.map(p => ({ id: p.id, name: p.name, token: p.access_token })),
      history: [],
    };

    // Subscribe webhook to each page
    for (const page of users[userId].pages) {
      await axios.post(
        `https://graph.facebook.com/v19.0/${page.id}/subscribed_apps?access_token=${page.token}`
      );
    }

    res.cookie("userId", userId);
    res.redirect("/");
  } catch (err) {
    console.error("OAuth error:", err.response?.data || err);
    res.send("Login failed.");
  }
});

app.get("/pages", (req, res) => {
  const userId = req.cookies.userId;
  if (!userId || !users[userId]) return res.sendStatus(401);
  res.json(users[userId].pages);
});

app.get("/history", (req, res) => {
  const userId = req.cookies.userId;
  if (!userId || !users[userId]) return res.sendStatus(401);
  res.json(users[userId].history);
});

// Webhook Verification
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === "your_verify_token") {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

// Handle incoming messages
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object === "page") {
    for (const entry of body.entry) {
      const pageId = entry.id;
      for (const event of entry.messaging) {
        const senderId = event.sender.id;
        const msg = event.message?.text || "";

        const user = Object.values(users).find(u => u.pages.some(p => p.id === pageId));
        if (user) {
          user.history.push({ pageId, from: senderId, text: msg });

          const page = user.pages.find(p => p.id === pageId);
          if (page) {
            await axios.post(
              `https://graph.facebook.com/v19.0/me/messages?access_token=${page.token}`,
              {
                recipient: { id: senderId },
                message: { text: `Echo: ${msg}` },
              }
            );

            user.history.push({ pageId, from: "page", text: `Echo: ${msg}` });
          }
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
  console.log(`🔥 SaaS backend running on http://localhost:${PORT}`);
});
