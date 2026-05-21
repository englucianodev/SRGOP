const mongoose = require("mongoose");

const crewSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true },
    cidade: { type: String, required: true },
    viatura: { type: String, default: "" },
    composicao: { type: [String], default: [] },
    ativa: { type: Boolean, default: true },
    inicioServico: { type: String, default: "" },
    fimServico: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Crew", crewSchema);