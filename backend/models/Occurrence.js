const mongoose = require("mongoose");

const occurrenceSchema = new mongoose.Schema(
  {
    data: {
      type: String,
      required: true,
    },
    hora: {
      type: String,
      required: true,
    },
    municipio: {
      type: String,
      required: true,
      trim: true,
    },
    tipoCrime: {
      type: String,
      required: true,
      trim: true,
    },
    localizacao: {
      type: String,
      required: true,
      trim: true,
    },
    prioridade: {
      type: String,
      required: true,
      default: "Baixa",
    },
    status: {
      type: String,
      default: "Em Aberto",
    },
    encaminhadaPara: {
      type: String,
      default: "",
    },
    guarnicaoDestino: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Occurrence", occurrenceSchema);