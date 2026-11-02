import { MongoClient } from "mongodb";
import "dotenv/config";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing from .env");
}

export const client = new MongoClient(uri);

export const db = client.db("studiospace");

let isConnected = false;

export async function connectDB() {
  try {
    if (!isConnected) {
      await client.connect();
      isConnected = true;

      console.log("MongoDB connected successfully!");
    }

    return db;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
}