const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    nomeCompleto: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    senha: { type: String, required: true },
    cidade: { type: String, required: true, trim: true },
    tipoAcesso: {
      type: String,
      enum: ["Administrativo", "Oficial", "Praça"],
      required: true,
      default: "Praça",
    },
    guarnicao: { type: String, default: "" },
    responsavelServico: { type: Boolean, default: false },
    dataServico: { type: String, default: "" },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);