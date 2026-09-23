const express = require("express");

const notificationRouter = express.Router();

const {protectedRouteMiddleware} =
    require("../Middleware/ProtectedRouteMiddleware");

const {
    getMyNotificationsHandler,
    notificationStatusHandler,
    markNotificationsSeenHandler,
    getNotificationHandler
} = require("../Controllers/NotificationController");


notificationRouter
    .get("/", protectedRouteMiddleware, getMyNotificationsHandler)
    .get("/status", protectedRouteMiddleware, notificationStatusHandler)
    .patch("/seen", protectedRouteMiddleware, markNotificationsSeenHandler)
    .get("/:notificationId", protectedRouteMiddleware, getNotificationHandler)
    


module.exports = notificationRouter;