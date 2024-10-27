import nodemailer from 'nodemailer';

class EmailService {
    private static transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    public static async sendPriceAlert(token: string, newPrice: number, oldPrice: number) {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'vivekkhudaniya@gmail.com',
            subject: `Price Alert: ${token} Price Changed`,
            text: `The price of ${token} has changed from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}.`
        };

        try {
            await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email alert sent for ${token}: Price changed from $${oldPrice} to $${newPrice}`);
        } catch (err) {
            console.error('❌ Error sending email:', err);
            throw err;
        }
    }
}

export default EmailService;