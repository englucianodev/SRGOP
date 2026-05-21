const express = require("express");
const Occurrence = require("../models/Occurrence");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const occurrences = await Occurrence.find().sort({ createdAt: -1 });
    return res.status(200).json(occurrences);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao buscar ocorrências.", origem: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const occurrence = new Occurrence(req.body);
    await occurrence.save();
    return res.status(201).json(occurrence);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao registrar ocorrência.", origem: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const occurrence = await Occurrence.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).json(occurrence);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao alterar ocorrência.", origem: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Occurrence.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: "Ocorrência excluída com sucesso." });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao excluir ocorrência.", origem: error.message });
  }
});

module.exports = router;