const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./models/User");

async function createUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const email = "luciano2093@hotmail.com";
    const senha = "nayanne";

    const usuarioExistente = await User.findOne({ email });

    if (usuarioExistente) {
      console.log("Usuário já existe no banco.");
      process.exit();
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    await User.create({
      email: email,
      senha: senhaHash,
    });

    console.log("Usuário criado com sucesso.");
    process.exit();
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    process.exit(1);
  }
}

createUser();