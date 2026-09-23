const ParticipationModel = require("../Models/ParticipationModel");
const ActivityModel = require("../Models/ActivityModel")
const mongoose = require("mongoose");

async function joinActivityHandler(req, res){
    let session;
    try{
        const {activityId} = req.params;

        //Cheking for valid user. Although done by middleware but extra checking.
        if(!req.user || !req.user._id){
            return res.status(400).json({
                message: "Unauthorized access",
                status: "failure"
            })
        }

        //Missing activity id
        if(!activityId){
            return res.status(400).json({
                meessage: "Activity Id is required",
                status: "failure"
            })
        }

        //Only whitespaces
        if(typeof activityId !== "string" || activityId.trim() === ""){
            return res.status(400).json({
                message: "Activity Id can't be empty",
                status: "failure"
            });
        }

        const normalizedActivityId = activityId.trim();

        if(!mongoose.Types.ObjectId.isValid(normalizedActivityId)){
            return res.status(400).json({
                message: "Invalid activity Id",
                status: "failure"
            });
        }

        session = await mongoose.startSession();

        let joinedParticipation;
        let joinedActivity;
        let wasRejoin = false;

        await session.withTransaction(async() => {
            const currentTime = new Date();

            const activity = await ActivityModel
            .findById(normalizedActivityId)
            .session(session);


            if(!activity){
                return res.status(404).json({
                    message: "Activity not found",
                    status: "failure"
                });
            }
            //Activity status validation
            
            //Activity is closed
            if(activity.status === "closed"){
                return res.status(400).json({
                    message: "This activity is closed and can't be joined",
                    status: "failure"
                });
            }

            //Activity is completed
            if(activity.status === "completed"){
                return res.status(400).json({
                    message: "Completed activities can't be joined",
                    status: "failure"
                });
            }

            //Activity is cancelled
            if(activity.status === "cancelled"){
                return res.status(400).json({
                    message: "Cancelled activities can't be joined",
                    status: "failure"
                });
            }

            if(activity.status !== "active"){
                return res.status(400).json({
                    message: "Activity can't be joined in its current state",
                    status: "failure"
                });
            }

            //Registration deadline passed
            if(currentTime >= activity.registrationDeadline){
                return res.status(400).json({
                    message: "Registration deadline has passed",
                    status: "failure"
                });
            }

            //Activity time validation
            if(currentTime >= activity.activityDate){
                return res.status(400).json({
                    message: "Activity has already been started or passed",
                    status: "failure"
                });
            }

            //Duplicate participant validation
            const existingParticipant = await ParticipationModel
            .findOne({
                userId: req.user._id,
                activityId: activity._id
            })
            .session(session);

            if(existingParticipant && existingParticipant.status === "joined"){
                return res.status(400).json({
                    message: "You have already joined this activity",
                    status: "failure"
                });
            }

            if (existingParticipant && existingParticipant.status === "completed") {
                return res.status(400).json({
                    message: "You have already completed this activity",
                    status: "failure"
                });
            }

            /***
             * 
             * The activity creator should automatically have a participation record 
             * 
             * The duplicate check above should normally prevent the creator from joining again.
             * 
             * This additional check protects against inconsistent data where the creator's participation record was not created
             */

            if(activity.createdBy.toString() === req.user._id.toString()){
                return res.status(400).json({
                    message: "Activity creator is already considered as a participant",
                    status: "failure"
                });
            }
            

            //Maximum participation validation
            
            const participantCount = await ParticipationModel
            .countDocuments({
                activityId: activity._id,
                status: "joined"
            })
            .session(session);

            /****
             * 
             * Conditions:
             * 
             * 1. participantCount < maxParticipant --> allowed to join
             * 
             * 2. participantCount == maxParticipant --> reject
             * 
             * 3. participantCount > maxParticipant --> reject
             */

            if(participantCount >= activity.maxParticipants){
                return res.status(400).json({
                    message: "Maximum participant limit has been reached",
                    status: "failure"
                });
            }

            /*
                    IMPORTANT:

                    We modify the Activity document inside the
                    transaction.

                    This makes the Activity document the common
                    write-conflict point for simultaneous joins.
                */

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

            if(activityWriteResult.matchedCount !== 1){
                return res.status(409).json({
                    message: "The activity was updated by another request. Please try again.",
                    status: "failure"
                })
            }

            if(existingParticipant && existingParticipant.status === "cancelled"){
                // Allow rejoining
                existingParticipant.status = "joined";
                existingParticipant.joinedAt = new Date();
                existingParticipant.completedAt = undefined;
                existingParticipant.pointsAwarded = undefined;
                await existingParticipant.save({
                    session
                });
            }else {
                // Create new participation
                const newParticipation =
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
                joinedParticipation = newParticipation[0];
                joinedActivity = activity;
            }
                // Check whether activity became full
                const updatedParticipantCount =
                    await ParticipationModel
                        .countDocuments({
                            activityId: activity._id,
                            status: "joined"
                        })
                        .session(session);


                if(updatedParticipantCount >= activity.maxParticipants){
                    activity.status = "closed";
                    activity.closureReason = "full";

                    await activity.save({
                        session
                    });
                }

            });

            // =========================================================
            // 4. Activity joined notification
            // =========================================================
            //
            // Transaction has committed successfully.
            //
            // Notify activity creator.
            //
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

            return res.status(wasRejoin ? 200 : 201).json({
                message: wasRejoin ? "You have successfully rejoined the activity" : "Successfully joined the activity",
                participation: joinedParticipation,
                activityStatus: joinedActivity.status,
                status: "success"
            });

    }catch(err){
        console.error("Join activity error:", err);

        //Duplicate key error
        if(err.code === 11000){
            return res.status(409).json({
                message: "You have already joined this activity",
                status: "failure"
            });
        }

        if(err.name === "CastError"){
            return res.status(400).json({
                message: "Invalid data provided",
                status: "failure"
            });
        }

        if(err.name === "ValidationError"){
            return res.status(400).json({
                message: err.message,
                status: "failure"
            });
        }

        return res.status(500).json({
            message: "Unable to join the activity. Please try again later",
            status: "failure"
        })
    }
}

async function leaveActivityHandler(req, res){

    try{
        const {activityId} = req.params;

        if(!req.user || !req.user._id){
            return res.status(401).json({
                message: "Unauthorized access",
                status: "failure"
            });
        }

        if(!activityId){
            return res.status(400).json({
                message: "Activity Id is required",
                status: "failure"
            });
        }

        if(typeof activityId !== "string" || activityId.trim() === ""){
            return res.status(400).json({
                message: "Invalid activity Id",
                status: "failure"
            });
        }

        const normalizedActivityId = activityId.trim();
        
        if(!mongoose.Types.ObjectId.isValid(normalizedActivityId)){
            return res.status(400).json({
                message: "Invalid activity Id",
                status: "failure"
            });
        }

        //Activity validation
        const activity = await ActivityModel.findById(normalizedActivityId);

        if(!activity){
            return res.status(404).json({
                message: "Activity not found",
                status: "failure"
            });
        }

        //Creator validation
        if(activity.createdBy.toString() === req.user._id.toString()){
            return res.status(403).json({
                message: "Activity creator cannot leave their own activity. You can cancel the activity instead",
                status: "failure"
            });
        }

        //Activity status validation

        //Activity is completed
        if(activity.status === "completed"){
            return res.status(400).json({
                message: "You can't leave a completed activity",
                status: "failure"
            });
        }

        //Activity is cancelled
        if(activity.status === "cancelled"){
            return res.status(400).json({
                message: "You can't leave a cancelled activity",
                status: "failure"
            });
        }

        //Activity time validation
        const currentTime = new Date();

        //Find participation
        const participation = await ParticipationModel.findOne({
            userId: req.user._id,
            activityId: activity._id
        });

        if(!participation){
            return res.status(404).json({
                message: "You have not joined this activity",
                status: "failure"
            });
        }

        //Participation already cancelled
        if(participation.status === "cancelled"){
            return res.status(400).json({
                message: "You have already left this activity",
                status: "failure"
            });
        }

        //Participation completed
        if(participation.status === "completed"){
            return res.status(400).json({
                message: "Completed participation cannot be cancelled",
                status: "failure"
            })
        }

        /***
         * 
         * Don't allow the users to leave after the registration deadline
         * 
         * Once registrationDeadline has passed, the participant
         * list should be considered finalized.
         * 
         */

        if(currentTime >= activity.registrationDeadline){
            return res.status(400).json({
                message: "You cannot leave after registration deadline",
                status: "failure"
            });
        }

         /***
         * 
         * Don't allow the users to leave after the activity has started
         * 
         * Once activityDate has passed, the activity is either running or already finished
         * 
         */

        if(currentTime >= activity.activityDate){
            return res.status(400).json({
                message: "You cannot leave after the activity has started",
                status: "failure"
            });
        }

        //Update participation
        participation.status = "cancelled";
        await participation.save();


        //Activity is closed
        if (activity.status === "closed" && activity.closureReason === "full" && currentTime < activity.registrationDeadline && currentTime < activity.activityDate){
            activity.status = "active";
            activity.closureReason = null;

            await activity.save();
        }

        
        //Activity reopening logic
        //Case 1: Activity is active
        if(activity.status === "active"){
            return res.status(200).json({
                message: "You have successfully left the activity",
                activityStatus: "active",
                participation,
                status: "success"
            });
        }

        /*
            CASE 2:
            Activity is closed.

            It could have been:
            1. Manually closed by creator
            2. Automatically closed because maximum
               participants was reached
        */

        if(activity.status === "closed"){
            return res.status(200).json({
                message: "You have successfully left the activity. The activity remains closed.",
                activityStatus: "closed",
                participation,
                status: "success"
            });
        }

        return res.status(200).json({
            message: "You have successfully left the activity",
            participation,
            status: "success"
        });
    }catch(err){
        console.error("Leave activity error:", err);

        //Duplicate key error
        if(err.code === 11000){
            return res.status(409).json({
                message: "Duplicate participation record detected",
                status: "failure"
            });
        }

        if(err.name === "CastError"){
            return res.status(400).json({
                message: "Invalid data provided",
                status: "failure"
            });
        }

        if(err.name === "ValidationError"){
            return res.status(400).json({
                message: err.message,
                status: "failure"
            });
        }

        return res.status(500).json({
            message: "Unable to leave activity. Please try again later.",
            status: "failure"
        })
    }
    
}

async function getMyParticipationHandler(req, res) {
    try {

        // 1. AUTHENTICATION VALIDATION
        // protectedRouteMiddleware should normally guarantee this.
        // This is an additional defensive check.
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "failure"
            });
        }

        // =========================================================
        // 2. STATUS FILTER VALIDATION
        // =========================================================

        const { status } = req.query;

        const allowedStatuses = [
            "joined",
            "completed",
            "cancelled"
        ];

        if(status !== undefined){
            // Query parameters should normally be strings.
            if (typeof status !== "string" || status.trim() === ""){
                return res.status(400).json({
                    message: "Invalid status",
                    status: "failure"
                });
            }

            const normalizedStatus = status.trim().toLowerCase();

            if(!allowedStatuses.includes(normalizedStatus)){
                return res.status(400).json({
                    message: "Invalid status. Status must be joined, completed, or cancelled",
                    status: "failure"
                });
            }
        }

        // 3. BUILD PARTICIPATION QUERY
        const participationQuery = {
            userId: req.user._id
        };

        // Apply status filter only when supplied.
        if (status !== undefined) {
            participationQuery.status = status.trim().toLowerCase();
        }

        // 4. FETCH PARTICIPATIONS
        const participations = await ParticipationModel
            .find(participationQuery)
            .populate("activityId")
            .sort({ joinedAt: -1 });

        // 5. NO PARTICIPATIONS
        if (participations.length === 0) {
            return res.status(200).json({
                message: "No participations found",
                count: 0,
                participations: [],
                status: "success"
            });
        }

        // 6. ACTIVITY REFERENCE VALIDATION
        const invalidParticipation = participations.find(
            participation => !participation.activityId
        );

        if (invalidParticipation) {
            console.error("Data integrity issue: Participation references a non-existing activity",invalidParticipation._id);
            return res.status(500).json({
                message: "Unable to fetch participations because one or more referenced activities no longer exist",
                status: "failure"
            });
        }

        // 7. SUCCESS RESPONSE
        return res.status(200).json({
            message: "Participations fetched successfully",
            count: participations.length,
            participations,
            status: "success"
        });

    }catch(err){
        console.error("Get my participation error:",err);

        // Mongoose CastError
        if (err.name === "CastError") {
            return res.status(400).json({
                message: "Invalid participation data",
                status: "failure"
            });
        }

        // Mongoose validation error
        if (err.name === "ValidationError") {
            return res.status(400).json({
                message: err.message,
                status: "failure"
            });
        }

        return res.status(500).json({
            message: "Unable to fetch your participations. Please try again later.",
            status: "failure"
        });
    }
}

async function getActivityParticipantsHandler(req, res) {

    try {

        // =========================================================
        // 1. AUTHENTICATION VALIDATION
        // =========================================================

        // protectedRouteMiddleware should already verify the JWT
        // and attach the authenticated user to req.user.
        //
        // This is an additional defensive check.

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

        // Activity ID missing
        if (activityId === undefined || activityId === null){
            return res.status(400).json({
                message: "Activity Id is required",
                status: "failure"
            });
        }

        // Activity ID must be a string and cannot be empty
        if (typeof activityId !== "string" || activityId.trim() === ""){
            return res.status(400).json({
                message: "Invalid activity Id",
                status: "failure"
            });
        }

        // Remove unnecessary leading/trailing spaces
        const normalizedActivityId = activityId.trim();

        // Validate MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(normalizedActivityId)){
            return res.status(400).json({
                message: "Invalid activity Id",
                status: "failure"
            });
        }

        // =========================================================
        // 3. ACTIVITY VALIDATION
        // =========================================================

        const activity = await ActivityModel.findById(
            normalizedActivityId
        );

        // Activity does not exist
        if(!activity){
            return res.status(404).json({
                message: "Activity not found",
                status: "failure"
            });
        }

        if (activity.createdBy.toString() !== req.user._id.toString()){
            return res.status(403).json({
                message: "Only the activity creator can view the participant list",
                status: "failure"
            });
        }

        // 4. AUTHORIZATION VALIDATION
        // const isActivityCreator = activity.createdBy.toString() === req.user._id.toString();

        // let requestingUserParticipation = null;

        // // Creator does not need a participation record
        // // to view the participant list.
        // if (!isActivityCreator) {
        //     requestingUserParticipation = await ParticipationModel.findOne({
        //             userId: req.user._id,
        //             activityId: activity._id
        //         });

        //     // User is not involved in this activity
        //     if (!requestingUserParticipation) {
        //         return res.status(403).json({
        //             message: "You are not authorized to view the participants of this activity",
        //             status: "failure"
        //         });
        //     }

        //     // A cancelled participant is no longer an active
        //     // participant and therefore cannot access the list.
        //     if(requestingUserParticipation.status === "cancelled"){
        //         return res.status(403).json({
        //             message: "You are no longer a participant of this activity",
        //             status: "failure"
        //         });
        //     }

        //     // A completed participant is no longer an active
        //     // participant.
        //     if(requestingUserParticipation.status === "completed"){
        //         return res.status(403).json({
        //             message: "Completed participants cannot access the participant list",
        //             status: "failure"
        //         });
        //     }

        //     // Defensive check for unexpected participation state
        //     if(requestingUserParticipation.status !== "joined"){
        //         return res.status(403).json({
        //             message: "You are not authorized to view the participants of this activity",
        //             status: "failure"
        //         });
        //     }
        // }

        
        // 5. FETCH PARTICIPANTS
        const participants = await ParticipationModel
            .find({
                activityId: activity._id
            })
            .select("_id userId status joinedAt completedAt pointsAwarded")
            .populate({
                path: "userId",
                select: "name email points createdAt"
            })
            .sort({
                joinedAt: 1
            });

        // 6. NO PARTICIPANTS
        if (participants.length === 0) {
            return res.status(200).json({
                message: "No participants found",
                count: 0,
                participants: [],
                status: "success"
            });
        }

        // =========================================================
        // 7. PARTICIPANT DATA VALIDATION
        // =========================================================

        /*
         * If a Participation document references a user that
         * no longer exists, populate() will return userId: null.
         *
         * This indicates a data-integrity problem.
         */

        const invalidParticipant = participants.find(
            participant => !participant.userId
        );

        if(invalidParticipant){
            console.error("Data integrity issue: Participation references a non-existing user",invalidParticipant._id);
            return res.status(500).json({
                message: "Unable to fetch participants because one or more referenced users no longer exist",
                status: "failure"
            });
        }

        // =========================================================
        // 8. SUCCESS RESPONSE
        // =========================================================

        return res.status(200).json({
            message: "Activity participants fetched successfully",
            activityId: activity._id,
            count: participants.length,
            participants,
            status: "success"
        });

    }catch(err){
        console.error("Get activity participants error:",err);
        // =========================================================
        // MONGOOSE CAST ERROR
        // =========================================================

        if(err.name === "CastError"){
            return res.status(400).json({
                message: "Invalid activity or participant data",
                status: "failure"
            });
        }

        // =========================================================
        // MONGOOSE VALIDATION ERROR
        // =========================================================

        if (err.name === "ValidationError") {
            return res.status(400).json({
                message: err.message,
                status: "failure"
            });
        }

        // =========================================================
        // INTERNAL SERVER ERROR
        // =========================================================

        return res.status(500).json({
            message: "Unable to fetch activity participants. Please try again later.",
            status: "failure"
        });
    }
}

module.exports = {
    joinActivityHandler,
    leaveActivityHandler,
    getMyParticipationHandler,
    getActivityParticipantsHandler
}