const mongoose = require("mongoose");
const UserModel = require("../Models/UserModel");

async function getMyProfileHandler(req, res){
    try {
        //Validate authenticated user
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }

        const userId = req.user._id;
        //Validate user ID
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }

        //Fetch latest user data
        const user = await UserModel.findById(userId)
            .select("_id name email points createdAt updatedAt")
            .lean();

        //Handle deleted/non-existent user
        if(!user){
            return res.status(401).json({
                message: "User no longer exists",
                status: "Failure"
            });
        }

        //Validate critical user data
        if (typeof user.name !== "string" || typeof user.email !== "string" || !Number.isInteger(user.points) || user.points < 0){
            console.error("Invalid user profile data detected:",user._id);

            return res.status(500).json({
                message: "Invalid user profile data",
                status: "Failure"
            });
        }

        //Return profile
        return res.status(200).json({
            message: "Profile fetched successfully",
            status: "Success",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                points: user.points,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });

    }catch(error){
        console.error("getMyProfileHandler error:", error);

        return res.status(500).json({
            message: "Internal server error",
            status: "Failure"
        });
    }
};


async function updateMyProfileHandler(req, res){
    try {
        //Validate authenticated user
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }

        const userId = req.user._id;
        //Validate user ID
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }

        //Validate request body
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)){
            return res.status(400).json({
                message: "Request body must be a valid object",
                status: "Failure"
            });
        }

        // 4. Validate allowed fields
        const allowedFields = ["name"];

        const receivedFields = Object.keys(req.body);

        const invalidFields = receivedFields.filter(
            (field) => !allowedFields.includes(field)
        );

        if (invalidFields.length > 0) {
            return res.status(400).json({
                message: `The following fields cannot be updated: ${invalidFields.join(", ")}`,
                status: "Failure",
                invalidFields
            });
        }

        //Ensure at least one field is provided
        if (receivedFields.length === 0) {
            return res.status(400).json({
                message: "At least one profile field is required",
                status: "Failure"
            });
        }

        //Validate name
        let normalizedName;

        if(Object.prototype.hasOwnProperty.call(req.body, "name")){
            if (typeof req.body.name !== "string") {
                return res.status(400).json({
                    message: "Name must be a string",
                    status: "Failure"
                });
            }

            normalizedName = req.body.name.trim();

            if (normalizedName.length === 0) {
                return res.status(400).json({
                    message: "Name cannot be empty",
                    status: "Failure"
                });
            }

            if (normalizedName.length < 2) {
                return res.status(400).json({
                    message: "Name must be at least 2 characters",
                    status: "Failure"
                });
            }

            if (normalizedName.length > 100) {
                return res.status(400).json({
                    message: "Name cannot exceed 100 characters",
                    status: "Failure"
                });
            }
        }

        //Build update object
        const updateData = {};

        if (normalizedName !== undefined) {
            updateData.name = normalizedName;
        }

        //Update user
        const updatedUser = await UserModel.findByIdAndUpdate(
            userId,
            {
                $set: updateData
            },
            {
                new: true,
                runValidators: true
            }
        )
            .select("_id name email points createdAt updatedAt")
            .lean();

        //Handle deleted/non-existent user
        if(!updatedUser){
            return res.status(404).json({
                message: "User not found",
                status: "Failure"
            });
        }

        //Return updated profile
        return res.status(200).json({
            message: "Profile updated successfully",
            status: "Success",
            data: {
                id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                points: updatedUser.points,
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt
            }
        });

    }catch(error){
        console.error("updateMyProfileHandler error:", error);

        //Handle Mongoose validation errors
        if (error.name === "ValidationError") {
            const validationErrors = {};

            for (const field in error.errors) {
                validationErrors[field] = error.errors[field].message;
            }

            return res.status(400).json({
                message: "Profile validation failed",
                status: "Failure",
                errors: validationErrors
            });
        }

        //Handle unexpected errors
        return res.status(500).json({
            message: "Internal server error",
            status: "Failure"
        });
    }
};
module.exports = {
    getMyProfileHandler,
    updateMyProfileHandler
};