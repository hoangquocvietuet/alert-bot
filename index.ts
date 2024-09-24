import axios from "axios";
import { existsSync, promises as fs } from "fs";
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import * as cron from 'node-cron'
import dotenv from 'dotenv'

dotenv.config()

export type Coin = {
  coinType: string;
  coinName: string;
  coinSymbol: string;
  balance: number;
  balanceUsd: number;
  decimals: number;
  coinPrice: number;
}

export type Change = {
  coinType: string;
  name: string;
  symbol: string;
  balanceBefore: string;
  balanceAfter: string;
  diff: string;
}

export async function retrieveAccountCoins(account: string): Promise<Coin[]> {
  const url = `https://api.blockberry.one/sui/v1/accounts/${account}/balance`;
  const res = await axios.get(url, {
    headers: {
      'x-api-key': 'V5Wvhsgz0OsuRVYLDWwdTWWw2Rcacw',
      'Accept': 'application/json'
    },
    params: {
      account: account
    }
  });
  return res.data;
}

const chatId = '-1002428381219';

async function getBalanceChange(name: string, coins: Coin[]) {
  const filePath = `db/balances-${name}.json`;
  if (!existsSync(filePath)) {
    await fs.writeFile(filePath, JSON.stringify(coins));
  }
  const balances = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  const changes: Change[] = [];
  for (const coin of coins) {
    if (!coin.coinType) continue;
    const balance = balances.find((b: Coin) => b.coinType === coin.coinType);
    if (balance !== undefined) {
      if (balance.balance.toString() !== coin.balance.toString()) {
        console.log(`Balance changed for ${coin.coinType}`);
        console.log(`Before: ${balance.balance}`);
        console.log(`After: ${coin.balance}`);
        console.log(`Diff: ${coin.balance - balance.balance}`);
        changes.push({
          coinType: coin.coinType,
          name: coin.coinName,
          symbol: coin.coinSymbol,
          balanceBefore: balance.balance.toString(),
          balanceAfter: coin.balance.toString(),
          diff: (balance.balance - coin.balance).toString()
        });
      }
    }
  }
  await fs.writeFile(filePath, JSON.stringify(coins));
  return changes;
}

async function main() {
  if (process.env.BOT_TOKEN === undefined) return;
  const bot = new Telegraf(process.env.BOT_TOKEN)
  const accounts = JSON.parse(await fs.readFile('db/accounts.json', 'utf-8'));
  
  bot.launch();
  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  cron.schedule('* * * * *', async () => {
    console.log(Date.now());
    for (const account of accounts) {
      const coins = await retrieveAccountCoins(account.address);
      const changes = await getBalanceChange(account.name, coins);
      if (changes.length === 0) continue;
      await bot.telegram.sendMessage(chatId, `Account ${account.name}`);
      for (const change of changes) {
        await bot.telegram.sendMessage(chatId, `${change.coinType}\n ${change.name}\n ${change.symbol}\n ${change.balanceBefore} to ${change.balanceAfter}\n diff: ${change.diff}`);
      }
    }
  });
}

main();