const mongoose = require("mongoose");
const ParticipationModel = require("../Models/ParticipationModel");


/**
 * Get the number of currently joined participants
 * for a particular activity.
 *
 * ParticipationModel fields:
 *
 * userId
 * activityId
 * status
 *
 * Active participation:
 *
 * status = "joined"
 */
async function getJoinedParticipantCount(activityId) {

    if (
        activityId === undefined ||
        activityId === null
    ) {
        throw new Error(
            "Activity ID is required"
        );
    }

    if (
        !mongoose.Types.ObjectId.isValid(
            activityId
        )
    ) {
        throw new Error(
            "Invalid Activity ID"
        );
    }

    const participantCount =
        await ParticipationModel.countDocuments({
            activityId: activityId,
            status: "joined"
        });

    return participantCount;
}


module.exports = {
    getJoinedParticipantCount
};