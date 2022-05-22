
import { Connection, Keypair, PublicKey,} from "@solana/web3.js";

// @ts-ignore
import bs58 from "bs58"

import {fetchAllPoolKeys, fetchPoolKeys} from "./util_devnet"
import { getTokenAccountsByOwner, swap, addLiquidity, removeLiquidity, createWsol } from "./util";


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
    
    // SOL-USDT
    const POOL_ID = "384zMi9MbUKVUfkUdrnuMfWBwJR9gadSxYimuXeJ9DaJ"

    // RAY_USDC
    // const POOL_ID = "ELSGBb45rAQNsMTVzwjUqL8vBophWhPn4rNbqwxenmqY"

    const poolKeys = await fetchPoolKeys(connection, new PublicKey(POOL_ID))

    await swap(connection, poolKeys, ownerKeypair, tokenAccounts)

    // await addLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    // await removeLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

})()