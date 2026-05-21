const express = require("express");
const Vehicle = require("../models/Vehicle");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const vehicles = await Vehicle.find().sort({ createdAt: -1 });
    return res.status(200).json(vehicles);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao listar viaturas.", origem: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const vehicle = new Vehicle(req.body);
    await vehicle.save();
    return res.status(201).json(vehicle);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao cadastrar viatura.", origem: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).json(vehicle);
  } catch (error) {
    return res.status(500).json({ message: "Erro ao alterar viatura.", origem: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Vehicle.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: "Viatura excluída com sucesso." });
  } catch (error) {
    return res.status(500).json({ message: "Erro ao excluir viatura.", origem: error.message });
  }
});

module.exports = router;