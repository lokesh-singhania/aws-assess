import express from "express";
import { createClient, defineScript , RedisClientType, RedisFunctions, RedisModules, RedisScripts} from "redis";
import { json } from "body-parser";


const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

interface ExtendedRedisClientType extends RedisClientType<RedisModules, RedisFunctions, RedisScripts> {
    conditionalSet: (account: string, charges: number) => Promise<{ isAuthorized: boolean; remainingBalance: number }>;
}

  
async function connect(): Promise<ExtendedRedisClientType> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);
    const client = createClient({
        url,
        scripts: {
          conditionalSet: defineScript({
            NUMBER_OF_KEYS: 1,
            SCRIPT: `
              local balance = tonumber(redis.call('GET', KEYS[1]))
              if balance and balance >= tonumber(ARGV[1]) then
                  balance = balance - tonumber(ARGV[1])
                  redis.call('SET', KEYS[1], tostring(balance))
                  return {true, balance}
              else
                  return {false, balance or 0}
              end
            `,
            transformArguments(account: string, charges: number): Array<string> {
              return [`${account}/balance`, charges.toString()];
            },
            transformReply(reply: [boolean, number]): { isAuthorized: boolean; remainingBalance: number } {
              return {
                isAuthorized: reply[0],
                remainingBalance: reply[1]
              };
            }
          })
        }
      }) as ExtendedRedisClientType;
    await client.connect();
    
    return client;
}

async function reset(account: string): Promise<void> {
    const client = await connect();
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await client.disconnect();
    }
}


async function charge(account: string, charges: number): Promise<ChargeResult> {
    const client = await connect();
    try {
        const {isAuthorized, remainingBalance} = await client.conditionalSet(account, charges);

        return {
            isAuthorized: isAuthorized,
            remainingBalance: remainingBalance,
            charges: isAuthorized ? charges : 0
        };
    } finally {
        await client.disconnect();
    }
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully charged account ${account}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}
