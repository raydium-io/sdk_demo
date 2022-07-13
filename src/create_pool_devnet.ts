// @ts-ignore
import BN from 'bn.js';
// @ts-ignore
import bs58 from 'bs58';

import {
  Coin,
  Dex,
} from '@project-serum/serum-dev-tools';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Liquidity,
  SPL_ACCOUNT_LAYOUT,
  Token,
  TOKEN_PROGRAM_ID,
  TokenAccount,
  TokenAmount,
} from '@raydium-io/raydium-sdk';
import { Token as splToken } from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  Transaction,
} from '@solana/web3.js';

async function getTokenAccountsByOwner(
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

export async function getVaultOwnerAndNonce(
  marketAddress: PublicKey,
  dexAddress: PublicKey,
): Promise<[vaultOwner: PublicKey, nonce: BN]> {
  const nonce = new BN(0);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const vaultOwner = await PublicKey.createProgramAddress(
        [marketAddress.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
        dexAddress,
      );
      return [vaultOwner, nonce];
    } catch (e) {
      nonce.iaddn(1);
    }
  }
}


async function sendTx(connection: Connection, transaction: Transaction, signers: Array<Signer>){
  let txRetry = 0

  // console.log('signers len:', signers.length)
  // console.log('transaction instructions len:', transaction.instructions.length)

  // transaction.instructions.forEach(ins => {
  //   console.log(ins.programId.toBase58())
  //   ins.keys.forEach(m => {
  //     console.log('\t', m.pubkey.toBase58(), m.isSigner, m.isWritable)
  //   });

  //   console.log('\t datasize:', ins.data.length)
  // });

  transaction.recentBlockhash = (
    await connection.getLatestBlockhash('processed')
  ).blockhash;

  transaction.sign(...signers);
  const rawTransaction = transaction.serialize();

  // console.log('packsize :', rawTransaction.length)

  while(++txRetry <= 3){
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
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

async function createAtaAndMinto(connection: Connection, baseCoin: Coin, quoteCoin: Coin, ownerKeypair :Keypair){
  const owner = ownerKeypair.publicKey;
  const transaction1 = new Transaction()
  const baseAta = await splToken.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    baseCoin.mint,
    owner,
  )

  transaction1.add(
    splToken.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      baseCoin.mint,
      baseAta,
      owner, 
      owner,
    ),

    splToken.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      baseCoin.mint,
      baseAta,
      owner,
      [],
      10 * 10 ** baseCoin.decimals
    )
  )

  const quoteAta = await splToken.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    quoteCoin.mint,
    owner,
  )

  transaction1.add(
    splToken.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      quoteCoin.mint,
      quoteAta,
      owner, 
      owner,
    ),
    splToken.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      quoteCoin.mint,
      quoteAta,
      owner,
      [],
      20 * 10 ** quoteCoin.decimals
    )
  )

  console.log('create token accounts and reqiure airdrop ...')
  await sendTx(connection, transaction1, [ownerKeypair] )

  return [baseAta, quoteAta]
}

(async () => {
    const LIQUIDITY_PROGRAM_ID_V4 = new PublicKey('9rpQHSyFVM1dkkHFQ2TtTzPEW7DVmEyPmN8wVniqJtuC')
    const SERUM_PROGRAM_ID_V3 = new PublicKey('DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY')

    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // VnxDzsZ7chE88e9rB6UKztCt2HUwrkgCTx8WieWf5mM
    const secretKey = bs58.decode('3qswEeCJcA9ogpN3JEuXBtmnU35YPzSxBwzrk6sdTPhogMJ64WuabU9XWg2yUegJvv1qupYPqo2jQrrK26N7HGsD')

    const ownerKeypair = Keypair.fromSecretKey( secretKey )

    const owner = ownerKeypair.publicKey;
    console.log(owner.toString())

    const dex = new Dex(SERUM_PROGRAM_ID_V3, connection);
  
    const baseCoin = await dex.createCoin(
      "RAY",
      9,
      ownerKeypair,
      ownerKeypair,
      ownerKeypair,
    );
    const quoteCoin = await dex.createCoin(
      "USDC",
      9,
      ownerKeypair,
      ownerKeypair,
      ownerKeypair,
    );
  
    const market = await dex.initDexMarket(ownerKeypair, baseCoin, quoteCoin, {
      lotSize: 1e-3,
      tickSize: 1e-2,
    });

    const [vaultOwner] = await getVaultOwnerAndNonce(market.address, SERUM_PROGRAM_ID_V3)
  
    console.log(`Created ${market.marketSymbol} market @ ${market.address.toString()},  vaultOwner ${vaultOwner.toString()}`);


    const seedParam = {programId:LIQUIDITY_PROGRAM_ID_V4, marketId :market.address}
    const {publicKey, nonce} = await Liquidity.getAssociatedAuthority({programId:LIQUIDITY_PROGRAM_ID_V4})
    const poolKeys = {
      id: await Liquidity.getAssociatedId(seedParam),
      baseMint:baseCoin.mint,
      quoteMint: quoteCoin.mint,
      lpMint: await Liquidity.getAssociatedLpMint(seedParam),
      version: 4,
      programId: LIQUIDITY_PROGRAM_ID_V4,
      authority:publicKey,
      nonce, 
      baseVault: await Liquidity.getAssociatedBaseVault(seedParam),
      quoteVault: await Liquidity.getAssociatedQuoteVault(seedParam),
      lpVault: await Liquidity.getAssociatedLpVault(seedParam),
      openOrders: await Liquidity.getAssociatedOpenOrders(seedParam),
      targetOrders: await Liquidity.getAssociatedTargetOrders(seedParam),
      withdrawQueue: await Liquidity.getAssociatedWithdrawQueue(seedParam),
      marketVersion: 3,
      marketId: market.address,
      marketProgramId: SERUM_PROGRAM_ID_V3,
      marketAuthority: vaultOwner
    }
    

    await createAtaAndMinto(connection, baseCoin, quoteCoin, ownerKeypair);


    const tx = new Transaction().add(
      Liquidity.makeCreatePoolInstructionV4({
      poolKeys,
      userKeys:{payer:owner}
    }))

    console.log('create raydium pool accounts ...')
    await sendTx(connection, tx, [ownerKeypair] )

    const tokenAccounts = await getTokenAccountsByOwner(connection, owner)
    const {transaction, signers} = await Liquidity.makeInitPoolTransaction({
      connection,
      poolKeys,
      userKeys:{
        tokenAccounts, 
        owner, 
      },
      baseAmount: new TokenAmount(new Token(baseCoin.mint, baseCoin.decimals), 1, false),
      quoteAmount: new TokenAmount(new Token(quoteCoin.mint, quoteCoin.decimals), 2, false),
    })

    console.log('init raydium pool ...')
    await sendTx(connection, transaction, [ownerKeypair, ...signers] )
    
})()
