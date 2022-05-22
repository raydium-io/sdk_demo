
import { Connection, Keypair, PublicKey,} from "@solana/web3.js";
import {fetchAllPoolKeys, fetchPoolKeys} from "./util_mainnet"
import { getTokenAccountsByOwner, swap, addLiquidity, removeLiquidity, createWsol } from "./util";

// @ts-ignore
import bs58 from "bs58"


(async () => {
    const connection = new Connection("https://solana-api.projectserum.com", "confirmed");

    // change to your privateKey
    const secretKey = bs58.decode('3qswEeCJcA9ogpN3JEuXBtmnU35YPzSxBwzrk6sdTPhogMJ64WuabU9XWg2yUegJvv1qupYPqo2jQrrK26N7HGsD')

    const ownerKeypair = Keypair.fromSecretKey( secretKey )
    const owner = ownerKeypair.publicKey;
    console.log(owner.toString());
    
    const tokenAccounts = await getTokenAccountsByOwner(connection, owner)

    // RAY_USDC
    // const POOL_ID = "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg"

    // SOL-USDC
    const POOL_ID = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"
    // const allPoolKeys = await fetchAllPoolKeys(connection);
    // const poolKeys = allPoolKeys.find((item) => item.id.toBase58() === RAY_USDC)

    const poolKeys = await fetchPoolKeys(connection, new PublicKey(POOL_ID))

    await swap(connection, poolKeys, ownerKeypair, tokenAccounts)

    // await addLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    // await removeLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)
})()