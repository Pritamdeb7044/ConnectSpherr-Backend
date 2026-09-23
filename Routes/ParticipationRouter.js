const express = require("express");
const participationRouter = express.Router();

const {protectedRouteMiddleware} = require("../Middleware/ProtectedRouteMiddleware");

const {
    joinActivityHandler,
    leaveActivityHandler,
    getMyParticipationHandler,
    getActivityParticipantsHandler
} = require("../Controllers/ParticipationController");

participationRouter
    .post("/:activityId/join", protectedRouteMiddleware, joinActivityHandler)
    .patch("/:activityId/leave", protectedRouteMiddleware, leaveActivityHandler)
    .get("/my-participations", protectedRouteMiddleware, getMyParticipationHandler)
    .get("/:activityId/participants", protectedRouteMiddleware, getActivityParticipantsHandler)

module.exports = participationRouter