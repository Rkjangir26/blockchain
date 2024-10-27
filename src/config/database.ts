import { Client } from 'pg';

class Database {
    private static instance: Client;
    private static isConnected: boolean = false;

    private constructor() {}

    public static async getConnection(): Promise<Client> {
        if (!this.instance) {
            this.instance = new Client({
                connectionString: process.env.DATABASE_URL,
            });
        }

        if (!this.isConnected) {
            await this.instance.connect();
            this.isConnected = true;
            console.log("✅ Connected to PostgreSQL successfully.");
            console.log(`Connected to database: ${process.env.DATABASE_URL}`);
            await this.createTables();
        }

        return this.instance;
    }

    private static async createTables(): Promise<void> {
        try {
            const pricesQuery = `
                CREATE TABLE IF NOT EXISTS token_prices (
                    id SERIAL PRIMARY KEY,
                    token VARCHAR(10) NOT NULL,
                    price NUMERIC(20, 10) NOT NULL,
                    last_update TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            `;
            
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
            
            await this.instance.query(pricesQuery);
            await this.instance.query(alertsQuery);
            console.log("✅ Tables verified or created successfully.");
        } catch (err) {
            console.error("❌ Error creating tables:", err);
            throw err;
        }
    }
}

export default Database;