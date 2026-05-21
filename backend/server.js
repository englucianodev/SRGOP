const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const occurrenceRoutes = require("./routes/occurrenceRoutes");
const dispatchRoutes = require("./routes/dispatchRoutes");
const crewRoutes = require("./routes/crewRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado com sucesso."))
  .catch((error) => console.error("Erro ao conectar MongoDB:", error.message));

app.get("/", (req, res) => {
  res.json({ message: "API do SRGOP funcionando." });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/occurrences", occurrenceRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/crews", crewRoutes);
app.use("/api/vehicles", vehicleRoutes);

app.use((error, req, res, next) => {
  return res.status(500).json({ message: "Erro interno do servidor.", origem: error.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});