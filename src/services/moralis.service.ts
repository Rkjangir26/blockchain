import Moralis from 'moralis';

class MoralisService {
    private static isInitialized: boolean = false;

    public static async init(): Promise<void> {
        if (!this.isInitialized) {
            await Moralis.start({
                apiKey: process.env.MORALIS_API_KEY || '',
            });
            this.isInitialized = true;
            console.log("✅ Moralis initialized successfully.");
        }
    }

    public static async getTokenPrice(address: string): Promise<number> {
        await this.init();
        const response = await Moralis.EvmApi.token.getTokenPrice({
            address,
            chain: '0x1'
        });
        return response.raw.usdPrice;
    }

    public static async getSwapRate(amountETH: number) {
        await this.init();

        const ethPrice = await this.getTokenPrice('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
        const btcPrice = await this.getTokenPrice('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599');

        const totalUSD = amountETH * ethPrice;
        const amountBTC = totalUSD / btcPrice;
        const feePercentage = 0.0003;
        const feeETH = amountETH * feePercentage;
        const feeUSD = totalUSD * feePercentage;

        return {
            input: { amount: amountETH, currency: 'ETH' },
            output: { amount: amountBTC.toFixed(8), currency: 'BTC' },
            exchangeRates: {
                ETH_USD: ethPrice.toFixed(2),
                BTC_USD: btcPrice.toFixed(2)
            },
            fees: {
                percentage: "0.03%",
                eth: feeETH.toFixed(6),
                usd: feeUSD.toFixed(2)
            },
            timestamp: new Date().toISOString()
        };
    }
}

export default MoralisService;