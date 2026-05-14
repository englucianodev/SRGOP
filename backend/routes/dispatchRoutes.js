const express = require("express");
const Occurrence = require("../models/Occurrence");

const router = express.Router();

// LISTAR OCORRÊNCIAS PARA DESPACHO
router.get("/", async (req, res) => {
  try {
    const lista = await Occurrence.find().sort({ createdAt: -1 });
    return res.status(200).json(lista);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao carregar despacho.",
      error: error.message,
    });
  }
});

// ATUALIZAR ENCAMINHAMENTO / STATUS
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
      message: "Erro ao atualizar despacho.",
      error: error.message,
    });
  }
});

module.exports = router;