const UserModel = require("../Models/UserModel")
const ActivityModel = require("../Models/ActivityModel");
const ParticipationModel = require("../Models/ParticipationModel");
const PointTransactionModel = require("../Models/PointTransactionModel");

const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function createActivityHandler(req, res){

    let session;
    try{
        session = await mongoose.startSession();
        const userobject = req.body;

        //Required details are present or not
        if(!userobject.title || !userobject.description || !userobject.location || !userobject.maxParticipants || !userobject.activityDate ||!userobject.activityDuration ||!userobject.registrationDeadline){
            return res.status(400).json({
                message: "Required fields are missing",
                status: "failure"
            })
        }

        //checking for string and number type
        if(typeof userobject.title !== "string" || typeof userobject.description !== "string" || typeof userobject.maxParticipants !== "number" || typeof userobject.activityDuration !== "number"){
            return res.status(400).json({
                message: "Invalid type",
                status: "failed"
            })
        }


        //Only whitespace
        if (userobject.title.trim() === "" || userobject.description.trim() === "") {
            return res.status(400).json({
                message: "Only whitespace is not allowed",
                status: "failed"
            });
        }

        //Minimum and maximum length of title
        const normalizedTitle = userobject.title.trim();
        const normalizedDescription = userobject.description.trim();

        if (normalizedTitle.length < 4 || normalizedTitle.length > 100) {
            return res.status(400).json({
                message: "Invalid title size",
                status: "failed"
            });
        }
        if (normalizedDescription.length < 10 || normalizedDescription.length > 1000) {
            return res.status(400).json({
                message: "Invalid description size",
                status: "failed"
            });
        }

        //Special check for location
        if (userobject.location === null) {
            return res.status(400).json({
                message: "Location cannot be null",
                status: "failed"
            });
        }

        if (typeof userobject.location !== "object" || Array.isArray(userobject.location)) {
            return res.status(400).json({
                message: "Invalid location format",
                status: "Failed"
            });
        }

        if (userobject.location.type !== "Point") {
            return res.status(400).json({
                message: 'Location type must be "Point"',
                status: "failed"
            });
        }

        if (!Array.isArray(userobject.location.coordinates)) {
            return res.status(400).json({
                message: "Coordinates must be an array",
                status: "Failed"
            });
        }

        if (userobject.location.coordinates.length === 0) {
            return res.status(400).json({
                message: "Coordinates cannot be empty",
                status: "Failed"
            });
        }

        if (userobject.location.coordinates.length !== 2) {
            return res.status(400).json({
                message: "Point coordinates must contain longitude and latitude",
                status: "Failed"
            });
        }

        const [longitude, latitude] = userobject.location.coordinates;

        if (typeof longitude !== "number" || typeof latitude !== "number" || !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
            return res.status(400).json({
                message: "Longitude and latitude must be valid numbers",
                status: "failed"
            });
        }

        if (longitude < -180 || longitude > 180) {
            return res.status(400).json({
                message: "Longitude must be between -180 and 180",
                status: "failed"
            });
        }

        if (latitude < -90 || latitude > 90) {
            return res.status(400).json({
                message: "Latitude must be between -90 and 90",
                status: "failed"
            });
        }

        // Parse activity date
        const parsedActivityDate = new Date(userobject.activityDate);
        // Invalid activity date
        if (Number.isNaN(parsedActivityDate.getTime())) {
            return res.status(400).json({
                message: "Invalid activity date",
                status: "Failed"
            });
        }

        // Activity must be in the future
        if(parsedActivityDate.getTime() <= Date.now()){
            return res.status(400).json({
                message:"Activity date must be in the future",
                status: "Failed"
            });
        }

        if(!Number.isFinite(userobject.activityDuration) || !Number.isInteger(userobject.activityDuration)){
            return res.status(400).json({
                message: "Activity duration must be a valid number",
                status: "failure"
            })
        }

        if(userobject.activityDuration < 30 || userobject.activityDuration > 180){
            return res.status(400).json({
                message: "Invalid activity duration",
                status: "failure"
            });
        }

        //Registration deadline validation
        const parsedRegistrationDeadline = new Date(userobject.registrationDeadline);

        if(Number.isNaN(parsedRegistrationDeadline.getTime())){
            return res.status(400).json({
                message: "Invalid registration deadline",
                status: "faliure"
            })
        }

        // Registration deadline MUST be EXACTLY 15 MINUTES
        // BEFORE activity start.
        const FIFTEEN_MINUTES = 15 * 60 * 1000;
        const expectedRegistrationDeadline = parsedActivityDate.getTime() - FIFTEEN_MINUTES;

        if(parsedRegistrationDeadline.getTime() !== expectedRegistrationDeadline){
            return res.status(400).json({
                message: "Registration deadline must be exactly 15 minutes before the activity start time",
                status: "failure"
            });
        }

        // Since activity must be in future and deadline is 15 minutes
        // before it, deadline must also be in future.

        if(parsedRegistrationDeadline.getTime() <= currentTime){
            return res.status(400).json({
                message: "Activity must start at least 15 minutes from now",
                status: "failure"
            });
        }

        if(parsedRegistrationDeadline.getTime() >= parsedActivityDate.getTime()){
            return res.status(400).json({
                message: "Registration deadline must be before the activity start time",
                status: "failure"
            });
        }

        if(!Number.isFinite(userobject.maxParticipants) || !Number.isInteger(userobject.maxParticipants)){
            return res.status(400).json({
                message: "Maximum participants must be a valid number",
                status: "failure"
            });
        }

        if(userobject.maxParticipants < 2){
            return res.status(400).json({
                message: "Maximum participant must be atleast 2",
                status: "faiure"
            });
        }

        const currentTime = new Date();

        const startOfDay = new Date(currentTime);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(currentTime);
        endOfDay.setHours(23, 59, 59, 999);

        const activitiesCreatedToday = await ActivityModel.countDocuments({
            createdBy: req.user._id,
            createdAt: {
                $gte: startOfDay, 
                $lte: endOfDay
            }
        })

        if(activitiesCreatedToday >= 5){
            return res.status(429).json({
                message: "You can create a maximum of 5 activities per day",
                status: "failure"
            });
        }

        let newActivity;
        let creatorParticipation;

        await session.withTransaction(async() => {
        //create activity
        const activityResult = await ActivityModel.create([{
            title: normalizedTitle,
            description:normalizedDescription,
            createdBy:req.user._id,
            location: {
                type: "Point",
                coordinates: [
                    longitude,
                    latitude
                    ]
                },
            activityDate:parsedActivityDate,
            activityDuration:userobject.activityDuration,
            registrationDeadline:parsedRegistrationDeadline,
            maxParticipants:userobject.maxParticipants,
            status: "active"
            }],
            {
                session
            });
            newActivity = activityResult[0];

            // Add creator as FIRST participant
            const participationResult = await ParticipationModel.create(
                    [
                        {
                            userId: req.user._id,
                            activityId:newActivity._id,
                            status: "joined",
                            joinedAt: new Date()
                        }
                    ],
                    {
                        session
                    }
                );
            creatorParticipation = participationResult[0];
        })

        // 18. CREATE NEARBY ACTIVITY NOTIFICATIONS
        // IMPORTANT:
        // This happens AFTER the transaction commits.
        //
        // If the transaction fails, this code is never reached.
        try {
            await NotificationService.createNearbyActivityNotifications({
                activity: newActivity,
                creatorId: req.user._id
            });

        }catch(notificationError){

            // Notification failure should NOT make the
            // successfully-created activity look like it failed.
            console.error("Nearby activity notification error:",notificationError);
        }

        return res.status(201).json({
            message: "Activity created successfully",
            activity: newActivity,
            status: "success"
        })

    }catch(err){ 
        console.error("Create activity error:", err); 
        //MONGOOSE CAST ERROR
        if(err instanceof mongoose.Error.CastError){ 
            return res.status(400).json({ message: "Invalid data format", status: "Failure" }); 
        } 
        //MONGOOSE VALIDATION ERROR
        if(err instanceof mongoose.Error.ValidationError){ 
            return res.status(400).json({ 
                message: "Activity validation failed", errors: Object.values(err.errors).map( error => error.message ), 
                status: "Failure" 
            }); 
        } 
        //DUPLICATE KEY ERROR 
        if(err.code === 11000){
            return res.status(409).json({ 
                message: "Duplicate activity data", 
                status: "Failure" 
            }); 
        } 
        //INTERNAL SERVER ERROR
        return res.status(500).json({ 
            message: "Internal server error", 
            status: "Failure" 
        }); 
    }finally{ 
        await session.endSession(); 
    }
}

async function getActivityHandler(req, res){

    try{
        // const userObject = req.body;
        const {activityId} = req.params;

        if(!activityId){
            return res.status(400).json({
                message: "Activity id is missing",
                status: "failure"
            })
        }

        // Remove unnecessary spaces
        const normalizedActivityId = activityId.trim();

        if(typeof normalizedActivityId !== "string" || normalizedActivityId === ""){
            return res.status(400).json({
                message: "Activity id can't be empty",
                status: "failure"
            })
        }

        if (!mongoose.Types.ObjectId.isValid(normalizedActivityId)) {
            return res.status(400).json({
                message: "Invalid activity ID",
                status: "failed"
            });
        }

        const activity = await ActivityModel.findById(normalizedActivityId);

        if (!activity) {
            return res.status(404).json({
                message: "Activity not found",
                status: "failed"
            });
        }

        // =========================================================
        // Automatic registration expiry handling
        // =========================================================
        //
        // If the activity is still marked as "active" but the
        // registration deadline has passed, close the activity.
        //
        // closureReason:
        // "registration_expired"
        //
        // This is a lazy/automatic status update. We don't need
        // a continuous timer or cron job.
        //
        const currentTime = new Date();

        if(activity.status === "active" && currentTime >= activity.registrationDeadline){
            activity.status = "closed";
            activity.closureReason = "registration_time_expired";

            await activity.save();
        }

        return res.status(200).json({
            message: "Activity fetched successfully",
            activity: activity,
            status: "success"
        });

    }catch(err){
        console.error("Get activity error", err);

        // ========================================================= // MONGOOSE VALIDATION ERROR // ========================================================= 
        if(err instanceof mongoose.Error.ValidationError){ 
            return res.status(400).json({ 
                message: "Activity validation failed", 
                errors: Object.values(err.errors).map( error => error.message ), 
                status: "failure" 
            }); 
        } 
        // ========================================================= // MONGOOSE CAST ERROR // ========================================================= 
        if(err instanceof mongoose.Error.CastError){ 
            return res.status(400).json({ 
                message: "Invalid activity data", 
                status: "failure" 
            }); 
        }

        return res.status(500).json({
            message:"Unable to fetch ativity. Please try again later.",
            status: "failure"
        });
    }
    
}

async function updateActivityHandler(req, res){
    try{
        const userObject = req.body;
        const {activityId} = req.params;

        if(!req.user._id){
            return res.status(401).json({
                message: "unauthorized acccess",
                status: "failure"
            })
        }

        if(!activityId){
            return res.status(400).json({
                message: "Activity id is required",
                status: "faliure"
            })
        }

        if(typeof activityId !== "string" || activityId.trim() === ""){
            return res.status(400).json({
                message: "invalid activity id",
                status: "failure"
            })
        }

        const normalizedActivityId = activityId.trim();

        if(!mongoose.Types.ObjectId.isValid(normalizedActivityId)){
            return res.status(400).json({
                message: "Invalid activity ID",
                status: "failure"
            });
        }

        const activity = await ActivityModel.findById(normalizedActivityId);

        if(!activity){
            return res.status(404).json({
                message: "Activity not found",
                status: "failure"
            });
        }

        const user = await UserModel.findById(req.user._id);

        if(!user){
            return res.status(401).json({
                message: "User no longer exists",
                status: "failure"
            });
        }

        if(activity.createdBy.toString() !== req.user._id.toString()){
            return res.status(403).json({
                message: "You are not authorized to update this",
                status: "failure"
            })
        }

        const now = Date.now();

        if(activity.status === "completed"){
            return res.status(400).json({
                message: "Completed activities cannot be updated",
                status: "failure"
            });
        }

        if(activity.status === "cancelled"){
            return res.status(400).json({
                message: "Cancelled activities cannot be updated",
                status: "failure"
            });
        }

        if (activity.status === "closed") {
            return res.status(400).json({
                message: "Closed activities cannot be updated",
                status: "failure"
            });
        }

        // Once registration deadline has passed, no update
        // is allowed.

        if(now >= activity.registrationDeadline.getTime()){
            return res.status(400).json({
                message: "Activity cannot be updated after the registration deadline",
                status: "failure"
            });
        }

        // Activity also cannot be updated once it has started.

        if(now >= activity.activityDate.getTime()){
            return res.status(400).json({
                message: "Activity cannot be updated after it has started",
                status: "failure"
            });
        }

        //1. Required details are present or not
        const allowedFields = [
            "title",
            "description",
            "location",
            "activityDate",
            "activityDuration",
            "registrationdeadline",
            "maxParticipants"
        ];

        const providedFields = allowedFields.filter(
            field => userObject[field] !== undefined
        )

        if(providedFields.length === 0){
            return res.status(400).json({
                message: "At least one field must be provided for update",
                status: "failure"
            });
        }

        const updateData = {};
        if (userObject.title !== undefined) {
            if (typeof userObject.title !== "string") {
                return res.status(400).json({
                    message: "Title must be a string",
                    status: "failure"
                });
            }

            const normalizedTitle = userObject.title.trim();

            if (normalizedTitle === "") {
                return res.status(400).json({
                    message: "Title cannot be empty",
                    status: "failure"
                });
            }


            if(normalizedTitle.length < 3 || normalizedTitle.length > 100){
                return res.status(400).json({
                    message:"Title must contain between 3 and 100 characters",
                    status: "failure"
                });

            }
            updateData.title = normalizedTitle;
        }

        //DESCRIPTION VALIDATION
        if (userObject.description !== undefined) {
            if (typeof userObject.description !== "string") {
                return res.status(400).json({
                    message: "Description must be a string",
                    status: "failure"
                });
            }
            const normalizedDescription = userObject.description.trim();

            if (normalizedDescription === "") {
                return res.status(400).json({
                    message:"Description cannot be empty",
                    status: "failure"
                });
            }


            if(normalizedDescription.length < 10 || normalizedDescription.length > 1000){
                return res.status(400).json({
                    message:"Description must contain between 10 and 1000 characters",
                    status: "failure"
                });
            }
            updateData.description = normalizedDescription;
        }

        //LOCATION VALIDATION
        if (userObject.location !== undefined) {
            if (userObject.location === null) {
                return res.status(400).json({
                    message: "Location cannot be null",
                    status: "failure"
                });
            }


            if (typeof userObject.location !== "object" || Array.isArray(userObject.location)) {
                return res.status(400).json({
                    message:"Invalid location format",
                    status: "failure"
                });
            }


            if (userObject.location.type !== "Point") {
                return res.status(400).json({
                    message:'Location type must be "Point"',
                    status: "failure"
                });
            }


            if (!Array.isArray(userObject.location.coordinates)) {
                return res.status(400).json({
                    message:"Coordinates must be an array",
                    status: "failure"
                });
            }


            if (userObject.location.coordinates.length !== 2) {
                return res.status(400).json({
                    message:"Coordinates must contain longitude and latitude",
                    status: "failure"
                });
            }


            const [longitude, latitude] = userObject.location.coordinates;


            if (typeof longitude !== "number" || typeof latitude !== "number" || !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
                return res.status(400).json({
                    message:"Longitude and latitude must be valid numbers",
                    status: "failure"
                });
            }


            if (longitude < -180 || longitude > 180) {
                return res.status(400).json({
                    message:"Longitude must be between -180 and 180",
                    status: "failure"
                });
            }


            if (latitude < -90 || latitude > 90) {
                return res.status(400).json({
                    message:"Latitude must be between -90 and 90",
                    status: "failure"
                });
            }


            updateData.location = {
                type: "Point",
                coordinates: [
                    longitude,
                    latitude
                ]
            };
        }


        //ACTIVITY DATE VALIDATION
        const finalActivityDate = activity.activityDate;
        if (userObject.activityDate !== undefined) {
            if (typeof userObject.activityDate === "string" && userObject.activityDate.trim() === "") {
                return res.status(400).json({
                    message:"Activity date cannot be empty",
                    status: "failure"
                });
            }


            const parsedActivityDate = new Date(userObject.activityDate);
            if (
                Number.isNaN(parsedActivityDate.getTime())) {
                return res.status(400).json({
                    message:"Invalid activity date",
                    status: "failure"
                });
            }

            if (parsedActivityDate.getTime() <= Date.now()) {
                return res.status(400).json({
                    message:"Activity date must be in the future",
                    status: "failure"
                });
            }
            finalActivityDate = parsedActivityDate;
            updateData.activityDate = parsedActivityDate;
        }

        //Activity duration validation
        if(userObject.activityDuration !== undefined){

            if(typeof userObject.activityDuration !== "number" || !Number.isFinite(userObject.activityDuration)){
                return res.status(400).json({
                    message: "Activity duration must be a valid number",
                    status: "failure"
                });
            }


            if(!Number.isInteger(userObject.activityDuration)){
                return res.status(400).json({
                    message: "Activity duration must be a whole number",
                    status: "failure"
                });
            }


            if(userObject.activityDuration < 30){
                return res.status(400).json({
                    message: "Activity duration must be at least 30 minutes",
                    status: "failure"
                });
            }


            if(userObject.activityDuration > 180){
                return res.status(400).json({
                    message: "Activity duration cannot exceed 180 minutes",
                    status: "failure"
                });
            }
            updateData.activityDuration = userObject.activityDuration;
        }

        //Registration deadline validation
        const finalRegistrationDeadline = activity.registrationDeadline;
        if (userObject.registrationDeadline !== undefined){

            if(typeof userObject.registrationDeadline === "string" && userObject.registrationDeadline.trim() === ""){
                return res.status(400).json({
                    message: "Registration deadline cannot be empty",
                    status: "failure"
                });
            }

            const parsedRegistrationDeadline = new Date(userObject.registrationDeadline);

            if (Number.isNaN(parsedRegistrationDeadline.getTime())){
                return res.status(400).json({
                    message: "Invalid registration deadline",
                    status: "failure"
                });
            }

            if(parsedRegistrationDeadline.getTime() <= Date.now()){
                return res.status(400).json({
                    message: "Registration deadline must be in the future",
                    status: "failure"
                });
            }


            finalRegistrationDeadline = parsedRegistrationDeadline;
            updateData.registrationDeadline = parsedRegistrationDeadline;
        }

        const FIFTEEN_MINUTES = 15 * 60 * 1000;
        const expectedRegistrationDeadline = finalActivityDate.getTime() - FIFTEEN_MINUTES;
        if(finalRegistrationDeadline.getTime() !== expectedRegistrationDeadline){
            return res.status(400).json({
                message: "Registration deadline must be exactly 15 minutes before the activity start time",
                status: "failure"
            });
        }


        if(finalRegistrationDeadline.getTime() <= Date.now()){
            return res.status(400).json({
                message:"Registration deadline must be in the future",
                status: "failure"
            });
        }

        if(finalActivityDate.getTime() <= Date.now()){
            return res.status(400).json({
                message: "Activity date must be in the future",
                status: "failure"
            });
        }

        //MAX PARTICIPANTS VALIDATION
        //Here one updation is required. Suppose the maxParticipant number is 10 and 9 participants have already joined. Now the user want to redure the number of participants to 5 --> this should not be allowed.
        if (userObject.maxParticipants !== undefined) {
            if (typeof userObject.maxParticipants !== "number" || !Number.isFinite(userObject.maxParticipants)) {
                return res.status(400).json({
                    message:"Maximum participants must be a valid number",
                    status: "failure"
                });
            }


            if (!Number.isInteger(userObject.maxParticipants)) {
                return res.status(400).json({
                    message:"Maximum participants must be a whole number",
                    status: "failure"
                });
            }


            if (userObject.maxParticipants < 2) {
                return res.status(400).json({
                    message:"Maximum participants must be at least 2",
                    status: "failure"
                });
            }


            if (userObject.maxParticipants > 100) {
                return res.status(400).json({
                    message:"Maximum participants cannot exceed 100",
                    status: "failure"
                });
            }
            updateData.maxParticipants = userObject.maxParticipants;

        }

        //SET UPDATED TIME
        // updateData.updatedAt = new Date(); //-->  automatically handled by timestamp

        //UPDATE ACTIVITY
        let updatedActivity;

        await session.withTransaction(async () => {

            const activityInTransaction = await ActivityModel.findById(normalizedActivityId).session(session);

            if(!activityInTransaction){
                return res.status(404).json({
                    message: "Activity not found",
                    status: "failure"
                })
            }

            // authorization
            if(activityInTransaction.createdBy.toString() !== req.user._id.toString()){
                return res.status(403).json({
                    message: "You are not authorized to update this activity",
                    status: "failure"
                });
            }

            // lifecycle
            if(activityInTransaction.status !== "active"){
                return res.status(400).json({
                    message: "Only active activities can be updated",
                    status: "failure"
                });
            }

            const transactionNow = Date.now();

            if(transactionNow >= activityInTransaction.registrationDeadline.getTime()){
                return res.status(400).json({
                    message: "Activity cannot be updated after the registration deadline",
                    status: "failure"
                });
            }

            if(transactionNow >= activityInTransaction.activityDate.getTime()){
                return res.status(400).json({
                    message: "Activity cannot be updated after it has started",
                    status: "failure"
                });
            }

            // =====================================================
            // CHECK CURRENT JOINED PARTICIPANTS
            // =====================================================

            const joinedParticipants =
                await ParticipationModel.countDocuments({
                    activityId: activityInTransaction._id,
                    status: "joined"
                }).session(session);

            if (finalMaxParticipants < joinedParticipants) {
                return res.status(400).json({
                    message: "Maximum participants cannot be reduced below the current number of joined participants",
                    status: "failure"
                });
            }

            // =====================================================
            // UPDATE USING findByIdAndUpdate
            // =====================================================

            updatedActivity =await ActivityModel.findByIdAndUpdate(
                    normalizedActivityId,
                    {
                        $set: updateData
                    },
                    {
                        new: true,
                        runValidators: true,
                        session
                    }
                );
        });


        //SUCCESS RESPONSE
        return res.status(200).json({
            message: "Activity updated successfully",
            activity: updatedActivity,
            status: "success"
        });


    } catch (err) {
        console.error("Update activity error:",err);


        // Invalid MongoDB data
        if (err.name === "CastError") {
            return res.status(400).json({
                message:"Invalid data provided",
                status: "failure"
            });
        }


        // Mongoose validation error
        if (err.name === "ValidationError") {
            return res.status(400).json({
                message:err.message,
                status: "failure"
            });
        }

        // Unexpected error
        return res.status(500).json({
            message:"Unable to update activity. Please try again later.",
            status:"failure"
        });

    }
}

async function getNearbyActivityHandler(req, res){
    try {

        //GET QUERY PARAMETERS
        const {longitude,latitude,radius} = req.query;


        //LONGITUDE VALIDATION
        // Longitude missing

        if (longitude === undefined || longitude === null || longitude.trim() === "") {
            return res.status(400).json({
                message: "Longitude is required",
                status: "failure"
            });
        }


        //LATITUDE VALIDATION
        // Latitude missing
        if(latitude === undefined || latitude === null || latitude.trim() === ""){
            return res.status(400).json({
                message: "Latitude is required",
                status: "failure"
            });
        }


        //RADIUS VALIDATION
        // Radius missing

        if(radius === undefined || radius === null || radius.trim() === ""){
            return res.status(400).json({
                message: "Radius is required",
                status: "failure"
            });
        }


        //CONVERT INPUT TO NUMBERS

        const parsedLongitude = Number(longitude);
        const parsedLatitude = Number(latitude);
        const parsedRadius = Number(radius);

        // 6. CHECK FOR INVALID NUMBERS
        // Longitude invalid

        if (!Number.isFinite(parsedLongitude)) {
            return res.status(400).json({
                message: "Longitude must be a valid number",
                status: "failure"
            });
        }

        // Latitude invalid
        if (!Number.isFinite(parsedLatitude)) {
            return res.status(400).json({
                message: "Latitude must be a valid number",
                status: "failure"
            });
        }

        // Radius not a number
        if (!Number.isFinite(parsedRadius)) {
            return res.status(400).json({
                message: "Radius must be a valid number",
                status: "failure"
            });
        }

        // 7. COORDINATE RANGE VALIDATION
        // Longitude range

        if (parsedLongitude < -180 || parsedLongitude > 180) {
            return res.status(400).json({
                message:"Longitude must be between -180 and 180",
                status:"failure"
            });
        }
        // Latitude range
        if (parsedLatitude < -90 || parsedLatitude > 90) {
            return res.status(400).json({
                message:"Latitude must be between -90 and 90",
                status:"failure"
            });
        }

        // 8. RADIUS VALIDATION
        // Radius = 0 or negative

        if (parsedRadius <= 0) {
            return res.status(400).json({
                message:"Radius must be greater than 0",
                status:"failure"
            });
        }


        /*
            Prevent extremely large searches.

            Maximum allowed radius = 5,000 meters
        */

        const MAX_RADIUS = 5000;
        if (parsedRadius > MAX_RADIUS) {
            return res.status(400).json({
                message:`Radius cannot exceed ${MAX_RADIUS} meters`,
                status:"failure"
            });
        }

        // 9. FIND NEARBY ACTIVE ACTIVITIES

        /*
            GeoJSON coordinate order:

            [longitude, latitude]
        */
       const currentTime = new Date();

        const nearbyActivities = await ActivityModel.find({
                status: "active",
                registrationDeadline: {
                    $gt: currentTime
                },
                location: {
                    $near: {
                        $geometry: {
                            type:"Point",
                            coordinates: [
                                parsedLongitude,
                                parsedLatitude
                            ]
                        },
                        $maxDistance:parsedRadius
                    }
                }
        });


        //SUCCESS RESPONSE
        return res.status(200).json({
            message: "Nearby activities fetched successfully",
            count: nearbyActivities.length,
            radius: parsedRadius,
            activities: nearbyActivities,
            status: "success"
        });
    }catch(err){
        console.error("Get nearby activities error:",err);
        return res.status(500).json({
            message:"Unable to fetch nearby activities. Please try again later.",
            status:"failure"
        });
    }
}

async function cancelActivityHandler(req, res){
    try{

        const {activityId} = req.params;

        if(!req.user._id){
            return res.status(401).json({
                mesage: "unauthorized access",
                status: "failure"
            })
        }

        if(!activityId){
            return res.status(400).json({
                message: "Activity Id is required",
                status: "failure"
            })
        }

        if (typeof activityId !== "string" || activityId.trim() === ""){
            return res.status(400).json({
                message: "Invalid activity ID",
                status: "failure"
            });
        }

        const normalizedActivityId = activityId.trim();

        if(!mongoose.Types.ObjectId.isValid(normalizedActivityId)){
            return res.status(400).json({
            message: "invalid activity id",
            status: "failure"
            })
        }

        session.startTransaction();

        const user = await UserModel.findById(req.user._id);

        if(!user){
            return res.status(401).json({
                message: "iser no longer exists",
                status: "failure"
            })
        }

        const activity = await ActivityModel.findById(normalizedActivityId).session(session);

        if(!activity){
            return res.status(404).json({
                message: "activity not found",
                status: "failure"
            })
        }

        if(activity.createdBy.toString() !== req.user._id.toString()){
            return res.status(403).json({
                message: "You are not authorized to cancel this activity",
                status: "failure"
            })
        }

        if(activity.status === "cancelled"){
            return res.status(400).json({
                message: "activity already cancelled",
                status: "failure"
            })
        }

        if(activity.status === "completed"){
            return res.status(400).json({
                message: "Completed activity cannot be cancelled",
                status: "failure"
            });
        }

        // if(activity.status === "closed"){
        //     return res.status(400).json({
        //         message: "Closed activity cannot be cancelled",
        //         status: "failure"
        //     });
        // }

        const currentTime = new Date();
        const activityStartTime = new Date(activity.activityDate);


        if (currentTime >= activityStartTime) {
            await session.abortTransaction();
            return res.status(400).json({
                message: "Activity has already started and cannot be cancelled",
                status: "failure"
            });
        }


        //Get currently joined participants
        const joinedParticipations = await ParticipationModel
                .find({
                    activityId: activity._id,
                    status: "joined"
                })
                .select("_id userId activityId status")
                .session(session);


        activity.status = "cancelled";
        // activity.updatedAt = new Date(); --> handled by timestamp
        await activity.save(session);

        let cancelledParticipationCount = 0;

        if (joinedParticipations.length > 0) {

            const participationResult = await ParticipationModel.updateMany(
                    {
                        activityId: activity._id,
                        status: "joined"
                    },
                    {
                        $set: {
                            status: "cancelled"
                        }
                    },
                    {
                        session
                    }
                );

            cancelledParticipationCount =
                participationResult.modifiedCount;
        }
        await session.commitTransaction();

        return res.status(200).json({
            message: "Activity cancelled successfully",
            status: "success",
            activity: activity,
            participationsCancelled: cancelledParticipationCount
        })
    }catch (err) {

        // --------------------------------------------------
        // Rollback transaction if something failed
        // --------------------------------------------------

        if (session.inTransaction()) {
            await session.abortTransaction();
        }


        console.error(
            "Cancel activity error:",
            err
        );


        // --------------------------------------------------
        // Mongoose CastError
        // --------------------------------------------------

        if (err.name === "CastError") {
            return res.status(400).json({
                message: "Invalid activity data",
                status: "failure"
            });
        }


        // --------------------------------------------------
        // Mongoose ValidationError
        // --------------------------------------------------

        if (err.name === "ValidationError") {
            return res.status(400).json({
                message: err.message,
                status: "failure"
            });
        }


        // --------------------------------------------------
        // Duplicate key error
        // --------------------------------------------------

        if (err.code === 11000) {
            return res.status(409).json({
                message:
                    "Duplicate participation record detected",
                status: "failure"
            });
        }


        // --------------------------------------------------
        // Generic server error
        // --------------------------------------------------

        return res.status(500).json({
            message:
                "Unable to cancel activity. Please try again later.",
            status: "failure"
        });

    } finally {

        // --------------------------------------------------
        // Always close the session
        // --------------------------------------------------

        await session.endSession();
    }
}

async function closeActivityHandler(req, res){
    try{
        const {activityId} = req.params;

        if(!req.user._id){
            return res.status(401).json({
                mesage: "unauthorized access",
                status: "failure"
            })
        }

        if(!activityId){
            return res.status(400).json({
                message: "Activity Id is required",
                status: "failure"
            })
        }

        if (typeof activityId !== "string" || activityId.trim() === ""){
            return res.status(400).json({
                message: "Invalid activity ID",
                status: "failure"
            });
        }

        const normalizedActivityId = activityId.trim();

        if(!mongoose.Types.ObjectId.isValid(normalizedActivityId)){
            return res.status(400).json({
            message: "invalid activity id",
            status: "failure"
            })
        }

        const user = await UserModel.findById(req.user._id);

        if(!user){
            return res.status(401).json({
                message: "user no longer exists",
                status: "failure"
            })
        }

        const activity = await ActivityModel.findById(normalizedActivityId);

        if(!activity){
            return res.status(404).json({
                message: "activity not found",
                status: "failure"
            })
        }

        if(activity.createdBy.toString() !== req.user._id.toString()){
            return res.status(403).json({
                message: "You are not authorized to close this activity",
                status: "failure"
            })
        }

        if(activity.status === "closed"){
            return res.status(400).json({
                message: "Activity is already closed",
                status: "failure"
            });
        }

        if(activity.status === "completed"){
            return res.status(400).json({
                message: "Completed activity cannot be closed",
                status: "failure"
            });
        }

        if(activity.status === "cancelled"){
            return res.status(400).json({
                message: "Cancelled activity cannot be closed",
                status: "failure"
            })
        }

        activity.status = "closed";
        activity.closureReason = "manual";
        await activity.save();

        return res.status(200).json({
            message: "Activity closed successfully",
            status: "success",
            activity: activity
        })
    }catch(err){

        console.error("Close activity error:",err);

        // Invalid MongoDB ObjectId
        if(err.name === "CastError"){
            return res.status(400).json({
                message: "Invalid activity data",
                status: "failure"
            });
        }

        // Database validation error
        if(err.name === "ValidationError"){
            return res.status(400).json({
                message: err.message,
                status: "failure"
            });
        }

        // Unexpected database/server error
        return res.status(500).json({
            message: "Unable to close activity. Please try again later.",
            status: "failure"
        });
    }
}

async function completeActivityHandler(req, res) {

    let session;

    try {

        // =========================================================
        // 1. Authentication validation
        // =========================================================

        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "failure"
            });
        }


        // =========================================================
        // 2. Activity ID validation
        // =========================================================

        const { activityId } = req.params;


        if (!activityId) {
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
                message: "Invalid activity ID",
                status: "failure"
            });
        }


        const normalizedActivityId = activityId.trim();


        if (
            !mongoose.Types.ObjectId.isValid(
                normalizedActivityId
            )
        ) {
            return res.status(400).json({
                message: "Invalid activity ID",
                status: "failure"
            });
        }


        // =========================================================
        // 3. Completion reward validation
        // =========================================================

        const COMPLETION_REWARD_POINTS =
            Number(process.env.COMPLETION_REWARD_POINTS);


        if (
            !Number.isInteger(COMPLETION_REWARD_POINTS) ||
            COMPLETION_REWARD_POINTS <= 0
        ) {
            console.error(
                "Invalid COMPLETION_REWARD_POINTS configuration"
            );

            return res.status(500).json({
                message: "Reward configuration is invalid",
                status: "failure"
            });
        }


        // =========================================================
        // 4. Start MongoDB session
        // =========================================================

        session = await mongoose.startSession();


        // =========================================================
        // Variables required after transaction
        // =========================================================

        let completedActivity;

        let completedParticipationCount = 0;

        let totalPointsAwarded = 0;

        /*
         * IMPORTANT:
         *
         * This array contains ONLY participants who should receive
         * ACTIVITY_COMPLETED notifications.
         *
         * The activity creator is intentionally excluded.
         */
        let completionNotificationParticipants = [];


        // =========================================================
        // 5. Start transaction
        // =========================================================

        await session.withTransaction(async () => {

            const currentTime = new Date();


            // =====================================================
            // 6. Fetch requesting user
            // =====================================================

            const user = await UserModel
                .findById(req.user._id)
                .session(session);


            if (!user) {
                throw Object.assign(
                    new Error("User no longer exists"),
                    {
                        statusCode: 401
                    }
                );
            }


            // =====================================================
            // 7. Fetch activity
            // =====================================================

            const activity = await ActivityModel
                .findById(normalizedActivityId)
                .session(session);


            if (!activity) {
                throw Object.assign(
                    new Error("Activity not found"),
                    {
                        statusCode: 404
                    }
                );
            }


            // =====================================================
            // 8. Authorization
            // =====================================================

            if (
                activity.createdBy.toString() !==
                req.user._id.toString()
            ) {
                throw Object.assign(
                    new Error(
                        "You are not authorized to complete this activity"
                    ),
                    {
                        statusCode: 403
                    }
                );
            }


            // =====================================================
            // 9. Activity status validation
            // =====================================================

            if (activity.status === "completed") {
                throw Object.assign(
                    new Error(
                        "This activity has already been completed"
                    ),
                    {
                        statusCode: 400
                    }
                );
            }


            if (activity.status === "cancelled") {
                throw Object.assign(
                    new Error(
                        "Cancelled activities cannot be completed"
                    ),
                    {
                        statusCode: 400
                    }
                );
            }


            // =====================================================
            // 10. Calculate activity start/end time
            // =====================================================

            const activityStartTime =
                new Date(activity.activityDate);


            const activityEndTime =
                new Date(
                    activityStartTime.getTime() +
                    (
                        activity.activityDuration *
                        60 *
                        1000
                    )
                );


            // =====================================================
            // 11. Activity must have started
            // =====================================================

            if (currentTime < activityStartTime) {
                throw Object.assign(
                    new Error(
                        "Activity has not started yet. It cannot be completed before its scheduled start time."
                    ),
                    {
                        statusCode: 400
                    }
                );
            }


            // =====================================================
            // 12. Activity duration must have ended
            // =====================================================

            if (currentTime < activityEndTime) {
                throw Object.assign(
                    new Error(
                        "Activity duration has not ended yet. The activity cannot be completed before its scheduled end time."
                    ),
                    {
                        statusCode: 400,
                        activityEndTime
                    }
                );
            }


            // =====================================================
            // 13. Automatic closing
            // =====================================================
            //
            // If activity is still active even though its
            // registration deadline has passed, close it first.
            //
            // =====================================================

            if (activity.status === "active") {

                activity.status = "closed";

                activity.closureReason =
                    "registration_time_expired";

                await activity.save({
                    session
                });
            }


            // =====================================================
            // 14. Activity must now be closed
            // =====================================================

            if (activity.status !== "closed") {
                throw Object.assign(
                    new Error(
                        "Activity cannot be completed in its current state"
                    ),
                    {
                        statusCode: 400
                    }
                );
            }


            // =====================================================
            // 15. Find all joined participants
            // =====================================================
            //
            // The activity creator is included here because the
            // creator is automatically added to Participation
            // during activity creation.
            //
            // This is CORRECT because the creator should also:
            //
            // - become completed
            // - receive completion points
            //
            // But the creator will later be excluded from
            // completion notifications.
            //
            // =====================================================

            const joinedParticipations =
                await ParticipationModel
                    .find({
                        activityId: activity._id,
                        status: "joined"
                    })
                    .select(
                        "_id userId activityId status"
                    )
                    .session(session);


            // =====================================================
            // 16. Separate notification recipients
            // =====================================================
            //
            // IMPORTANT:
            //
            // Do NOT remove the creator from joinedParticipations.
            //
            // The creator still needs:
            //
            //     Participation → completed
            //     Points → awarded
            //     PointTransaction → created
            //
            // We only exclude the creator from the notification
            // recipient list.
            //
            // =====================================================

            completionNotificationParticipants =
                joinedParticipations
                    .filter(
                        participation =>
                            participation.userId.toString() !==
                            activity.createdBy.toString()
                    )
                    .map(
                        participation =>
                            participation.userId
                    );


            // =====================================================
            // 17. Get participant user IDs
            // =====================================================

            const participantUserIds =
                joinedParticipations.map(
                    participation =>
                        participation.userId
                );


            // =====================================================
            // 18. Fetch participant users
            // =====================================================

            let participantUsers = [];


            if (participantUserIds.length > 0) {

                participantUsers =
                    await UserModel
                        .find({
                            _id: {
                                $in: participantUserIds
                            }
                        })
                        .select("_id points")
                        .session(session);


                // =================================================
                // Make sure every participant still exists
                // =================================================

                if (
                    participantUsers.length !==
                    participantUserIds.length
                ) {
                    throw new Error(
                        "One or more participants no longer exist"
                    );
                }
            }


            // =====================================================
            // 19. Complete the activity
            // =====================================================

            activity.status = "completed";

            activity.closureReason = null;

            await activity.save({
                session
            });


            // =====================================================
            // 20. Complete all joined participations
            // =====================================================

            if (joinedParticipations.length > 0) {

                const participationResult =
                    await ParticipationModel.updateMany(
                        {
                            activityId: activity._id,
                            status: "joined"
                        },
                        {
                            $set: {
                                status: "completed",
                                completedAt: currentTime,
                                pointsAwarded:
                                    COMPLETION_REWARD_POINTS
                            }
                        },
                        {
                            session
                        }
                    );


                completedParticipationCount =
                    participationResult.modifiedCount;
            }


            // =====================================================
            // 21. Prepare point updates and transactions
            // =====================================================

            const userOperations = [];

            const pointTransactions = [];


            for (const participant of participantUsers) {

                const currentPoints =
                    participant.points;


                const balanceAfter =
                    currentPoints +
                    COMPLETION_REWARD_POINTS;


                // -------------------------------------------------
                // Increase user points
                // -------------------------------------------------

                userOperations.push({
                    updateOne: {
                        filter: {
                            _id: participant._id
                        },
                        update: {
                            $inc: {
                                points:
                                    COMPLETION_REWARD_POINTS
                            }
                        }
                    }
                });


                // -------------------------------------------------
                // Create PointTransaction
                // -------------------------------------------------

                pointTransactions.push({
                    userId: participant._id,

                    type: "earned",

                    points:
                        COMPLETION_REWARD_POINTS,

                    balanceAfter:
                        balanceAfter,

                    activityId:
                        activity._id,

                    rewardId: null,

                    redemptionId: null,

                    description:
                        `Points earned for completing activity: ${activity.title}`
                });
            }


            // =====================================================
            // 22. Award points
            // =====================================================

            if (userOperations.length > 0) {

                const rewardResult =
                    await UserModel.bulkWrite(
                        userOperations,
                        {
                            session
                        }
                    );


                // -------------------------------------------------
                // Ensure every participant was updated
                // -------------------------------------------------

                if (
                    rewardResult.matchedCount !==
                    participantUsers.length
                ) {
                    throw new Error(
                        "One or more participants no longer exist"
                    );
                }


                totalPointsAwarded =
                    participantUsers.length *
                    COMPLETION_REWARD_POINTS;
            }


            // =====================================================
            // 23. Create PointTransaction records
            // =====================================================

            if (pointTransactions.length > 0) {

                await PointTransactionModel.insertMany(
                    pointTransactions,
                    {
                        session
                    }
                );
            }


            // =====================================================
            // 24. Store completed activity
            // =====================================================

            completedActivity = activity;
        });


        // =========================================================
        // 25. Transaction committed successfully
        // =========================================================
        //
        // At this point:
        //
        // ✓ Activity is completed
        // ✓ Participations are completed
        // ✓ Points are awarded
        // ✓ PointTransactions are created
        //
        // Therefore notification creation can safely happen now.
        //
        // =========================================================


        // =========================================================
        // 26. Create completion notifications
        // =========================================================
        //
        // IMPORTANT:
        //
        // completionNotificationParticipants DOES NOT contain
        // the activity creator.
        //
        // Therefore:
        //
        // Creator:
        //     ✓ receives points
        //     ✓ participation completed
        //     ✗ ACTIVITY_COMPLETED notification
        //
        // Other participants:
        //     ✓ receives points
        //     ✓ participation completed
        //     ✓ ACTIVITY_COMPLETED notification
        //
        // =========================================================

        try {

            if (
                completionNotificationParticipants.length > 0
            ) {

                await NotificationService
                    .createActivityCompletedNotifications({
                        activity: completedActivity,

                        participants:
                            completionNotificationParticipants
                    });
            }

        } catch (notificationError) {

            // Notification failure must NOT undo the already
            // successful activity completion.

            console.error(
                "Activity completion notification error:",
                notificationError
            );
        }


        // =========================================================
        // 27. Success response
        // =========================================================

        return res.status(200).json({

            message:
                "Activity completed successfully",

            status: "success",

            activity:
                completedActivity,

            participationCompleted:
                completedParticipationCount,

            rewardPointsPerParticipant:
                COMPLETION_REWARD_POINTS,

            totalPointsAwarded:
                totalPointsAwarded
        });


    } catch (err) {

        console.error(
            "Complete activity error:",
            err
        );


        // =========================================================
        // Controlled application errors
        // =========================================================

        if (err.statusCode) {

            const response = {
                message: err.message,
                status: "failure"
            };


            if (err.activityEndTime) {
                response.activityEndTime =
                    err.activityEndTime;
            }


            return res.status(
                err.statusCode
            ).json(response);
        }


        // =========================================================
        // Mongoose CastError
        // =========================================================

        if (
            err instanceof mongoose.Error.CastError
        ) {

            return res.status(400).json({
                message: "Invalid activity data",
                status: "failure"
            });
        }


        // =========================================================
        // Mongoose ValidationError
        // =========================================================

        if (
            err instanceof mongoose.Error.ValidationError
        ) {

            return res.status(400).json({
                message: "Activity validation failed",

                errors:
                    Object.values(err.errors)
                        .map(error => error.message),

                status: "failure"
            });
        }


        // =========================================================
        // Duplicate key
        // =========================================================

        if (err.code === 11000) {

            return res.status(409).json({
                message: "Duplicate activity data",
                status: "failure"
            });
        }


        // =========================================================
        // Internal server error
        // =========================================================

        return res.status(500).json({
            message:
                "Unable to complete activity. Please try again later.",

            status: "failure"
        });


    } finally {

        // =========================================================
        // End MongoDB session
        // =========================================================

        if (session) {
            await session.endSession();
        }
    }
}

module.exports={
    createActivityHandler,
    getActivityHandler,
    updateActivityHandler,
    getNearbyActivityHandler,
    cancelActivityHandler,
    closeActivityHandler,
    completeActivityHandler
}