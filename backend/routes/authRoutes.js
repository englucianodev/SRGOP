const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

// CADASTRO DE USUÁRIO
router.post("/register", async (req, res) => {
  try {
    const { nomeCompleto, email, senha, cidade } = req.body;

    if (!nomeCompleto || !email || !senha || !cidade) {
      return res.status(400).json({
        message: "Preencha nome completo, email, senha e cidade.",
      });
    }

    const usuarioExistente = await User.findOne({ email });

    if (usuarioExistente) {
      return res.status(400).json({
        message: "Já existe um usuário com esse email.",
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const novoUsuario = new User({
      nomeCompleto,
      email,
      senha: senhaHash,
      cidade,
    });

    await novoUsuario.save();

    return res.status(201).json({
      message: "Usuário cadastrado com sucesso.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao cadastrar usuário.",
      error: error.message,
    });
  }
});

// LOGIN DE USUÁRIO
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        message: "Informe email e senha.",
      });
    }

    const usuario = await User.findOne({ email });

    if (!usuario) {
      return res.status(404).json({
        message: "Usuário não encontrado.",
      });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

    if (!senhaCorreta) {
      return res.status(401).json({
        message: "Senha inválida.",
      });
    }

    return res.status(200).json({
      message: "Login realizado com sucesso.",
      user: {
        id: usuario._id,
        nomeCompleto: usuario.nomeCompleto,
        email: usuario.email,
        cidade: usuario.cidade,
        permissao: usuario.permissao,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao fazer login.",
      error: error.message,
    });
  }
});

module.exports = router;