const express = require("express");
const Crew = require("../models/Crew");

const router = express.Router();

// LISTAR GUARNIÇÕES
router.get("/", async (req, res) => {
  try {
    const guarnicoes = await Crew.find().sort({ createdAt: -1 });
    return res.status(200).json(guarnicoes);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar guarnições.",
      error: error.message,
    });
  }
});

// CADASTRAR GUARNIÇÃO
router.post("/", async (req, res) => {
  try {
    const novaGuarnicao = new Crew(req.body);
    await novaGuarnicao.save();

    return res.status(201).json(novaGuarnicao);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao cadastrar guarnição.",
      error: error.message,
    });
  }
});

// ATUALIZAR GUARNIÇÃO
router.put("/:id", async (req, res) => {
  try {
    const guarnicaoAtualizada = await Crew.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    return res.status(200).json(guarnicaoAtualizada);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao atualizar guarnição.",
      error: error.message,
    });
  }
});

// EXCLUIR GUARNIÇÃO
router.delete("/:id", async (req, res) => {
  try {
    await Crew.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      message: "Guarnição removida com sucesso.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao excluir guarnição.",
      error: error.message,
    });
  }
});

module.exports = router;