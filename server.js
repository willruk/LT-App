import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 3000);

console.log("Minimal server booting...");
console.log("PORT:", PORT);

app.get("/", (_req, res) => {
  res.send("Life Tracks minimal server is running");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Minimal server listening on port ${PORT}`);
});
