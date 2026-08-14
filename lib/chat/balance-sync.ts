import { MongoClient, ObjectId } from "mongodb";

// 主站灵点 → LibreChat tokenCredits 余额同步。
// LibreChat 同机部署时 Mongo 暴露在 127.0.0.1:27017（见 deploy-librechat.sh），
// 主站服务端按 email 定位 LibreChat 用户并 upsert balances 集合。

const MONGO_URI = process.env.LIBRECHAT_MONGO_URI || "mongodb://127.0.0.1:27017/LibreChat";
const CREDIT_RATE = Number(process.env.CHAT_CREDIT_RATE || 1000); // 1 灵点 = 1000 tokenCredits

export type ChatBalanceSyncResult = {
  synced: boolean;
  librechatUserId?: string;
  tokenCredits?: number;
  message: string;
};

/**
 * 把主站灵点余额同步到 LibreChat 的 tokenCredits。
 * @returns 同步结果；LibreChat 用户不存在或 Mongo 不可达时返回 synced=false（不抛错）
 */
export async function syncChatBalance(email: string, credits: number): Promise<ChatBalanceSyncResult> {
  if (!email || !Number.isFinite(credits)) {
    return { synced: false, message: "invalid input" };
  }
  let client: MongoClient | null = null;
  try {
    client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    const db = client.db();

    const user = await db.collection("users").findOne(
      { email: email.toLowerCase() },
      { projection: { _id: 1 } },
    );
    if (!user) {
      return { synced: false, message: "librechat user not found" };
    }

    const tokenCredits = Math.max(0, Math.floor(credits * CREDIT_RATE));
    const userId = user._id instanceof ObjectId ? user._id : new ObjectId(String(user._id));
    await db.collection("balances").updateOne(
      { user: userId },
      { $set: { user: userId, tokenCredits } },
      { upsert: true },
    );

    return {
      synced: true,
      librechatUserId: userId.toString(),
      tokenCredits,
      message: "synced",
    };
  } catch (error) {
    return { synced: false, message: error instanceof Error ? error.message : "mongo error" };
  } finally {
    await client?.close().catch(() => undefined);
  }
}
