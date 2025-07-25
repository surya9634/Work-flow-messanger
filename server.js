import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as FacebookStrategy } from "passport-facebook";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 10000;

// ======= SESSION SETUP =======
app.use(
  session({
    secret: "your-session-secret",
    resave: false,
    saveUninitialized: true,
  })
);

// ======= PASSPORT SETUP =======
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ✅ FACEBOOK OAUTH STRATEGY ✅
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FB_APP_ID,
      clientSecret: process.env.FB_APP_SECRET,
      callbackURL: "https://work-flow-messanger.onrender.com/login/callback", // must match FB dashboard
      profileFields: ["id", "displayName"],
    },
    function (accessToken, refreshToken, profile, cb) {
      profile.accessToken = accessToken;
      return cb(null, profile);
    }
  )
);

// ======= ROUTES =======

// ✅ Serve frontend HTML
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Login
app.get("/login", passport.authenticate("facebook", {
  scope: [
    "pages_show_list",
    "pages_messaging",
    "pages_read_engagement",
    "pages_manage_metadata"
  ]
}));

// ✅ Callback from Facebook
app.get(
  "/login/callback",
  passport.authenticate("facebook", { failureRedirect: "/" }),
  (req, res) => {
    req.session.user = req.user;
    res.redirect("/dashboard"); // or back to frontend
  }
);

// ✅ Pages (Mock / Replace with Graph API logic)
app.get("/pages", (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

  // Fetch pages using Facebook Graph API and user accessToken
  res.json([
    { id: "101", name: "Workflow Page A" },
    { id: "102", name: "Workflow Page B" },
  ]);
});

// ✅ Chat History (Mock / Replace with your data logic)
app.get("/history", (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });

  res.json([
    { id: "msg1", text: "Hello from user" },
    { id: "msg2", text: "Reply from bot" },
  ]);
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
