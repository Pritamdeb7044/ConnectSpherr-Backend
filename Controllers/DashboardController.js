const mongoose = require("mongoose");

const UserModel = require("../Models/UserModel");
const ActivityModel = require("../Models/ActivityModel");
const ParticipationModel = require("../Models/ParticipationModel");
const RewardModel = require("../Models/RewardModel");

export const getDashboardHandler = async (req, res) => {
  try {
    // --------------------------------------------------
    // 1. Verify authenticated user
    // --------------------------------------------------
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

    // --------------------------------------------------
    // 2. Get query parameters
    // --------------------------------------------------
    const { longitude, latitude, radius } = req.query;

    // --------------------------------------------------
    // 3. Validate longitude
    // --------------------------------------------------
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

    if (parsedLongitude < -180 || parsedLongitude > 180) {
      return res.status(400).json({
        success: false,
        message: "Longitude must be between -180 and 180.",
      });
    }

    // --------------------------------------------------
    // 4. Validate latitude
    // --------------------------------------------------
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

    if (parsedLatitude < -90 || parsedLatitude > 90) {
      return res.status(400).json({
        success: false,
        message: "Latitude must be between -90 and 90.",
      });
    }

    // --------------------------------------------------
    // 5. Validate radius
    // --------------------------------------------------
    const parsedRadius =
      radius === undefined || radius === null || String(radius).trim() === ""
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

    // --------------------------------------------------
    // 6. Current time
    // --------------------------------------------------
    const now = new Date();

    // --------------------------------------------------
    // 7. Fetch current user
    // --------------------------------------------------
    const user = await UserModel.findById(userObjectId)
      .select("_id name email points location createdAt")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // --------------------------------------------------
    // 8. Fetch user's participation records
    // --------------------------------------------------
    const participationRecords = await ParticipationModel.find({
      user: userObjectId,
    })
      .select("activity status createdAt")
      .populate({
        path: "activity",
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
          select: "_id name",
        },
      })
      .lean();

    // --------------------------------------------------
    // 9. Active participations
    // --------------------------------------------------
    const activeParticipations = participationRecords.filter(
      (participation) =>
        participation.status === "active" && participation.activity
    );

    // --------------------------------------------------
    // 10. Activities joined
    // --------------------------------------------------
    const activitiesJoined = activeParticipations.length;

    // --------------------------------------------------
    // 11. Activities created by user
    // --------------------------------------------------
    const activitiesCreated = await ActivityModel.countDocuments({
      createdBy: userObjectId,
    });

    // --------------------------------------------------
    // 12. Upcoming activities
    // --------------------------------------------------
    const upcomingActivities = activeParticipations
      .filter(
        (participation) =>
          new Date(participation.activity.activityDate) > now
      )
      .sort(
        (a, b) =>
          new Date(a.activity.activityDate) -
          new Date(b.activity.activityDate)
      )
      .slice(0, 5)
      .map((participation) => {
        const activity = participation.activity;
        return {
          activityId: activity._id,
          title: activity.title,
          activityDate: activity.activityDate,
          activityDuration: activity.activityDuration,
          registrationDeadline: activity.registrationDeadline,
          host: activity.createdBy?.name || "Unknown",
        };
      });

    // --------------------------------------------------
    // 13. Upcoming plans count
    // --------------------------------------------------
    const upcomingPlans = upcomingActivities.length;

    // --------------------------------------------------
    // 14. Nearby activities with safe lookup & participant counting
    // --------------------------------------------------
    const nearbyActivities = await ActivityModel.aggregate([
      // Geo search
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [parsedLongitude, parsedLatitude],
          },
          distanceField: "distance",
          maxDistance: parsedRadius,
          spherical: true,
        },
      },
      // Future and open/active activities only
      {
        $match: {
          activityDate: { $gt: now },
          status: { $in: ["active", "open"] },
        },
      },
      // Nearest first
      {
        $sort: { distance: 1 },
      },
      // Dashboard limit
      {
        $limit: 10,
      },
      // Host / Creator info
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $unwind: {
          path: "$creator",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Lookup active participations with ObjectId conversion safeguard
      {
        $lookup: {
          from: "participations",
          let: { activityId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        { $toObjectId: "$activity" },
                        "$$activityId",
                      ],
                    },
                    { $eq: ["$status", "active"] },
                  ],
                },
              },
            },
          ],
          as: "activeParticipations",
        },
      },
      // Count participants via array size ($size avoids empty array count crashes)
      {
        $addFields: {
          participantCount: { $size: "$activeParticipations" },
        },
      },
      // Project fields
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
            name: "$creator.name",
          },
        },
      },
    ]);

    // --------------------------------------------------
    // 15. Format nearby activities
    // --------------------------------------------------
    const formattedNearbyActivities = nearbyActivities.map((activity) => {
      const participantCount = Number(activity.participantCount) || 0;
      const maxParticipants = Number(activity.maxParticipants) || 1;

      let registrationStatus = "Registration Open";

      if (
        activity.registrationDeadline &&
        new Date(activity.registrationDeadline) <= now
      ) {
        registrationStatus = "Registration Closed";
      }

      if (participantCount >= maxParticipants) {
        registrationStatus = "Full";
      }

      return {
        activityId: activity._id,
        title: activity.title,
        description: activity.description,
        distance: Math.round(activity.distance),
        activityDate: activity.activityDate,
        duration: activity.activityDuration,
        maxParticipants,
        participantCount,
        participants: participantCount,
        spotsFilled: `${participantCount} / ${maxParticipants}`,
        participationPercentage:
          maxParticipants > 0
            ? Math.min(
                100,
                Math.round((participantCount / maxParticipants) * 100)
              )
            : 0,
        points: activity.points || 0,
        status: activity.status,
        registrationStatus,
        hostedBy: activity.creator?.name || "Unknown",
        createdBy: activity.creator?._id || null,
      };
    });

    // --------------------------------------------------
    // 16. Fetch rewards
    // --------------------------------------------------
    const rewards = await RewardModel.find({})
      .select(`
        _id
        title
        description
        pointsRequired
        voucherValue
        voucherProvider
        expiryDate
      `)
      .sort({ pointsRequired: 1 })
      .limit(5)
      .lean();

    // --------------------------------------------------
    // 17. Format rewards
    // --------------------------------------------------
    const formattedRewards = rewards.map((reward) => ({
      rewardId: reward._id,
      title: reward.title,
      description: reward.description,
      pointsRequired: reward.pointsRequired,
      voucherValue: reward.voucherValue,
      voucherProvider: reward.voucherProvider,
      expiryDate: reward.expiryDate,
      available: (user.points || 0) >= reward.pointsRequired,
    }));

    // --------------------------------------------------
    // 18. Final dashboard response
    // --------------------------------------------------
    return res.status(200).json({
      success: true,
      message: "Dashboard data fetched successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        points: user.points || 0,
        location: user.location,
        createdAt: user.createdAt,
      },
      statistics: {
        availablePoints: user.points || 0,
        activitiesJoined,
        activitiesCreated,
        upcomingPlans,
      },
      location: {
        longitude: parsedLongitude,
        latitude: parsedLatitude,
        radius: parsedRadius,
      },
      nearbyActivities: formattedNearbyActivities,
      upcomingSchedule: upcomingActivities,
      rewardsWallet: {
        balance: user.points || 0,
        rewards: formattedRewards,
      },
    });
  } catch (error) {
    console.error("getDashboardHandler error:", error);

    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({
        success: false,
        message: "Invalid dashboard data.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data.",
      ...(process.env.NODE_ENV === "development" && {
        error: error.message,
      }),
    });
  }
};

module.exports = {
    getDashboardHandler
};