const UserModel = require("../Models/UserModel");
const ActivityModel = require("../Models/ActivityModel");
const ParticipationModel = require("../Models/ParticipationModel");
const RewardModel = require("../Models/RewardModel");

const getDashboardHandler = async (req, res) => {
    try {
        const userId = req.user._id;
        const longitude = Number(req.query.longitude);
        const latitude = Number(req.query.latitude);

        const radius = req.query.radius
            ? Number(req.query.radius)
            : 500;

        // ---------------------------------------------
        // Validate location
        // ---------------------------------------------

        if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude)
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid longitude and latitude are required."
            });
        }

        if (
            longitude < -180 ||
            longitude > 180 ||
            latitude < -90 ||
            latitude > 90
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid geographic coordinates."
            });
        }

        if (!Number.isFinite(radius) || radius <= 0) {
            return res.status(400).json({
                success: false,
                message: "Radius must be a positive number."
            });
        }

        // ---------------------------------------------
        // Current user
        // ---------------------------------------------

        const user = await UserModel.findById(userId)
            .select("name email points createdAt")
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // ---------------------------------------------
        // Current time
        // ---------------------------------------------

        const now = new Date();

        // ---------------------------------------------
        // User's participation records
        // ---------------------------------------------

        const participationRecords =
            await ParticipationModel.find({
                user: userId
            })
            .select("activity status createdAt")
            .populate({
                path: "activity",
                select: `
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
                    select: "name"
                }
            })
            .lean();

        // ---------------------------------------------
        // Activities joined
        // ---------------------------------------------

        const activeParticipations =
            participationRecords.filter(
                (participation) =>
                    participation.status === "active"
            );

        const joinedActivityIds = activeParticipations
            .map((participation) => participation.activity?._id)
            .filter(Boolean);

        // ---------------------------------------------
        // Activities created by user
        // ---------------------------------------------

        const activitiesCreated =
            await ActivityModel.countDocuments({
                createdBy: userId
            });

        // ---------------------------------------------
        // Upcoming activities joined by user
        // ---------------------------------------------

        const upcomingActivities =
            activeParticipations
                .filter(
                    (participation) =>
                        participation.activity &&
                        new Date(
                            participation.activity.activityDate
                        ) > now
                )
                .sort(
                    (a, b) =>
                        new Date(
                            a.activity.activityDate
                        ) -
                        new Date(
                            b.activity.activityDate
                        )
                )
                .slice(0, 5)
                .map((participation) => ({
                    activityId: participation.activity._id,
                    title: participation.activity.title,
                    activityDate:
                        participation.activity.activityDate,
                    activityDuration:
                        participation.activity.activityDuration,
                    host:
                        participation.activity.createdBy?.name ||
                        "Unknown"
                }));

        // ---------------------------------------------
        // Nearby activities
        // ---------------------------------------------

        const nearbyActivities =
            await ActivityModel.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [
                                longitude,
                                latitude
                            ]
                        },
                        distanceField: "distance",
                        maxDistance: radius,
                        spherical: true
                    }
                },

                // Don't show activities that have already started
                {
                    $match: {
                        activityDate: {
                            $gt: now
                        }
                    }
                },

                {
                    $sort: {
                        distance: 1
                    }
                },

                {
                    $limit: 10
                },

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

                {
                    $project: {
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

                        creator: {
                            _id: "$creator._id",
                            name: "$creator.name"
                        }
                    }
                }
            ]);

        // ---------------------------------------------
        // Format nearby activities
        // ---------------------------------------------

        const formattedNearbyActivities =
            await Promise.all(
                nearbyActivities.map(async (activity) => {

                    const participantCount =
                        await ParticipationModel.countDocuments({
                            activity: activity._id,
                            status: "active"
                        });

                    let registrationStatus = "Registration Open";

                    if (
                        activity.registrationDeadline &&
                        new Date(
                            activity.registrationDeadline
                        ) <= now
                    ) {
                        registrationStatus =
                            "Registration Closed";
                    }

                    if (
                        participantCount >=
                        activity.maxParticipants
                    ) {
                        registrationStatus = "Full";
                    }

                    return {
                        activityId: activity._id,

                        title: activity.title,

                        description:
                            activity.description,

                        distance:
                            Math.round(activity.distance),

                        activityDate:
                            activity.activityDate,

                        duration:
                            activity.activityDuration,

                        maxParticipants:
                            activity.maxParticipants,

                        participants:
                            participantCount,

                        spotsFilled:
                            `${participantCount} / ${activity.maxParticipants}`,

                        points:
                            activity.points || 0,

                        status:
                            activity.status,

                        registrationStatus,

                        hostedBy:
                            activity.creator?.name ||
                            "Unknown"
                    };
                })
            );

        // ---------------------------------------------
        // Reward catalog
        // ---------------------------------------------

        const rewards =
            await RewardModel.find({})
                .select(`
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

        const formattedRewards =
            rewards.map((reward) => ({
                rewardId: reward._id,

                title: reward.title,

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
                    user.points >=
                    reward.pointsRequired
            }));

        // ---------------------------------------------
        // Dashboard statistics
        // ---------------------------------------------

        const activitiesJoined =
            activeParticipations.length;

        const upcomingPlans =
            upcomingActivities.length;

        // ---------------------------------------------
        // Final response
        // ---------------------------------------------

        return res.status(200).json({
            success: true,

            message: "Dashboard data fetched successfully.",

            user: {
                id: user._id,
                name: user.name,
                email: user.email
            },

            statistics: {
                availablePoints:
                    user.points || 0,

                activitiesJoined,

                activitiesCreated,

                upcomingPlans
            },

            location: {
                longitude,
                latitude,
                radius
            },

            nearbyActivities:
                formattedNearbyActivities,

            upcomingSchedule:
                upcomingActivities,

            rewardsWallet: {
                balance:
                    user.points || 0,

                rewards:
                    formattedRewards
            }
        });

    } catch (error) {

        console.error(
            "Dashboard Handler Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard data.",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined
        });
    }
};

module.exports = {
    getDashboardHandler
};