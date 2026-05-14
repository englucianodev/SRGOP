const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    placa: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    prefixo: {
      type: String,
      required: true,
      trim: true,
    },
    cidade: {
      type: String,
      required: true,
      trim: true,
    },
    kilometragem: {
      type: Number,
      default: 0,
    },
    dataRevisao: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "Disponível",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);