const express = require("express");

const dashboardRouter = express.Router();

const {protectedRouteMiddleware} = require("../Middleware/ProtectedRouteMiddleware");

const {
    getDashboardHandler
} = require("../Controllers/DashboardController");


dashboardRouter
    .get("/",protectedRouteMiddleware, getDashboardHandler);


module.exports = dashboardRouter;