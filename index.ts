import axios from "axios";
import { existsSync, promises as fs } from "fs";
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import * as cron from 'node-cron'
import numeral from 'numeral'
import dotenv from 'dotenv'

dotenv.config()

let running = false;

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
  const balances = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Coin[];
  const changes: Change[] = [];
  for (const coin of coins) {
    if (!coin.coinType) continue;
    const previous_coin = balances.find((b: Coin) => b.coinType === coin.coinType);
    let balance = 0;
    if (previous_coin !== undefined) {
      balance = previous_coin.balance;
    }
    if (balance.toString() !== coin.balance.toString()) {
      changes.push({
        coinType: coin.coinType,
        name: coin.coinName,
        symbol: coin.coinSymbol,
        balanceBefore: balance.toString(),
        balanceAfter: coin.balance.toString(),
        diff: (coin.balance - balance).toString()
      });
    }
  }
  for (const coin of balances) {
    const next_coin = coins.find((c: Coin) => c.coinType === coin.coinType);
    if (next_coin === undefined) {
      changes.push({
        coinType: coin.coinType,
        name: coin.coinName,
        symbol: coin.coinSymbol,
        balanceBefore: coin.balance.toString(),
        balanceAfter: '0',
        diff: `-${coin.balance}`
      });
    }
  }
  await fs.writeFile(filePath, JSON.stringify(coins));
  return changes;
}

async function updateAccount(bot: Telegraf, accounts: {
  address: string,
  name: string
}[]) {
  if (running) return;
  running = true;
  console.log(Date.now());
  for (const account of accounts) {
    const coins = await retrieveAccountCoins(account.address);
    const changes = await getBalanceChange(account.name, coins);
    if (changes.length === 0) continue;
    console.log(`Account ${account.name} changes ${changes.length} coins`);
    await bot.telegram.sendMessage(chatId, `Account ${account.name}`);
    await bot.telegram.sendMessage(chatId, `Address: ${account.address}`);
    for (const change of changes) {
      await bot.telegram.sendMessage(chatId, `Coin Type: ${change.coinType}\nName: ${change.name}\nSymbol: ${change.symbol}\nBefore: ${change.balanceBefore}\n After: ${change.balanceAfter}\nDiff: ${change.diff}${parseFloat(change.diff) > 0 ? '🚀' : '🔻'}
    `);
    }
  }
  running = false;
}

async function main() {
  if (process.env.BOT_TOKEN === undefined) return;
  const bot = new Telegraf(process.env.BOT_TOKEN)
  const accounts = JSON.parse(await fs.readFile('db/accounts.json', 'utf-8'));
  
  bot.launch();
  bot.start(async (ctx) => {
    await updateAccount(bot, accounts);
    return ctx.reply('🚀');
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  cron.schedule('* * * * *', async () => {
    await updateAccount(bot, accounts);
  });
}

main();