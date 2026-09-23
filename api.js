const mongoose = require("mongoose");
const express = require("express");
const app = express();
const dotenv = require("dotenv");
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const cookieParser = require("cookie-parser");
const cors = require("cors");

dotenv.config();

/*************************** CORS Configuration ******************* */
// Whitelist frontend origins (Local development + production deployments)
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_URL, // e.g., your production Vercel or Render domain
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS error: Origin ${origin} not allowed`));
      }
    },
    credentials: true, // Crucial for HTTP-only JWT cookies
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

/*************************** Middleware ******************* */
app.use(express.json());
app.use(cookieParser());

/*************************** Health Check ******************* */
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ConnectSpherr Backend is running",
  });
});

/*************************** Routes ******************* */
const authRouter = require("./Routes/AuthRouter");
const activityRouter = require("./Routes/ActivityRouter");
const participationRouter = require("./Routes/ParticipationRouter");
const rewardRouter = require("./Routes/RewardRouter");
const notificationRouter = require("./Routes/NotificationRouter");

app.use("/api/auth", authRouter);
app.use("/api/activity", activityRouter);
app.use("/api/participation", participationRouter);
app.use("/api/reward", rewardRouter);
app.use("/api/notification", notificationRouter);

/*************************** Server Initialization ******************* */
async function startServer() {
  if (process.env.NODE_ENV !== "test") {
    try {
      await mongoose.connect(process.env.dbLink);
      console.log("Connected to DB");
    } catch (err) {
      console.log("DB connection error: ", err);
      process.exit(1);
    }
  }

  // Define ports
  const PORT = process.env.NODE_ENV === "test" ? 5000 : (process.env.PORT || 5000);

  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`);
  });
}

// Start server if not being required by another module (like tests)
if (process.env.NODE_ENV !== "test") {
  startServer();
}

// module.exports = { app };