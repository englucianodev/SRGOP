const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    nomeCompleto: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    senha: { type: String, required: true },
    cidade: { type: String, required: true, trim: true },
    permissao: { type: String, default: "operador" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);