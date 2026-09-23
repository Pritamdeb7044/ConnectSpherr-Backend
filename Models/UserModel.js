const mongoose = require("mongoose");

const userSchemaRules = {
    name: {
        type: String,
        required: [true, "name is required"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: [true, "Email should be unique"],
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: [true, "Password is required"],
        minLength: 8,
    },
    location: {
        type: {
            type: String,
            enum: ["Point"],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },
    points:{
        type: Number,
        default: 0
    },
    createdAt:{
        type: Date,
        default: Date.now
    },
    updatedAt:{
        type: Date,
        default: null
    },
    lastNotificationSeenAt: {
        type: Date,
        default: null
    },
    otp: String,
    otpExpiry: Date,
}

const userSchema = new mongoose.Schema(userSchemaRules);
userSchema.index({ location: "2dsphere" });

const userModel = mongoose.model("User", userSchema);

module.exports = userModel;