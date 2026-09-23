// notificationModel.js

const mongoose = require("mongoose");


const notificationSchemaRules = {
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Notification recipient is required"],
        index: true
    },
    /*
        senderId represents the user who caused the notification.
        Example:
        User A creates an activity
                ↓
        User B receives notification
        recipientId = User B
        senderId    = User A
        For system-generated notifications, senderId can be null.
    */
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
    },
    /*
        activityId connects the notification to an activity.
        It is nullable because not every notification
        will be related to an activity.

        Example:
        NEARBY_ACTIVITY      → activityId required
        ACTIVITY_JOINED      → activityId required
        ACTIVITY_COMPLETED   → activityId required
        REWARD_EARNED        → activityId null
        REWARD_REDEEMED      → activityId null
        GENERAL              → activityId null
    */
    activityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Activity",
        default: null,
        index: true
    },
    type: {
        type: String,
        enum: {
            values: [
                "NEARBY_ACTIVITY",
                "ACTIVITY_JOINED",
                "ACTIVITY_COMPLETED",
                "REWARD_EARNED",
                "REWARD_REDEEMED",
                "GENERAL"
            ],
            message: "Invalid notification type"
        },
        required: [true, "Notification type is required"],
        index: true
    },
    title: {
        type: String,
        required: [true, "Notification title is required"],
        trim: true,
        minlength: [3, "Notification title must be at least 3 characters"],
        maxlength: [150, "Notification title cannot exceed 150 characters"]
    },
    message: {
        type: String,
        required: [true, "Notification message is required"],
        trim: true,
        minlength: [3, "Notification message must be at least 3 characters"],
        maxlength: [500, "Notification message cannot exceed 500 characters"]
    },
    createdAt: {
        type: Date,
        default: Date.now,
        immutable: true
    },
    updatedAt: {
        type: Date,
        default: null
    }
};

const notificationSchema = new mongoose.Schema(
    notificationSchemaRules,
    {
        versionKey: false
    }
);
/*
    Used when retrieving a user's notifications.

    Example:

    GET /api/notification

    Find notifications belonging to a user
    and return newest notifications first.
*/

notificationSchema.index({
    recipientId: 1,
    createdAt: -1
});

/*
    Used for unread notification queries.

    Example:

    GET /api/notification/unread
*/

notificationSchema.index({
    recipientId: 1,
    isRead: 1,
    createdAt: -1
});


/*
    Useful when retrieving notifications related
    to a particular activity.
*/

notificationSchema.index({
    activityId: 1,
    createdAt: -1
});

const notificationModel = mongoose.model(
    "Notification",
    notificationSchema
);


module.exports = notificationModel;