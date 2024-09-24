import axios from "axios";
import { existsSync, promises as fs } from "fs";
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import * as cron from 'node-cron'
import dotenv from 'dotenv'

dotenv.config()

export type Coin = {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  verified: boolean;
  logo: string;
  usdValue: string;
  object: number;
  price: string;
  priceChange: string;
}

export type Change = {
  coinType: string;
  name: string;
  symbol: string;
  balanceBefore: string;
  balanceAfter: string;
}

export async function retrieveAccountCoins(account: string): Promise<Coin[]> {
  const url = 'https://api.blockvision.org/v2/sui/account/coins';
  const res = await axios.get(url, {
    headers: {
      'x-api-key': '2mVK2Fg56MdV77RwDoXpxNBx8T7',
      'Accept': 'application/json'
    },
    params: {
      account: account
    }
  });
  // ensure the response is an array
  return res.data.result.coins;
}

const chatId = '-1002428381219';

async function getBalanceChange(name: string, coins: Coin[]) {
  if (!existsSync('db/balances-' + name + '.json')) {
    await fs.writeFile('db/balances-' + name + '.json', JSON.stringify(coins));
  }
  const balances = JSON.parse(await fs.readFile('db/balances-' + name + '.json', 'utf-8'));
  const changes: Change[] = [];
  for (const coin of coins) {
    if (!coin.coinType) continue;
    const balance = balances.find((b: Coin) => b.coinType === coin.coinType);
    if (balance !== undefined) {
      if (balance.balance.toString() !== coin.balance) {
        changes.push({
          coinType: coin.coinType,
          name: coin.name,
          symbol: coin.symbol,
          balanceBefore: (BigInt(balance.balance) / BigInt(10 ** coin.decimals)).toString(),
          balanceAfter: (BigInt(coin.balance) / BigInt(10 ** coin.decimals)).toString()
        });
      }
    }
  }
  await fs.writeFile('db/balances-' + name + '.json', JSON.stringify(coins));
  return changes;
}

async function main() {
  if (process.env.BOT_TOKEN === undefined) return;
  const bot = new Telegraf(process.env.BOT_TOKEN)
  const accounts = JSON.parse(await fs.readFile('db/accounts.json', 'utf-8'));

  bot.on(message('text'), (ctx) => ctx.reply('Hello!'));
  bot.launch();
  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  cron.schedule('* * * * *', async () => {
    for (const account of accounts) {
      const coins = await retrieveAccountCoins(account.address);
      await bot.telegram.sendMessage(chatId, `Account ${account.name}`);
      const changes = await getBalanceChange(account.name, coins);
      for (const change of changes) {
        await bot.telegram.sendMessage(chatId, `${change.coinType}\n ${change.name}\n ${change.symbol}\n ${change.balanceBefore} to ${change.balanceAfter}\n diff: ${BigInt(change.balanceAfter) - BigInt(change.balanceBefore)}`);
      }
    }
  });
}

main();