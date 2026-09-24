const UserModel = require("../Models/UserModel");

const jwt = require("jsonwebtoken");
const util = require("util");
const bcrypt = require("bcrypt");
const {mailSender} = require("./EmailSender");
const { verify } = require("crypto");


const promisify = util.promisify;
const promisifiedJWTsign = promisify(jwt.sign);


function checkPasswordCharacters(password) {
    return {
        hasSpecialCharacter: /[^a-zA-Z0-9]/.test(password),
        hasUnicodeCharacter: /[^\x00-\x7F]/.test(password)
    };
}

const getMeHandler = async (req, res) => {
    try {
        // User ID is attached by protectedRouteMiddleware
        const userId = req.user._id;

        const user = await UserModel.findById(userId)
            .select("name email points location createdAt")
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "User details fetched successfully.",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                points: user.points || 0,
                location: user.location,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error("Get Me Handler Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch user details."
        });
    }
};

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
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true, //it can only be accessed by the server.
            secure: true, //only transfer data via https
            sameSite: "none"
        });
        res.status(200).json({
            message: "login successfully",
            status: "success",
            user: user,
        });
    } catch(err){
        console.error("Login catch error:", err);
        res.status(500).json({
            message: err.message || "Login failed",
            status: "Failed",
        }
    );
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

async function forgotPasswordHandler(req, res) {
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

async function verifyOtpHandler(req, res) {
  try {
    const { email, otp } = req.body;

    // 1. Validate presence
    if (!email || !otp) {
      return res.status(400).json({
        status: "Failure",
        message: "Email and OTP are required.",
      });
    }

    if (typeof email !== "string" || typeof otp !== "string") {
      return res.status(400).json({
        status: "Failure",
        message: "Email and OTP must be strings.",
      });
    }

    const trimmedOtp = otp.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (trimmedOtp.length !== 6) {
      return res.status(400).json({
        status: "Failure",
        message: "OTP must be a 6-digit code.",
      });
    }

    // 2. Find user
    const user = await UserModel.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        status: "Failure",
        message: "No user found with this email.",
      });
    }

    // 3. Verify OTP exists
    if (!user.otp) {
      return res.status(400).json({
        status: "Failure",
        message: "No OTP was requested for this user.",
      });
    }

    // 4. Check expiration
    if (Date.now() > user.otpExpiry) {
      return res.status(400).json({
        status: "Failure",
        message: "OTP has expired. Please request a new one.",
      });
    }

    // 5. Check match (cast both to string to avoid type mismatches)
    if (String(user.otp).trim() !== trimmedOtp) {
      return res.status(400).json({
        status: "Failure",
        message: "Invalid OTP. Please check the code and try again.",
      });
    }

    // Mark as verified for the subsequent password reset step
    user.isOtpVerified = true;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      status: "success",
      message: "OTP verified successfully.",
      userId: user._id,
    });
  } catch (err) {
    console.error("verifyOtpHandler error:", err);
    return res.status(500).json({
      status: "Failure",
      message: err.message || "Internal server error during OTP verification.",
    });
  }
}

async function resetPasswordHandler(req, res) {
  try {
    const { userId } = req.params;
    const { password, confirmPassword } = req.body;

    // 1. Validate required fields
    if (!password || !confirmPassword) {
      return res.status(400).json({
        status: "Failure",
        message: "Password and Confirm Password are required.",
      });
    }

    if (typeof password !== "string" || typeof confirmPassword !== "string") {
      return res.status(400).json({
        status: "Failure",
        message: "Passwords must be strings.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: "Failure",
        message: "Password must be at least 8 characters long.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        status: "Failure",
        message: "Passwords do not match.",
      });
    }

    // 2. Find user
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: "Failure",
        message: "User not found or invalid user ID.",
      });
    }

    // 3. Ensure OTP was verified and not expired
    if (!user.isOtpVerified && !user.otp) {
      return res.status(401).json({
        status: "Failure",
        message: "Unauthorized request. Please verify OTP first.",
      });
    }

    if (user.otpExpiry && Date.now() > user.otpExpiry) {
      return res.status(401).json({
        status: "Failure",
        message: "Session expired. Please request a new OTP.",
      });
    }

    // 4. Hash and update password
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    user.password = hash;
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.isOtpVerified = undefined;

    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      status: "success",
      message: "Password has been reset successfully.",
    });
  } catch (err) {
    console.error("resetPasswordHandler error:", err);
    return res.status(500).json({
      status: "Failure",
      message: err.message || "Failed to reset password.",
    });
  }
}

module.exports = {
    signupHandler,
    loginHandler,
    logoutHandler,
    forgotPasswordHandler,
    verifyOtpHandler,
    resetPasswordHandler,
    getMeHandler
}