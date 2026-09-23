const dotenv = require("dotenv")
dotenv.config();

const UserModel = require("../Models/UserModel");
const jwt = require("jsonwebtoken");

const util = require("util");
const promisify = util.promisify;
const promisifiedJWTverify = promisify(jwt.verify);

async function protectedRouteMiddleware(req, res, next){
    try{
        const token = req.cookies?.jwt;
        if(!token){
            return res. status(401).json({
                "message": "Unauthorized access",
                status: "Failure"
            })
        }

        const decryptedToken = await promisifiedJWTverify(token, process.env.SECRET_KEY);

        const user = await UserModel.findById(decryptedToken.id);

        if (!user) {
            return res.status(401).json({
                message: "User no longer exists",
                status: "Failure"
            });
        }

        req.user = user;

        next();
    } catch(err){
        console.log("err", err);
        res.status(500).json({
            message: "Internal server error.",
            status: "Failure",
        });
    }
}

module.exports = {
    protectedRouteMiddleware
}