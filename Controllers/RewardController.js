const mongoose = require("mongoose");
const UserModel = require("../Models/UserModel");
const RewardModel = require("../Models/RewardModel");
const PointTransactionModel = require("../Models/PointTransactionModel");
const RewardRedemptionModel = require("../Models/RewardRedemptionModel");

async function getAllRewardHandler(req, res) {
    try {

        // Check whether authentication middleware has attached the authenticated user to req.user
        if(!req.user || !req.user._id){
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }

        // Validate authenticated user's MongoDB ObjectId.
        if(!mongoose.Types.ObjectId.isValid(req.user._id)){
            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }

        // Use one fixed timestamp for the complete request.
        // This avoids different rewards being evaluated against slightly different times.
        const currentTime = new Date();

        /*
            A reward is considered available only when:

            1. status = active
            2. stock > 0
            3. expiryDate is null
               OR
               expiryDate is in the future
        */

        const rewards = await RewardModel.find({
            status: "active",

            // Reward must have at least one item available.
            stock: {
                $gt: 0
            },

            // Reward without expiry OR reward whose expiry is still in the future.
            $or: [
                {
                    expiryDate: null
                },
                {
                    expiryDate: {
                        $gt: currentTime
                    }
                }
            ]
        })

        // Return only fields that the client actually needs.
        .select("title description pointsRequired voucherValue voucherProvider stock expiryDate status createdAt")

        // Lowest points requirement first.
        // If two rewards require the same points,
        // newest reward comes first.
        .sort({
            pointsRequired: 1,
            createdAt: -1
        })

        // Return plain JavaScript objects instead of Mongoose documents.
        .lean();


        // =========================================================
        // 4. DEFENSIVE RESPONSE VALIDATION
        // =========================================================

        /*
            Mongoose schema validation protects data when it is
            normally created/updated through Mongoose.

            However, production systems can still contain malformed
            legacy/imported/database data.

            Therefore, validate the returned records before exposing
            them to the client.
        */

        if(!Array.isArray(rewards)){
            // console.error("Unexpected reward query result: expected an array.");

            return res.status(500).json({
                message: "Internal server error.",
                status: "Failure"
            });
        }


        const validRewards = rewards.filter((reward) => {

            if(!reward || typeof reward !== "object"){
                return false;
            }

            if(!reward._id || !mongoose.Types.ObjectId.isValid(reward._id)){
                return false;
            }

            if(typeof reward.title !== "string" || reward.title.trim().length === 0){
                return false;
            }

            if(typeof reward.description !== "string" || reward.description.trim().length === 0){
                return false;
            }

            // Voucher provider validation
            if(typeof reward.voucherProvider !== "string" || reward.voucherProvider.trim().length === 0){
                return false;
            }

            // pointsRequired validation
            if(!Number.isFinite(reward.pointsRequired) ||!Number.isInteger(reward.pointsRequired) || reward.pointsRequired < 1){
                return false;
            }

            // voucherValue validation
            if(!Number.isFinite(reward.voucherValue) || reward.voucherValue < 0){
                return false;
            }

            // Stock validation
            if(!Number.isFinite(reward.stock) || !Number.isInteger(reward.stock) || reward.stock <= 0){
                return false;
            }

            // Status validation
            if(reward.status !== "active"){
                return false;
            }

            // Expiry validation
            if(reward.expiryDate !== null){
                const expiryTime = new Date(reward.expiryDate);
                // Invalid date
                if(Number.isNaN(expiryTime.getTime())) {
                    return false;
                }

                // Already expired or expires exactly now
                if(expiryTime <= currentTime){
                    return false;
                }
            }
            // Reward passed all validation checks.
            return true;
        });

        return res.status(200).json({
            message: "Available rewards fetched successfully",
            status: "success",
            count: validRewards.length,
            data: validRewards
        });

    } catch (err) {
        console.error("Get all rewards error:",err);
        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}

async function  getRewardHandler(req, res){
    const {rewardId} = req.params;
    try{

        if(!req.user || !req.user._id){
            return res.status(401).json({
                message: "Unauthorized access",
                status: "failure"
            });
        }

        if(!mongoose.Types.ObjectId.isValid(req.user._id)){

            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "failure"
            });
        }

        if(!rewardId){
            return res.status(400).json({
                message: "Reward id is required",
                status: "failure"
            });
        }

        if(typeof rewardId !== "string" || rewardId.trim().length === 0){
            return res.status(400).json({
                message: "Reward id is required",
                status: "failure"
            });
        }

        const trimmedRewardId = rewardId.trim();

        if(!mongoose.Types.ObjectId.isValid(trimmedRewardId)){
            return res.status(400).json({
                message: "Invalid reward id",
                status: "failure"
            });
        }

        const reward = await RewardModel.findById(trimmedRewardId)
        .select("title description pointsRequired voucherValue voucherProvider stock expiryDate status createdAt updatedAt")
        .lean();

        if(!reward){
            return res.status(404).json({
                message: "Reward not found",
                status: "failure"
            })
        }

        const currentTime = new Date();

        if(!reward._id || !mongoose.Types.ObjectId.isValid(reward._id)){
            // console.error(`Invalid reward ID found in database: ${trimmedRewardId}`);
            return res.status(500).json({
                message: "Invalid reward data",
                status: "failure"
            });
        }

        if(typeof reward.title !== "string" || reward.title.trim().length === 0){
            return res.status(500).json({
                message: "Invalid reward data",
                status: "Failure"
            });
        }

        if (typeof reward.description !== "string" || reward.description.trim().length === 0){
            return res.status(500).json({
                message: "Invalid reward data",
                status: "Failure"
            });
        }

        if (typeof reward.voucherProvider !== "string" || reward.voucherProvider.trim().length === 0){
            return res.status(500).json({
                message: "Invalid reward data",
                status: "Failure"
            });
        }
        
        if(!Number.isFinite(reward.pointsRequired) || !Number.isInteger(reward.pointsRequired) || reward.pointsRequired < 1){
            return res.status(500).json({
                message: "Invalid reward data",
                status: "Failure"
            });
        }

        if (!Number.isFinite(reward.voucherValue) || reward.voucherValue < 0){
            return res.status(500).json({
                message: "Invalid reward data",
                status: "Failure"
            });
        }

        if (!Number.isFinite(reward.stock) || !Number.isInteger(reward.stock)){
            return res.status(500).json({
                message: "Invalid reward data",
                status: "Failure"
            });
        }

        if (reward.status !== "active") {
            return res.status(404).json({
                message: "Reward is not available",
                status: "Failure"
            });
        }

        if (reward.stock < 0) {
            return res.status(500).json({
                message: "Invalid reward stock",
                status: "Failure"
            });
        }

        if (reward.stock === 0) {
            return res.status(404).json({
                message: "Reward is out of stock",
                status: "Failure"
            });
        }

        if(reward.expiryDate !== null){
            const expiryTime = new Date(reward.expiryDate);
            // Invalid date stored in database.
            if(Number.isNaN(expiryTime.getTime())){
                // console.error(`Invalid expiryDate for reward: ${trimmedRewardId}`);

                return res.status(500).json({
                    message: "Invalid reward expiry date",
                    status: "Failure"
                });
            }

            if(expiryTime <= currentTime){
                return res.status(404).json({
                    message: "Reward has expired",
                    status: "Failure"
                });
            }
        }

        return res.status(200).json({
            message: "Reward fetched successfully",
            status: "success",
            data: reward
        });

    }catch (err) {
        console.error("Get reward error:",err);

        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}

async function getMyPointsHandler(req, res) {
    try {

        if(!req.user || !req.user._id){
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }

        // Validate the authenticated user's MongoDB ObjectId.
        if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }

        const user = await UserModel.findById(req.user._id)
            .select("_id points")
            .lean();

        if(!user){
            return res.status(401).json({
                message: "User no longer exists",
                status: "Failure"
            });
        }

        if (!Number.isFinite(user.points) || !Number.isInteger(user.points) || user.points < 0){
            return res.status(500).json({
                message: "Invalid user points data",
                status: "Failure"
            });
        }

        return res.status(200).json({
            message: "Points fetched successfully",
            status: "success",
            data: {
                points: user.points
            }
        });

    } catch (err) {
        console.error("Get my points error:",err);

        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}

async function getMyPointsHistoryHandler(req, res) {
    try {

        // 1. AUTHENTICATION VALIDATION
        /*
            protectedRouteMiddleware should already verify the JWT
            and attach the authenticated user to req.user.

            This handler does not accept userId from:
                - req.body
                - req.params
                - req.query

            The authenticated user's ID comes only from req.user.
        */

        if(!req.user || !req.user._id){
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }

        // Validate authenticated user's MongoDB ObjectId.
        if(!mongoose.Types.ObjectId.isValid(req.user._id)){
            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }

        // Store the authenticated user's ID.
        const authenticatedUserId = req.user._id;


        // 2. FETCH CURRENT USER'S TRANSACTION HISTORY
        /*
            IMPORTANT SECURITY CHECK:

            The query explicitly filters by the authenticated user's ID.
            Therefore, transactions belonging to other users cannot be returned by this endpoint.
        */

        const transactions = await PointTransactionModel.find({
            userId: authenticatedUserId
        })

        // Return only fields required by the client.
        .select(
            "type points balanceAfter activityId rewardId redemptionId description createdAt"
        )

        /*
            Newest transaction first.

            _id is used as a secondary deterministic ordering
            mechanism when two transactions have the same timestamp.
        */
        .sort({
            createdAt: -1,
            _id: -1
        })

        // Return plain JavaScript objects.
        .lean();


        // 3. TRANSACTION HISTORY VALIDATION
        if (!Array.isArray(transactions)) {
            // console.error("Unexpected transaction query result: expected an array.");

            return res.status(500).json({
                message: "Invalid transaction history data",
                status: "Failure"
            });
        }


        // 4. TRANSACTION DATA VALIDATION
        const validTransactions = [];

        for(const transaction of transactions){
            // Transaction object validation
            if (!transaction || typeof transaction !== "object"){
                // console.error("Invalid transaction object found.");

                return res.status(500).json({
                    message: "Invalid transaction history data",
                    status: "Failure"
                });
            }

            // Transaction ID validation
            if (!transaction._id || !mongoose.Types.ObjectId.isValid(transaction._id)){
                // console.error("Invalid transaction ID found.");

                return res.status(500).json({
                    message: "Invalid transaction history data",
                    status: "Failure"
                });
            }

            // User ID validation
            if (!transaction.userId || !mongoose.Types.ObjectId.isValid(transaction.userId)){
                // console.error(`Invalid userId in transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction history data",
                    status: "Failure"
                });
            }

            // Ownership validation
            /*
                This is an additional defensive ownership check.

                The MongoDB query already filters by userId, but
                checking again prevents accidentally exposing a
                transaction if the query is changed incorrectly
                in the future.
            */

            if (transaction.userId.toString() !== authenticatedUserId.toString()){
                // console.error(`Ownership mismatch for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction ownership data",
                    status: "Failure"
                });
            }

            // Transaction type validation
            if (transaction.type !== "earned" && transaction.type !== "spent"){
                // console.error(`Invalid transaction type for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction history data",
                    status: "Failure"
                });
            }

            // Points validation
            /*
                Points are always stored as positive integers.

                type = earned -> points earned
                type = spent  -> points spent
            */
            if(!Number.isFinite(transaction.points) || !Number.isInteger(transaction.points) || transaction.points <= 0){
                // console.error(`Invalid points for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction points data",
                    status: "Failure"
                });
            }

            // Balance validation
            if(!Number.isFinite(transaction.balanceAfter) || !Number.isInteger(transaction.balanceAfter) || transaction.balanceAfter < 0){
                // console.error(`Invalid balanceAfter for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction balance data",
                    status: "Failure"
                });
            }

            // Description validation
            if(typeof transaction.description !== "string" || transaction.description.trim().length === 0){
                // console.error(`Invalid description for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction description",
                    status: "Failure"
                });
            }

            // CreatedAt validation
            if (!transaction.createdAt) {
                // console.error(`Missing createdAt for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction date data",
                    status: "Failure"
                });
            }

            const createdAt = new Date(transaction.createdAt);

            if (Number.isNaN(createdAt.getTime())) {
                // console.error(`Invalid createdAt for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction date data",
                    status: "Failure"
                });
            }

            // Optional reference validation
            if(transaction.activityId !== null && transaction.activityId !== undefined && !mongoose.Types.ObjectId.isValid(transaction.activityId)){
                // console.error(`Invalid activityId for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction reference data",
                    status: "Failure"
                });
            }


            if(transaction.rewardId !== null && transaction.rewardId !== undefined && !mongoose.Types.ObjectId.isValid(transaction.rewardId)){
                // console.error(`Invalid rewardId for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction reference data",
                    status: "Failure"
                });
            }


            if (transaction.redemptionId !== null && transaction.redemptionId !== undefined && !mongoose.Types.ObjectId.isValid(transaction.redemptionId)){
                // console.error(`Invalid redemptionId for transaction: ${transaction._id}`);

                return res.status(500).json({
                    message: "Invalid transaction reference data",
                    status: "Failure"
                });
            }

            // Transaction passed every validation check.
            validTransactions.push(transaction);
        }

        // 5. RESPONSE
        /*
            If the user has no transaction history,
            validTransactions will simply be [].

            This is a successful request, not an error.
        */

        return res.status(200).json({
            message: "Point transaction history fetched successfully",
            status: "success",
            count: validTransactions.length,
            data: validTransactions
        });

    }catch(err){
        // 6. ERROR HANDLING
        console.error("Get my points history error:",err);

        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}

async function redeemRewardHandler(req, res) {

    /*
        protectedRouteMiddleware should already:

        1. Read JWT from cookie
        2. Verify JWT
        3. Find the user
        4. Attach the user to req.user

        This handler does not accept userId from:
            - req.body
            - req.query
            - req.params

        The authenticated user's identity comes from req.user.
    */

    if (!req.user || !req.user._id) {
        return res.status(401).json({
            message: "Unauthorized access",
            status: "Failure"
        });
    }


    // Validate authenticated user's ObjectId.
    if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
        return res.status(401).json({
            message: "Invalid authenticated user",
            status: "Failure"
        });
    }


    // Store authenticated user's ID.
    const authenticatedUserId = req.user._id;


    // =============================================================
    // 2. REWARD ID VALIDATION
    // =============================================================
    const { rewardId } = req.params;


    // Reward ID missing.
    if (rewardId === undefined || rewardId === null) {
        return res.status(400).json({
            message: "Reward ID is required",
            status: "Failure"
        });
    }


    // Reward ID empty.
    if (typeof rewardId !== "string" || rewardId.trim().length === 0){
        return res.status(400).json({
            message: "Reward ID is required",
            status: "Failure"
        });
    }


    const trimmedRewardId = rewardId.trim();


    // Validate MongoDB ObjectId.
    if (!mongoose.Types.ObjectId.isValid(trimmedRewardId)) {
        return res.status(400).json({
            message: "Invalid reward ID",
            status: "Failure"
        });
    }


    // =============================================================
    // 3. CREATE MONGODB SESSION
    // =============================================================

    const session = await mongoose.startSession();


    try {

        // =========================================================
        // 4. TRANSACTION
        // =========================================================

        let redemptionResult = null;
        let newBalance = null;
        let remainingStock = null;


        await session.withTransaction(async () => {

            // =====================================================
            // 5. FETCH USER
            // =====================================================

            /*
                Fetch the user inside the transaction.

                We only select the fields needed for this operation.
            */

            const user = await UserModel.findById(
                authenticatedUserId
            )
                .select("_id points")
                .session(session)
                .lean();


            // User disappeared after authentication.
            if (!user) {
                const error = new Error(
                    "AUTHENTICATED_USER_NOT_FOUND"
                );

                error.code = "AUTHENTICATED_USER_NOT_FOUND";

                throw error;
            }


            // =====================================================
            // 6. USER POINTS VALIDATION
            // =====================================================

            /*
                Valid points must be:

                    finite
                    integer
                    >= 0
            */

            if (!Number.isFinite(user.points) || !Number.isInteger(user.points) || user.points < 0){
                const error = new Error(
                    "INVALID_USER_POINTS"
                );

                error.code = "INVALID_USER_POINTS";

                throw error;
            }


            // =====================================================
            // 7. FETCH REWARD
            // =====================================================

            const reward = await RewardModel.findById(
                trimmedRewardId
            )
                .select(
                    "title description pointsRequired voucherValue voucherProvider stock expiryDate status"
                )
                .session(session)
                .lean();


            // Reward does not exist.
            if (!reward) {
                const error = new Error(
                    "REWARD_NOT_FOUND"
                );

                error.code = "REWARD_NOT_FOUND";

                throw error;
            }


            // =====================================================
            // 8. REWARD DATA VALIDATION
            // =====================================================

            // Reward ID validation.
            if (!reward._id || !mongoose.Types.ObjectId.isValid(reward._id)){
                const error = new Error(
                    "INVALID_REWARD_DATA"
                );

                error.code = "INVALID_REWARD_DATA";

                throw error;
            }


            // Title validation.
            if (typeof reward.title !== "string" || reward.title.trim().length === 0){
                const error = new Error(
                    "INVALID_REWARD_DATA"
                );

                error.code = "INVALID_REWARD_DATA";

                throw error;
            }


            // Description validation.
            if (typeof reward.description !== "string" || reward.description.trim().length === 0){
                const error = new Error(
                    "INVALID_REWARD_DATA"
                );

                error.code = "INVALID_REWARD_DATA";

                throw error;
            }


            // Voucher provider validation.
            if (typeof reward.voucherProvider !== "string" || reward.voucherProvider.trim().length === 0){
                const error = new Error(
                    "INVALID_REWARD_DATA"
                );

                error.code = "INVALID_REWARD_DATA";

                throw error;
            }


            // pointsRequired validation.
            if (!Number.isFinite(reward.pointsRequired) || !Number.isInteger(reward.pointsRequired) || reward.pointsRequired < 1){
                const error = new Error(
                    "INVALID_REWARD_DATA"
                );

                error.code = "INVALID_REWARD_DATA";

                throw error;
            }


            // voucherValue validation.
            if (!Number.isFinite(reward.voucherValue) || reward.voucherValue < 0){
                const error = new Error(
                    "INVALID_REWARD_DATA"
                );

                error.code = "INVALID_REWARD_DATA";

                throw error;
            }


            // Stock validation.
            if (!Number.isFinite(reward.stock) || !Number.isInteger(reward.stock)){
                const error = new Error(
                    "INVALID_REWARD_STOCK"
                );

                error.code = "INVALID_REWARD_STOCK";

                throw error;
            }


            // Negative stock is database corruption.
            if (reward.stock < 0) {
                const error = new Error(
                    "INVALID_REWARD_STOCK"
                );

                error.code = "INVALID_REWARD_STOCK";

                throw error;
            }


            // =====================================================
            // 9. REWARD STATUS VALIDATION
            // =====================================================

            const validStatuses = [
                "active",
                "inactive",
                "out_of_stock"
            ];


            // Invalid status in database.
            if (!validStatuses.includes(reward.status)) {
                const error = new Error(
                    "INVALID_REWARD_STATUS"
                );

                error.code = "INVALID_REWARD_STATUS";

                throw error;
            }


            // Inactive reward.
            if (reward.status === "inactive") {
                const error = new Error(
                    "REWARD_UNAVAILABLE"
                );

                error.code = "REWARD_UNAVAILABLE";

                throw error;
            }


            // Explicit out-of-stock status.
            if (reward.status === "out_of_stock") {
                const error = new Error(
                    "REWARD_OUT_OF_STOCK"
                );

                error.code = "REWARD_OUT_OF_STOCK";

                throw error;
            }


            // =====================================================
            // 10. STOCK AVAILABILITY VALIDATION
            // =====================================================

            if (reward.stock === 0) {
                const error = new Error(
                    "REWARD_OUT_OF_STOCK"
                );

                error.code = "REWARD_OUT_OF_STOCK";

                throw error;
            }


            // At this point stock must be > 0.
            if (reward.stock <= 0) {
                const error = new Error(
                    "REWARD_OUT_OF_STOCK"
                );

                error.code = "REWARD_OUT_OF_STOCK";

                throw error;
            }


            // =====================================================
            // 11. REWARD EXPIRY VALIDATION
            // =====================================================

            const currentTime = new Date();


            /*
                null expiryDate means the reward does not expire.
            */

            if (reward.expiryDate !== null) {

                const expiryTime = new Date(
                    reward.expiryDate
                );


                // Invalid expiry date.
                if (Number.isNaN(expiryTime.getTime())) {
                    const error = new Error(
                        "INVALID_REWARD_EXPIRY"
                    );

                    error.code = "INVALID_REWARD_EXPIRY";

                    throw error;
                }


                // Expired or exactly at expiry time.
                if (expiryTime <= currentTime) {
                    const error = new Error(
                        "REWARD_EXPIRED"
                    );

                    error.code = "REWARD_EXPIRED";

                    throw error;
                }
            }


            // =====================================================
            // 12. USER POINTS VS REWARD COST
            // =====================================================

            /*
                Exact points:

                    user.points === reward.pointsRequired
                    -> allowed

                More points:

                    user.points > reward.pointsRequired
                    -> allowed

                Fewer points:

                    user.points < reward.pointsRequired
                    -> rejected
            */

            if (user.points < reward.pointsRequired) {
                const error = new Error(
                    "INSUFFICIENT_POINTS"
                );

                error.code = "INSUFFICIENT_POINTS";

                throw error;
            }


            // =====================================================
            // 13. ATOMIC USER POINT DEDUCTION
            // =====================================================

            /*
                This is intentionally an atomic conditional update.

                The condition:

                    points >= reward.pointsRequired

                guarantees that the user's balance cannot become
                negative due to concurrent redemption requests.
            */

            const userUpdateResult =
                await UserModel.updateOne(
                    {
                        _id: authenticatedUserId,

                        // Critical concurrency protection.
                        points: {
                            $gte: reward.pointsRequired
                        }
                    },
                    {
                        $inc: {
                            points: -reward.pointsRequired
                        }
                    },
                    {
                        session
                    }
                );


            // User update failed.
            if (userUpdateResult.modifiedCount !== 1) {

                const error = new Error(
                    "USER_POINTS_UPDATE_FAILED"
                );

                error.code = "USER_POINTS_UPDATE_FAILED";

                throw error;
            }


            // Calculate the new balance.
            newBalance = user.points - reward.pointsRequired;


            // Defensive check.
            if (!Number.isInteger(newBalance) || newBalance < 0){
                const error = new Error("INVALID_NEW_BALANCE");
                error.code = "INVALID_NEW_BALANCE";
                throw error;
            }


            // =====================================================
            // 14. ATOMIC REWARD STOCK DEDUCTION
            // =====================================================

            /*
                Critical concurrency protection:

                    stock > 0

                and:

                    stock = stock - 1

                happen as one database operation.

                Therefore two users cannot successfully consume
                the same final stock.
            */

            const rewardUpdateResult = await RewardModel.updateOne({
                        _id: reward._id,
                        // Critical concurrency protection.
                        stock: {
                            $gt: 0
                        },
                        status: "active"
                    },
                    {
                        $inc: {
                            stock: -1
                        }
                    },
                    {
                        session
                    }
                );


            // Reward stock update failed.
            if (rewardUpdateResult.modifiedCount !== 1) {
                const error = new Error("REWARD_STOCK_UPDATE_FAILED");
                error.code = "REWARD_STOCK_UPDATE_FAILED";
                throw error;
            }


            // Calculate remaining stock.
            remainingStock = reward.stock - 1;


            // Defensive check.
            if (!Number.isInteger(remainingStock) || remainingStock < 0){
                const error = new Error("INVALID_REMAINING_STOCK");
                error.code = "INVALID_REMAINING_STOCK";
                throw error;
            }


            // =====================================================
            // 15. CREATE REDEMPTION DOCUMENT
            // =====================================================

            /*
                Store a snapshot of important reward information.

                This is important because the Reward document can
                change later.

                For example:

                    Reward title today:
                    "Amazon ₹500 Voucher"

                    Reward title later:
                    "Amazon ₹1000 Voucher"

                Historical redemption should still show what the
                user actually redeemed.
            */

            const redemptionDocuments =
                await RewardRedemptionModel.create(
                    [
                        {
                            userId: authenticatedUserId,

                            rewardId: reward._id,

                            rewardTitle: reward.title,

                            pointsSpent:
                                reward.pointsRequired,

                            voucherValue:
                                reward.voucherValue,

                            voucherProvider:
                                reward.voucherProvider,

                            /*
                                Voucher code can be assigned later
                                if your system integrates with an
                                external voucher provider.
                            */
                            voucherCode: null,

                            status: "completed",

                            redeemedAt: currentTime
                        }
                    ],
                    {
                        session
                    }
                );


            // Ensure redemption document was created.
            if (!Array.isArray(redemptionDocuments) || redemptionDocuments.length !== 1){
                const error = new Error("REDEMPTION_CREATION_FAILED");
                error.code = "REDEMPTION_CREATION_FAILED";
                throw error;
            }

            const redemption = redemptionDocuments[0];
            if (!redemption || !redemption._id) {
                const error = new Error("REDEMPTION_CREATION_FAILED");
                error.code = "REDEMPTION_CREATION_FAILED";
                throw error;
            }


            // =====================================================
            // 16. CREATE POINT TRANSACTION
            // =====================================================

            /*
                points are stored as positive numbers.

                type = "spent"

                tells us that these points were deducted.
            */

            const pointTransactionDocuments = await PointTransactionModel.create(
                    [
                        {
                            userId: authenticatedUserId,

                            type: "spent",

                            points:
                                reward.pointsRequired,

                            balanceAfter:
                                newBalance,

                            activityId: null,

                            rewardId:
                                reward._id,

                            redemptionId:
                                redemption._id,

                            description:
                                `Redeemed reward: ${reward.title}`,

                            createdAt: currentTime
                        }
                    ],
                    {
                        session
                    }
                );


            // Ensure point transaction was created.
            if (!Array.isArray(pointTransactionDocuments) || pointTransactionDocuments.length !== 1){
                const error = new Error(
                    "POINT_TRANSACTION_CREATION_FAILED"
                );

                error.code =
                    "POINT_TRANSACTION_CREATION_FAILED";

                throw error;
            }


            const pointTransaction =
                pointTransactionDocuments[0];


            if (
                !pointTransaction ||
                !pointTransaction._id
            ) {

                const error = new Error(
                    "POINT_TRANSACTION_CREATION_FAILED"
                );

                error.code =
                    "POINT_TRANSACTION_CREATION_FAILED";

                throw error;
            }


            // =====================================================
            // 17. PREPARE SUCCESS RESPONSE
            // =====================================================

            redemptionResult = redemption;
        });


        // =========================================================
        // 18. SUCCESS RESPONSE
        // =========================================================

        return res.status(201).json({
            message: "Reward redeemed successfully",
            status: "success",

            data: {
                redemption: {
                    _id: redemptionResult._id,

                    rewardId:
                        redemptionResult.rewardId,

                    rewardTitle:
                        redemptionResult.rewardTitle,

                    pointsSpent:
                        redemptionResult.pointsSpent,

                    voucherValue:
                        redemptionResult.voucherValue,

                    voucherProvider:
                        redemptionResult.voucherProvider,

                    voucherCode:
                        redemptionResult.voucherCode,

                    status:
                        redemptionResult.status,

                    redeemedAt:
                        redemptionResult.redeemedAt
                },

                points: {
                    pointsSpent:
                        redemptionResult.pointsSpent,

                    balanceAfter:
                        newBalance
                },

                reward: {
                    remainingStock:
                        remainingStock
                }
            }
        });

    } catch (err) {

        // =========================================================
        // 19. BUSINESS ERROR RESPONSES
        // =========================================================

        console.error("Redeem reward error:",err);


        // Authenticated user was deleted.
        if (err.code === "AUTHENTICATED_USER_NOT_FOUND"){
            return res.status(401).json({
                message: "User no longer exists",
                status: "Failure"
            });
        }


        // Reward does not exist.
        if (err.code === "REWARD_NOT_FOUND"){
            return res.status(404).json({
                message: "Reward not found",
                status: "Failure"
            });
        }


        // Reward inactive.
        if (err.code === "REWARD_UNAVAILABLE"){
            return res.status(404).json({
                message: "Reward is not available",
                status: "Failure"
            });
        }


        // Reward out of stock.
        if (err.code === "REWARD_OUT_OF_STOCK"){
            return res.status(404).json({
                message: "Reward is out of stock",
                status: "Failure"
            });
        }


        // Reward expired.
        if (err.code === "REWARD_EXPIRED"){
            return res.status(404).json({
                message: "Reward has expired",
                status: "Failure"
            });
        }


        // User doesn't have enough points.
        if (err.code === "INSUFFICIENT_POINTS"){
            return res.status(400).json({
                message: "Insufficient points to redeem this reward",
                status: "Failure"
            });
        }


        // Invalid user points.
        if (err.code === "INVALID_USER_POINTS"){
            return res.status(500).json({
                message: "Invalid user points data",
                status: "Failure"
            });
        }


        // Invalid reward data.
        if (err.code === "INVALID_REWARD_DATA"){
            return res.status(500).json({
                message: "Invalid reward data",
                status: "Failure"
            });
        }


        // Invalid reward stock.
        if (err.code === "INVALID_REWARD_STOCK"){
            return res.status(500).json({
                message: "Invalid reward stock data",
                status: "Failure"
            });
        }


        // Invalid reward status.
        if (err.code === "INVALID_REWARD_STATUS"){
            return res.status(500).json({
                message: "Invalid reward status data",
                status: "Failure"
            });
        }


        // Invalid expiry data.
        if (err.code === "INVALID_REWARD_EXPIRY"){
            return res.status(500).json({
                message: "Invalid reward expiry data",
                status: "Failure"
            });
        }


        // =========================================================
        // 20. CONCURRENCY / ATOMIC UPDATE FAILURES
        // =========================================================

        /*
            If another user consumed the final stock before this
            transaction could update it, the transaction fails and
            MongoDB rolls back the user's point deduction as well.
        */

        if (err.code === "REWARD_STOCK_UPDATE_FAILED"){
            return res.status(409).json({
                message: "Reward stock is no longer available",
                status: "Failure"
            });
        }


        /*
            If the user's points changed between validation and
            the atomic update, the conditional update fails.

            The transaction is rolled back.
        */

        if (err.code === "USER_POINTS_UPDATE_FAILED"){
            return res.status(409).json({
                message: "User points changed. Please try again",
                status: "Failure"
            });
        }


        // =========================================================
        // 21. DATABASE / TRANSACTION FAILURE
        // =========================================================

        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });

    } finally {

        // =========================================================
        // 22. ALWAYS CLOSE SESSION
        // =========================================================

        await session.endSession();
    }
}

async function getMyRedemptionsHandler(req, res) {

    try {

        // =========================================================
        // 1. AUTHENTICATION VALIDATION
        // =========================================================

        // protectedRouteMiddleware should normally guarantee req.user.
        // Still validate it here as defense-in-depth.
        if (!req.user || !req.user._id) {

            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }


        const authenticatedUserId = req.user._id;


        // Validate authenticated user's ObjectId
        if (!mongoose.Types.ObjectId.isValid(authenticatedUserId)) {

            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }


        // =========================================================
        // 2. VERIFY USER STILL EXISTS
        // =========================================================

        // Do not blindly trust req.user.
        // Re-check the database so a deleted user cannot continue
        // accessing redemption history.
        const user = await UserModel
            .findById(authenticatedUserId)
            .select("_id")
            .lean();


        if (!user) {

            return res.status(401).json({
                message: "User no longer exists",
                status: "Failure"
            });
        }


        // =========================================================
        // 3. FETCH ONLY CURRENT USER'S REDEMPTIONS
        // =========================================================

        /*
            IMPORTANT SECURITY RULE:

            The user ID comes ONLY from the authenticated JWT /
            protectedRouteMiddleware.

            Never use:
                req.query.userId
                req.params.userId
                req.body.userId

            This prevents users from requesting another user's
            redemption history.
        */

        const redemptions = await RewardRedemptionModel
            .find({
                userId: authenticatedUserId
            })
            .select(
                "_id " +
                "userId " +
                "rewardId " +
                "rewardTitle " +
                "pointsSpent " +
                "voucherValue " +
                "voucherProvider " +
                "voucherCode " +
                "status " +
                "redeemedAt"
            )
            .sort({
                redeemedAt: -1,
                _id: -1
            })
            .lean();


        // =========================================================
        // 4. DEFENSIVE VALIDATION OF DATABASE RESULTS
        // =========================================================

        if (!Array.isArray(redemptions)) {

            console.error(
                "Invalid redemption query result for user:",
                authenticatedUserId
            );

            return res.status(500).json({
                message: "Invalid redemption data",
                status: "Failure"
            });
        }


        for (const redemption of redemptions) {

            // -----------------------------------------------------
            // Redemption object validation
            // -----------------------------------------------------

            if (
                !redemption ||
                typeof redemption !== "object" ||
                !redemption._id
            ) {

                console.error(
                    "Malformed redemption document:",
                    redemption
                );

                return res.status(500).json({
                    message: "Invalid redemption data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // Redemption ID validation
            // -----------------------------------------------------

            if (!mongoose.Types.ObjectId.isValid(redemption._id)) {

                console.error(
                    "Invalid redemption ID:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // Ownership validation
            // -----------------------------------------------------

            if (
                !redemption.userId ||
                !mongoose.Types.ObjectId.isValid(redemption.userId)
            ) {

                console.error(
                    "Invalid redemption userId:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption data",
                    status: "Failure"
                });
            }


            if (
                redemption.userId.toString() !==
                authenticatedUserId.toString()
            ) {

                console.error(
                    "Ownership violation detected for redemption:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption ownership data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // Reward ID validation
            // -----------------------------------------------------

            if (
                redemption.rewardId !== null &&
                redemption.rewardId !== undefined &&
                !mongoose.Types.ObjectId.isValid(
                    redemption.rewardId
                )
            ) {

                console.error(
                    "Invalid rewardId in redemption:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption reward data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // Reward snapshot validation
            // -----------------------------------------------------

            if (
                typeof redemption.rewardTitle !== "string" ||
                redemption.rewardTitle.trim().length === 0
            ) {

                console.error(
                    "Invalid reward title snapshot:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption reward data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // Points validation
            // -----------------------------------------------------

            if (
                !Number.isFinite(redemption.pointsSpent) ||
                !Number.isInteger(redemption.pointsSpent) ||
                redemption.pointsSpent < 1
            ) {

                console.error(
                    "Invalid pointsSpent:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption points data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // Voucher value validation
            // -----------------------------------------------------

            if (
                !Number.isFinite(redemption.voucherValue) ||
                redemption.voucherValue < 0
            ) {

                console.error(
                    "Invalid voucherValue:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption voucher data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // Voucher provider validation
            // -----------------------------------------------------

            if (
                typeof redemption.voucherProvider !== "string" ||
                redemption.voucherProvider.trim().length === 0
            ) {

                console.error(
                    "Invalid voucherProvider:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption voucher data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // Status validation
            // -----------------------------------------------------

            const allowedStatuses = [
                "pending",
                "completed",
                "cancelled"
            ];

            if (!allowedStatuses.includes(redemption.status)) {

                console.error(
                    "Invalid redemption status:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption status data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // redeemedAt validation
            // -----------------------------------------------------

            if (
                !redemption.redeemedAt ||
                Number.isNaN(
                    new Date(redemption.redeemedAt).getTime()
                )
            ) {

                console.error(
                    "Invalid redeemedAt:",
                    redemption._id
                );

                return res.status(500).json({
                    message: "Invalid redemption date data",
                    status: "Failure"
                });
            }


            // -----------------------------------------------------
            // voucherCode validation
            // -----------------------------------------------------

            if (redemption.voucherCode !== null && redemption.voucherCode !== undefined && typeof redemption.voucherCode !== "string"){
                // console.error("Invalid voucherCode:",redemption._id);
                return res.status(500).json({
                    message: "Invalid redemption voucher code",
                    status: "Failure"
                });
            }
        }


        // =========================================================
        // 5. REMOVE INTERNAL OWNERSHIP FIELD FROM RESPONSE
        // =========================================================

        /*
            userId was selected above so that we could perform
            defense-in-depth ownership validation.

            It does not need to be exposed in the response because
            this endpoint is already scoped to the authenticated user.
        */

        const responseData = redemptions.map((redemption) => {

            const {
                userId,
                ...safeRedemption
            } = redemption;

            return safeRedemption;
        });


        // =========================================================
        // 6. SUCCESS RESPONSE
        // =========================================================

        return res.status(200).json({
            message: "Redemption history fetched successfully",
            status: "success",
            count: responseData.length,
            data: responseData
        });


    } catch (err) {

        // =========================================================
        // 7. DATABASE / UNEXPECTED ERROR
        // =========================================================

        console.error(
            "getMyRedemptionsHandler error:",
            err
        );

        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}

async function getMyRedemptionHandler(req, res) {

    try {

        // =========================================================
        // 1. AUTHENTICATION VALIDATION
        // =========================================================

        /*
            protectedRouteMiddleware should already authenticate
            the request and attach the authenticated user to:

                req.user

            This additional validation acts as defense-in-depth.
        */

        if (!req.user || !req.user._id) {

            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }


        const authenticatedUserId = req.user._id;


        // Validate authenticated user's ObjectId
        if (!mongoose.Types.ObjectId.isValid(authenticatedUserId)) {

            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }


        // =========================================================
        // 2. VERIFY USER STILL EXISTS
        // =========================================================

        /*
            Do not blindly trust req.user.

            Re-checking the database ensures that a user deleted
            after authentication cannot continue accessing data.
        */

        const user = await UserModel
            .findById(authenticatedUserId)
            .select("_id")
            .lean();


        if (!user) {

            return res.status(401).json({
                message: "User no longer exists",
                status: "Failure"
            });
        }


        // =========================================================
        // 3. REDEMPTION ID VALIDATION
        // =========================================================

        const redemptionId = req.params?.redemptionId;


        // Missing redemption ID
        if (redemptionId === undefined || redemptionId === null) {

            return res.status(400).json({
                message: "Redemption ID is required",
                status: "Failure"
            });
        }


        // Empty redemption ID
        if (
            typeof redemptionId !== "string" ||
            redemptionId.trim().length === 0
        ) {

            return res.status(400).json({
                message: "Redemption ID cannot be empty",
                status: "Failure"
            });
        }


        const trimmedRedemptionId = redemptionId.trim();


        // Invalid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(trimmedRedemptionId)) {

            return res.status(400).json({
                message: "Invalid redemption ID",
                status: "Failure"
            });
        }


        // =========================================================
        // 4. FETCH REDEMPTION WITH OWNERSHIP ENFORCEMENT
        // =========================================================

        /*
            IMPORTANT SECURITY RULE:

            We query using BOTH:

                _id
                userId

            This means the authenticated user can only retrieve
            a redemption that belongs to them.

            We do NOT accept:
                req.body.userId
                req.query.userId
                req.params.userId
        */

        const redemption = await RewardRedemptionModel
            .findOne({
                _id: trimmedRedemptionId,
                userId: authenticatedUserId
            })
            .select(
                "_id " +
                "userId " +
                "rewardId " +
                "rewardTitle " +
                "pointsSpent " +
                "voucherValue " +
                "voucherProvider " +
                "voucherCode " +
                "status " +
                "redeemedAt"
            )
            .lean();


        // =========================================================
        // 5. NOT FOUND / OWNERSHIP FAILURE
        // =========================================================

        /*
            We intentionally return the same 404 response when:

            1. Redemption does not exist
            2. Redemption exists but belongs to another user

            This prevents ID enumeration / information leakage.
        */

        if (!redemption) {

            return res.status(404).json({
                message: "Redemption not found",
                status: "Failure"
            });
        }


        // =========================================================
        // 6. DEFENSIVE OWNERSHIP VALIDATION
        // =========================================================

        /*
            The database query already enforced ownership.

            This additional check protects against unexpected
            application/data-layer behavior.
        */

        if (
            !redemption.userId ||
            !mongoose.Types.ObjectId.isValid(redemption.userId)
        ) {

            console.error(
                "Invalid userId in redemption:",
                redemption._id
            );

            return res.status(500).json({
                message: "Invalid redemption ownership data",
                status: "Failure"
            });
        }


        if (
            redemption.userId.toString() !==
            authenticatedUserId.toString()
        ) {

            console.error(
                "Redemption ownership mismatch:",
                redemption._id
            );

            return res.status(500).json({
                message: "Invalid redemption ownership data",
                status: "Failure"
            });
        }


        // =========================================================
        // 7. REDEMPTION ID VALIDATION
        // =========================================================

        if (
            !redemption._id ||
            !mongoose.Types.ObjectId.isValid(redemption._id)
        ) {

            console.error(
                "Invalid redemption _id:",
                redemption
            );

            return res.status(500).json({
                message: "Invalid redemption data",
                status: "Failure"
            });
        }


        // =========================================================
        // 8. REWARD ID VALIDATION
        // =========================================================

        /*
            rewardId can technically become unavailable because the
            Reward document may have been deleted.

            The redemption itself should still remain valid because
            historical reward information is stored as a snapshot.
        */

        if (
            redemption.rewardId !== null &&
            redemption.rewardId !== undefined &&
            !mongoose.Types.ObjectId.isValid(redemption.rewardId)
        ) {

            console.error(
                "Invalid rewardId in redemption:",
                redemption._id
            );

            return res.status(500).json({
                message: "Invalid redemption reward data",
                status: "Failure"
            });
        }


        // =========================================================
        // 9. REWARD SNAPSHOT VALIDATION
        // =========================================================

        if (
            typeof redemption.rewardTitle !== "string" ||
            redemption.rewardTitle.trim().length === 0
        ) {

            console.error(
                "Invalid reward title snapshot:",
                redemption._id
            );

            return res.status(500).json({
                message: "Invalid redemption reward data",
                status: "Failure"
            });
        }


        // =========================================================
        // 10. POINTS SPENT VALIDATION
        // =========================================================

        if (
            !Number.isFinite(redemption.pointsSpent) ||
            !Number.isInteger(redemption.pointsSpent) ||
            redemption.pointsSpent < 1
        ) {

            console.error(
                "Invalid pointsSpent:",
                redemption._id
            );

            return res.status(500).json({
                message: "Invalid redemption points data",
                status: "Failure"
            });
        }


        // =========================================================
        // 11. VOUCHER VALUE VALIDATION
        // =========================================================

        if (
            !Number.isFinite(redemption.voucherValue) ||
            redemption.voucherValue < 0
        ) {

            console.error(
                "Invalid voucherValue:",
                redemption._id
            );

            return res.status(500).json({
                message: "Invalid redemption voucher data",
                status: "Failure"
            });
        }


        // =========================================================
        // 12. VOUCHER PROVIDER VALIDATION
        // =========================================================

        if (
            typeof redemption.voucherProvider !== "string" ||
            redemption.voucherProvider.trim().length === 0
        ) {

            console.error(
                "Invalid voucherProvider:",
                redemption._id
            );

            return res.status(500).json({
                message: "Invalid redemption voucher data",
                status: "Failure"
            });
        }


        // =========================================================
        // 13. REDEMPTION STATUS VALIDATION
        // =========================================================

        const allowedStatuses = [
            "pending",
            "completed",
            "cancelled"
        ];


        if (!allowedStatuses.includes(redemption.status)) {

            console.error(
                "Invalid redemption status:",
                redemption._id,
                redemption.status
            );

            return res.status(500).json({
                message: "Invalid redemption status data",
                status: "Failure"
            });
        }


        // =========================================================
        // 14. REDEEMED DATE VALIDATION
        // =========================================================

        if (
            !redemption.redeemedAt ||
            Number.isNaN(
                new Date(redemption.redeemedAt).getTime()
            )
        ) {

            console.error(
                "Invalid redeemedAt:",
                redemption._id
            );

            return res.status(500).json({
                message: "Invalid redemption date data",
                status: "Failure"
            });
        }


        // =========================================================
        // 15. VOUCHER CODE VALIDATION
        // =========================================================

        /*
            voucherCode is allowed to be null because a pending
            redemption may not have a voucher code yet.
        */

        if (
            redemption.voucherCode !== null &&
            redemption.voucherCode !== undefined &&
            typeof redemption.voucherCode !== "string"
        ) {

            console.error(
                "Invalid voucherCode:",
                redemption._id
            );

            return res.status(500).json({
                message: "Invalid redemption voucher code",
                status: "Failure"
            });
        }


        // =========================================================
        // 16. PREPARE SAFE RESPONSE
        // =========================================================

        /*
            userId was selected only so that ownership could be
            validated.

            It is deliberately removed from the public response.
        */

        const {
            userId,
            ...safeRedemption
        } = redemption;


        // =========================================================
        // 17. SUCCESS RESPONSE
        // =========================================================

        return res.status(200).json({
            message: "Redemption fetched successfully",
            status: "success",
            data: safeRedemption
        });


    } catch (err) {

        // =========================================================
        // 18. DATABASE / UNEXPECTED ERROR
        // =========================================================

        console.error(
            "getMyRedemptionHandler error:",
            err
        );

        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}

async function createRewardHandler(req, res) {
    try {

        // =========================================================
        // 1. AUTHENTICATION VALIDATION
        // =========================================================

        if (!req.user || !req.user._id) {
            return res.status(401).json({
                message: "Unauthorized access",
                status: "Failure"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
            return res.status(401).json({
                message: "Invalid authenticated user",
                status: "Failure"
            });
        }


        // =========================================================
        // 2. EXTRACT REQUEST DATA
        // =========================================================

        const {
            title,
            description,
            pointsRequired,
            voucherValue,
            voucherProvider,
            stock,
            expiryDate,
            status
        } = req.body;


        // =========================================================
        // 3. BASIC REQUIRED-FIELD VALIDATION
        // =========================================================

        if (typeof title !== "string" || title.trim().length === 0) {
            return res.status(400).json({
                message: "Reward title is required",
                status: "Failure"
            });
        }

        if (typeof description !== "string" || description.trim().length === 0) {
            return res.status(400).json({
                message: "Reward description is required",
                status: "Failure"
            });
        }

        if (typeof voucherProvider !== "string" || voucherProvider.trim().length === 0) {
            return res.status(400).json({
                message: "Voucher provider is required",
                status: "Failure"
            });
        }


        // =========================================================
        // 4. TITLE VALIDATION
        // =========================================================

        const normalizedTitle = title.trim();

        if (normalizedTitle.length < 3) {
            return res.status(400).json({
                message: "Reward title must be at least 3 characters",
                status: "Failure"
            });
        }

        if (normalizedTitle.length > 100) {
            return res.status(400).json({
                message: "Reward title cannot exceed 100 characters",
                status: "Failure"
            });
        }


        // =========================================================
        // 5. DESCRIPTION VALIDATION
        // =========================================================

        const normalizedDescription = description.trim();

        if (normalizedDescription.length < 10) {
            return res.status(400).json({
                message: "Reward description must be at least 10 characters",
                status: "Failure"
            });
        }

        if (normalizedDescription.length > 1000) {
            return res.status(400).json({
                message: "Reward description cannot exceed 1000 characters",
                status: "Failure"
            });
        }


        // =========================================================
        // 6. VOUCHER PROVIDER VALIDATION
        // =========================================================

        const normalizedProvider = voucherProvider.trim();

        if (normalizedProvider.length < 2) {
            return res.status(400).json({
                message: "Voucher provider must be at least 2 characters",
                status: "Failure"
            });
        }

        if (normalizedProvider.length > 100) {
            return res.status(400).json({
                message: "Voucher provider cannot exceed 100 characters",
                status: "Failure"
            });
        }


        // =========================================================
        // 7. POINTS REQUIRED VALIDATION
        // =========================================================

        if (
            typeof pointsRequired !== "number" ||
            !Number.isFinite(pointsRequired) ||
            !Number.isInteger(pointsRequired) ||
            pointsRequired < 1
        ) {
            return res.status(400).json({
                message: "Points required must be a positive integer",
                status: "Failure"
            });
        }


        // =========================================================
        // 8. VOUCHER VALUE VALIDATION
        // =========================================================

        if (
            typeof voucherValue !== "number" ||
            !Number.isFinite(voucherValue) ||
            voucherValue < 0
        ) {
            return res.status(400).json({
                message: "Voucher value must be a non-negative number",
                status: "Failure"
            });
        }


        // =========================================================
        // 9. STOCK VALIDATION
        // =========================================================

        if (
            typeof stock !== "number" ||
            !Number.isFinite(stock) ||
            !Number.isInteger(stock) ||
            stock < 0
        ) {
            return res.status(400).json({
                message: "Reward stock must be a non-negative integer",
                status: "Failure"
            });
        }


        // =========================================================
        // 10. STATUS VALIDATION
        // =========================================================

        const rewardStatus = status ?? "active";

        const allowedStatuses = [
            "active",
            "inactive",
            "out_of_stock"
        ];

        if (!allowedStatuses.includes(rewardStatus)) {
            return res.status(400).json({
                message: "Invalid reward status",
                status: "Failure"
            });
        }


        // =========================================================
        // 11. EXPIRY DATE VALIDATION
        // =========================================================

        let normalizedExpiryDate = null;

        if (expiryDate !== undefined && expiryDate !== null && expiryDate !== "") {

            const parsedExpiryDate = new Date(expiryDate);

            if (Number.isNaN(parsedExpiryDate.getTime())) {
                return res.status(400).json({
                    message: "Expiry date must be a valid date",
                    status: "Failure"
                });
            }

            normalizedExpiryDate = parsedExpiryDate;
        }


        // =========================================================
        // 12. BUSINESS VALIDATION
        // =========================================================

        // A reward with zero stock should not be created as active.
        if (rewardStatus === "active" && stock === 0) {
            return res.status(400).json({
                message: "An active reward must have stock greater than 0",
                status: "Failure"
            });
        }

        // An expired reward should not be created as active.
        if (
            rewardStatus === "active" &&
            normalizedExpiryDate !== null &&
            normalizedExpiryDate <= new Date()
        ) {
            return res.status(400).json({
                message: "An active reward must have a future expiry date",
                status: "Failure"
            });
        }


        // =========================================================
        // 13. CREATE REWARD
        // =========================================================

        const reward = await RewardModel.create({
            title: normalizedTitle,
            description: normalizedDescription,
            pointsRequired,
            voucherValue,
            voucherProvider: normalizedProvider,
            stock,
            expiryDate: normalizedExpiryDate,
            status: rewardStatus
        });


        // =========================================================
        // 14. DEFENSIVE RESPONSE VALIDATION
        // =========================================================

        if (!reward || !reward._id) {
            return res.status(500).json({
                message: "Reward creation failed",
                status: "Failure"
            });
        }


        // =========================================================
        // 15. SUCCESS RESPONSE
        // =========================================================

        return res.status(201).json({
            message: "Reward created successfully",
            status: "success",
            data: {
                _id: reward._id,
                title: reward.title,
                description: reward.description,
                pointsRequired: reward.pointsRequired,
                voucherValue: reward.voucherValue,
                voucherProvider: reward.voucherProvider,
                stock: reward.stock,
                expiryDate: reward.expiryDate,
                status: reward.status,
                createdAt: reward.createdAt
            }
        });

    } catch (err) {

        console.error("Create reward error:", err);

        // Mongoose validation error
        if (err.name === "ValidationError") {
            return res.status(400).json({
                message: "Invalid reward data",
                status: "Failure",
                errors: Object.values(err.errors).map(error => error.message)
            });
        }

        // Invalid ObjectId / Cast error
        if (err.name === "CastError") {
            return res.status(400).json({
                message: "Invalid reward data",
                status: "Failure"
            });
        }

        return res.status(500).json({
            message: "Internal server error.",
            status: "Failure"
        });
    }
}

module.exports = {
    getAllRewardHandler,
    getRewardHandler,
    getMyPointsHandler,
    getMyPointsHistoryHandler,
    redeemRewardHandler,
    getMyRedemptionsHandler,
    getMyRedemptionHandler,
    createRewardHandler
};