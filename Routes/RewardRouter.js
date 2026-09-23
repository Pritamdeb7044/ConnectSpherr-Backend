const express = require("express");
const rewardRouter = express.Router();

const {protectedRouteMiddleware} = require("../Middleware/ProtectedRouteMiddleware")

const {
    getAllRewardHandler,
    getRewardHandler,
    getMyPointsHandler,
    getMyPointsHistoryHandler,
    redeemRewardHandler,
    getMyRedemptionsHandler,
    getMyRedemptionHandler,
    createRewardHandler
} = require("../Controllers/RewardController")


rewardRouter
    .post("/create", protectedRouteMiddleware, createRewardHandler)
    .get("/",protectedRouteMiddleware, getAllRewardHandler)
    .get("/points",protectedRouteMiddleware, getMyPointsHandler)
    .get("/points/history",protectedRouteMiddleware, getMyPointsHistoryHandler)
    .get("/my-redemptions", protectedRouteMiddleware, getMyRedemptionsHandler)
    .get("/redemption/:redemptionId", protectedRouteMiddleware, getMyRedemptionHandler)
    .get("/:rewardId",protectedRouteMiddleware, getRewardHandler)
    .post("/:rewardId/redeem",protectedRouteMiddleware, redeemRewardHandler)

module.exports = rewardRouter