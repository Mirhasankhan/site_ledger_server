import * as nodemailer from "nodemailer";
import config from "@/config";

const transporter = nodemailer.createTransport({
    // For Gmail
    service: "gmail",
    // For other service
    // host: config.smtp.host,
    // port: config.smtp.port,
    auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
    },
});

const nodemailEmailSender = async ({
    email,
    subject,
    html,
    text,
}: {
    email: string;
    subject: string;
    html: string;
    text?: string;
}) => {
    const mailOptions = {
        from: `"${config.company_name || "Siteledger"}" <${config.smtp.sender || config.smtp.user}>`,
        to: email,
        subject,
        html,
        ...(text && { text }),
    };

    // Send the email
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent: " + info.response);
        return info;
    } catch (error) {
        console.error("Error sending email:", error);
        throw error;
    }
};

export default nodemailEmailSender;
