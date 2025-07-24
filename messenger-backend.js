// server.js

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
app.use(cors());

// Setup __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "../public")));

// Serve index.html on root GET
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const REDIRECT_URI = "https://work-flow-messanger.onrender.com/auth/callback";

// Facebook Login Route
app.get("/auth/login", (req, res) => {
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=pages_messaging,pages_manage_metadata,pages_read_engagement,pages_show_list`;

  res.redirect(authUrl);
});

// Facebook OAuth Callback
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code");

  try {
    const tokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(
        REDIRECT_URI
      )}&client_secret=${APP_SECRET}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) return res.status(500).json(tokenData.error);

    const userAccessToken = tokenData.access_token;

    // Get pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${userAccessToken}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) return res.status(500).json(pagesData.error);

    // Format results
    const pagesHTML = pagesData.data
      .map(
        (p) =>
          `<li><b>${p.name}</b> — Page ID: ${p.id}<br>Access Token: <code>${p.access_token}</code></li>`
      )
      .join("");

    res.send(`<h2>✅ Login Successful!</h2><ul>${pagesHTML}</ul>`);
  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth Error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is live at http://localhost:${PORT}`);
});
