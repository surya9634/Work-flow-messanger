// server.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PAGE_ACCESS_TOKENS = {}; // key: page id, value: token
const messageHistory = {}; // key: sender ID, value: [message1, message2, ...]

// Gemini API
const genAI = new GoogleGenerativeAI("YOUR_GEMINI_API_KEY");
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/webhook', (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    body.entry.forEach(entry => {
      const webhookEvent = entry.messaging[0];
      const senderId = webhookEvent.sender.id;
      const pageId = entry.id;

      if (webhookEvent.message && webhookEvent.message.text) {
        const receivedText = webhookEvent.message.text;
        storeMessage(senderId, `User: ${receivedText}`);

        handleGeminiReply(receivedText).then(reply => {
          sendMessage(senderId, reply, PAGE_ACCESS_TOKENS[pageId]);
          storeMessage(senderId, `Bot: ${reply}`);
          io.emit('message', { from: senderId, message: reply });
        });
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = "testtoken";
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/getPages', async (req, res) => {
  const { access_token } = req.body;
  try {
    const response = await axios.get(
      `https://graph.facebook.com/me/accounts?access_token=${access_token}`
    );
    const pages = response.data.data;
    pages.forEach(p => PAGE_ACCESS_TOKENS[p.id] = p.access_token);
    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

function storeMessage(user, message) {
  if (!messageHistory[user]) messageHistory[user] = [];
  messageHistory[user].push(message);
  if (messageHistory[user].length > 10) messageHistory[user].shift();
}

async function handleGeminiReply(text) {
  const history = messageHistory[text] || [];
  const chat = model.startChat({ history: history.map(msg => ({ role: msg.startsWith('User:') ? 'user' : 'model', parts: [msg.split(': ')[1]] })) });
  const result = await chat.sendMessage(text);
  return result.response.text();
}

function sendMessage(senderId, text, pageAccessToken) {
  axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${pageAccessToken}`, {
    recipient: { id: senderId },
    message: { text }
  });
}

io.on('connection', socket => {
  console.log('Client connected');
});

server.listen(3000, () => console.log('Server running on port 3000'));


// package.json
{
  "name": "fb-messenger-bot",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "@google/generative-ai": "^0.3.0",
    "axios": "^1.6.8",
    "body-parser": "^1.20.2",
    "express": "^4.19.2",
    "socket.io": "^4.7.2"
  }
}


// public/index.html
<!DOCTYPE html>
<html>
<head>
  <title>Messenger Automation</title>
  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  <script src="https://connect.facebook.net/en_US/sdk.js"></script>
</head>
<body>
  <h1>Messenger Automation Bot</h1>
  <button onclick="loginWithFacebook()">Login with Facebook</button>
  <div id="pages"></div>
  <ul id="messages"></ul>

  <script>
    const socket = io();
    socket.on('message', data => {
      const msg = document.createElement('li');
      msg.innerText = `${data.from}: ${data.message}`;
      document.getElementById('messages').appendChild(msg);
    });

    window.fbAsyncInit = function() {
      FB.init({
        appId      : 'YOUR_FB_APP_ID',
        cookie     : true,
        xfbml      : true,
        version    : 'v18.0'
      });
    };

    function loginWithFacebook() {
      FB.login(function(response) {
        if (response.authResponse) {
          fetch('/getPages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: response.authResponse.accessToken })
          })
          .then(res => res.json())
          .then(data => {
            document.getElementById('pages').innerHTML = '<h3>Connected Pages:</h3>' + data.pages.map(p => `<p>${p.name}</p>`).join('');
          });
        }
      }, { scope: 'pages_messaging,pages_read_engagement,pages_manage_metadata,pages_show_list' });
    }
  </script>
</body>
</html>
