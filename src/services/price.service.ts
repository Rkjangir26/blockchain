import Database from '../config/database';
import MoralisService from './moralis.service';
import EmailService from './email.service';

class PriceService {
    public static async savePrices(ethPrice: number, maticPrice: number) {
        try {
            const client = await Database.getConnection();
            const result = await client.query(
                'INSERT INTO token_prices (token, price) VALUES ($1, $2), ($3, $4) RETURNING *',
                ['ETH', ethPrice, 'MATIC', maticPrice]
            );
            console.log("✅ Prices saved to database:", result.rows);
        } catch (err) {
            console.error('❌ Error saving prices to PostgreSQL:', err);
            throw err;
        }
    }

    public static async getHourlyPrices() {
        try {
            const client = await Database.getConnection();
            const query = `
                SELECT 
                    token,
                    DATE_TRUNC('hour', last_update) AS hour,
                    AVG(price) AS avg_price
                FROM 
                    token_prices
                WHERE 
                    last_update >= NOW() - INTERVAL '24 HOURS'
                GROUP BY 
                    token, hour
                ORDER BY 
                    hour DESC;
            `;
            const result = await client.query(query);
            return result.rows;
        } catch (err) {
            console.error('❌ Error getting hourly prices:', err);
            return [];
        }
    }

    public static async checkPriceIncrease(token: string, newPrice: number) {
        try {
            const client = await Database.getConnection();
            const result = await client.query(
                'SELECT price FROM token_prices WHERE token = $1 ORDER BY last_update DESC LIMIT 1',
                [token]
            );

            if (result.rows.length > 0) {
                const oldPrice = parseFloat(result.rows[0].price);
                if (newPrice !== oldPrice) {
                    await EmailService.sendPriceAlert(token, newPrice, oldPrice);
                }
            }
        } catch (err) {
            console.error(`❌ Error checking price increase for ${token}:`, err);
        }
    }

    public static async createPriceAlert(token: string, targetPrice: number, email: string) {
        try {
            const client = await Database.getConnection();
            const result = await client.query(
                `INSERT INTO price_alerts (token, target_price, email) 
                 VALUES ($1, $2, $3) 
                 RETURNING *`,
                [token.toUpperCase(), targetPrice, email]
            );
            return result.rows[0];
        } catch (err) {
            console.error("❌ Error creating price alert:", err);
            throw err;
        }
    }

    public static async checkPriceAlerts(token: string, currentPrice: number) {
        try {
            const client = await Database.getConnection();
            const alerts = await client.query(
                `SELECT * FROM price_alerts 
                 WHERE token = $1 
                 AND triggered = false
                 AND target_price BETWEEN $2 AND $3`,
                [token, currentPrice * 0.99, currentPrice * 1.01]
            );

            for (const alert of alerts.rows) {
                await EmailService.sendPriceAlert(token, currentPrice, alert.target_price);
                await client.query(
                    'UPDATE price_alerts SET triggered = true WHERE id = $1',
                    [alert.id]
                );
            }
        } catch (err) {
            console.error(`❌ Error checking price alerts for ${token}:`, err);
        }
    }
}

export default PriceService;