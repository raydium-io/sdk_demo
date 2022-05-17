
import { Connection, Keypair, PublicKey,} from "@solana/web3.js";
import {fetchAllPoolKeys, fetchPoolKeys} from "./util_mainnet"
import { getTokenAccountsByOwner, swap, addLiquidity, removeLiquidity, routeSwap, tradeSwap } from "./util";

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

    const FIDA_RAY = "2dRNngAm729NzLbb1pzgHtfHvPqR4XHFmFyYK78EfEeX"
    const RAY_USDC = "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg"
    // const allPoolKeys = await fetchAllPoolKeys(connection);
    // const poolKeys = allPoolKeys.find((item) => item.id.toBase58() === RAY_USDC)

    const fromPoolKeys = await fetchPoolKeys(connection, new PublicKey(FIDA_RAY))
    const poolKeys = await fetchPoolKeys(connection, new PublicKey(RAY_USDC))
    const FIDA_MINT_ID = fromPoolKeys.baseMint;
    const USDC_MINT_ID = poolKeys.quoteMint;

    await swap(connection, poolKeys, ownerKeypair, tokenAccounts)

    await addLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    await removeLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    await routeSwap(connection, fromPoolKeys, poolKeys, ownerKeypair, tokenAccounts)

    await tradeSwap(connection, FIDA_MINT_ID, USDC_MINT_ID, ownerKeypair, tokenAccounts)
})()