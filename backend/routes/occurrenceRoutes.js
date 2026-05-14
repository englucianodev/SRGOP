const express = require("express");
const Occurrence = require("../models/Occurrence");

const router = express.Router();

// LISTAR OCORRÊNCIAS
router.get("/", async (req, res) => {
  try {
    const ocorrencias = await Occurrence.find().sort({ createdAt: -1 });
    return res.status(200).json(ocorrencias);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar ocorrências.",
      error: error.message,
    });
  }
});

// CRIAR OCORRÊNCIA
router.post("/", async (req, res) => {
  try {
    const novaOcorrencia = new Occurrence(req.body);
    await novaOcorrencia.save();

    return res.status(201).json(novaOcorrencia);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao criar ocorrência.",
      error: error.message,
    });
  }
});

// ATUALIZAR OCORRÊNCIA
router.put("/:id", async (req, res) => {
  try {
    const ocorrenciaAtualizada = await Occurrence.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    return res.status(200).json(ocorrenciaAtualizada);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao atualizar ocorrência.",
      error: error.message,
    });
  }
});

// EXCLUIR OCORRÊNCIA
router.delete("/:id", async (req, res) => {
  try {
    await Occurrence.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      message: "Ocorrência removida com sucesso.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao excluir ocorrência.",
      error: error.message,
    });
  }
});

module.exports = router;