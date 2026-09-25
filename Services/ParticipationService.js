const ParticipationModel = require("../Models/ParticipationModel");

async function getParticipantCount(activityId) {
    const participantCount = await ParticipationModel.countDocuments({
        activity: activityId,
        status: "active",
    });

    return participantCount;
}

module.exports = {
    getParticipantCount,
};