
import { Connection, Keypair, PublicKey,} from "@solana/web3.js";

// @ts-ignore
import bs58 from "bs58"

import {fetchAllPoolKeys, fetchPoolKeys, getRouteRelated} from "./util_devnet"
import { getTokenAccountsByOwner, swap, addLiquidity, removeLiquidity, routeSwap, tradeSwap } from "./util";


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

    const poolKeys = await fetchPoolKeys(connection, new PublicKey(POOL_ID))
    

    await swap(connection, poolKeys, ownerKeypair, tokenAccounts)

    await addLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    await removeLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    const fromPoolKeys = await fetchPoolKeys(connection, new PublicKey(FIDA_SOL))
    const toPoolKeys = await fetchPoolKeys(connection, new PublicKey(SOL_USDT))

    const FIDA_MINT_ID = fromPoolKeys.baseMint;
    const USDC_MINT_ID = toPoolKeys.quoteMint;
    const relatedPoolKeys = await getRouteRelated(connection, FIDA_MINT_ID, USDC_MINT_ID)

    await routeSwap(connection, fromPoolKeys, toPoolKeys, ownerKeypair, tokenAccounts)

    await tradeSwap(connection, FIDA_MINT_ID, USDC_MINT_ID, relatedPoolKeys, ownerKeypair, tokenAccounts)

})()