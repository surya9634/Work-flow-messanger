const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const VERIFY_TOKEN = "your_verify_token"; // Set same as in FB Developer Console
const PAGE_ACCESS_TOKEN = "your_page_access_token"; // Get from FB Page

let messageHistory = [];

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook to receive messages
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMsg = event.message.text;
        messageHistory.push({ from: senderId, text: userMsg });

        // Auto-reply (optional)
        await axios.post(
          `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
          {
            recipient: { id: senderId },
            message: { text: `Echo: ${userMsg}` }
          }
        );

        messageHistory.push({ from: "page", text: `Echo: ${userMsg}` });
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Return chat history
app.get("/history", (req, res) => {
  res.json(messageHistory);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
