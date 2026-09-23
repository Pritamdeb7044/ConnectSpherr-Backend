const express = require("express");
const activityRouter = express.Router();

const {protectedRouteMiddleware} = require("../Middleware/ProtectedRouteMiddleware.js");

const {
    createActivityHandler,
    getActivityHandler,
    updateActivityHandler,
    getNearbyActivityHandler,
    cancelActivityHandler,
    closeActivityHandler,
    completeActivityHandler
} = require("../Controllers/ActivityController");


activityRouter
    .post("/createactivity",protectedRouteMiddleware, createActivityHandler)
    .get("/nearby",getNearbyActivityHandler)
    .get("/:activityId", getActivityHandler)
    .patch("/:activityId",protectedRouteMiddleware,updateActivityHandler)
    .patch("/:activityId/close",protectedRouteMiddleware, closeActivityHandler)
    .patch("/:activityId/cancel", protectedRouteMiddleware, cancelActivityHandler)
    .patch("/:activityId/complete", protectedRouteMiddleware, completeActivityHandler)

module.exports = activityRouter