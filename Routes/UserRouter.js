const express = require("express");

const userRouter = express.Router();

const {
    getMyProfileHandler,
    updateMyProfileHandler
} = require("../Controllers/UserController");

const {protectedRouteMiddleware} = require("../Middleware/ProtectedRouteMiddleware");

userRouter.get("/profile", protectedRouteMiddleware, getMyProfileHandler);
userRouter.patch("/profile", protectedRouteMiddleware, updateMyProfileHandler);

module.exports = userRouter;