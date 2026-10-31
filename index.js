import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

app.listen(PORT, () => {
  console.log(`StudioSpace Server running on port ${PORT}`);
});