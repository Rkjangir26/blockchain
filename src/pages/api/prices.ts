// prices.ts
import { NextApiRequest, NextApiResponse } from 'next';
import Moralis from 'moralis';
import { Client } from 'pg';
import cron from 'node-cron';
import nodemailer from 'nodemailer';

// Initialize Moralis only once
let isMoralisInitialized = false;
async function initializeMoralis() {
    if (!isMoralisInitialized) {
        await Moralis.start({
            apiKey: process.env.MORALIS_API_KEY || '',
        });
        isMoralisInitialized = true;
        console.log("✅ Moralis initialized successfully.");
    }
}

// PostgreSQL client setup
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});
let isConnected = false;

async function createTableIfNotExists() {
    try {
        // Your existing token_prices table
        const pricesQuery = `
            CREATE TABLE IF NOT EXISTS token_prices (
                id SERIAL PRIMARY KEY,
                token VARCHAR(10) NOT NULL,
                price NUMERIC(20, 10) NOT NULL,
                last_update TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `;
        
        // New price_alerts table
        const alertsQuery = `
            CREATE TABLE IF NOT EXISTS price_alerts (
                id SERIAL PRIMARY KEY,
                token VARCHAR(10) NOT NULL,
                target_price NUMERIC(20, 10) NOT NULL,
                email VARCHAR(255) NOT NULL,
                triggered BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `;
        
        await client.query(pricesQuery);
        await client.query(alertsQuery);
        console.log("✅ Tables verified or created successfully.");
    } catch (err) {
        console.error("❌ Error creating tables:", err);
        throw err;
    }
}



// Connect to PostgreSQL database
async function connectToDatabase() {
    if (!isConnected) {
        await client.connect();
        isConnected = true;
        console.log("✅ Connected to PostgreSQL successfully.");
        console.log(`Connected to database: ${process.env.DATABASE_URL}`);
        await createTableIfNotExists();
    }
}

// Function to save prices in the database with confirmation logs
async function savePrices(ethPrice: number, maticPrice: number) {
    try {
        await connectToDatabase();

        console.log("Inserting prices:", { ethPrice, maticPrice });

        const result = await client.query(
            'INSERT INTO token_prices (token, price) VALUES ($1, $2), ($3, $4) RETURNING *',
            ['ETH', ethPrice, 'MATIC', maticPrice]
        );

        console.log("✅ Prices saved to database:", result.rows);
    } catch (err) {
        console.error('❌ Error saving prices to PostgreSQL:', err);
    }
}

// Function to send email notification
async function sendEmailAlert(token: string, newPrice: number, oldPrice: number) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: 'vivekkhudaniya@gmail.com',
        subject: `Price Alert: ${token} Price Changed`,
        text: `The price of ${token} has changed from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}.`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email alert sent for ${token}: Price changed from $${oldPrice} to $${newPrice}`);
    } catch (err) {
        console.error('❌ Error sending email:', err);
    }
}

// Function to check for price increases
async function checkPriceIncrease(token: string, newPrice: number) {
    try {
        const result = await client.query(
            'SELECT price FROM token_prices WHERE token = $1 ORDER BY last_update DESC LIMIT 1',
            [token]
        );

        if (result.rows.length > 0) {
            const oldPrice = parseFloat(result.rows[0].price);

            if (newPrice !== oldPrice) {
                await sendEmailAlert(token, newPrice, oldPrice);
            }
        }
    } catch (err) {
        console.error(`❌ Error checking price increase for ${token}:`, err);
    }
}

// Function to get hourly prices for the last 24 hours
async function getHourlyPrices() {
    try {
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

// Function to create price alert
async function createPriceAlert(token: string, targetPrice: number, email: string) {
    try {
        await connectToDatabase();
        
        const result = await client.query(
            `INSERT INTO price_alerts (token, target_price, email) 
             VALUES ($1, $2, $3) 
             RETURNING *`,
            [token.toUpperCase(), targetPrice, email]
        );

        console.log("✅ Price alert created:", result.rows[0]);
        return result.rows[0];
    } catch (err) {
        console.error("❌ Error creating price alert:", err);
        throw err;
    }
}

// Function to check price alerts (add this to your existing checkPriceIncrease function)
async function checkPriceAlerts(token: string, currentPrice: number) {
    try {
        // Get active alerts for the token where current price matches target price (within 1%)
        const alerts = await client.query(
            `SELECT * FROM price_alerts 
             WHERE token = $1 
             AND triggered = false
             AND target_price BETWEEN $2 AND $3`,
            [token, currentPrice * 0.99, currentPrice * 1.01]
        );

        for (const alert of alerts.rows) {
            // Send email notification
            await sendEmailAlert(token, currentPrice, alert.target_price);
            
            // Mark alert as triggered
            await client.query(
                'UPDATE price_alerts SET triggered = true WHERE id = $1',
                [alert.id]
            );
        }
    } catch (err) {
        console.error(`❌ Error checking price alerts for ${token}:`, err);
    }
}

// Update your API handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        await connectToDatabase();

        if (req.method === 'GET') {
            if (req.query.type === 'hourlyPrices') {
                const hourlyPrices = await getHourlyPrices();
                return res.status(200).json(hourlyPrices);
            }
        } 
        // New POST endpoint for setting alerts
        else if (req.method === 'POST' && req.query.type === 'setAlert') {
            const { token, targetPrice, email } = req.body;

            // Input validation
            if (!token || !targetPrice || !email) {
                return res.status(400).json({ 
                    error: 'Missing required fields',
                    required: ['token', 'targetPrice', 'email']
                });
            }

            // Validate token
            if (!['ETH', 'MATIC'].includes(token.toUpperCase())) {
                return res.status(400).json({ 
                    error: 'Invalid token. Supported tokens are ETH and MATIC'
                });
            }

            // Validate target price
            if (typeof targetPrice !== 'number' || targetPrice <= 0) {
                return res.status(400).json({ 
                    error: 'Target price must be a positive number'
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ 
                    error: 'Invalid email format'
                });
            }

            // Create the alert
            const alert = await createPriceAlert(token, targetPrice, email);
            
            return res.status(201).json({
                message: 'Price alert created successfully',
                alert: {
                    id: alert.id,
                    token: alert.token,
                    targetPrice: alert.target_price,
                    email: alert.email,
                    created_at: alert.created_at
                }
            });
        }
        
        res.status(200).json({ 
            message: 'Price tracker API',
            endpoints: {
                'GET /api/prices?type=hourlyPrices': 'Get hourly prices for last 24 hours',
                'POST /api/prices?type=setAlert': 'Set price alert with body: { token, targetPrice, email }'
            }
        });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Update your cron job to include price alert checks
cron.schedule('*/5 * * * *', async () => {
    try {
        await initializeMoralis();

        const response = await Moralis.EvmApi.token.getTokenPrice({
            address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            chain: '0x1'
        });

        const response2 = await Moralis.EvmApi.token.getTokenPrice({
            address: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
            chain: '0x1'
        });

        const ethUsdPrice = response.raw.usdPrice;
        const maticUsdPrice = response2.raw.usdPrice;

        console.log(`Fetched ETH: ${ethUsdPrice}, MATIC: ${maticUsdPrice}`);

        if (ethUsdPrice && maticUsdPrice) {
            await savePrices(ethUsdPrice, maticUsdPrice);
            console.log(`✅ Saved ETH: ${ethUsdPrice}, MATIC: ${maticUsdPrice}`);

            // Check regular price increases
            await checkPriceIncrease('ETH', ethUsdPrice);
            await checkPriceIncrease('MATIC', maticUsdPrice);

            // Check price alerts
            await checkPriceAlerts('ETH', ethUsdPrice);
            await checkPriceAlerts('MATIC', maticUsdPrice);
        } else {
            console.error('❌ Failed to fetch valid price data.');
        }
    } catch (err) {
        console.error('❌ Error fetching and saving prices:', err);
    }
});