import { NextApiRequest, NextApiResponse } from 'next';
import cron from 'node-cron';
import MoralisService from '@/services/moralis.service';
import PriceService from '@/services/price.service';

// Your API handler remains mostly the same, but using the services
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (req.method === 'GET') {
            if (req.query.type === 'hourlyPrices') {
                const hourlyPrices = await PriceService.getHourlyPrices();
                return res.status(200).json(hourlyPrices);
            }
            if (req.query.type === 'swapRate') {
                const amountETH = parseFloat(req.query.amount as string);
                if (!amountETH || amountETH <= 0) {
                    return res.status(400).json({ 
                        error: 'Please provide a valid positive ETH amount'
                    });
                }
                const swapRate = await MoralisService.getSwapRate(amountETH);
                return res.status(200).json(swapRate);
            }
        } 
        else if (req.method === 'POST' && req.query.type === 'setAlert') {
            // Your existing validation code remains the same
            const { token, targetPrice, email } = req.body;
            // ... validation code ...
            const alert = await PriceService.createPriceAlert(token, targetPrice, email);
            return res.status(201).json({
                message: 'Price alert created successfully',
                alert
            });
        }
        
        return res.status(200).json({ 
            message: 'Price tracker API',
            endpoints: {
                'GET /api/prices?type=hourlyPrices': 'Get hourly prices for last 24 hours',
                'GET /api/prices?type=swapRate&amount=1': 'Get swap rate for ETH to BTC conversion',
                'POST /api/prices?type=setAlert': 'Set price alert'
            }
        });
    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Update the cron job
cron.schedule('*/5 * * * *', async () => {
    try {
        const ethPrice = await MoralisService.getTokenPrice('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
        const maticPrice = await MoralisService.getTokenPrice('0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0');

        console.log(`Fetched ETH: ${ethPrice}, MATIC: ${maticPrice}`);

        if (ethPrice && maticPrice) {
            await PriceService.savePrices(ethPrice, maticPrice);
            await PriceService.checkPriceIncrease('ETH', ethPrice);
            await PriceService.checkPriceIncrease('MATIC', maticPrice);
            await PriceService.checkPriceAlerts('ETH', ethPrice);
            await PriceService.checkPriceAlerts('MATIC', maticPrice);
        }
    } catch (err) {
        console.error('❌ Error in cron job:', err);
    }
});