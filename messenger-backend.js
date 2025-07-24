// messenger-backend.js

import express from 'express'
import axios from 'axios'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
app.use(express.json())
app.use(cookieParser())

// Serve static HTML from /public
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use(express.static(path.join(__dirname, 'public')))

// ====== ENV CONFIG ======
const PORT = process.env.PORT || 3000
const FB_APP_ID = process.env.FB_APP_ID
const FB_APP_SECRET = process.env.FB_APP_SECRET
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI

// ====== 1. FACEBOOK LOGIN (REDIRECT) ======
app.get('/auth/login', (req, res) => {
  const loginUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${FB_REDIRECT_URI}&scope=pages_messaging,pages_manage_metadata,pages_read_engagement,public_profile`
  res.redirect(loginUrl)
})

// ====== 2. FACEBOOK OAUTH CALLBACK ======
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code
  const tokenRes = await axios.get(`https://graph.facebook.com/v18.0/oauth/access_token`, {
    params: {
      client_id: FB_APP_ID,
      client_secret: FB_APP_SECRET,
      redirect_uri: FB_REDIRECT_URI,
      code
    }
  })
  const accessToken = tokenRes.data.access_token

  const pageRes = await axios.get(`https://graph.facebook.com/me/accounts`, {
    params: { access_token: accessToken }
  })

  const page = pageRes.data.data[0]
  res.cookie('page_id', page.id)
  res.cookie('page_token', page.access_token)

  res.redirect('/') // go back to frontend
})

// ====== 3. SEND MESSAGE ======
app.post('/send-message', async (req, res) => {
  const pageToken = req.cookies.page_token
  const { to, message } = req.body

  const fbRes = await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${pageToken}`, {
    recipient: { id: to },
    message: { text: message }
  })

  res.json({ success: true, response: fbRes.data })
})

// ====== 4. GET MESSAGE HISTORY (no DB, direct from Graph API) ======
app.get('/chat-history', async (req, res) => {
  const pageToken = req.cookies.page_token
  const { userId } = req.query

  try {
    const threadRes = await axios.get(`https://graph.facebook.com/v18.0/${userId}/messages`, {
      params: {
        access_token: pageToken,
        fields: 'message,from,to,created_time'
      }
    })
    res.json({ messages: threadRes.data.data })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages', details: err.response?.data || err.message })
  }
})

// ====== 5. WEBHOOK VERIFY (optional) ======
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
    return res.status(200).send(challenge)
  }
  return res.status(403).send('Verification failed')
})

// ====== 6. WEBHOOK RECEIVE (optional for real-time updates) ======
app.post('/webhook', (req, res) => {
  console.log('📥 Webhook event:', JSON.stringify(req.body, null, 2))
  res.sendStatus(200)
})

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})
