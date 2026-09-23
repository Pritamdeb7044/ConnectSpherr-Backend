const mongoose = require("mongoose");
const express = require("express");
const app = express();
const dotenv = require("dotenv")
const dns = require("dns");
dns.setServers(["1.1.1.1","8.8.8.8"]);
const cookieParser = require("cookie-parser");

dotenv.config();

async function startServer(){
    if(process.env.NODE_ENV !== 'test'){
        try{
            await mongoose.connect(process.env.dbLink);
            console.log("Connected to DB");
        } catch(err){
            console.log("DB connection error: ", err);
            process.exit(1);
        }
    }

    // Define ports
    const PORT = process.env.NODE_ENV === 'test' ? 5000 : process.env.PORT;

    app.listen(PORT, () => {
        console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
    })
}

// Start server if not being required by another module (like tests)
if (process.env.NODE_ENV != 'test') {
    startServer();
}

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "ConnectSpherr Backend is running"
    });
});

/***************************Middleware******************* */
app.use(express.json());
app.use(cookieParser());

const authRouter = require("./Routes/AuthRouter");
const activityRouter = require("./Routes/ActivityRouter")
const participationRouter = require("./Routes/ParticipationRouter")
const rewardRouter = require("./Routes/RewardRouter")
const notificationRouter = require("./Routes/NotificationRouter");


app.use("/api/auth", authRouter);
app.use("/api/activity", activityRouter);
app.use("/api/participation", participationRouter);
app.use("/api/reward", rewardRouter);
app.use("/api/notification", notificationRouter);

// module.exports = { app };