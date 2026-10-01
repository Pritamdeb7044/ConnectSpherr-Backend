const mongoose = require("mongoose");

const UserModel = require("../Models/UserModel");
const ActivityModel = require("../Models/ActivityModel");
const ParticipationModel = require("../Models/ParticipationModel");
const RewardModel = require("../Models/RewardModel");

const getDashboardHandler = async (req, res) => {
    try {

        // =========================================================
        // 1. AUTHENTICATION VALIDATION
        // =========================================================

        if (!req.user || !req.user._id) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized access.",
            });
        }

        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                success: false,
                message: "Invalid authenticated user.",
            });
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);


        // =========================================================
        // 2. GET QUERY PARAMETERS
        // =========================================================

        const {
            longitude,
            latitude,
            radius
        } = req.query;


        // =========================================================
        // 3. LONGITUDE VALIDATION
        // =========================================================

        if (
            longitude === undefined ||
            longitude === null ||
            String(longitude).trim() === ""
        ) {
            return res.status(400).json({
                success: false,
                message: "Longitude is required.",
            });
        }

        const parsedLongitude = Number(longitude);

        if (!Number.isFinite(parsedLongitude)) {
            return res.status(400).json({
                success: false,
                message: "Longitude must be a valid number.",
            });
        }

        if (
            parsedLongitude < -180 ||
            parsedLongitude > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Longitude must be between -180 and 180.",
            });
        }


        // =========================================================
        // 4. LATITUDE VALIDATION
        // =========================================================

        if (
            latitude === undefined ||
            latitude === null ||
            String(latitude).trim() === ""
        ) {
            return res.status(400).json({
                success: false,
                message: "Latitude is required.",
            });
        }

        const parsedLatitude = Number(latitude);

        if (!Number.isFinite(parsedLatitude)) {
            return res.status(400).json({
                success: false,
                message: "Latitude must be a valid number.",
            });
        }

        if (
            parsedLatitude < -90 ||
            parsedLatitude > 90
        ) {
            return res.status(400).json({
                success: false,
                message: "Latitude must be between -90 and 90.",
            });
        }


        // =========================================================
        // 5. RADIUS VALIDATION
        // =========================================================

        const parsedRadius =
            radius === undefined ||
            radius === null ||
            String(radius).trim() === ""
                ? 500
                : Number(radius);

        if (!Number.isFinite(parsedRadius)) {
            return res.status(400).json({
                success: false,
                message: "Radius must be a valid number.",
            });
        }

        if (parsedRadius <= 0) {
            return res.status(400).json({
                success: false,
                message: "Radius must be greater than 0.",
            });
        }

        const MAX_RADIUS = 5000;

        if (parsedRadius > MAX_RADIUS) {
            return res.status(400).json({
                success: false,
                message: "Radius cannot exceed 5000 meters.",
            });
        }


        // =========================================================
        // 6. CURRENT TIME
        // =========================================================

        const now = new Date();


        // =========================================================
        // 7. FETCH CURRENT USER
        // =========================================================

        const user = await UserModel.findById(userObjectId)
            .select(
                "_id name email points location createdAt"
            )
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }


        // =========================================================
        // 8. FETCH USER'S PARTICIPATION RECORDS
        // =========================================================
        //
        // IMPORTANT:
        //
        // ParticipationModel uses:
        //
        // userId
        // activityId
        // status
        //
        // NOT:
        //
        // user
        // activity
        //
        // Active participation status = "joined"
        //
        // =========================================================

        const participationRecords =
            await ParticipationModel.find({
                userId: userObjectId
            })
            .select(
                "_id userId activityId status joinedAt completedAt pointsAwarded"
            )
            .populate({
                path: "activityId",
                select: `
                    _id
                    title
                    description
                    createdBy
                    activityDate
                    activityDuration
                    maxParticipants
                    registrationDeadline
                    location
                    status
                    points
                `,
                populate: {
                    path: "createdBy",
                    select: "_id name"
                }
            })
            .lean();


        // =========================================================
        // 9. ACTIVE/JOINED PARTICIPATIONS
        // =========================================================

        const joinedParticipations =
            participationRecords.filter(
                (participation) =>
                    participation.status === "joined" &&
                    participation.activityId
            );


        // =========================================================
        // 10. ACTIVITIES JOINED
        // =========================================================

        const activitiesJoined =
            joinedParticipations.length;


        // =========================================================
        // 11. ACTIVITIES CREATED
        // =========================================================

        const activitiesCreated =
            await ActivityModel.countDocuments({
                createdBy: userObjectId
            });


        // =========================================================
        // 12. UPCOMING ACTIVITIES
        // =========================================================

        const upcomingActivities =
            joinedParticipations
                .filter(
                    (participation) =>
                        participation.activityId &&
                        new Date(
                            participation.activityId.activityDate
                        ) > now
                )
                .sort(
                    (a, b) =>
                        new Date(
                            a.activityId.activityDate
                        ) -
                        new Date(
                            b.activityId.activityDate
                        )
                )
                .slice(0, 5)
                .map((participation) => {

                    const activity =
                        participation.activityId;

                    return {
                        activityId: activity._id,

                        title: activity.title,

                        activityDate:
                            activity.activityDate,

                        activityDuration:
                            activity.activityDuration,

                        registrationDeadline:
                            activity.registrationDeadline,

                        host:
                            activity.createdBy?.name ||
                            "Unknown"
                    };
                });


        // =========================================================
        // 13. UPCOMING PLANS
        // =========================================================

        const upcomingPlans =
            upcomingActivities.length;


        // =========================================================
        // 14. NEARBY ACTIVITIES
        // =========================================================

        const nearbyActivities =
            await ActivityModel.aggregate([

                // -------------------------------------------------
                // GEO SEARCH
                // -------------------------------------------------

                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [
                                parsedLongitude,
                                parsedLatitude
                            ]
                        },

                        distanceField: "distance",

                        maxDistance: parsedRadius,

                        spherical: true
                    }
                },


                // -------------------------------------------------
                // ONLY FUTURE ACTIVE ACTIVITIES
                // -------------------------------------------------

                {
                    $match: {
                        activityDate: {
                            $gt: now
                        },

                        status: "active"
                    }
                },


                // -------------------------------------------------
                // NEAREST ACTIVITIES FIRST
                // -------------------------------------------------

                {
                    $sort: {
                        distance: 1
                    }
                },


                // -------------------------------------------------
                // MAXIMUM 10 ACTIVITIES
                // -------------------------------------------------

                {
                    $limit: 10
                },


                // -------------------------------------------------
                // GET CREATOR
                // -------------------------------------------------

                {
                    $lookup: {
                        from: "users",

                        localField: "createdBy",

                        foreignField: "_id",

                        as: "creator"
                    }
                },


                {
                    $unwind: {
                        path: "$creator",

                        preserveNullAndEmptyArrays: true
                    }
                },


                // =================================================
                // GET PARTICIPATIONS
                // =================================================
                //
                // IMPORTANT:
                //
                // Participation collection uses:
                //
                // activityId
                // status: "joined"
                //
                // NOT:
                //
                // activity
                // status: "active"
                //
                // =================================================

                {
                    $lookup: {
                        from: "participations",

                        let: {
                            currentActivityId: "$_id"
                        },

                        pipeline: [

                            {
                                $match: {
                                    $expr: {
                                        $and: [

                                            {
                                                $eq: [
                                                    "$activityId",
                                                    "$$currentActivityId"
                                                ]
                                            },

                                            {
                                                $eq: [
                                                    "$status",
                                                    "joined"
                                                ]
                                            }

                                        ]
                                    }
                                }
                            }

                        ],

                        as: "joinedParticipations"
                    }
                },


                // -------------------------------------------------
                // COUNT PARTICIPANTS
                // -------------------------------------------------

                {
                    $addFields: {

                        participantCount: {
                            $size: "$joinedParticipations"
                        }

                    }
                },


                // -------------------------------------------------
                // PROJECT REQUIRED FIELDS
                // -------------------------------------------------

                {
                    $project: {

                        _id: 1,

                        title: 1,

                        description: 1,

                        activityDate: 1,

                        activityDuration: 1,

                        maxParticipants: 1,

                        registrationDeadline: 1,

                        location: 1,

                        status: 1,

                        points: 1,

                        distance: 1,

                        participantCount: 1,

                        creator: {
                            _id: "$creator._id",
                            name: "$creator.name"
                        }
                    }
                }

            ]);


        // =========================================================
        // 15. FORMAT NEARBY ACTIVITIES
        // =========================================================

        const formattedNearbyActivities =
            nearbyActivities.map((activity) => {

                const participantCount =
                    Number(activity.participantCount) || 0;

                const maxParticipants =
                    Number(activity.maxParticipants) || 1;


                // -------------------------------------------------
                // REGISTRATION STATUS
                // -------------------------------------------------

                let registrationStatus =
                    "Registration Open";


                if (
                    activity.registrationDeadline &&
                    new Date(
                        activity.registrationDeadline
                    ) <= now
                ) {

                    registrationStatus =
                        "Registration Closed";
                }


                // -------------------------------------------------
                // FULL CHECK
                // -------------------------------------------------

                if (
                    participantCount >=
                    maxParticipants
                ) {

                    registrationStatus =
                        "Full";
                }


                // -------------------------------------------------
                // PARTICIPATION PERCENTAGE
                // -------------------------------------------------

                const participationPercentage =
                    Math.min(
                        100,
                        Math.round(
                            (
                                participantCount /
                                maxParticipants
                            ) * 100
                        )
                    );


                return {

                    activityId:
                        activity._id,

                    title:
                        activity.title,

                    description:
                        activity.description,

                    // Distance is kept because
                    // frontend needs it.

                    distance:
                        Math.round(
                            activity.distance
                        ),

                    activityDate:
                        activity.activityDate,

                    duration:
                        activity.activityDuration,

                    maxParticipants:
                        maxParticipants,

                    participantCount:
                        participantCount,

                    spotsFilled:
                        `${participantCount} / ${maxParticipants}`,

                    participationPercentage:
                        participationPercentage,

                    points:
                        activity.points || 0,

                    status:
                        activity.status,

                    registrationStatus,

                    hostedBy:
                        activity.creator?.name ||
                        "Unknown",

                    createdBy:
                        activity.creator?._id ||
                        null
                };
            });


        // =========================================================
        // 16. FETCH REWARDS
        // =========================================================

        const rewards =
            await RewardModel.find({})
                .select(`
                    _id
                    title
                    description
                    pointsRequired
                    voucherValue
                    voucherProvider
                    expiryDate
                `)
                .sort({
                    pointsRequired: 1
                })
                .limit(5)
                .lean();


        // =========================================================
        // 17. FORMAT REWARDS
        // =========================================================

        const formattedRewards =
            rewards.map((reward) => ({

                rewardId:
                    reward._id,

                title:
                    reward.title,

                description:
                    reward.description,

                pointsRequired:
                    reward.pointsRequired,

                voucherValue:
                    reward.voucherValue,

                voucherProvider:
                    reward.voucherProvider,

                expiryDate:
                    reward.expiryDate,

                available:
                    (user.points || 0) >=
                    reward.pointsRequired

            }));


        // =========================================================
        // 18. FINAL RESPONSE
        // =========================================================

        return res.status(200).json({

            success: true,

            message:
                "Dashboard data fetched successfully.",


            // -------------------------------------------------
            // USER
            // -------------------------------------------------

            user: {

                id:
                    user._id,

                name:
                    user.name,

                email:
                    user.email,

                points:
                    user.points || 0,

                location:
                    user.location,

                createdAt:
                    user.createdAt
            },


            // -------------------------------------------------
            // STATISTICS
            // -------------------------------------------------

            statistics: {

                availablePoints:
                    user.points || 0,

                activitiesJoined:
                    activitiesJoined,

                activitiesCreated:
                    activitiesCreated,

                upcomingPlans:
                    upcomingPlans
            },


            // -------------------------------------------------
            // REQUEST LOCATION
            // -------------------------------------------------

            location: {

                longitude:
                    parsedLongitude,

                latitude:
                    parsedLatitude,

                radius:
                    parsedRadius
            },


            // -------------------------------------------------
            // NEARBY ACTIVITIES
            // -------------------------------------------------

            nearbyActivities:
                formattedNearbyActivities,


            // -------------------------------------------------
            // UPCOMING SCHEDULE
            // -------------------------------------------------

            upcomingSchedule:
                upcomingActivities,


            // -------------------------------------------------
            // REWARDS
            // -------------------------------------------------

            rewardsWallet: {

                balance:
                    user.points || 0,

                rewards:
                    formattedRewards
            }

        });

    } catch (error) {

        console.error(
            "getDashboardHandler error:",
            error
        );


        // =====================================================
        // MONGOOSE CAST ERROR
        // =====================================================

        if (
            error instanceof mongoose.Error.CastError
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid dashboard data."

            });
        }


        // =====================================================
        // SERVER ERROR
        // =====================================================

        return res.status(500).json({

            success: false,

            message:
                "Failed to fetch dashboard data.",

            ...(process.env.NODE_ENV === "development" && {
                error: error.message
            })

        });
    }
};


module.exports = {
    getDashboardHandler
};