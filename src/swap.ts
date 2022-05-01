
import { Connection, Keypair, PublicKey,} from "@solana/web3.js";
import { Liquidity, Token, TokenAmount,Percent } from "@raydium-io/raydium-sdk";
  
import {getTokenAccountsByOwner, fetchAllPoolKeys, fetchPoolKeys} from "./mainnet"

// @ts-ignore
import bs58 from "bs58"

(async () => {
    const connection = new Connection("https://solana-api.projectserum.com", "confirmed");

    // change to your privateKey
    // const secretKey = bs58.decode('xxxxxxxxxxxxxxxxxxxxxxxx')
    // const secretKey = Buffer.from(JSON.parse('[1,1,1,1,1]'))

    const secretKey = bs58.decode('3qswEeCJcA9ogpN3JEuXBtmnU35YPzSxBwzrk6sdTPhogMJ64WuabU9XWg2yUegJvv1qupYPqo2jQrrK26N7HGsD')

    const ownerKeypair = Keypair.fromSecretKey( secretKey )
    const owner = ownerKeypair.publicKey;
    console.log(owner.toString());

    const tokenAccounts = await getTokenAccountsByOwner(connection, owner)

    const RAY_USDC = "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg"
    // const allPoolKeys = await fetchAllPoolKeys(connection);
    // const poolKeys = allPoolKeys.find((item) => item.id.toBase58() === RAY_USDC)

    const poolKeys = await fetchPoolKeys(connection, new PublicKey(RAY_USDC))
    if (poolKeys){
      
      const poolInfo = await Liquidity.fetchInfo({connection, poolKeys})
      const amountIn = new TokenAmount(new Token(poolKeys.baseMint, 6), 1000000)
      const currencyOut = new Token(poolKeys.quoteMint,6)
      const slippage = new Percent(5, 100)

      const {
        amountOut,
        minAmountOut,
        currentPrice,
        executionPrice,
        priceImpact,
        fee,
      } = Liquidity.computeAmountOut({ poolKeys, poolInfo, amountIn, currencyOut, slippage, })

      //@ts-ignore
      console.log(amountOut.toFixed(), minAmountOut.toFixed(), currentPrice.toFixed(), executionPrice.toFixed(), priceImpact.toFixed(), fee.toFixed())
      const {transaction, signers} = await Liquidity.makeSwapTransaction({
          connection,
          poolKeys,
          userKeys: {
              tokenAccounts,
              owner,
          },
          amountIn,
          amountOut: minAmountOut,
          fixedSide: "in"
      })

      const txid = await connection.sendTransaction(
          transaction, 
          [...signers, ownerKeypair],
          {skipPreflight: true}
      );

      console.log(`https://solscan.io/tx/${txid}`)
    }
})()