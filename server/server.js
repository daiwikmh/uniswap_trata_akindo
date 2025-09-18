import express from "express";
import { getAllPoolsInfo, addPool } from "./src/hooks/hooks.js";
import { ENV } from "./env.js";
import cors from "cors";
const app = express()
const PORT = ENV.PORT || 3000

app.use(cors());

app.get("/pools", async (req,res) => {
    try {
    const poolsInfo = await getAllPoolsInfo();
    res.json(poolsInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})

app.post("/pools", async (req,res) => {
  try {
    const poolConfig = req.body;
    const result = addPool(poolConfig);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});