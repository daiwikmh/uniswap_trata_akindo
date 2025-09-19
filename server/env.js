import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  ALCHEMY_MAINNET_URL: process.env.ALCHEMY_MAINNET_URL,
  PORT: "https://shinrai-atrium-pqkx.vercel.app/",
};
