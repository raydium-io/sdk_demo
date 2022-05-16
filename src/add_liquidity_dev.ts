// @ts-ignore
import bs58 from 'bs58';

import {
  Liquidity,
  Percent,
  Token,
  TokenAmount,
} from '@raydium-io/raydium-sdk';
import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';

import {
  fetchAllPoolKeys,
  fetchPoolKeys,
  getTokenAccountsByOwner,
} from './devnet';

(async () => {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Replace '[1,1,1,1,1]' with your key
    const secretKey = Buffer.from(JSON.parse('[1,1,1,1,1]'))
    // const secretKey = bs58.decode('11111')
    
    const ownerKeypair = Keypair.fromSecretKey( secretKey )

    const owner = ownerKeypair.publicKey;
    console.log(owner.toString());

    const tokenAccounts = await getTokenAccountsByOwner(connection, owner)
    console.log("tokenAccounts.length:", tokenAccounts.length)

    const allPoolKeys = await fetchAllPoolKeys(connection);
    console.log("allPoolKeys.length:", allPoolKeys.length)

    allPoolKeys.forEach((item) => {
      // if (item.baseMint.toBase58() == WSOL.mint || item.quoteMint.toBase58() == WSOL.mint )
        console.log(item.id.toBase58(),item.baseMint.toBase58(),item.quoteMint.toBase58())
    })

    // SOL-USDT
    // const POOL_ID = "384zMi9MbUKVUfkUdrnuMfWBwJR9gadSxYimuXeJ9DaJ"

    // RAY_USDC
    const POOL_ID = "ELSGBb45rAQNsMTVzwjUqL8vBophWhPn4rNbqwxenmqY"
    const USDC_MINT_ID = "BEcGFQK1T1tSu3kvHC17cyCkQ5dvXqAJ7ExB2bb5Do7a";
    const RAY_MINT_ID = "FSRvxBNrQWX2Fy2qvKMLL3ryEdRtE3PUTZBcdKwASZTU"

    const poolKeys = await fetchPoolKeys(connection, new PublicKey(POOL_ID))
    if (poolKeys){
      
      const poolInfo = await Liquidity.fetchInfo({connection, poolKeys})

      // real amount = 1000000 / 10**poolInfo.baseDecimals
      const amountInA = new TokenAmount(new Token(USDC_MINT_ID, poolInfo.baseDecimals), 100)
      const amountInB = new TokenAmount(new Token(RAY_MINT_ID, poolInfo.baseDecimals), 100)

      // 1% slippage
      const slippage = new Percent(1, 100)
            
      // const minAmountOut = new TokenAmount(new Token(poolKeys.quoteMint, poolInfo.quoteDecimals), 1000000)

      const { transaction, signers } = await Liquidity.makeAddLiquidityTransaction({
          connection,
          poolKeys,
          userKeys: {
              tokenAccounts,
              owner,
          },
          amountInA,
          amountInB,
          fixedSide: 'a'
      })

      const txid = await connection.sendTransaction(
          transaction, 
          [...signers, ownerKeypair],
          {skipPreflight: true}
      );

      console.log(`https://explorer.solana.com/tx/${txid}?cluster=devnet`)
    }
})()