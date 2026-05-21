const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
  {
    placa: { type: String, required: true, unique: true },
    prefixo: { type: String, required: true },
    cidade: { type: String, required: true },
    kilometragem: { type: Number, default: 0 },
    dataRevisao: { type: String, default: "" },
    ultimoMotorista: { type: String, default: "" },
    status: { type: String, default: "Disponível" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vehicle", vehicleSchema);