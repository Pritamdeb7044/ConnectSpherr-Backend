const mongoose = require("mongoose");

const rewardRedemptionSchemaRules = {

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "User is required"],
        index: true
    },

    rewardId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reward",
        required: [true, "Reward is required"],
        index: true
    },

    // Snapshot of reward information at redemption time.
    // This protects historical records if the Reward document
    // is modified later.

    rewardTitle: {
        type: String,
        required: [true, "Reward title is required"],
        trim: true
    },

    pointsSpent: {
        type: Number,
        required: [true, "Points spent is required"],
        min: [1, "Points spent must be at least 1"],
        validate: {
            validator: Number.isInteger,
            message: "Points spent must be an integer"
        }
    },

    voucherValue: {
        type: Number,
        required: [true, "Voucher value is required"],
        min: [0, "Voucher value cannot be negative"]
    },

    voucherProvider: {
        type: String,
        required: [true, "Voucher provider is required"],
        trim: true
    },

    voucherCode: {
        type: String,
        trim: true,
        default: null
    },

    status: {
        type: String,
        enum: {
            values: ["pending", "completed", "cancelled"],
            message: "Invalid redemption status"
        },
        default: "completed"
    },

    redeemedAt: {
        type: Date,
        default: Date.now,
        immutable: true
    }
};

const rewardRedemptionSchema = new mongoose.Schema(
    rewardRedemptionSchemaRules,
    {
        versionKey: false
    }
);


// Main query:
// user's redemption history, newest first.
rewardRedemptionSchema.index({
    userId: 1,
    redeemedAt: -1
});


// Useful for reward-specific redemption queries.
rewardRedemptionSchema.index({
    rewardId: 1,
    redeemedAt: -1
});


// Useful for status-based queries.
rewardRedemptionSchema.index({
    status: 1,
    redeemedAt: -1
});


const rewardRedemptionModel = mongoose.model(
    "RewardRedemption",
    rewardRedemptionSchema
);

module.exports = rewardRedemptionModel;