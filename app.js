const express = require("express");
const path = require("path");

const app = express();
const PORT = 5000;

app.use("/static", express.static(path.join(__dirname, "static")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "templates", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Trail Share running at http://127.0.0.1:${PORT}`);
});
