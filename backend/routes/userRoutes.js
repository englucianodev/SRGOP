const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const users = await User.find().select("-senha").sort({ createdAt: -1 });
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao listar usuários.", origem: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nomeCompleto, email, senha, cidade, tipoAcesso, guarnicao, responsavelServico, dataServico } = req.body;
    const existente = await User.findOne({ email });
    if (existente) return res.status(400).json({ message: "E-mail já cadastrado." });

    if (tipoAcesso === "Oficial" && responsavelServico && dataServico) {
      const jaExiste = await User.findOne({ tipoAcesso: "Oficial", responsavelServico: true, dataServico });
      if (jaExiste) return res.status(400).json({ message: "Já existe um oficial responsável nessa data." });
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    const user = new User({ nomeCompleto, email, senha: senhaHash, cidade, tipoAcesso, guarnicao, responsavelServico, dataServico });
    await user.save();
    return res.status(201).json({ message: "Usuário cadastrado com sucesso." });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao cadastrar usuário.", origem: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { nomeCompleto, email, cidade, tipoAcesso, guarnicao, responsavelServico, dataServico, ativo } = req.body;

    if (tipoAcesso === "Oficial" && responsavelServico && dataServico) {
      const jaExiste = await User.findOne({ _id: { $ne: req.params.id }, tipoAcesso: "Oficial", responsavelServico: true, dataServico });
      if (jaExiste) return res.status(400).json({ message: "Já existe um oficial responsável nessa data." });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { nomeCompleto, email, cidade, tipoAcesso, guarnicao, responsavelServico, dataServico, ativo },
      { new: true }
    ).select("-senha");

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao atualizar usuário.", origem: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: "Usuário excluído com sucesso." });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao excluir usuário.", origem: error.message });
  }
});

module.exports = router;