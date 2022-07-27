// @ts-ignore
import BN from 'bn.js';
// @ts-ignore
import bs58 from 'bs58';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Farm,
  FARM_VERSION_TO_LEDGER_LAYOUT,
  FARM_VERSION_TO_STATE_LAYOUT,
  FarmPoolKeys,
  findProgramAddress,
  SPL_ACCOUNT_LAYOUT,
  SPL_MINT_LAYOUT,
  TEN,
  TOKEN_PROGRAM_ID,
} from '@raydium-io/raydium-sdk';
import { Token as SplToken } from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  TokenAmount,
  Transaction,
} from '@solana/web3.js';

const FARM_PROGRAM_ID_V3 = new PublicKey(
  "85BFyr98MbCUU9MVTEgzx1nbhWACbJqLzho6zd6DZcWL"
);
const FARM_PROGRAM_ID_V5 = new PublicKey(
  "EcLzTrNg9V7qhcdyXDe2qjtPkiGzDM2UbdRaeaadU5r2"
);

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
      Buffer.from("staker_info_v2_associated_seed", "utf-8"),
    ],
    programId
  );
  return publicKey;
}

function getProgramId(version: number) {
  if (version === 3) return FARM_PROGRAM_ID_V3;
  if (version === 5) return FARM_PROGRAM_ID_V5;
  return PublicKey.default;
}

async function getFarmKeys(
  connection: Connection,
  poolId: PublicKey,
  version: number
) {
  const programId = getProgramId(version);

  const stakingAccount = await connection.getAccountInfo(poolId);
  // @ts-ignore
  const stakingInfo = Farm.getStateLayout(version).decode(stakingAccount?.data);

  const keys = [stakingInfo.lpVault, stakingInfo.rewardInfos[0].rewardVault];

  if (version === 5) {
    keys.push(stakingInfo.rewardInfos[1].rewardVault);
  }
  const accounts = await connection.getMultipleAccountsInfo(keys);
  // @ts-ignore
  const lpVaultInfo = SPL_ACCOUNT_LAYOUT.decode(accounts[0].data);

  // @ts-ignore
  const rewartVaultInfo = SPL_ACCOUNT_LAYOUT.decode(accounts[1].data);

  const poolKeys = {
    id: poolId,
    lpMint: lpVaultInfo.mint,
    version,
    programId,
    authority: (await Farm.getAssociatedAuthority({ programId, poolId }))
      .publicKey,
    lpVault: stakingInfo.lpVault,
    upcoming: false,
    rewardInfos: [
      {
        rewardMint: rewartVaultInfo.mint,
        rewardVault: stakingInfo.rewardInfos[0].rewardVault,
      },
    ],
  };
  if (version === 5) {
    // @ts-ignore
    const rewartVaultInfo2 = SPL_ACCOUNT_LAYOUT.decode(accounts[2].data);

    poolKeys.rewardInfos.push({
      rewardMint: rewartVaultInfo2.mint,
      rewardVault: stakingInfo.rewardInfos[1].rewardVault,
    });
  }

  return poolKeys;
}

async function getUserKeys(poolKeys: FarmPoolKeys, owner: PublicKey) {
  const ledger = await getAssociatedLedgerAccount({
    programId: poolKeys.programId,
    poolId: poolKeys.id,
    owner,
  });
  const lpTokenAccount = await SplToken.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    poolKeys.lpMint,
    owner
  );
  const rewardTokenAccount = await SplToken.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    poolKeys.rewardInfos[0].rewardMint,
    owner
  );

  const userKeys = {
    ledger,
    lpTokenAccount,
    rewardTokenAccounts: [rewardTokenAccount],
    owner,
  };
  if (poolKeys.version === 5) {
    const rewardTokenAccount = await SplToken.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      poolKeys.rewardInfos[1].rewardMint,
      owner
    );
    userKeys.rewardTokenAccounts.push(rewardTokenAccount);
  }

  return userKeys;
}

async function sendTx(
  connection: Connection,
  transaction: Transaction,
  signers: Array<Signer>
) {
  let txRetry = 0;

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
    await connection.getLatestBlockhash("processed")
  ).blockhash;

  transaction.sign(...signers);
  const rawTransaction = transaction.serialize();

  // console.log('packsize :', rawTransaction.length)

  while (++txRetry <= 3) {
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });

    let url = `${txRetry}, https://solscan.io/tx/${txid}`;
    if (connection.rpcEndpoint.includes("dev")) url += "?cluster=devnet";
    console.log(url);

    await new Promise((resolve) => setTimeout(resolve, 1000 * 6));
    const ret = await connection.getSignatureStatus(txid, {
      searchTransactionHistory: true,
    });
    try {
      //@ts-ignore
      if (ret.value && ret.value.err == null) {
        console.log(txRetry, "success");
        break;
      } else {
        console.log(txRetry, "failed", ret);
      }
    } catch (e) {
      console.log(txRetry, "failed", ret);
    }
  }
}

async function getDepositedAndPenddingReward(
  connection: Connection,
  poolId: PublicKey,
  ledger: PublicKey,
  version: number
) {
  const accounts = await connection.getMultipleAccountsInfo([poolId, ledger]);
  
  if (!accounts[0] || !accounts[1]) return
  const poolInfo = FARM_VERSION_TO_STATE_LAYOUT[version].decode(
    accounts[0].data
  );

  const ledgerInfo = FARM_VERSION_TO_LEDGER_LAYOUT[version].decode(
    accounts[1].data
  );

  console.log(`deposited lp: ${ledgerInfo.deposited}`);
  const lpVaultAmount = (await connection.getTokenAccountBalance(
    poolInfo.lpVault
  )).value;

  let ret : {lpAmount:TokenAmount,pendingRewards:{mint:PublicKey, amount:string, decimals:number}[]} = {
    lpAmount: {amount:ledgerInfo.deposited, decimals: lpVaultAmount.decimals, uiAmount:null},
    pendingRewards: []
  }

  const slot = await connection.getSlot();

  if (poolInfo.version === 3) {
    const multiplier = TEN.pow(new BN(9));
    const spread = new BN(slot).sub(poolInfo.lastSlot);
    const reward = poolInfo.rewardInfos[0].perSlotReward.mul(spread);
    poolInfo.perShareReward = poolInfo.rewardInfos[0].perShareReward.add(
      reward.mul(multiplier).div(new BN(lpVaultAmount.amount))
    );
    poolInfo.rewardInfos[0].totalReward =
      poolInfo.rewardInfos[0].totalReward.add(reward);

    const rewardDebt = ledgerInfo.rewardDebts[0];
    const pendingReward = ledgerInfo.deposited
      .mul(poolInfo.rewardInfos[0].perShareReward)
      .div(multiplier)
      .sub(rewardDebt);

    console.log(`pendingReward: ${pendingReward}`);

    const account = await connection.getAccountInfo(poolInfo.rewardInfos[0].rewardVault)
    if (!account) return
    const rewardInfo = SPL_ACCOUNT_LAYOUT.decode(account.data) 
    const rewardMint = await connection.getAccountInfo(rewardInfo.mint)
    if (!rewardMint) return
    const rewardMintInfo = SPL_MINT_LAYOUT.decode(rewardMint.data)
    ret.pendingRewards.push(
      {
        mint: rewardInfo.mint,
        amount: pendingReward,
        decimals: rewardMintInfo.decimals
      }
    )
  } else if (poolInfo.version === 5) {
    const spread = new BN(slot).sub(poolInfo.lastSlot);
    const pendingRewards:BN[] = []
    for (let i = 0; i < 2; i++) {
      const multiplier = TEN.pow(new BN(15));
      const reward = poolInfo.rewardInfos[i].perSlotReward.mul(spread);
      poolInfo.rewardInfos[i].perShareReward = poolInfo.rewardInfos[
        i
      ].perShareReward.add(
        reward.mul(multiplier).div(new BN(lpVaultAmount.amount))
      );

      const pendingReward: BN = ledgerInfo.deposited
        .mul(poolInfo.rewardInfos[i].perShareReward)
        .div(multiplier)
        .sub(ledgerInfo.rewardDebts[i]);
      pendingRewards.push(pendingReward)

      console.log(`pendingReward${i}: ${pendingReward}`);
    }

    const accounts = await connection.getMultipleAccountsInfo([poolInfo.rewardInfos[0].rewardVault, poolInfo.rewardInfos[1].rewardVault])
    if (!accounts[0] || !accounts[1]) return
    const rewardInfo = SPL_ACCOUNT_LAYOUT.decode(accounts[0].data) 
    const rewardInfo1 = SPL_ACCOUNT_LAYOUT.decode(accounts[1].data) 
    const rewardMints = await connection.getMultipleAccountsInfo([rewardInfo.mint, rewardInfo1.mint])
    if (!rewardMints[0] || !rewardMints[1]) return
    const rewardMintInfo = SPL_MINT_LAYOUT.decode(rewardMints[0].data)
    const rewardMintInfo1 = SPL_MINT_LAYOUT.decode(rewardMints[1].data)
    ret.pendingRewards.push(
      {
        mint: rewardInfo.mint,
        amount: pendingRewards[0],
        decimals: rewardMintInfo.decimals
      },
      {
        mint: rewardInfo.mint,
        amount: pendingRewards[1],
        decimals: rewardMintInfo1.decimals
      }
    )
  } else if (poolInfo.version === 6) {
    const chainTime = await connection.getBlockTime(slot);
    const pendingRewards:BN[] = []
    const rewardVaults: PublicKey[] = []
    for (const [i,itemRewardInfo] of poolInfo.rewardInfos.entries()) {

      if (itemRewardInfo.rewardState.eq(new BN(0))) continue;
      const updateTime: BN = BN.min(
        new BN(chainTime),
        itemRewardInfo.rewardEndTime
      );
      if (itemRewardInfo.rewardOpenTime.gte(updateTime)) continue;
      const spread = updateTime.sub(itemRewardInfo.rewardLastUpdateTime);
      let reward = spread.mul(itemRewardInfo.rewardPerSecond);
      const leftReward = itemRewardInfo.totalReward.sub(
        itemRewardInfo.totalRewardEmissioned
      );
      if (leftReward.lt(reward)) {
        reward = leftReward;
        itemRewardInfo.rewardLastUpdateTime =
          itemRewardInfo.rewardLastUpdateTime.add(
            leftReward.div(itemRewardInfo.rewardPerSecond)
          );
      } else {
        itemRewardInfo.rewardLastUpdateTime = updateTime;
      }
      if (lpVaultAmount.uiAmount === 0) continue;
      itemRewardInfo.accRewardPerShare = itemRewardInfo.accRewardPerShare.add(
        reward
          .mul(poolInfo.rewardMultiplier)
          .div(new BN(lpVaultAmount.amount))
      );
      itemRewardInfo.totalRewardEmissioned =
        itemRewardInfo.totalRewardEmissioned.add(reward);

      const pendingReward = ledgerInfo.deposited
        .mul(itemRewardInfo.accRewardPerShare)
        .div(poolInfo.rewardMultiplier)
        .sub(ledgerInfo.rewardDebts[i]);

      pendingRewards.push(pendingReward)
      rewardVaults.push(itemRewardInfo.rewardVault)
      console.log(`pendingReward${i}: ${pendingReward}`);
    }
    const mints: PublicKey[] = []
    const accounts = await connection.getMultipleAccountsInfo(rewardVaults)
    for (const account of accounts) {
      if (account != null){
        const rewardInfo = SPL_ACCOUNT_LAYOUT.decode(account.data) 
        mints.push(rewardInfo.mint)
      }
    }
    const mintAccounts = await connection.getMultipleAccountsInfo(mints)
    for (const [i, account] of mintAccounts.entries()) {
      if (account != null){
        const mintInfo = SPL_MINT_LAYOUT.decode(account.data) 
        ret.pendingRewards.push(
          {
            mint: mints[i],
            amount: pendingRewards[i],
            decimals:mintInfo.decimals
          }
        )
      }
    }
  }
  return ret
}

(async () => {
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  const secretKey = bs58.decode(
    "3qswEeCJcA9ogpN3JEuXBtmnU35YPzSxBwzrk6sdTPhogMJ64WuabU9XWg2yUegJvv1qupYPqo2jQrrK26N7HGsD"
  );

  const ownerKeypair = Keypair.fromSecretKey(secretKey);

  const owner = ownerKeypair.publicKey;
  console.log(owner.toString());

  const poolId = new PublicKey("6Sey8z91CLTXfDq697FURZmpyCBqaekmupyj14Aqjh79");
  const poolId_5 = new PublicKey('B9gGrvcs1zGHWNjmaYcLPurMS3pMVBLuBZGp1vJuFUTg')

  await getDepositedAndPenddingReward(
    connection, 
    poolId, 
    await getAssociatedLedgerAccount({programId: getProgramId(3),poolId, owner}),
    3
  )

  // const poolKeys = await getFarmKeys(connection, poolId_5, 5)
  const poolKeys = await getFarmKeys(connection, poolId, 3);
  const userKeys = await getUserKeys(poolKeys, owner);

  await sendTx(
    connection,
    new Transaction().add(
      Farm.makeCreateAssociatedLedgerAccountInstruction({
        poolKeys,
        userKeys,
      }),
      Farm.makeDepositInstruction({
        poolKeys,
        userKeys,
        amount: 1000,
      })
    ),
    [ownerKeypair]
  );

  // await sendTx(
  //   connection,
  //   new Transaction().add(
  //     Farm.makeWithdrawInstruction({
  //       poolKeys,
  //       userKeys,
  //       amount: 1,
  //     })
  //   ),
  //   [ownerKeypair]
  // );
})();
