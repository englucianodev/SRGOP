const mongoose = require("mongoose");

const occurrenceSchema = new mongoose.Schema(
  {
    data: { type: String, required: true },
    hora: { type: String, required: true },
    municipio: { type: String, required: true },
    tipoCrime: { type: String, required: true },
    localizacao: { type: String, required: true },
    descricao: { type: String, default: "" },
    prioridade: { type: String, enum: ["Alta", "Média", "Baixa"], default: "Média" },
    status: { type: String, default: "Em Aberto" },
    guarnicaoDestino: { type: String, default: "" },
    anexos: { type: [String], default: [] },
    tempoAtendimentoSegundos: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Occurrence", occurrenceSchema);