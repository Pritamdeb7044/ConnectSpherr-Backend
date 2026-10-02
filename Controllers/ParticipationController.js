const ParticipationModel = require("../Models/ParticipationModel");
const ActivityModel = require("../Models/ActivityModel")
const mongoose = require("mongoose");

async function joinActivityHandler(req, res) {
    let session;

    try {

        // =========================================================
        // 1. AUTHENTICATION
        // =========================================================

        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "failure"
            });
        }

        // =========================================================
        // 2. ACTIVITY ID VALIDATION
        // =========================================================

        const { activityId } = req.params;

        if (
            activityId === undefined ||
            activityId === null
        ) {
            return res.status(400).json({
                message: "Activity Id is required",
                status: "failure"
            });
        }

        if (
            typeof activityId !== "string" ||
            activityId.trim() === ""
        ) {
            return res.status(400).json({
                message: "Activity Id can't be empty",
                status: "failure"
            });
        }

        const normalizedActivityId = activityId.trim();

        if (!mongoose.Types.ObjectId.isValid(normalizedActivityId)) {
            return res.status(400).json({
                message: "Invalid activity Id",
                status: "failure"
            });
        }

        // =========================================================
        // 3. START TRANSACTION
        // =========================================================

        session = await mongoose.startSession();

        let joinedParticipation = null;
        let joinedActivity = null;
        let wasRejoin = false;

        await session.withTransaction(async () => {

            const currentTime = new Date();

            // =====================================================
            // 4. FETCH ACTIVITY
            // =====================================================

            const activity = await ActivityModel
                .findById(normalizedActivityId)
                .session(session);

            if (!activity) {
                throw new Error("ACTIVITY_NOT_FOUND");
            }

            // =====================================================
            // 5. ACTIVITY STATUS
            // =====================================================

            if (activity.status === "closed") {
                throw new Error("ACTIVITY_CLOSED");
            }

            if (activity.status === "completed") {
                throw new Error("ACTIVITY_COMPLETED");
            }

            if (activity.status === "cancelled") {
                throw new Error("ACTIVITY_CANCELLED");
            }

            if (activity.status !== "active") {
                throw new Error("ACTIVITY_NOT_ACTIVE");
            }

            // =====================================================
            // 6. TIME VALIDATION
            // =====================================================

            if (
                currentTime >=
                new Date(activity.registrationDeadline)
            ) {
                throw new Error("REGISTRATION_CLOSED");
            }

            if (
                currentTime >=
                new Date(activity.activityDate)
            ) {
                throw new Error("ACTIVITY_STARTED");
            }

            // =====================================================
            // 7. FIND EXISTING PARTICIPATION
            // =====================================================
            //
            // IMPORTANT:
            // ParticipationModel uses:
            //
            // userId
            // activityId
            // status
            //
            // =====================================================

            const existingParticipation =
                await ParticipationModel
                    .findOne({
                        userId: req.user._id,
                        activityId: activity._id
                    })
                    .session(session);

            // Already joined
            if (
                existingParticipation &&
                existingParticipation.status === "joined"
            ) {
                throw new Error("ALREADY_JOINED");
            }

            // Already completed
            if (
                existingParticipation &&
                existingParticipation.status === "completed"
            ) {
                throw new Error("ALREADY_COMPLETED");
            }

            // =====================================================
            // 8. CREATOR VALIDATION
            // =====================================================

            if (
                activity.createdBy.toString() ===
                req.user._id.toString()
            ) {
                throw new Error("CREATOR_ALREADY_PARTICIPANT");
            }

            // =====================================================
            // 9. CURRENT PARTICIPANT COUNT
            // =====================================================

            const participantCount =
                await ParticipationModel.countDocuments({
                    activityId: activity._id,
                    status: "joined"
                }).session(session);

            if (
                participantCount >=
                activity.maxParticipants
            ) {
                throw new Error("ACTIVITY_FULL");
            }

            // =====================================================
            // 10. UPDATE ACTIVITY
            // =====================================================
            //
            // This provides a common write point for concurrent
            // join requests.
            //
            // =====================================================

            const activityWriteResult =
                await ActivityModel.updateOne(
                    {
                        _id: activity._id,
                        status: "active"
                    },
                    {
                        $set: {
                            updatedAt: currentTime
                        }
                    },
                    {
                        session
                    }
                );

            if (
                activityWriteResult.matchedCount !== 1
            ) {
                throw new Error("ACTIVITY_CONFLICT");
            }

            // =====================================================
            // 11. CREATE / REACTIVATE PARTICIPATION
            // =====================================================

            if (
                existingParticipation &&
                existingParticipation.status === "cancelled"
            ) {

                // Rejoin
                existingParticipation.status = "joined";
                existingParticipation.joinedAt = currentTime;
                existingParticipation.completedAt = null;
                existingParticipation.pointsAwarded = 0;

                await existingParticipation.save({
                    session
                });

                joinedParticipation =
                    existingParticipation;

                wasRejoin = true;

            } else {

                // New participation
                const participationResult =
                    await ParticipationModel.create(
                        [
                            {
                                userId: req.user._id,
                                activityId: activity._id,
                                status: "joined",
                                joinedAt: currentTime,
                                completedAt: null,
                                pointsAwarded: 0
                            }
                        ],
                        {
                            session
                        }
                    );

                joinedParticipation =
                    participationResult[0];
            }

            // =====================================================
            // 12. CHECK WHETHER ACTIVITY BECAME FULL
            // =====================================================

            const updatedParticipantCount =
                await ParticipationModel
                    .countDocuments({
                        activityId: activity._id,
                        status: "joined"
                    })
                    .session(session);

            if (
                updatedParticipantCount >=
                activity.maxParticipants
            ) {
                activity.status = "closed";
                activity.closureReason = "full";

                await activity.save({
                    session
                });
            }

            joinedActivity = activity;
        });

        // =========================================================
        // 13. NOTIFICATION
        // =========================================================

        try {

            await NotificationService.createActivityJoinedNotification({
                activity: joinedActivity,
                joiningUser: req.user
            });

        } catch (notificationError) {

            console.error(
                "Activity joined notification error:",
                notificationError
            );
        }

        // =========================================================
        // 14. SUCCESS
        // =========================================================

        return res.status(
            wasRejoin ? 200 : 201
        ).json({

            message:
                wasRejoin
                    ? "You have successfully rejoined the activity"
                    : "Successfully joined the activity",

            participation:
                joinedParticipation,

            activityStatus:
                joinedActivity.status,

            status:
                "success"
        });

    } catch (err) {

        console.error(
            "Join activity error:",
            err
        );

        // =========================================================
        // BUSINESS ERRORS
        // =========================================================

        const businessErrors = {

            ACTIVITY_NOT_FOUND: [
                404,
                "Activity not found"
            ],

            ACTIVITY_CLOSED: [
                400,
                "This activity is closed and can't be joined"
            ],

            ACTIVITY_COMPLETED: [
                400,
                "Completed activities can't be joined"
            ],

            ACTIVITY_CANCELLED: [
                400,
                "Cancelled activities can't be joined"
            ],

            ACTIVITY_NOT_ACTIVE: [
                400,
                "Activity can't be joined in its current state"
            ],

            REGISTRATION_CLOSED: [
                400,
                "Registration deadline has passed"
            ],

            ACTIVITY_STARTED: [
                400,
                "Activity has already been started or passed"
            ],

            ALREADY_JOINED: [
                400,
                "You have already joined this activity"
            ],

            ALREADY_COMPLETED: [
                400,
                "You have already completed this activity"
            ],

            CREATOR_ALREADY_PARTICIPANT: [
                400,
                "Activity creator is already considered as a participant"
            ],

            ACTIVITY_FULL: [
                400,
                "Maximum participant limit has been reached"
            ],

            ACTIVITY_CONFLICT: [
                409,
                "The activity was updated by another request. Please try again."
            ]
        };

        if (businessErrors[err.message]) {

            const [
                statusCode,
                message
            ] = businessErrors[err.message];

            return res.status(statusCode).json({
                message,
                status: "failure"
            });
        }

        // Duplicate participation
        if (err.code === 11000) {
            return res.status(409).json({
                message: "You have already joined this activity",
                status: "failure"
            });
        }

        if (err.name === "CastError") {
            return res.status(400).json({
                message: "Invalid data provided",
                status: "failure"
            });
        }

        if (err.name === "ValidationError") {
            return res.status(400).json({
                message: err.message,
                status: "failure"
            });
        }

        return res.status(500).json({
            message:
                "Unable to join the activity. Please try again later",
            status: "failure"
        });

    } finally {

        if (session) {
            await session.endSession();
        }
    }
}

async function leaveActivityHandler(req, res) {

    try {

        // =========================================================
        // 1. AUTHENTICATION
        // =========================================================

        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "failure"
            });
        }

        // =========================================================
        // 2. ACTIVITY ID
        // =========================================================

        const { activityId } = req.params;

        if (
            activityId === undefined ||
            activityId === null
        ) {
            return res.status(400).json({
                message: "Activity Id is required",
                status: "failure"
            });
        }

        if (
            typeof activityId !== "string" ||
            activityId.trim() === ""
        ) {
            return res.status(400).json({
                message: "Invalid activity Id",
                status: "failure"
            });
        }

        const normalizedActivityId =
            activityId.trim();

        if (
            !mongoose.Types.ObjectId.isValid(
                normalizedActivityId
            )
        ) {
            return res.status(400).json({
                message: "Invalid activity Id",
                status: "failure"
            });
        }

        // =========================================================
        // 3. FETCH ACTIVITY
        // =========================================================

        const activity =
            await ActivityModel.findById(
                normalizedActivityId
            );

        if (!activity) {
            return res.status(404).json({
                message: "Activity not found",
                status: "failure"
            });
        }

        // =========================================================
        // 4. CREATOR CANNOT LEAVE
        // =========================================================

        if (
            activity.createdBy.toString() ===
            req.user._id.toString()
        ) {
            return res.status(403).json({
                message:
                    "Activity creator cannot leave their own activity. You can cancel the activity instead",
                status: "failure"
            });
        }

        // =========================================================
        // 5. ACTIVITY STATUS
        // =========================================================

        if (activity.status === "completed") {
            return res.status(400).json({
                message:
                    "You can't leave a completed activity",
                status: "failure"
            });
        }

        if (activity.status === "cancelled") {
            return res.status(400).json({
                message:
                    "You can't leave a cancelled activity",
                status: "failure"
            });
        }

        // =========================================================
        // 6. FIND USER PARTICIPATION
        // =========================================================
        //
        // IMPORTANT:
        //
        // userId + activityId
        //
        // =========================================================

        const participation =
            await ParticipationModel.findOne({
                userId: req.user._id,
                activityId: activity._id
            });

        if (!participation) {
            return res.status(404).json({
                message:
                    "You have not joined this activity",
                status: "failure"
            });
        }

        // =========================================================
        // 7. PARTICIPATION STATUS
        // =========================================================

        if (participation.status === "cancelled") {
            return res.status(400).json({
                message:
                    "You have already left this activity",
                status: "failure"
            });
        }

        if (participation.status === "completed") {
            return res.status(400).json({
                message:
                    "Completed participation cannot be cancelled",
                status: "failure"
            });
        }

        if (participation.status !== "joined") {
            return res.status(400).json({
                message:
                    "Participation cannot be cancelled in its current state",
                status: "failure"
            });
        }

        // =========================================================
        // 8. TIME VALIDATION
        // =========================================================

        const currentTime = new Date();

        if (
            currentTime >=
            new Date(activity.registrationDeadline)
        ) {
            return res.status(400).json({
                message:
                    "You cannot leave after registration deadline",
                status: "failure"
            });
        }

        if (
            currentTime >=
            new Date(activity.activityDate)
        ) {
            return res.status(400).json({
                message:
                    "You cannot leave after the activity has started",
                status: "failure"
            });
        }

        // =========================================================
        // 9. CANCEL PARTICIPATION
        // =========================================================

        participation.status = "cancelled";

        await participation.save();

        // =========================================================
        // 10. REOPEN FULL ACTIVITY IF NECESSARY
        // =========================================================

        if (
            activity.status === "closed" &&
            activity.closureReason === "full"
        ) {

            activity.status = "active";
            activity.closureReason = null;

            await activity.save();
        }

        // =========================================================
        // 11. SUCCESS
        // =========================================================

        return res.status(200).json({

            message:
                "You have successfully left the activity",

            activityStatus:
                activity.status,

            participation,

            status:
                "success"
        });

    } catch (err) {

        console.error(
            "Leave activity error:",
            err
        );

        if (err.code === 11000) {
            return res.status(409).json({
                message:
                    "Duplicate participation record detected",
                status: "failure"
            });
        }

        if (err.name === "CastError") {
            return res.status(400).json({
                message:
                    "Invalid data provided",
                status: "failure"
            });
        }

        if (err.name === "ValidationError") {
            return res.status(400).json({
                message: err.message,
                status: "failure"
            });
        }

        return res.status(500).json({
            message:
                "Unable to leave activity. Please try again later.",
            status: "failure"
        });
    }
}

async function myJoinedActivitiesHandler(req, res) {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "failure"
            });
        }
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "failure"
            });
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);


        // =========================================================
        // 3. FIND USER'S JOINED PARTICIPATIONS
        // =========================================================
        //
        // ParticipationModel uses:
        //
        // userId
        // activityId
        // status: "joined"
        //
        // Therefore we only retrieve currently joined
        // participation records.
        //
        // =========================================================

        const participations =
            await ParticipationModel
                .find({
                    userId: userObjectId,
                    status: "joined"
                })
                .select(
                    "_id userId activityId status joinedAt"
                )
                .populate({
                    path: "activityId",
                    select: `
                        _id
                        title
                        description
                        createdBy
                        location
                        activityDate
                        activityDuration
                        registrationDeadline
                        maxParticipants
                        status
                        closureReason
                        createdAt
                        updatedAt
                    `,
                    populate: {
                        path: "createdBy",
                        select: "_id name email"
                    }
                })
                .sort({
                    joinedAt: -1
                })
                .lean();


        // =========================================================
        // 4. REMOVE INVALID ACTIVITY REFERENCES
        // =========================================================
        //
        // If an activity was deleted and the participation still
        // exists, populate() will return activityId: null.
        //
        // Such a record should not be returned as a joined activity.
        //
        // =========================================================

        const validParticipations =
            participations.filter(
                participation =>
                    participation.activityId
            );


        // =========================================================
        // 5. REMOVE COMPLETED / CANCELLED ACTIVITIES
        // =========================================================
        //
        // A participation may still have:
        //
        // status: "joined"
        //
        // while the corresponding activity has subsequently
        // become completed or cancelled.
        //
        // Those activities must NOT appear in this endpoint.
        //
        // =========================================================

        const joinedActivities =
            validParticipations
                .filter(
                    participation => {

                        const activity =
                            participation.activityId;

                        return (
                            activity.status !== "completed" &&
                            activity.status !== "cancelled"
                        );
                    }
                )
                .map(
                    participation => {

                        const activity =
                            participation.activityId;

                        return {

                            activityId:
                                activity._id,

                            title:
                                activity.title,

                            description:
                                activity.description,

                            createdBy:
                                activity.createdBy,

                            location:
                                activity.location,

                            activityDate:
                                activity.activityDate,

                            activityDuration:
                                activity.activityDuration,

                            registrationDeadline:
                                activity.registrationDeadline,

                            maxParticipants:
                                activity.maxParticipants,

                            status:
                                activity.status,

                            closureReason:
                                activity.closureReason || null,

                            createdAt:
                                activity.createdAt,

                            updatedAt:
                                activity.updatedAt,

                            // Information about the user's
                            // participation.
                            joinedAt:
                                participation.joinedAt,

                            participationStatus:
                                participation.status
                        };
                    }
                );

        return res.status(200).json({
            message: "Joined activities fetched successfully",
            count: joinedActivities.length,
            activities: joinedActivities,
            status: "success"
        });


    } catch (err) {
        console.error("My joined activities error:",err);

        if (err instanceof mongoose.Error.CastError){
            return res.status(400).json({
                message: "Invalid activity or participation data",
                status: "failure"
            });
        }

        if (err instanceof mongoose.Error.ValidationError){
            return res.status(400).json({
                message: "Participation validation failed",
                errors: Object.values(err.errors)
                    .map(error => error.message),
                status: "failure"
            });
        }

        return res.status(500).json({
            message: "Unable to fetch joined activities. Please try again later.",
            status: "failure"
        });
    }
}

async function getMyParticipationHandler(req, res) {

    try {

        // =========================================================
        // 1. AUTHENTICATION
        // =========================================================

        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "failure"
            });
        }

        // =========================================================
        // 2. STATUS FILTER
        // =========================================================

        const { status } = req.query;

        const allowedStatuses = [
            "joined",
            "completed",
            "cancelled"
        ];

        let normalizedStatus = null;

        if (status !== undefined) {

            if (
                typeof status !== "string" ||
                status.trim() === ""
            ) {
                return res.status(400).json({
                    message: "Invalid status",
                    status: "failure"
                });
            }

            normalizedStatus =
                status.trim().toLowerCase();

            if (
                !allowedStatuses.includes(
                    normalizedStatus
                )
            ) {
                return res.status(400).json({
                    message:
                        "Invalid status. Status must be joined, completed, or cancelled",
                    status: "failure"
                });
            }
        }

        // =========================================================
        // 3. BUILD QUERY
        // =========================================================
        //
        // ParticipationModel:
        //
        // userId
        // activityId
        //
        // =========================================================

        const participationQuery = {
            userId: req.user._id
        };

        if (normalizedStatus) {
            participationQuery.status =
                normalizedStatus;
        }

        // =========================================================
        // 4. FETCH PARTICIPATIONS
        // =========================================================

        const participations =
            await ParticipationModel
                .find(participationQuery)
                .populate({
                    path: "activityId"
                })
                .sort({
                    joinedAt: -1
                });

        // =========================================================
        // 5. NO RESULTS
        // =========================================================

        if (participations.length === 0) {
            return res.status(200).json({
                message: "No participations found",
                count: 0,
                participations: [],
                status: "success"
            });
        }

        // =========================================================
        // 6. DATA INTEGRITY
        // =========================================================

        const invalidParticipation =
            participations.find(
                participation =>
                    !participation.activityId
            );

        if (invalidParticipation) {

            console.error(
                "Data integrity issue: Participation references a non-existing activity",
                invalidParticipation._id
            );

            return res.status(500).json({
                message:
                    "Unable to fetch participations because one or more referenced activities no longer exist",
                status: "failure"
            });
        }

        // =========================================================
        // 7. SUCCESS
        // =========================================================

        return res.status(200).json({

            message:
                "Participations fetched successfully",

            count:
                participations.length,

            participations,

            status:
                "success"
        });

    } catch (err) {

        console.error(
            "Get my participation error:",
            err
        );

        if (err.name === "CastError") {
            return res.status(400).json({
                message:
                    "Invalid participation data",
                status: "failure"
            });
        }

        if (err.name === "ValidationError") {
            return res.status(400).json({
                message:
                    err.message,
                status: "failure"
            });
        }

        return res.status(500).json({
            message:
                "Unable to fetch your participations. Please try again later.",
            status: "failure"
        });
    }
}

async function getActivityParticipantsHandler(req, res) {

    try {

        // =========================================================
        // 1. AUTHENTICATION
        // =========================================================

        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "failure"
            });
        }

        // =========================================================
        // 2. ACTIVITY ID
        // =========================================================

        const { activityId } = req.params;

        if (
            activityId === undefined ||
            activityId === null
        ) {
            return res.status(400).json({
                message:
                    "Activity Id is required",
                status: "failure"
            });
        }

        if (
            typeof activityId !== "string" ||
            activityId.trim() === ""
        ) {
            return res.status(400).json({
                message:
                    "Invalid activity Id",
                status: "failure"
            });
        }

        const normalizedActivityId =
            activityId.trim();

        if (
            !mongoose.Types.ObjectId.isValid(
                normalizedActivityId
            )
        ) {
            return res.status(400).json({
                message:
                    "Invalid activity Id",
                status: "failure"
            });
        }

        // =========================================================
        // 3. FETCH ACTIVITY
        // =========================================================

        const activity =
            await ActivityModel.findById(
                normalizedActivityId
            );

        if (!activity) {
            return res.status(404).json({
                message:
                    "Activity not found",
                status: "failure"
            });
        }

        // =========================================================
        // 4. CREATOR AUTHORIZATION
        // =========================================================

        if (
            activity.createdBy.toString() !==
            req.user._id.toString()
        ) {
            return res.status(403).json({
                message:
                    "Only the activity creator can view the participant list",
                status: "failure"
            });
        }

        // =========================================================
        // 5. FETCH PARTICIPANTS
        // =========================================================
        //
        // IMPORTANT:
        //
        // ParticipationModel uses userId/activityId.
        //
        // =========================================================

        const participants =
            await ParticipationModel
                .find({
                    activityId: activity._id
                })
                .select(
                    "_id userId activityId status joinedAt completedAt pointsAwarded"
                )
                .populate({
                    path: "userId",
                    select:
                        "name email points createdAt"
                })
                .sort({
                    joinedAt: 1
                });

        // =========================================================
        // 6. NO PARTICIPANTS
        // =========================================================

        if (participants.length === 0) {
            return res.status(200).json({
                message:
                    "No participants found",
                count: 0,
                participants: [],
                status: "success"
            });
        }

        // =========================================================
        // 7. DATA INTEGRITY
        // =========================================================

        const invalidParticipant =
            participants.find(
                participant =>
                    !participant.userId
            );

        if (invalidParticipant) {

            console.error(
                "Data integrity issue: Participation references a non-existing user",
                invalidParticipant._id
            );

            return res.status(500).json({
                message:
                    "Unable to fetch participants because one or more referenced users no longer exist",
                status: "failure"
            });
        }

        // =========================================================
        // 8. SUCCESS
        // =========================================================

        return res.status(200).json({

            message:
                "Activity participants fetched successfully",

            activityId:
                activity._id,

            count:
                participants.length,

            participants,

            status:
                "success"
        });

    } catch (err) {

        console.error(
            "Get activity participants error:",
            err
        );

        if (err.name === "CastError") {
            return res.status(400).json({
                message:
                    "Invalid activity or participant data",
                status: "failure"
            });
        }

        if (err.name === "ValidationError") {
            return res.status(400).json({
                message:
                    err.message,
                status: "failure"
            });
        }

        return res.status(500).json({
            message:
                "Unable to fetch activity participants. Please try again later.",
            status: "failure"
        });
    }
}

module.exports = {
    joinActivityHandler,
    leaveActivityHandler,
    myJoinedActivitiesHandler,
    getMyParticipationHandler,
    getActivityParticipantsHandler
}