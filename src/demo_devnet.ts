
import { Connection, Keypair, PublicKey,} from "@solana/web3.js";

// @ts-ignore
import bs58 from "bs58"

import {fetchAllPoolKeys, fetchPoolKeys, getRouteRelated} from "./util_devnet"
import { getLiquidityInfo, getTokenAccountsByOwner, swap, addLiquidity, removeLiquidity, routeSwap, tradeSwap } from "./util";


const SERUM_PROGRAM_ID_V3 = new PublicKey('DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY')

async function getAllAmmPools(connection: Connection){
  // get all pools
  const allPoolKeys = await fetchAllPoolKeys(connection);
  console.log("allPoolKeys.length:", allPoolKeys.length)

  allPoolKeys.forEach((item) => {
    // if (item.baseMint.toBase58() == WSOL.mint || item.quoteMint.toBase58() == WSOL.mint )
      console.log(item.id.toBase58(),item.baseMint.toBase58(),item.quoteMint.toBase58())
  })
  // return allPoolKeys
}


(async () => {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // change to your privateKey
    // const secretKey = Buffer.from(JSON.parse('[1,1,1,1,1]'))
    const secretKey = bs58.decode('3qswEeCJcA9ogpN3JEuXBtmnU35YPzSxBwzrk6sdTPhogMJ64WuabU9XWg2yUegJvv1qupYPqo2jQrrK26N7HGsD')

    const ownerKeypair = Keypair.fromSecretKey( secretKey )

    const owner = ownerKeypair.publicKey;
    console.log(owner.toString())

    // await createWsol(connection, ownerKeypair, 0.1)

    const tokenAccounts = await getTokenAccountsByOwner(connection, owner)
    console.log("tokenAccounts.length:", tokenAccounts.length)

    // await getAllAmmPools(connection)
    
    const SOL_USDT = "384zMi9MbUKVUfkUdrnuMfWBwJR9gadSxYimuXeJ9DaJ"

    // FIDA-SOL POOL
    const FIDA_SOL = "ER3u3p9TGyA4Sc9VCJrkLq4hR73GFW8QAzYkkz8rSwsk"

    // RAY_USDC
    const POOL_ID = "ELSGBb45rAQNsMTVzwjUqL8vBophWhPn4rNbqwxenmqY"

    const poolKeys = await fetchPoolKeys(connection, new PublicKey(SOL_USDT))
    
    const info = await getLiquidityInfo(connection, new PublicKey(POOL_ID), SERUM_PROGRAM_ID_V3)

    // @ts-ignore
    console.log("base Vault:", info.baseVaultKey.toBase58(), info.baseVaultBalance);
    // @ts-ignore
    console.log("quote Vault:", info.quoteVaultKey.toBase58(), info.quoteVaultBalance);
  
    // @ts-ignore
    console.log(`openOrders Account ${info.openOrdersKey.toBase58()}, base Serum book total: ${info.openOrdersTotalBase},quote Serum book total: ${info.openOrdersTotalQuote} `)
  
      // @ts-ignore
    console.log(`base pnl: ${info.basePnl }, quote pnl: ${info.quotePnl}` );

    // @ts-ignore
    console.log(`Final base:${info.base}, quote:${info.quote}, priceInQuote: ${info.priceInQuote}, lpSupply:${info.lpSupply}` )

    await swap(connection, poolKeys, ownerKeypair, tokenAccounts)

    await addLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    await removeLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    /// dev not support routeSwap
    // const fromPoolKeys = await fetchPoolKeys(connection, new PublicKey(FIDA_SOL))
    // const toPoolKeys = await fetchPoolKeys(connection, new PublicKey(SOL_USDT))

    // const FIDA_MINT_ID = fromPoolKeys.baseMint;
    // const USDC_MINT_ID = toPoolKeys.quoteMint;
    // const relatedPoolKeys = await getRouteRelated(connection, FIDA_MINT_ID, USDC_MINT_ID)

    // await routeSwap(connection, fromPoolKeys, toPoolKeys, ownerKeypair, tokenAccounts)

    // await tradeSwap(connection, FIDA_MINT_ID, USDC_MINT_ID, relatedPoolKeys, ownerKeypair, tokenAccounts)

})()