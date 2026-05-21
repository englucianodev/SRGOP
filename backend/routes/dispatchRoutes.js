const express = require("express");
const Occurrence = require("../models/Occurrence");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const dispatches = await Occurrence.find().sort({ createdAt: -1 });
    return res.status(200).json(dispatches);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao buscar despachos.", origem: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const dispatch = await Occurrence.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).json(dispatch);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao atualizar despacho.", origem: error.message });
  }
});

module.exports = router;