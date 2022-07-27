
import { Connection, Keypair, PublicKey,} from "@solana/web3.js";
import {fetchAllPoolKeys, fetchPoolKeys, getRouteRelated} from "./util_mainnet"
import { getTokenAccountsByOwner, swap, addLiquidity, removeLiquidity, routeSwap, tradeSwap, getLiquidityInfo } from "./util";

// @ts-ignore
import bs58 from "bs58"
import { SERUM_PROGRAM_ID_V3 } from "@raydium-io/raydium-sdk";


(async () => {
    const connection = new Connection("https://solana-api.projectserum.com", "confirmed");

    // change to your privateKey
    const secretKey = bs58.decode('3qswEeCJcA9ogpN3JEuXBtmnU35YPzSxBwzrk6sdTPhogMJ64WuabU9XWg2yUegJvv1qupYPqo2jQrrK26N7HGsD')

    const ownerKeypair = Keypair.fromSecretKey( secretKey )
    const owner = ownerKeypair.publicKey;
    console.log(owner.toString());
    
    const tokenAccounts = await getTokenAccountsByOwner(connection, owner)

    // SOL-USDC
    const POOL_ID = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"

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

    
    // const allPoolKeys = await fetchAllPoolKeys(connection);
    // const poolKeys = allPoolKeys.find((item) => item.id.toBase58() === RAY_USDC)
    const poolKeys = await fetchPoolKeys(connection, new PublicKey(POOL_ID))


    await swap(connection, poolKeys, ownerKeypair, tokenAccounts)

    await addLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    await removeLiquidity(connection, poolKeys, ownerKeypair, tokenAccounts)

    const FIDA_RAY = "2dRNngAm729NzLbb1pzgHtfHvPqR4XHFmFyYK78EfEeX"
    const RAY_USDC = "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg"

    const fromPoolKeys = await fetchPoolKeys(connection, new PublicKey(FIDA_RAY))
    const toPoolKeys = await fetchPoolKeys(connection, new PublicKey(RAY_USDC))
    const FIDA_MINT_ID = fromPoolKeys.baseMint;
    const USDC_MINT_ID = poolKeys.quoteMint;
    const relatedPoolKeys = await getRouteRelated(connection, FIDA_MINT_ID, USDC_MINT_ID)

    await routeSwap(connection, fromPoolKeys, toPoolKeys, ownerKeypair, tokenAccounts)

    await tradeSwap(connection, FIDA_MINT_ID, USDC_MINT_ID, relatedPoolKeys, ownerKeypair, tokenAccounts)
})()