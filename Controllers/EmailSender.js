const emailjs = require("@emailjs/nodejs");

async function mailSender(otp, userEmail) {
    try {

        const currentTime = new Date();
        currentTime.setMinutes(currentTime.getMinutes() + 10);
        const formattedTime = currentTime.toString().replace(" GMT+0530 (India Standard Time)", "");
        const params = {
            email: userEmail,
            passcode: otp,
            time: formattedTime
        };

        console.log("Sending OTP to:", userEmail);

        const response = await emailjs.send(
            process.env.MAIL_SENDER_SERVICE_ID,
            process.env.MAIL_SENDER_TEMPLATE_ID,
            params,
            {
                publicKey: process.env.MAIL_SENDER_PUBLIC_KEY,
                privateKey: process.env.MAIL_SENDER_PRIVATE_KEY
            }
        );

        console.log("Email sent:", response);
        return response;

    } catch (error) {
        console.error("EmailJS Error:", error);
        throw error;
    }
}

module.exports = { mailSender };