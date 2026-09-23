// rewardModel.js
const mongoose = require("mongoose");

const rewardSchemaRules = {
    title: {
        type: String,
        required: [true, "Reward title is required"],
        trim: true,
        minlength: [3, "Reward title must be at least 3 characters"],
        maxlength: [100, "Reward title cannot exceed 100 characters"]
    },

    description: {
        type: String,
        required: [true, "Reward description is required"],
        trim: true,
        minlength: [10, "Reward description must be at least 10 characters"],
        maxlength: [1000, "Reward description cannot exceed 1000 characters"]
    },

    pointsRequired: {
        type: Number,
        required: [true, "Points required for redemption is required"],
        min: [1, "Points required must be at least 1"],
        validate: {
            validator: Number.isInteger,
            message: "Points required must be an integer"
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
        trim: true,
        minlength: [2, "Voucher provider must be at least 2 characters"],
        maxlength: [100, "Voucher provider cannot exceed 100 characters"]
    },

    stock: {
        type: Number,
        required: [true, "Reward stock is required"],
        min: [0, "Reward stock cannot be negative"],
        validate: {
            validator: Number.isInteger,
            message: "Reward stock must be an integer"
        },
        default: 0
    },

    expiryDate: {
        type: Date,
        default: null,
        validate: {
            validator: function (value) {
                return value === null || value instanceof Date;
            },
            message: "Expiry date must be a valid date or null"
        }
    },

    status: {
        type: String,
        enum: {
            values: ["active", "inactive", "out_of_stock"],
            message: "Invalid reward status"
        },
        default: "active"
    }
};

const rewardSchema = new mongoose.Schema(
    rewardSchemaRules,
    {
        timestamps: true,
        versionKey: false
    }
);

// Automatically mark reward as out_of_stock
// when stock becomes zero.
rewardSchema.pre("save", function () {

    if (this.stock === 0 && this.status === "active") {
        this.status = "out_of_stock";
    }

    if (this.stock > 0 && this.status === "out_of_stock") {
        this.status = "active";
    }
});

// Useful indexes
rewardSchema.index({
    status: 1,
    expiryDate: 1
});

rewardSchema.index({
    voucherProvider: 1
});

const rewardModel = mongoose.model("Reward", rewardSchema);

module.exports = rewardModel;

//Sampl evoucher will look like
/***
 * ₹100 Amazon Voucher
 * -------------------------
 * pointsRequired: 500
 * voucherValue: 100
 * voucherProvider: Amazon
 * stock: 50
 * status: active
 * 
 */