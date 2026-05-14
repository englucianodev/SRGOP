const express = require("express");
const Vehicle = require("../models/Vehicle");

const router = express.Router();

// LISTAR VIATURAS
router.get("/", async (req, res) => {
  try {
    const viaturas = await Vehicle.find().sort({ createdAt: -1 });
    return res.status(200).json(viaturas);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao buscar viaturas.",
      error: error.message,
    });
  }
});

// CADASTRAR VIATURA
router.post("/", async (req, res) => {
  try {
    const novaViatura = new Vehicle(req.body);
    await novaViatura.save();

    return res.status(201).json(novaViatura);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao cadastrar viatura.",
      error: error.message,
    });
  }
});

// ATUALIZAR VIATURA
router.put("/:id", async (req, res) => {
  try {
    const viaturaAtualizada = await Vehicle.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    return res.status(200).json(viaturaAtualizada);
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao atualizar viatura.",
      error: error.message,
    });
  }
});

// EXCLUIR VIATURA
router.delete("/:id", async (req, res) => {
  try {
    await Vehicle.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      message: "Viatura removida com sucesso.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro ao excluir viatura.",
      error: error.message,
    });
  }
});

module.exports = router;