const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const authRoutes = require("./routes/authRoutes");
const occurrenceRoutes = require("./routes/occurrenceRoutes");
const dispatchRoutes = require("./routes/dispatchRoutes");
const crewRoutes = require("./routes/crewRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/occurrences", occurrenceRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/crews", crewRoutes);
app.use("/api/vehicles", vehicleRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB conectado com sucesso");
    app.listen(process.env.PORT || 5000, () => {
      console.log(`Servidor rodando na porta ${process.env.PORT || 5000}`);
    });
  })
  .catch((error) => {
    console.error("Erro ao conectar no MongoDB:", error);
  });