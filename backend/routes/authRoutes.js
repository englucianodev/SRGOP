const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { nomeCompleto, email, senha, confirmarSenha, cidade, tipoAcesso } = req.body;

    if (!nomeCompleto || !email || !senha || !confirmarSenha || !cidade || !tipoAcesso) {
      return res.status(400).json({ message: "Preencha todos os campos do cadastro." });
    }

    if (senha !== confirmarSenha) {
      return res.status(400).json({ message: "Senha e confirmação de senha não conferem." });
    }

    const existente = await User.findOne({ email });
    if (existente) {
      return res.status(400).json({ message: "Já existe um usuário com esse e-mail." });
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    const novoUsuario = new User({ nomeCompleto, email, senha: senhaHash, cidade, tipoAcesso });
    await novoUsuario.save();

    return res.status(201).json({ message: "Usuário cadastrado com sucesso." });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao cadastrar usuário.", origem: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ message: "Informe e-mail e senha." });
    }

    const usuario = await User.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ message: "Senha inválida." });
    }

    return res.status(200).json({
      message: "Login realizado com sucesso.",
      user: {
        id: usuario._id,
        nomeCompleto: usuario.nomeCompleto,
        email: usuario.email,
        cidade: usuario.cidade,
        tipoAcesso: usuario.tipoAcesso,
        guarnicao: usuario.guarnicao,
        responsavelServico: usuario.responsavelServico,
        dataServico: usuario.dataServico,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao fazer login.", origem: error.message });
  }
});

module.exports = router;