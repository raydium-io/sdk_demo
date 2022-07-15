// @ts-ignore
import bs58 from 'bs58';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Farm,
  FarmPoolKeys,
  findProgramAddress,
  SPL_ACCOUNT_LAYOUT,
  TOKEN_PROGRAM_ID,
} from '@raydium-io/raydium-sdk';
import { Token as SplToken } from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  Transaction,
} from '@solana/web3.js';

const FARM_PROGRAM_ID_V3 = new PublicKey('85BFyr98MbCUU9MVTEgzx1nbhWACbJqLzho6zd6DZcWL')
const FARM_PROGRAM_ID_V5 = new PublicKey('EcLzTrNg9V7qhcdyXDe2qjtPkiGzDM2UbdRaeaadU5r2')


async function getAssociatedLedgerAccount({
  programId,
  poolId,
  owner,
}: {
  programId: PublicKey;
  poolId: PublicKey;
  owner: PublicKey;
}) {
  const { publicKey } = await findProgramAddress(
    [
      poolId.toBuffer(),
      owner.toBuffer(),
      Buffer.from(
        "staker_info_v2_associated_seed",
        "utf-8",
      ),
    ],
    programId,
  );
  return publicKey;
}

function getProgramId(version:number){
  if (version === 3) return FARM_PROGRAM_ID_V3
  if (version === 5) return FARM_PROGRAM_ID_V5
  return PublicKey.default
}

async function getFarmKeys(connection: Connection, poolId: PublicKey, version: number){

  const programId = getProgramId(version)

  const stakingAccount = await connection.getAccountInfo(poolId)
  // @ts-ignore
  const stakingInfo = Farm. getStateLayout(version).decode(stakingAccount?.data)

  const keys = [stakingInfo.lpVault,stakingInfo.rewardInfos[0].rewardVault,]

  if (version === 5){
    keys.push(stakingInfo.rewardInfos[1].rewardVault)
  }
  const accounts = await  connection.getMultipleAccountsInfo(keys)
  // @ts-ignore
  const lpVaultInfo = SPL_ACCOUNT_LAYOUT.decode(accounts[0].data)

  // @ts-ignore
  const rewartVaultInfo = SPL_ACCOUNT_LAYOUT.decode(accounts[1].data)

  const poolKeys = {
    id: poolId,
    lpMint: lpVaultInfo.mint,
    version,
    programId,
    authority: (await Farm.getAssociatedAuthority({programId, poolId})).publicKey,
    lpVault: stakingInfo.lpVault,
    upcoming: false,
    rewardInfos: [
      {
        rewardMint : rewartVaultInfo.mint,
        rewardVault: stakingInfo.rewardInfos[0].rewardVault,
      }
    ]
  }
  if (version === 5){
    // @ts-ignore
    const rewartVaultInfo2 = SPL_ACCOUNT_LAYOUT.decode(accounts[2].data)
    
    poolKeys.rewardInfos.push({
      rewardMint : rewartVaultInfo2.mint,
      rewardVault: stakingInfo.rewardInfos[1].rewardVault,
    })
  }

  return poolKeys
}

async function getUserKeys(poolKeys: FarmPoolKeys, owner: PublicKey){

  const ledger = await getAssociatedLedgerAccount({programId:poolKeys.programId, poolId:poolKeys.id, owner})
  const lpTokenAccount = await SplToken.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, poolKeys.lpMint, owner)
  const rewardTokenAccount = await SplToken.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, poolKeys.rewardInfos[0].rewardMint, owner)

  const userKeys = {
    ledger,
    lpTokenAccount,
    rewardTokenAccounts: [rewardTokenAccount],
    owner
  }
  if (poolKeys.version === 5){
    const rewardTokenAccount = await SplToken.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, poolKeys.rewardInfos[1].rewardMint, owner)
    userKeys.rewardTokenAccounts.push(rewardTokenAccount)
  }

  return userKeys
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


(async () => {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    const secretKey = bs58.decode('3qswEeCJcA9ogpN3JEuXBtmnU35YPzSxBwzrk6sdTPhogMJ64WuabU9XWg2yUegJvv1qupYPqo2jQrrK26N7HGsD')

    const ownerKeypair = Keypair.fromSecretKey( secretKey )

    const owner = ownerKeypair.publicKey;
    console.log(owner.toString())


    // const tokenAccounts = await getTokenAccountsByOwner(connection, owner)
    

    const poolKeys = await getFarmKeys(connection, new PublicKey('B9gGrvcs1zGHWNjmaYcLPurMS3pMVBLuBZGp1vJuFUTg'), 5)
    // const poolKeys = await getFarmKeys(connection, new PublicKey('Ef9E4HxzATN6Kb3h8W4ZnDF2q7AxiMt6wh3NH61Si6oD'), 3)

    const userKeys = await getUserKeys(poolKeys, owner)

    await sendTx(connection, 
      new Transaction().add(
        Farm.makeCreateAssociatedLedgerAccountInstruction({
            poolKeys,
            userKeys,
        }),
        Farm.makeDepositInstruction({
          poolKeys,
          userKeys,
          amount:1
        })
      ), 
      [ownerKeypair]
    )

    await sendTx(connection, 
      new Transaction().add(Farm.makeWithdrawInstruction({
        poolKeys,
        userKeys,
        amount:1
      })), 
      [ownerKeypair]
    )

})()
