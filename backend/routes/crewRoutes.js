const express = require("express");
const Crew = require("../models/Crew");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const crews = await Crew.find().sort({ createdAt: -1 });
    return res.status(200).json(crews);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao listar guarnições.", origem: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const crew = new Crew(req.body);
    await crew.save();
    return res.status(201).json(crew);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao cadastrar guarnição.", origem: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const crew = await Crew.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).json(crew);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao alterar guarnição.", origem: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Crew.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: "Guarnição excluída com sucesso." });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao excluir guarnição.", origem: error.message });
  }
});

module.exports = router;