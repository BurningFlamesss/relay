import * as nodemailer from 'nodemailer'

export async function sendEmails(emailRequest: {
    type: "verify" | "resend" | "reset",
    receiverEmail: string,
    receiverName: string,
    token: string,
    callToAction: string
}) {
    try {
        const user = process.env.USER || 'relay@gmail.com'
        const password = process.env.APP_PASSWORD || ''

        if (!password) {
            return {
                success: false,
                message: "Password not configured"
            }
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: user,
                pass: password
            },
        })

        await transporter.verify()

        let emailHtml = "";
        let subject = "";

        switch (emailRequest.type) {
            case 'verify':
                subject = "Verify your Email - relay"
                emailHtml = `
                    <body style="font-family: sans-serif; background-color: #f7f7f7; margin: 0; padding: 0; color: #333;">
                        <div style="max-width: 600px; margin: 50px auto; padding: 20px; background: #ffffff; box-shadow: 0 0 10px rgba(0, 0, 0, 0.08); border-radius: 8px;">

                            <div style="border-bottom: 1px solid #eee; padding-bottom: 20px;">
                                <h1 style="color: #FAA016; margin: 0; font-size: 1.8em;">relay</h1>
                            </div>

                            <div style="padding: 20px 0;">
                                <h2 style="color: #1F2937;">Hello, ${emailRequest.receiverName}!</h2>

                                <div style="background-color: #FFF7E6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                    <h3 style="color: #C76A00; margin: 0 0 15px 0;">Verify Your Email</h3>
                                    <p style="margin: 0; line-height: 1.6;">
                                        Please verify your email address to complete your registration.
                                    </p>

                                    <div style="text-align: center; margin: 25px 0;">
                                        <a href="${emailRequest.token}"
                                            style="display: inline-block; 
                                            background: linear-gradient(135deg, #FAA016 0%, #E68900 100%);
                                            color: white; 
                                            padding: 14px 28px; 
                                            text-decoration: none; 
                                            border-radius: 8px; 
                                            font-weight: 600; 
                                            font-size: 16px; 
                                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                                            ${emailRequest.callToAction}
                                        </a>
                                    </div>

                                    <p style="margin: 15px 0 0 0; color: #C76A00; font-size: 14px;">
                                        <strong>Note:</strong> If you didn't request this email, please ignore it.
                                    </p>
                                </div>

                                <div style="margin-top: 30px; font-size: 0.9em; color: #6B7280;">
                                    <p>Best regards,<br />The relay Team</p>
                                </div>
                            </div>

                            <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #9CA3AF; font-size: 0.8em;">
                                <p>&copy; 2026 relay. All rights reserved.</p>
                            </div>

                        </div>
                    </body>
                `

                break;

            case 'reset':
                subject = "Reset your Email Password - relay"
                emailHtml = `
                    <body style="font-family: sans-serif; background-color: #f7f7f7; margin: 0; padding: 0; color: #333;">
                        <div style="max-width: 600px; margin: 50px auto; padding: 20px; background: #ffffff; box-shadow: 0 0 10px rgba(0, 0, 0, 0.08); border-radius: 8px;">

                            <div style="border-bottom: 1px solid #eee; padding-bottom: 20px;">
                                <h1 style="color: #FAA016; margin: 0; font-size: 1.8em;">relay</h1>
                            </div>

                            <div style="padding: 20px 0;">
                                <h2 style="color: #1F2937;">Hello, ${emailRequest.receiverName}!</h2>

                                <div style="background-color: #FFF7E6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                    <h3 style="color: #C76A00; margin: 0 0 15px 0;">Reset Your Password</h3>
                                    <p style="margin: 0; line-height: 1.6;">
                                        We received a request to reset your password. Click the button below to set a new password.
                                    </p>

                                    <div style="text-align: center; margin: 25px 0;">
                                        <a href="${emailRequest.token}"
                                            style="display: inline-block; 
                                            background: linear-gradient(135deg, #FAA016 0%, #E68900 100%);
                                            color: white; 
                                            padding: 14px 28px; 
                                            text-decoration: none; 
                                            border-radius: 8px; 
                                            font-weight: 600; 
                                            font-size: 16px;">
                                            Reset Password
                                        </a>
                                    </div>

                                    <p style="margin: 15px 0 0 0; color: #C76A00; font-size: 14px;">
                                        <strong>Security Tip:</strong> This link will expire soon for your protection.
                                    </p>
                                </div>

                                <div style="margin-top: 30px; font-size: 0.9em; color: #6B7280;">
                                    <p>If you didn’t request a password reset, please ignore this email.</p>
                                    <p>Best regards,<br />The relay Team</p>
                                </div>
                            </div>

                            <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #9CA3AF; font-size: 0.8em;">
                                <p>&copy; 2026 relay. All rights reserved.</p>
                            </div>

                        </div>
                    </body>
                `

                break;

            case 'resend':
                subject = "Verify your Email (RESEND) - relay"
                emailHtml = `
                    <body style="font-family: sans-serif; background-color: #f7f7f7; margin: 0; padding: 0; color: #333;">
                        <div style="max-width: 600px; margin: 50px auto; padding: 20px; background: #ffffff; box-shadow: 0 0 10px rgba(0, 0, 0, 0.08); border-radius: 8px;">

                            <div style="border-bottom: 1px solid #eee; padding-bottom: 20px;">
                                <h1 style="color: #FAA016; margin: 0; font-size: 1.8em;">relay</h1>
                            </div>

                            <div style="padding: 20px 0;">
                                <h2 style="color: #1F2937;">Hello, ${emailRequest.receiverName}!</h2>

                                <div style="background-color: #FFF7E6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                    <h3 style="color: #C76A00; margin: 0 0 15px 0;">Verify Your Email</h3>
                                    <p style="margin: 0; line-height: 1.6;">
                                        You requested a new verification link. Click below to verify your email address.
                                    </p>

                                    <div style="text-align: center; margin: 25px 0;">
                                        <a href="${emailRequest.token}"
                                            style="display: inline-block; 
                                            background: linear-gradient(135deg, #FAA016 0%, #E68900 100%);
                                            color: white; 
                                            padding: 14px 28px; 
                                            text-decoration: none; 
                                            border-radius: 8px; 
                                            font-weight: 600; 
                                            font-size: 16px;">
                                            Verify Email
                                        </a>
                                    </div>

                                    <p style="margin: 15px 0 0 0; color: #C76A00; font-size: 14px;">
                                        <strong>Reminder:</strong> Verification links expire after a limited time.
                                    </p>
                                </div>

                                <div style="margin-top: 30px; font-size: 0.9em; color: #6B7280;">
                                    <p>Best regards,<br />The relay Team</p>
                                </div>
                            </div>

                            <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #9CA3AF; font-size: 0.8em;">
                                <p>&copy; 2026 relay. All rights reserved.</p>
                            </div>

                        </div>
                    </body>
                `

                break;

            default:
                break;
        }

        await transporter.sendMail({
            from: `relay - ${user}`,
            to: emailRequest.receiverEmail,
            subject: subject,
            html: emailHtml
        })


        return {
            success: true,
            message: "Successfully sent email",
            details: {
                subject: subject
            }
        }
    } catch (error) {
        console.error("Email service error:", error);
        return {
            success: false,
            message: "Failed to send emails",
            details: {
                error: error instanceof Error ? error.message : String(error),
            },
        };
    }
}