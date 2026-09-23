const mongoose = require("mongoose");

const activitySchemaRules = {
    title: {
        type: String,
        required: [true, "Title is required"],
        trim: true,
        minlength: [4, "Title must be at least 3 characters"],
        maxlength: [100, "Title cannot exceed 100 characters"]
    },
    description:{
        type: String,
        required: [true, "Description is required"],
        trim: true,
        minlength: [10, "Description must be at least 10 characters"],
        maxlength: [1000, "Description cannot exceed 1000 characters"]
        },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Activity creator is required"]
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
    activityDate:{
        type: Date,
        required: [true, "Activity date is required"]
    },
    activityDuration: {
        type: Number,
        required: [true, "Activity duration is required"],
        min: [30, "Activity duration must be at least 30 minutes"],
        max: [180, "Activity duration cannot exceed 3 hours"]
    },
    registrationDeadline: {
        type: Date,
        required: [true, "Registration deadline is required"]
    },
    maxParticipants:{
        type: Number,
        required:[true, "Number of participants is required"],
        min: [2, "An activity must allow at least 2 participants"]
        // default: 5
    },
    status:{
        type: String,
        enum: ["active", "closed", "completed", "cancelled"],
        default: "active"
    },
    closureReason: {
        type: String,
        enum: ["manual", "full","registration_time_expired"],
        default: null
    }
}

const activitySchema = new mongoose.Schema(activitySchemaRules, {timestamps: true});
// Geospatial index for location-based queries
activitySchema.index({ location: "2dsphere" });

const activityModel = mongoose.model("Activity", activitySchema);

module.exports = activityModel; 