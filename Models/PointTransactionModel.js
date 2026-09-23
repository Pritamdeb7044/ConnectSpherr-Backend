const mongoose = require("mongoose");

const pointTransactionSchemaRules = {

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "User is required"],
        index: true
    },

    type: {
        type: String,
        enum: {
            values: ["earned", "spent"],
            message: "Transaction type must be either earned or spent"
        },
        required: [true, "Transaction type is required"]
    },

    points: {
        type: Number,
        required: [true, "Points are required"],
        min: [1, "Points must be greater than 0"],
        validate: {
            validator: Number.isInteger,
            message: "Points must be an integer"
        }
    },

    balanceAfter: {
        type: Number,
        required: [true, "Balance after transaction is required"],
        min: [0, "Balance cannot be negative"],
        validate: {
            validator: Number.isInteger,
            message: "Balance must be an integer"
        }
    },

    activityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Activity",
        default: null
    },

    rewardId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reward",
        default: null
    },

    redemptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RewardRedemption",
        default: null
    },

    description: {
        type: String,
        required: [true, "Transaction description is required"],
        trim: true,
        maxlength: [500, "Description cannot exceed 500 characters"]
    },

    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true
    }
};

const pointTransactionSchema = new mongoose.Schema(
    pointTransactionSchemaRules,
    {
        versionKey: false
    }
);


// Main query pattern:
// Get one user's transactions,
// newest transaction first.
pointTransactionSchema.index({
    userId: 1,
    createdAt: -1
});


// Useful for activity-related point queries.
pointTransactionSchema.index({
    activityId: 1
});


// Useful for reward/redemption-related queries.
pointTransactionSchema.index({
    rewardId: 1
});

pointTransactionSchema.index({
    redemptionId: 1
});


const pointTransactionModel = mongoose.model(
    "PointTransaction",
    pointTransactionSchema
);

module.exports = pointTransactionModel;