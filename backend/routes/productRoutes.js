import express from "express";
import upload from "../middleware/upload.js";

const router = express.Router();

router.post("/create", upload.single("image"), async (req, res) => {
  try {
    const product = {
      name: req.body.name,
      price: req.body.price,
      image: req.file.path,
    };

    res.status(200).json({
      success: true,
      imageUrl: `/uploads/${req.file.filename}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
});

export default router;
