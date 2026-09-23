const UserModel = require("../Models/UserModel");

const jwt = require("jsonwebtoken");
const util = require("util");
const bcrypt = require("bcrypt");
const {mailSender} = require("./EmailSender");


const promisify = util.promisify;
const promisifiedJWTsign = promisify(jwt.sign);


function checkPasswordCharacters(password) {
    return {
        hasSpecialCharacter: /[^a-zA-Z0-9]/.test(password),
        hasUnicodeCharacter: /[^\x00-\x7F]/.test(password)
    };
}

async function signupHandler(req, res){
    //create the user
    try{
        const userObject = req.body;
        //1. user -> get data, check mail and password
        if(!userObject.name || !userObject.email || !userObject.password || !userObject.confirmPassword){
            return res.status(400).json({
                "message": "required data is missing",
                status: "failure",
            })
        }

        //2. Check for valid email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const normalizedEmail = userObject.email.trim().toLowerCase();

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Please provide a valid email address",
                success: false
            });
        }

        //3. Check whether password is valid and passwords match BEFORE hashing

        //password should be atleast or greater that 8 characters and less than 128 characters
        if(userObject.password.length < 8 && userObject.password.length > 72){
            return res.status(400).json({
                message: "Invalid password length",
                status: "Failure"
            })
        }
        //check for white spaces
        if (/\s/.test(userObject.password)) {
            return res.status(400).json({
                success: false,
                message: "Password cannot contain spaces"
            });
        }
        //check for special and unicode characters
        if(!checkPasswordCharacters(userObject.password)){
            return res.status(400).json({
                message:"Invalid password",
                status:"failure"
            })
        }

        if (userObject.password.trim() !== userObject.confirmPassword.trim()) {
            return res.status(400).json({
                message: "Password and confirm password do not match",
                status: "failure"
            });
        }

        //4. check mail -> if exist then already existing user
        const user = await UserModel.findOne({
            email: userObject.email
        })
        if(user){
            return res.status(400).json({
                "message": "existing user",
                status: "failure"
            })
        }
        
        const userPassword = userObject.password;

        const salt = bcrypt.genSaltSync(10); //Larger the salt size greater the seacurity and slower the function
        const hash = await bcrypt.hash(userPassword, salt);
        //Update the user password
        userObject.password = hash;
        const newUser = await UserModel.create(userObject);

        const userResponse = {
            _id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            points: newUser.points,
            createdAt: newUser.createdAt,
            updatedAt: newUser.updatedAt
        }

        res.status(201).json({
            message:"user signup successful",
            user: userResponse,
            status: "success"
        })

    } catch(err){
        console.log("err", err);
        //Check for duplicate key error -> future
        res.status(500).json({
            message: err.message,
            status: "failure"
        })
    }
}

async function loginHandler(req, res){
    try{
        const { email, password} = req.body;

        // Check whether fields exist
        if (email === undefined || password === undefined) {
            return res.status(400).json({
                message: "Email and password are required",
                status: "Failed"
            });
        }

        // Check empty / whitespace-only values
        if (email.trim() === "" || password.trim() === "") {
            return res.status(400).json({
                message: "Email and password cannot be empty",
                status: "Failed"
            });
        }

        //email normalization
        const normalizedEmail = email.trim().toLowerCase();

        //check email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Invalid email format",
                status: "Failed"
            });
        }

        //Find user by email
        const user = await UserModel.findOne({
            email : normalizedEmail
        });

        if(!user){
            return res.status(401).json({
                message: "Invalid email or password",
                status: "Failed"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch){
            return res.status(401).json({
                message: "Invalid email or password",
                status: "Failed",
            });
        }

        const authToken = await promisifiedJWTsign(
            { id: user["_id"] },
            process.env.SECRET_KEY
        );

        res.cookie("jwt", authToken, {
            maxAge: 1000 * 60 * 60 * 24,
            httpOnly: true, //it can only be accessed by the server.
            secure: true, //only transfer data via https
        });
        res.status(200).json({
            message: "login successfully",
            status: "success",
            user: user,
        });
    } catch(err){
        console.log("err", err);
        res.status(500).json({
            message: "Required data missing",
            status: "Failed",
        });
    }
}

async function logoutHandler(req, res) {
    try{
        const token = res.cookies.jwt;

        // Case 1: No cookie / already logged out / empty cookie
        if(!token || token.trim() === ""){
            // Clear the cookie anyway
            res.clearCookie('jwt', {path : "/"});

            return res.status(200).json({
                message: "User is already logged out",
                status: "success"
            });
        }

         // Case 2:
        // Cookie exists. We don't need to verify the JWT here.
        // Simply remove it from the browser.
        res.clearCookie('jwt', {path : "/"});
        res.json({
            message: "logout successful",
            status: "success"
        })
    } catch(err){
        console.log("Err", err);
        res.status(500).json({
            message: err.message,
            status: "failure"
        })
    }
}

const otpGenerator = function(){
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function forgetPasswordHandler(req, res) {
    try{
        const userObject = req.body;

        //1. Email is present or not.
        if(!userObject.email){
            return res.status(400).json({
                message: "email is required",
                status: "failure"
            })
        }

        //2. Email must be a string
        if (typeof userObject.email !== "string") {
            return res.status(400).json({
                message: "Email must be a string",
                status: "Failed"
            });
        }

        //3. Empty / whitespace-only email
        if (userObject.email.trim() === "") {
            return res.status(400).json({
                message: "Email cannot be empty",
                status: "Failed"
            });
        }

        //4. Check for valid email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const normalizedEmail = userObject.email.trim().toLowerCase();

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Please provide a valid email address",
                success: false
            });
        }

        const user = await UserModel.findOne({
            email : normalizedEmail
        })

        if(!user){
            return res.status(400).json({
                status: "Failure",
                message: "User doesn't exist"
            })
        }

        const otp = otpGenerator(); //generating the opt
        if (!otp) {
            return res.status(500).json({
                message: "Failed to generate OTP",
                status: "Failed"
            });
        }

        if (otp.length !== 6) {
            return res.status(500).json({
                message: "Invalid OTP generated",
                status: "Failed"
            });
        }

        // if(Date.now() < user.otpExpiry){
        //     return res.status(429).json({
        //         message:"Please wait before requesting another OTP",
        //         status: "Failed"
        //     });
        // }
        //update the otp data in the usermodel fro future reference
        user.otp = otp;
        user.otpExpiry = Date.now() + 80 * 60 * 1000;

        await user.save({validateBeforeSave : false});
        try{

            await mailSender(otp, userObject.email);

        } catch(error){
            console.error("Password reset email failed.", error.message);

            return res.status(500).json({
                message: "Unable to send OTP. Please try again later.",
                status: "Failed"
            });
        }

        res.status(200).json({
          status: "success",
          message: "otp send sucessfully",
          resetURL: `http://localhost:3000/api/auth/resetPassword/${user["_id"]}`,
        });

    } catch(err){
        console.log("err", err);
        
        res.status(500).json({
            message: err.message,
            status: "failure"
        })
    }
}

async function resetPasswordHandler(req, res){
    try{
        const userObject = req.body;

        if(!userObject.password || !userObject.confirmPassword || userObject.password !== userObject.confirmPassword || !userObject.otp ){
            return res.status(401).json({
                message: "Invalid request",
                status: "Failure"
            })
        }

        if (userObject.email.trim() === "" ||userObject.otp.trim() === "" ||userObject.newPassword.trim() === "" ||userObject.confirmPassword.trim() === ""
        ) {
            return res.status(400).json({
                message: "Fields cannot be empty or contain only whitespace",
                status: "Failed"
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const normalizedEmail = userObject.email.trim().toLowerCase();

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                message: "Please provide a valid email address",
                success: false
            });
        }

        const userId = req.params.userId;
        const user = await UserModel.findById(userId);

        if(!user){
            return res.status(401).json({
                message: "Not a valid user",
                status: "Failure"
            })
        }

        if(user.otp == undefined){
            return res.status(401).json({
                message: "unauthorized access",
                status: "Failure"
            })
        }

        if(Date.now() > user.otpExpiry){
            return res.status(401).json({
                message: "otp expired",
                status: "failure",
            });
        }

        if(user.otp !== userObject.otp){
            return res.status(401).json({
                message: "invalid otp",
                status: "failure",
            });
        }

        const newPassword = userObject.password;
        const salt = bcrypt.genSaltSync(10); //Larger the salt size greater the seacurity and slower the function
        const hash = await bcrypt.hash(newPassword, salt);

        user.password = hash;
        user.otp = undefined;
        user.otpExpiry = undefined;

        await user.save();

        return res.status(200).json({
            message: "password reset successfully",
            status: "success"
        })

    }catch(err){
        console.log("err", err);
        res.status(500).json({
            message: err.message,
            status: "Failure"
        })
    }
}

module.exports = {
    signupHandler,
    loginHandler,
    logoutHandler,
    forgetPasswordHandler,
    resetPasswordHandler
}