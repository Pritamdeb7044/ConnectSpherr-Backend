const mongoose = require("mongoose");
const NotificationModel = require("../Models/NotificationModel");

async function getMyNotificationsHandler (req, res){

    try {

        //Validate authenticated use
        if(!req.user || !req.user._id){
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }

        const userId = req.user._id;
        if(!mongoose.Types.ObjectId.isValid(userId)){
            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }

        //Pagination configuration
        const DEFAULT_PAGE = 1;
        const DEFAULT_LIMIT = 10;
        const MAX_LIMIT = 100;

        let page = DEFAULT_PAGE;
        let limit = DEFAULT_LIMIT;

        //Validate page query parameter
        const pageQuery = req.query.page;

        if(pageQuery !== undefined){
            if(typeof pageQuery !== "string" || !/^\d+$/.test(pageQuery)){
                return res.status(400).json({
                    message: "Page must be a positive integer",
                    status: "Failure"
                });
            }


            page = Number(pageQuery);
            if (!Number.isSafeInteger(page) || page < 1){
                return res.status(400).json({
                    message: "Page must be a positive integer",
                    status: "Failure"
                });
            }
        }

        //Validate limit query parameter
        const limitQuery = req.query.limit;
        if(limitQuery !== undefined){
            if(typeof limitQuery !== "string" || !/^\d+$/.test(limitQuery)){
                return res.status(400).json({
                    message: "Limit must be a positive integer",
                    status: "Failure"
                });
            }


            limit = Number(limitQuery);


            if (
                !Number.isSafeInteger(limit) ||
                limit < 1
            ) {

                return res.status(400).json({
                    message: "Limit must be a positive integer",
                    status: "Failure"
                });
            }


            if (limit > MAX_LIMIT) {

                return res.status(400).json({
                    message: `Limit cannot exceed ${MAX_LIMIT}`,
                    status: "Failure"
                });
            }
        }

        //Calculate skip
        const skip = (page - 1) * limit;

        if(!Number.isSafeInteger(skip)){
            return res.status(400).json({
                message: "Invalid pagination values",
                status: "Failure"
            });
        }

        //Notification filter
        const notificationFilter = {
            recipientId: userId
        };

        //Get total notification count
        const totalNotifications = await NotificationModel.countDocuments(notificationFilter);

        // 8. Fetch notifications
        const notifications =
            await NotificationModel
                .find(notificationFilter)
                .select(
                    "_id senderId activityId type title message isRead createdAt updatedAt"
                )
                .sort({
                    createdAt: -1,
                    _id: -1
                })
                .skip(skip)
                .limit(limit)
                .lean();

        //Defensive database response validation
        if (!Array.isArray(notifications)) {
            return res.status(500).json({
                message: "Invalid notification data returned from database",
                status: "Failure"
            });
        }

        //Calculate pagination information
        const totalPages = totalNotifications === 0 ? 0 : Math.ceil(totalNotifications / limit);

        const hasNextPage = page < totalPages;

        const hasPreviousPage = page > 1 && totalPages > 0;

        //Send response
        return res.status(200).json({
            message: "Notifications fetched successfully",
            status: "success",
            pagination: {
                page,
                limit,
                totalNotifications,
                totalPages,
                hasNextPage,
                hasPreviousPage
            },
            count: notifications.length,
            data: notifications
        });
    }catch(err){
        console.log("getMyNotificationsHandler error:",err);

        // 12. Mongoose validation error
        if(err instanceof mongoose.Error.ValidationError){
            return res.status(500).json({
                message: "Notification data validation failed",
                status: "Failure"
            });
        }

        // 13. Mongoose cast error
        if(err instanceof mongoose.Error.CastError){
            return res.status(500).json({
                message: "Invalid notification data",
                status: "Failure"
            });
        }

        // 14. Generic database/server error
        return res.status(500).json({
            message: "Internal server error",
            status: "Failure"
        });
    }
}

async function notificationStatusHandler(req, res) {
    try {

        // --------------------------------------------------
        // 1. Validate authenticated user
        // --------------------------------------------------

        const userId = req.user?._id;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }


        // --------------------------------------------------
        // 2. Fetch user's last notification seen timestamp
        // --------------------------------------------------

        const user = await UserModel.findById(userId)
            .select("_id lastNotificationSeenAt")
            .lean();

        if (!user) {
            return res.status(401).json({
                message: "User no longer exists",
                status: "Failure"
            });
        }


        // --------------------------------------------------
        // 3. Check whether new notifications exist
        // --------------------------------------------------

        let hasNewNotifications = false;

        if (user.lastNotificationSeenAt === null) {

            // User has never opened the notification panel.
            // Check whether at least one notification exists.

            hasNewNotifications = await NotificationModel.exists({
                recipientId: userId
            });

        } else {

            // Only check for notifications created after
            // the user's last seen timestamp.

            hasNewNotifications = await NotificationModel.exists({
                recipientId: userId,
                createdAt: {
                    $gt: user.lastNotificationSeenAt
                }
            });
        }


        // --------------------------------------------------
        // 4. Return notification status
        // --------------------------------------------------

        return res.status(200).json({
            message: "Notification status fetched successfully",
            status: "Success",
            data: {
                hasNewNotifications: Boolean(hasNewNotifications)
            }
        });

    } catch (err) {

        console.log("notificationStatusHandler error:", err);

        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}

// PATCH /api/notification/seen
async function markNotificationsSeenHandler(req, res) {
    try {

        // --------------------------------------------------
        // 1. Validate authenticated user
        // --------------------------------------------------

        const userId = req.user?._id;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }


        // --------------------------------------------------
        // 2. Update notification seen timestamp
        // --------------------------------------------------

        const currentTime = new Date();

        const updatedUser = await UserModel.findByIdAndUpdate(
            userId,
            {
                $set: {
                    lastNotificationSeenAt: currentTime
                }
            },
            {
                new: true,
                runValidators: true
            }
        )
        .select("_id lastNotificationSeenAt")
        .lean();


        // --------------------------------------------------
        // 3. Verify user still exists
        // --------------------------------------------------

        if (!updatedUser) {
            return res.status(401).json({
                message: "User no longer exists",
                status: "Failure"
            });
        }


        // --------------------------------------------------
        // 4. Return updated status
        // --------------------------------------------------

        return res.status(200).json({
            message: "Notifications marked as seen",
            status: "Success",
            data: {
                lastNotificationSeenAt: updatedUser.lastNotificationSeenAt
            }
        });

    } catch (err) {

        console.log("markNotificationsSeenHandler error:", err);

        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}

async function getNotificationHandler(req, res){

    try {
        //Verify authenticated user
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }

        //Validate authenticated user's ID
        const userId = req.user._id;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }

        //Get notification ID from route parameters
        const { notificationId } = req.params;

        // 4. Validate notification ID
        if (!notificationId || notificationId.trim() === "") {
            return res.status(400).json({
                message: "Notification ID is required",
                status: "Failure"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(notificationId)) {
            return res.status(400).json({
                message: "Invalid notification ID",
                status: "Failure"
            });
        }

        //Find notification belonging to authenticated user
        const notification =
            await NotificationModel.findOne({
                _id: notificationId,
                recipientId: userId
            })
            .select(
                "_id recipientId senderId activityId type title message isRead createdAt updatedAt"
            )
            .populate({
                path: "senderId",
                select: "_id name email"
            })
            .populate({
                path: "activityId",
                select: "_id title description location activityDate activityDuration status"
            })
            .lean();

        //Notification not found
        if(!notification){
            return res.status(404).json({
                message: "Notification not found",
                status: "Failure"
            });
        }

        //Defensive validation of notification data
        if (!notification._id || !notification.recipientId || !notification.type || !notification.title || !notification.message || typeof notification.isRead !== "boolean" || !notification.createdAt){
            // console.error("Invalid notification data:",notification._id);
            return res.status(500).json({
                message: "Internal server error.",
                status: "Failure"
            });
        }

        //Verify notification belongs to authenticated user
        if(notification.recipientId.toString() !== userId.toString()){
            // console.error("Notification ownership validation failed:",notification._id);
            return res.status(500).json({
                message: "Internal server error.",
                status: "Failure"
            });
        }

        //Validate activity reference when required
        if ([
                "NEARBY_ACTIVITY",
                "ACTIVITY_JOINED",
                "ACTIVITY_COMPLETED"
            ].includes(notification.type)){
            if (!notification.activityId) {
                console.error("Activity notification is missing activity reference:",notification._id);
                return res.status(500).json({
                    message: "Internal server error.",
                    status: "Failure"
                });
            }
        }
        //Return notification
        return res.status(200).json({
            message: "Notification fetched successfully",
            status: "success",
            data: notification
        });
    }catch(err){
        //Handle invalid ObjectId errors
        if(err instanceof mongoose.Error.CastError){
            return res.status(400).json({
                message: "Invalid notification ID",
                status: "Failure"
            });
        }

        //Handle Mongoose validation errors
        if (err instanceof mongoose.Error.ValidationError) {
            // console.error("Notification validation error:",err);
            return res.status(500).json({
                message: "Internal server error.",
                status: "Failure"
            });
        }

        //Handle unexpected/database errors
        // console.error("getNotificationHandler error:",err);
        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}


module.exports = {
    getMyNotificationsHandler,
    notificationStatusHandler,
    markNotificationsSeenHandler,
    getNotificationHandler
};


// getMyNotificationsHandler
// getUnreadNotificationsHandler
// getNotificationHandler
// markNotificationAsReadHandler
// markAllNotificationsAsReadHandler

// next idea 
// first one i have to add a notification status handler whose jod is to tell that if the user had any new notification or not? -> In the architecture we're designing, the frontend should call notificationStatusHandler after a successful login.
// second one is the mark notifications seen handler whose task is to update the notification seen time while the user **click on the bell icon**.