const express = require("express");
const activityRouter = express.Router();

const {protectedRouteMiddleware} = require("../Middleware/ProtectedRouteMiddleware.js");

const {
    createActivityHandler,
    getActivityHandler,
    updateActivityHandler,
    getNearbyActivityHandler,
    getHostedActivitiesHandler,
    cancelActivityHandler,
    closeActivityHandler,
    completeActivityHandler
} = require("../Controllers/ActivityController");


activityRouter
    .post("/createactivity",protectedRouteMiddleware, createActivityHandler)
    .get("/nearby",protectedRouteMiddleware, getNearbyActivityHandler)
    .get("/hosted", protectedRouteMiddleware, getHostedActivitiesHandler)
    .get("/:activityId", getActivityHandler)
    .patch("/:activityId",protectedRouteMiddleware,updateActivityHandler)
    .patch("/:activityId/close",protectedRouteMiddleware, closeActivityHandler)
    .patch("/:activityId/cancel", protectedRouteMiddleware, cancelActivityHandler)
    .patch("/:activityId/complete", protectedRouteMiddleware, completeActivityHandler)

module.exports = activityRouter