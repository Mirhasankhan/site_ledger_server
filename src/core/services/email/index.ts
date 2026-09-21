/* eslint-disable @typescript-eslint/no-unused-vars */

import nodemailEmailSender from "./nodemailer";

export interface EmailOptions {
    email: string;
    subject: string;
    text?: string;
    html?: string;
}

export const sendEmail = async ({
    email,
    subject,
    html,
    text,
}: EmailOptions) => {
    try {
        return await nodemailEmailSender({
            email,
            subject,
            html: html || "",
            text,
        });
    } catch (error) {
        console.error("Email Send Failed: ", (error as Error).message);
        throw error;
    }
};
