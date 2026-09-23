const mongoose = require("mongoose");

const NotificationModel = require("../Models/NotificationModel");
const UserModel = require("../Models/UserModel");


// ============================================================
// Helper: Validate ObjectId
// ============================================================

const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};


// ============================================================
// Helper: Create notifications in bulk
// ============================================================

const createNotificationsInBulk = async (notifications) => {

    if (!Array.isArray(notifications)) {
        throw new Error("Notifications must be provided as an array");
    }

    if (notifications.length === 0) {
        return [];
    }

    for (const notification of notifications) {

        if (
            !notification.recipientId ||
            !isValidObjectId(notification.recipientId)
        ) {
            throw new Error("Invalid notification recipient");
        }

        if (
            notification.senderId &&
            !isValidObjectId(notification.senderId)
        ) {
            throw new Error("Invalid notification sender");
        }

        if (
            notification.activityId &&
            !isValidObjectId(notification.activityId)
        ) {
            throw new Error("Invalid notification activity");
        }

        if (!notification.type) {
            throw new Error("Notification type is required");
        }

        if (!notification.title) {
            throw new Error("Notification title is required");
        }

        if (!notification.message) {
            throw new Error("Notification message is required");
        }
    }

    return await NotificationModel.insertMany(
        notifications,
        {
            ordered: false
        }
    );
};


// ============================================================
// 1. Nearby Activity Notifications
// ============================================================

const createNearbyActivityNotifications = async ({
    activity,
    creatorId
}) => {

    // --------------------------------------------------------
    // Validate activity
    // --------------------------------------------------------

    if (!activity || !activity._id) {
        throw new Error("Valid activity is required");
    }

    if (!activity.location) {
        throw new Error("Activity location is required");
    }

    if (activity.location.type !== "Point") {
        throw new Error("Activity location must be a GeoJSON Point");
    }

    if (
        !Array.isArray(activity.location.coordinates) ||
        activity.location.coordinates.length !== 2
    ) {
        throw new Error(
            "Activity location must contain longitude and latitude"
        );
    }

    const [longitude, latitude] = activity.location.coordinates;

    if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude)
    ) {
        throw new Error(
            "Activity coordinates must contain valid numbers"
        );
    }

    if (
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
    ) {
        throw new Error("Invalid activity coordinates");
    }


    // --------------------------------------------------------
    // Validate creator
    // --------------------------------------------------------

    if (!creatorId || !isValidObjectId(creatorId)) {
        throw new Error("Invalid activity creator");
    }


    // --------------------------------------------------------
    // Find users within 500 meters
    // --------------------------------------------------------

    const nearbyUsers = await UserModel.find({
        _id: {
            $ne: creatorId
        },
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [
                        longitude,
                        latitude
                    ]
                },
                $maxDistance: 500
            }
        }
    })
        .select("_id name")
        .lean();


    // --------------------------------------------------------
    // No nearby users
    // --------------------------------------------------------

    if (nearbyUsers.length === 0) {

        return {
            notificationsCreated: 0,
            nearbyUsersFound: 0
        };
    }


    // --------------------------------------------------------
    // Prepare notifications
    // --------------------------------------------------------

    const notifications = nearbyUsers.map((user) => {

        return {
            recipientId: user._id,
            senderId: creatorId,
            activityId: activity._id,
            type: "NEARBY_ACTIVITY",

            title: "New activity nearby",

            message:
                `"${activity.title}" is happening near you.`
        };
    });


    // --------------------------------------------------------
    // Create notifications
    // --------------------------------------------------------

    const createdNotifications =
        await createNotificationsInBulk(notifications);


    return {
        notificationsCreated: createdNotifications.length,
        nearbyUsersFound: nearbyUsers.length
    };
};


// ============================================================
// 2. Activity Joined Notification
// ============================================================

const createActivityJoinedNotification = async ({
    activity,
    joiningUser
}) => {

    // --------------------------------------------------------
    // Validate activity
    // --------------------------------------------------------

    if (!activity || !activity._id) {
        throw new Error("Valid activity is required");
    }

    if (!activity.createdBy) {
        throw new Error("Activity creator is required");
    }

    if (!activity.title) {
        throw new Error("Activity title is required");
    }


    // --------------------------------------------------------
    // Validate joining user
    // --------------------------------------------------------

    if (!joiningUser || !joiningUser._id) {
        throw new Error("Valid joining user is required");
    }

    if (!joiningUser.name) {
        throw new Error("Joining user name is required");
    }


    if (!isValidObjectId(activity.createdBy)) {
        throw new Error("Invalid activity creator");
    }

    if (!isValidObjectId(joiningUser._id)) {
        throw new Error("Invalid joining user");
    }


    // --------------------------------------------------------
    // Creator cannot receive notification about themselves
    // --------------------------------------------------------

    if (
        activity.createdBy.toString() ===
        joiningUser._id.toString()
    ) {

        return {
            notificationCreated: false,
            reason: "Activity creator cannot notify themselves"
        };
    }


    // --------------------------------------------------------
    // Create notification
    // --------------------------------------------------------

    const notification = await NotificationModel.create({

        recipientId: activity.createdBy,

        senderId: joiningUser._id,

        activityId: activity._id,

        type: "ACTIVITY_JOINED",

        title: "New participant joined",

        message:
            `${joiningUser.name} joined your activity "${activity.title}".`
    });


    return {
        notificationCreated: true,
        notification
    };
};


// ============================================================
// 3. Activity Completed Notifications
// ============================================================

const createActivityCompletedNotifications = async ({
    activity,
    participants
}) => {

    // --------------------------------------------------------
    // Validate activity
    // --------------------------------------------------------

    if (!activity || !activity._id) {
        throw new Error("Valid activity is required");
    }

    if (!activity.title) {
        throw new Error("Activity title is required");
    }

    if (
        !activity.createdBy ||
        !isValidObjectId(activity.createdBy)
    ) {
        throw new Error("Invalid activity creator");
    }


    // --------------------------------------------------------
    // Validate participants array
    // --------------------------------------------------------

    if (!Array.isArray(participants)) {
        throw new Error("Participants must be provided as an array");
    }


    if (participants.length === 0) {

        return {
            notificationsCreated: 0
        };
    }


    // --------------------------------------------------------
    // Extract participant user IDs
    //
    // Supports:
    //
    // 1. ObjectId
    // 2. String ObjectId
    // 3. Participation document
    // 4. Plain object containing userId
    // --------------------------------------------------------

    const participantIds = [];

    for (const participant of participants) {

        let participantId = null;


        // Participation document/object
        if (
            participant &&
            typeof participant === "object" &&
            participant.userId
        ) {
            participantId = participant.userId;
        }

        // ObjectId/string
        else {
            participantId = participant;
        }


        // ----------------------------------------------------
        // Validate participant ID
        // ----------------------------------------------------

        if (
            !participantId ||
            !isValidObjectId(participantId)
        ) {
            throw new Error(
                "Invalid participant user ID"
            );
        }


        // ----------------------------------------------------
        // Creator should NEVER receive completion notification
        // ----------------------------------------------------

        if (
            participantId.toString() ===
            activity.createdBy.toString()
        ) {
            continue;
        }


        // ----------------------------------------------------
        // Avoid duplicate recipients
        // ----------------------------------------------------

        const alreadyAdded = participantIds.some(
            id =>
                id.toString() ===
                participantId.toString()
        );

        if (!alreadyAdded) {
            participantIds.push(participantId);
        }
    }


    // --------------------------------------------------------
    // Everyone was creator / no valid recipients remain
    // --------------------------------------------------------

    if (participantIds.length === 0) {

        return {
            notificationsCreated: 0
        };
    }


    // --------------------------------------------------------
    // Create notification documents
    // --------------------------------------------------------

    const notifications = participantIds.map(
        (participantId) => {

            return {

                recipientId: participantId,

                senderId: activity.createdBy,

                activityId: activity._id,

                type: "ACTIVITY_COMPLETED",

                title: "Activity completed",

                message:
                    `The activity "${activity.title}" has been completed.`
            };
        }
    );


    // --------------------------------------------------------
    // Insert notifications
    // --------------------------------------------------------

    const createdNotifications =
        await createNotificationsInBulk(
            notifications
        );


    return {
        notificationsCreated:
            createdNotifications.length
    };
};


// ============================================================
// Exports
// ============================================================

module.exports = {
    createNearbyActivityNotifications,
    createActivityJoinedNotification,
    createActivityCompletedNotifications
};