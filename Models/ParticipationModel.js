const mongoose = require("mongoose");

const participationSchemaRules = {
    userId: {
        //fetch user detail from user model -> userId
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "User is required"]
    },
    activityId: {
        //fetch activity detail from activity model -> activityId
        type: mongoose.Schema.Types.ObjectId,
        ref: "Activity",
        required: [true, "Activity is required"]
    },
    status: {
        //Here two things can be possible either activuty is active or completed
        type: String,
        enum: ["joined", "completed", "cancelled"],
        default: "joined"
    },
    joinedAt:{
        type: Date,
        required: [true, "Joined time is required"]
    },
    completedAt:{
        type: Date
    },
    pointsAwarded: {
        type: Number,
        min: [0, "Points awarded cannot be negative"],
    }
}

const participationSchema = new mongoose.Schema(participationSchemaRules);

participationSchema.index(
    { userId: 1, activityId: 1 },
    { unique: true }
);

const participationModel = mongoose.model("Participation", participationSchema);
module.exports = participationModel;