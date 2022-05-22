
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Signer, SystemProgram, Transaction, TransactionInstruction,} from "@solana/web3.js";
import { Token as SplToken, } from "@solana/spl-token"

import {  TOKEN_PROGRAM_ID, SPL_ACCOUNT_LAYOUT,  TokenAccount, LiquidityPoolKeys, Liquidity, Route, Trade, TokenAmount, Token, Percent, Currency } from "@raydium-io/raydium-sdk";

export async function getTokenAccountsByOwner(
  connection: Connection,
  owner: PublicKey,
) {
  const tokenResp = await connection.getTokenAccountsByOwner(
    owner,
    {
      programId: TOKEN_PROGRAM_ID
    },
  );

  const accounts: TokenAccount[] = [];

  for (const { pubkey, account } of tokenResp.value) {
    accounts.push({
      pubkey,
      accountInfo:SPL_ACCOUNT_LAYOUT.decode(account.data)
    });
  }

  return accounts;
}

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112")

export async function createWsol(connection: Connection, ownerKeypair: Keypair, amount: number){
   
  const newAccount = Keypair.generate()
  const newAccountPubkey = newAccount.publicKey
  const owner = ownerKeypair.publicKey

  const lamports = await connection.getMinimumBalanceForRentExemption(SPL_ACCOUNT_LAYOUT.span)

  console.log('lamports: ', lamports, SPL_ACCOUNT_LAYOUT.span)
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey,
      lamports: lamports ,
      space: SPL_ACCOUNT_LAYOUT.span,
      programId: TOKEN_PROGRAM_ID
    }),

    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: newAccountPubkey,
      lamports: amount * 10**9 ,
    }),

    SplToken.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WSOL_MINT,
      newAccountPubkey,
      owner
    )
  )
  await sendTx(connection, transaction, [ownerKeypair, newAccount ])

}

export async function closeWsol(
  connection: Connection,
  ownerKeypair: Keypair,
  wsolAddress: PublicKey,
) {
  const owner = ownerKeypair.publicKey
  const transaction = new Transaction().add(
    SplToken.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      wsolAddress,
      owner,
      owner,
      []
    )
  )
  await sendTx(connection, transaction, [ownerKeypair, ])
}

async function sendTx(connection: Connection, transaction: Transaction, signers: Array<Signer>){
  let txRetry = 0

  console.log('signers len:', signers.length)
  console.log('transaction instructions len:', transaction.instructions.length)

  transaction.instructions.forEach(ins => {
    console.log(ins.programId.toBase58())
    ins.keys.forEach(m => {
      console.log('\t', m.pubkey.toBase58(), m.isSigner, m.isWritable)
    });

    console.log('\t datasize:', ins.data.length)
  });

  transaction.recentBlockhash = (
    await connection.getLatestBlockhash('processed')
  ).blockhash;

  transaction.sign(...signers);
  const rawTransaction = transaction.serialize();

  console.log('packsize :', rawTransaction.length)

  while(++txRetry <= 3){
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    })

    let url = `${txRetry}, https://solscan.io/tx/${txid}`
    if (connection.rpcEndpoint.includes('dev'))
      url += '?cluster=devnet'
    console.log(url)

    await new Promise(resolve => setTimeout(resolve, 1000 * 6))
    const ret = await connection.getSignatureStatus(txid, {searchTransactionHistory:true})
    try {
      //@ts-ignore
      if (ret.value && ret.value.err == null){
        console.log(txRetry,'success')
        break
      } else {
        console.log(txRetry,'failed', ret)
      }
    } catch(e){
      console.log(txRetry,'failed', ret)
    }
  }
}

export async function swap(connection: Connection, poolKeys: LiquidityPoolKeys, ownerKeypair: Keypair, tokenAccounts: TokenAccount[]){
  console.log('swap start')

  const owner = ownerKeypair.publicKey
  const poolInfo = await Liquidity.fetchInfo({connection, poolKeys})

  // real amount = 1000000 / 10**poolInfo.baseDecimals
  const amountIn = new TokenAmount(new Token(poolKeys.baseMint, poolInfo.baseDecimals), 0.1, false)

  const currencyOut = new Token(poolKeys.quoteMint, poolInfo.quoteDecimals)

  // 5% slippage
  const slippage = new Percent(5, 100)

  const {
    amountOut,
    minAmountOut,
    currentPrice,
    executionPrice,
    priceImpact,
    fee,
  } = Liquidity.computeAmountOut({ poolKeys, poolInfo, amountIn, currencyOut, slippage, })

  
  // @ts-ignore
  // console.log(amountOut.toFixed(), minAmountOut.toFixed(), currentPrice.toFixed(), executionPrice.toFixed(), priceImpact.toFixed(), fee.toFixed())
  console.log(`swap: ${poolKeys.id.toBase58()}, amountIn: ${amountIn.toFixed()}, amountOut: ${amountOut.toFixed()}, executionPrice: ${executionPrice.toFixed()}`,)
  
  // const minAmountOut = new TokenAmount(new Token(poolKeys.quoteMint, poolInfo.quoteDecimals), 1000000)

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

  await sendTx(connection, transaction, [ownerKeypair, ...signers ])
  console.log('swap end')
}


export async function addLiquidity(connection: Connection, poolKeys: LiquidityPoolKeys, ownerKeypair: Keypair, tokenAccounts:TokenAccount[]){
  console.log('addLiquidity start')

  const owner = ownerKeypair.publicKey
  const poolInfo = await Liquidity.fetchInfo({connection, poolKeys})

  // real amount = 1000000 / 10**poolInfo.baseDecimals
  const amount = new TokenAmount(new Token(poolKeys.baseMint, poolInfo.baseDecimals), 1, false)
  const anotherCurrency = new Currency(poolInfo.quoteDecimals)

  // 5% slippage
  const slippage = new Percent(5, 100)

  const {
    anotherAmount,
    maxAnotherAmount
  } = Liquidity.computeAnotherAmount({ poolKeys, poolInfo, amount, anotherCurrency, slippage, })

  console.log(`addLiquidity: ${poolKeys.id.toBase58()}, base amount: ${amount.toFixed()}, quote amount: ${anotherAmount.toFixed()}`,)
  
  const amountInB = new TokenAmount(new Token(poolKeys.quoteMint, poolInfo.quoteDecimals), maxAnotherAmount.toFixed(), false)
  const { transaction, signers } = await Liquidity.makeAddLiquidityTransaction({
    connection,
    poolKeys,
    userKeys: {
        tokenAccounts,
        owner,
    },
    amountInA : amount,
    amountInB,
    fixedSide: 'a'
  })

  await sendTx(connection, transaction, [ownerKeypair, ...signers ])

  console.log('addLiquidity end')
}



export async function removeLiquidity(connection: Connection, poolKeys: LiquidityPoolKeys, ownerKeypair: Keypair, tokenAccounts:TokenAccount[]){
  console.log('removeLiquidity start')
  const owner = ownerKeypair.publicKey
  const poolInfo = await Liquidity.fetchInfo({connection, poolKeys})

  const lpToken = tokenAccounts.find((t)=> t.accountInfo.mint.toBase58() === poolKeys.lpMint.toBase58())

  if (lpToken){
    const ratio = parseFloat(lpToken.accountInfo.amount.toString()) / parseFloat(poolInfo.lpSupply.toString())
    console.log(`base amount: ${poolInfo.baseReserve.toNumber() * ratio / 10** poolInfo.baseDecimals}, quote amount: ${poolInfo.quoteReserve.toNumber() * ratio / 10** poolInfo.quoteDecimals} `)
    
    const amountIn = new TokenAmount(new Token(poolKeys.lpMint, poolInfo.lpDecimals), lpToken.accountInfo.amount.toNumber())
    const { transaction, signers } = await Liquidity.makeRemoveLiquidityTransaction({
      connection,
      poolKeys,
      userKeys: {
          tokenAccounts,
          owner,
      },
      amountIn,
    })

    await sendTx(connection, transaction, [ownerKeypair, ...signers ])
  }
  console.log('removeLiquidity end')
}

export async function routeSwap(connection: Connection, fromPoolKeys: LiquidityPoolKeys, toPoolKeys: LiquidityPoolKeys, ownerKeypair: Keypair, tokenAccounts: TokenAccount[]){
  console.log('route swap start')

  const owner = ownerKeypair.publicKey
  const fromPoolInfo = await Liquidity.fetchInfo({connection, poolKeys:fromPoolKeys})
  const toPoolInfo = await Liquidity.fetchInfo({connection, poolKeys:toPoolKeys})
  const amountIn = new TokenAmount(new Token(fromPoolKeys.baseMint, fromPoolInfo.baseDecimals), 1, false)
  const currencyOut = new Token(toPoolKeys.quoteMint,toPoolInfo.quoteDecimals)
  // 5% slippage
  const slippage = new Percent(5, 100)

  const { amountOut, minAmountOut, executionPrice, priceImpact, fee } = Route.computeAmountOut({
    fromPoolKeys,
    toPoolKeys,
    fromPoolInfo,
    toPoolInfo,
    amountIn,
    currencyOut,
    slippage,
  });

  // @ts-ignore
  console.log(`route swap: ${fromPoolKeys.id.toBase58()}, amountIn: ${amountIn.toFixed()}, amountOut: ${amountOut.toFixed()}, executionPrice: ${executionPrice!.toFixed()}`,)

  const { swapTransaction } =
    await Route.makeSwapTransaction({
      connection,
      fromPoolKeys,
      toPoolKeys,
      userKeys: {
        tokenAccounts,
        owner,
    },
      amountIn,
      amountOut,
      fixedSide: "in",
    });

  const txid = await connection.sendTransaction(
      swapTransaction!.transaction,
      [...swapTransaction!.signers, ownerKeypair],
      {skipPreflight: true}
  );

  console.log(`https://solscan.io/tx/${txid}`)
  console.log('route swap end')
}

export async function tradeSwap(connection: Connection, tokenInMint: PublicKey, tokenOutMint: PublicKey, relatedPoolKeys: LiquidityPoolKeys[], ownerKeypair: Keypair, tokenAccounts: TokenAccount[]){
  console.log('trade swap start')

  const owner = ownerKeypair.publicKey
  const amountIn = new TokenAmount(new Token(tokenInMint, 6), 1, false)
  const currencyOut = new Token(tokenOutMint,6)
  // 5% slippage
  const slippage = new Percent(5, 100)
  const pools = await Promise.all(relatedPoolKeys.map(async(poolKeys) => {
    const poolInfo = await Liquidity.fetchInfo({connection, poolKeys})
    return {
      poolKeys,
      poolInfo
    }
  }))

  const { amountOut, minAmountOut, executionPrice, currentPrice, priceImpact, routes, routeType, fee } = Trade.getBestAmountOut({
    pools,
    currencyOut,
    amountIn,
    slippage
  })
  console.log(`trade swap: amountIn: ${amountIn.toFixed()}, amountOut: ${amountOut.toFixed()}, executionPrice: ${executionPrice!.toFixed()}, ${routeType}`,)

  const { setupTransaction, tradeTransaction } = await Trade.makeTradeTransaction({
    connection,
    routes,
    routeType,
    userKeys: {
      tokenAccounts,
      owner
    },
    amountIn,
    amountOut,
    fixedSide: 'in',
  })

  const txid = await connection.sendTransaction(
      tradeTransaction!.transaction,
      [...tradeTransaction!.signers, ownerKeypair],
      {skipPreflight: true}
  );

  console.log(`https://solscan.io/tx/${txid}?cluster=devnet`)
  console.log('trade swap end')
}